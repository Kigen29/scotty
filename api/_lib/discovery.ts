import { sql } from "./db.js";
import { logEvent } from "./inbox.js";
import { domainGuesses, prospectScore, websiteKind, type WebsiteKind } from "./prospect.js";
import { sortDiscoveries } from "./qualify.js";

/**
 * Finds real Kenyan businesses on Google Places (Text Search, New) and keeps the ones without a real website.
 * Every lead comes from a Google listing; nothing is generated.
 *
 * Env: GOOGLE_PLACES_API_KEY, PLACES_MONTHLY_LIMIT (requests per month, default 900, inside Google's free 1,000)
 *
 * Google's terms let us keep a place id indefinitely but not cache other listing data long-term, so untouched
 * discovered leads are cleared after 30 days (clearStale). A lead you work with (who writes to you, or that you
 * move forward) is no longer just a cached listing.
 */

type Row = Record<string, unknown>;
const q = async <T = Row>(text: string, values: unknown[] = []) => (await sql().query(text, values)) as T[];

const FIELDS = [
  "places.id", "places.displayName", "places.formattedAddress", "places.businessStatus", "places.primaryTypeDisplayName",
  "places.googleMapsUri", "places.websiteUri", "places.nationalPhoneNumber", "places.internationalPhoneNumber",
  "places.rating", "places.userRatingCount", "nextPageToken",
].join(",");

type Place = {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  businessStatus?: string;
  primaryTypeDisplayName?: { text: string };
  googleMapsUri?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
};

const monthlyLimit = () => Number(process.env.PLACES_MONTHLY_LIMIT ?? 900);

/** Google requests used this calendar month, from the discovery log. */
export async function placesRequestsThisMonth(operatorId: string) {
  const [r] = await q<{ n: number }>(
    `SELECT coalesce(sum((details->>'requests')::int), 0)::int AS n FROM scotty.agent_events
      WHERE user_id = $1::uuid AND kind IN ('discovered', 'prepared') AND created_at >= date_trunc('month', now())`,
    [operatorId],
  );
  return r.n;
}

async function searchText(textQuery: string, pageToken?: string) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("Discovery isn't set up: GOOGLE_PLACES_API_KEY is missing.");
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify({ textQuery, regionCode: "KE", pageSize: 20, ...(pageToken ? { pageToken } : {}) }),
  });
  if (!res.ok) throw new Error(`Google Places refused the search (${res.status}): ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as { places?: Place[]; nextPageToken?: string };
}

/** Asks Kenya's registry (KeNIC RDAP) whether any of the likely domains is registered. */
async function registeredDomain(name: string): Promise<string | null> {
  for (const domain of domainGuesses(name)) {
    try {
      const res = await fetch(`https://rdap.kenic.or.ke/domain/${domain}`, { signal: AbortSignal.timeout(4000) });
      if (res.status === 200) return domain;
    } catch {
      // The registry being slow or down shouldn't stop discovery.
    }
  }
  return null;
}

/** Deletes discovered leads nobody acted on within 30 days, as Google's caching terms expect. */
export async function clearStale(operatorId: string) {
  const rows = await q(
    `DELETE FROM scotty.leads l
      WHERE l.user_id = $1::uuid AND l.discovery_source = 'google_places' AND l.status = 'discovered'
        AND l.places_fetched_at < now() - interval '30 days'
        AND NOT EXISTS (SELECT 1 FROM scotty.conversations c WHERE c.lead_id = l.id)
      RETURNING l.id`,
    [operatorId],
  );
  return rows.length;
}

export async function discover(input: { category?: string; location?: string; query?: string; pages?: number }, operatorId: string) {
  const what = (input.query || input.category || "").trim();
  const where = (input.location || "").trim();
  if (!what && !where) throw new Error("Say what kind of business, where, or both.");
  const textQuery = `${what || "businesses"}${where ? ` in ${where}` : ""}, Kenya`;
  const pages = Math.min(Math.max(Number(input.pages) || 3, 1), 3);

  const used = await placesRequestsThisMonth(operatorId);
  if (used + pages > monthlyLimit()) {
    throw new Error(`This month's discovery allowance is used up (${used} of ${monthlyLimit()} Google searches). It resets on the 1st.`);
  }
  const cleared = await clearStale(operatorId);

  const [settings] = await q<{ target_categories: string[] | null; target_locations: string[] | null; auto_qualify_enabled: boolean }>(
    "SELECT target_categories, target_locations, auto_qualify_enabled FROM scotty.settings WHERE user_id = $1::uuid",
    [operatorId],
  );
  const targets = {
    categories: [...(settings?.target_categories ?? []), ...(what ? [what] : [])],
    locations: [...(settings?.target_locations ?? []), ...(where ? [where] : [])],
  };

  // Up to 60 businesses: three pages of 20.
  const places: Place[] = [];
  let token: string | undefined;
  let requests = 0;
  for (let i = 0; i < pages; i++) {
    const page = await searchText(textQuery, token);
    requests++;
    places.push(...(page.places ?? []));
    token = page.nextPageToken;
    if (!token) break;
    await new Promise((r) => setTimeout(r, 1500)); // Google needs a moment before a page token works
  }

  let added = 0;
  let alreadyKnown = 0;
  let withWebsite = 0;
  let closed = 0;
  const candidates: { p: Place; name: string; kind: WebsiteKind }[] = [];
  for (const p of places) {
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
      closed++;
      continue;
    }
    const kind = websiteKind(p.websiteUri);
    if (kind === "site") {
      withWebsite++;
      continue;
    }
    const name = p.displayName?.text?.trim();
    if (name) candidates.push({ p, name, kind });
  }

  // Registry lookups ten at a time, so 60 results finish well inside the function's time limit.
  const domains: (string | null)[] = [];
  for (let i = 0; i < candidates.length; i += 10) {
    domains.push(...(await Promise.all(candidates.slice(i, i + 10).map((c) => registeredDomain(c.name)))));
  }

  for (const [i, { p, name, kind }] of candidates.entries()) {
    const domain = domains[i];
    const phone = p.internationalPhoneNumber || p.nationalPhoneNumber || null;
    const category = p.primaryTypeDisplayName?.text ?? (input.category || null);
    const score = prospectScore(
      { website: kind, hasPhone: !!phone, rating: p.rating ?? null, reviews: p.userRatingCount ?? null, category, location: p.formattedAddress ?? where, domainRegistered: !!domain },
      targets,
    );

    const inserted = await q(
      `INSERT INTO scotty.leads (user_id, business_name, category, location, phone, has_website, website_url, social_links,
                                 status, discovery_source, verification_state, place_id, google_maps_url, rating, review_count,
                                 places_fetched_at, icp_score, priority_score, analysis)
       VALUES ($1::uuid, $2, $3, $4, $5, false, NULL, $6::jsonb, 'discovered', 'google_places', 'verified', $7, $8, $9, $10,
               now(), $11, $12, $13::jsonb)
       ON CONFLICT (user_id, place_id) WHERE place_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [
        operatorId, name, category, p.formattedAddress ?? (where || null), phone,
        JSON.stringify(kind === "social" && p.websiteUri ? { listed: p.websiteUri } : {}),
        p.id, p.googleMapsUri ?? null, p.rating ?? null, p.userRatingCount ?? null,
        score, Math.max(1, Math.round(score / 10)),
        JSON.stringify({ website: kind, listed_url: p.websiteUri ?? null, registered_domain: domain, search: textQuery, competitors_with_site: withWebsite, search_found: places.length }),
      ],
    );
    if (inserted.length) added++;
    else alreadyKnown++;
  }

  const summary = `Searched “${textQuery}”: ${added} new business${added === 1 ? "" : "es"} without a website${alreadyKnown ? `, ${alreadyKnown} already in Scotty` : ""}`;
  await logEvent(operatorId, {
    kind: "discovered",
    summary,
    details: { query: textQuery, requests, found: places.length, added, already_known: alreadyKnown, with_website: withWebsite, closed, cleared },
  });
  // Let Scotty sort the new finds into qualified and dismissed, unless that's switched off.
  let sorted: { qualified: number; dismissed: number } | null = null;
  if (added && (settings?.auto_qualify_enabled ?? true)) {
    try {
      sorted = await sortDiscoveries(operatorId);
    } catch (err) {
      console.error("discovery: sorting failed", err);
      await logEvent(operatorId, { kind: "error", summary: `Couldn't sort the new discoveries: ${(err as Error).message}` });
    }
  }
  return {
    query: textQuery, found: places.length, added, already_known: alreadyKnown, with_website: withWebsite, closed, cleared,
    qualified: sorted?.qualified ?? null, dismissed: sorted?.dismissed ?? null,
    requests_this_month: used + requests, monthly_limit: monthlyLimit(),
  };
}
