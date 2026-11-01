/**
 * A business's public Instagram, through Meta's official Business Discovery API: profile counts and recent posts of
 * any business or creator account, read through Code 5's own Instagram professional account. Nothing is scraped and
 * no media is downloaded; captions and counts only.
 *
 * Env:
 *   META_ACCESS_TOKEN   Facebook user (or system user) token with instagram_basic, instagram_manage_insights,
 *                       pages_read_engagement
 *   IG_USER_ID          Code 5's Instagram professional account id (the one the token reads through)
 */

const GRAPH = "https://graph.facebook.com/v26.0";

export const instagramConfigured = () => Boolean(process.env.META_ACCESS_TOKEN && process.env.IG_USER_ID);

const RESERVED = new Set(["p", "reel", "reels", "explore", "stories", "accounts", "tv", "direct"]);

/** "https://www.instagram.com/spritzhairstudio/?igsh=…" → "spritzhairstudio". */
export function igUsernameFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^(?:https?:\/\/)?(?:www\.|m\.)?instagram\.com\/([A-Za-z0-9._]{1,30})(?:[/?#]|$)/i.exec(url.trim());
  if (!m || RESERVED.has(m[1].toLowerCase())) return null;
  return m[1].toLowerCase();
}

const FILLER = /\b(ltd|limited|and|&|the|co|company|enterprises?|kenya|nairobi|in|at|mall)\b/gi;

/** Likely handles for a business that Google didn't link to Instagram, most likely first. */
export function handleGuesses(name: string): string[] {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^\w\s&]/g, " ").replace(/\s+/g, " ").trim();
  const words = base.replace(FILLER, " ").split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const joined = words.join("");
  const short = words.slice(0, 3).join("");
  const out = [joined, `${joined}ke`, `${joined}_ke`, `${joined}kenya`, words.join("_"), short, `${short}ke`];
  return [...new Set(out.filter((h) => h.length >= 4 && h.length <= 30))];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Whether a guessed account is really this business, not a namesake abroad: its name must match, and its bio must
 * point to Kenya (a place, +254 or 07 number) or carry the business's phone number.
 */
export function looksLikeMatch(p: { name?: string; username: string; biography?: string }, lead: { business_name: string; phone: string | null }) {
  const want = norm(lead.business_name.replace(FILLER, " "));
  const got = norm(p.name ?? "") || norm(p.username);
  const nameOk = want.length >= 4 && (got.includes(want.slice(0, Math.min(want.length, 10))) || want.includes(got.slice(0, Math.min(got.length, 10))));
  const bio = p.biography ?? "";
  const phoneTail = (lead.phone ?? "").replace(/\D/g, "").slice(-9);
  const local = /\b(nairobi|kenya|kilimani|westlands|karen|kileleshwa|lavington|cbd|mombasa|kisumu|nakuru|eldoret|thika|ruaka|rongai|syokimau|kitengela)\b|\+?254|\b07\d{8}\b|🇰🇪/i.test(bio);
  const phoneOk = phoneTail.length === 9 && bio.replace(/\D/g, "").includes(phoneTail);
  return nameOk && (local || phoneOk);
}

type Media = { caption?: string; timestamp?: string; media_type?: string; like_count?: number; comments_count?: number; permalink?: string };
type Profile = { username: string; name?: string; biography?: string; website?: string; followers_count?: number; media_count?: number; media?: { data?: Media[] } };

export type InstagramFacts = {
  username: string;
  url: string;
  source: "google" | "guessed";
  followers: number | null;
  posts: number | null;
  bio: string | null;
  link_in_bio: string | null;
  last_post_days_ago: number | null;
  posts_last_30_days: number;
  average_likes: number | null;
  recent_posts: { days_ago: number | null; type: string | null; likes: number | null; caption: string }[];
};

const daysAgo = (iso: string | undefined, now: number) => (iso ? Math.max(0, Math.floor((now - Date.parse(iso)) / 86_400_000)) : null);

/** The facts the outreach writer needs, from one Business Discovery response. */
export function summarize(p: Profile, source: InstagramFacts["source"], now = Date.now()): InstagramFacts {
  const media = p.media?.data ?? [];
  const likes = media.map((m) => m.like_count).filter((n): n is number => typeof n === "number");
  return {
    username: p.username,
    url: `https://www.instagram.com/${p.username}/`,
    source,
    followers: p.followers_count ?? null,
    posts: p.media_count ?? null,
    bio: p.biography?.slice(0, 300) || null,
    link_in_bio: p.website || null,
    last_post_days_ago: daysAgo(media[0]?.timestamp, now),
    posts_last_30_days: media.filter((m) => (daysAgo(m.timestamp, now) ?? 999) <= 30).length,
    average_likes: likes.length ? Math.round(likes.reduce((a, b) => a + b, 0) / likes.length) : null,
    recent_posts: media.slice(0, 8).map((m) => ({
      days_ago: daysAgo(m.timestamp, now),
      type: m.media_type ?? null,
      likes: m.like_count ?? null,
      caption: (m.caption ?? "").slice(0, 280),
    })),
  };
}

const FIELDS = "username,name,biography,website,followers_count,media_count,media.limit(12){caption,timestamp,media_type,like_count,comments_count,permalink}";

/** One Business Discovery lookup. Null when the account doesn't exist, is personal or age-gated, or the call fails. */
async function lookup(username: string): Promise<Profile | null> {
  const url = `${GRAPH}/${encodeURIComponent(process.env.IG_USER_ID!)}?fields=${encodeURIComponent(`business_discovery.username(${username}){${FIELDS}}`)}&access_token=${encodeURIComponent(process.env.META_ACCESS_TOKEN!)}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    // 110 = no such business/creator account; anything else (expired token, rate limit) is worth a log line.
    if (!/"error_subcode":\s*2207013|"code":\s*110/.test(body)) console.error("instagram:", res.status, body.slice(0, 200));
    return null;
  }
  return ((await res.json()) as { business_discovery?: Profile }).business_discovery ?? null;
}

/**
 * The business's Instagram: from the link Google lists if there is one, otherwise by trying likely handles and keeping
 * only an account that clearly matches. Up to 1 + 7 API calls per lead.
 */
export async function instagramFor(lead: { business_name: string; phone: string | null; listed_url: string | null }): Promise<InstagramFacts | null> {
  if (!instagramConfigured()) return null;
  const listed = igUsernameFromUrl(lead.listed_url);
  if (listed) {
    const p = await lookup(listed);
    return p ? summarize(p, "google") : null;
  }
  for (const handle of handleGuesses(lead.business_name)) {
    const p = await lookup(handle);
    if (p && looksLikeMatch(p, lead)) return summarize(p, "guessed");
  }
  return null;
}
