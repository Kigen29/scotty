/**
 * Pure rules for judging a business found on Google: does it have a real website, what domain might it own,
 * and how good a prospect is it for a studio that builds websites.
 */

export type WebsiteKind = "none" | "social" | "site";

/** Hosts that are a presence, not a website the business controls. */
const SOCIAL = [
  "facebook.com", "fb.com", "fb.me", "instagram.com", "wa.me", "whatsapp.com", "linktr.ee", "tiktok.com",
  "twitter.com", "x.com", "linkedin.com", "youtube.com", "business.site", "sites.google.com", "jiji.co.ke",
  "jumia.co.ke", "yellowpageskenya.com", "businesslist.co.ke",
];

export function websiteKind(uri: string | null | undefined): WebsiteKind {
  if (!uri?.trim()) return "none";
  let host: string;
  try {
    host = new URL(uri.includes("://") ? uri : `https://${uri}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "none";
  }
  return SOCIAL.some((s) => host === s || host.endsWith(`.${s}`)) ? "social" : "site";
}

/** Words that rarely appear in a business's domain. */
const NOISE = /\b(ltd|limited|enterprises?|company|co|the|and|kenya|ke|shop|store)\b/g;

/** The .co.ke and .ke names a business would most likely register, e.g. "Mama Njeri's Salon" → mamanjerissalon.co.ke. */
export function domainGuesses(name: string): string[] {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(NOISE, " ")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const slug = words.join("");
  if (slug.length < 3 || slug.length > 40) return [];
  return [`${slug}.co.ke`, `${slug}.ke`];
}

export type Prospect = {
  website: WebsiteKind;
  hasPhone: boolean;
  rating: number | null;
  reviews: number | null;
  category: string | null;
  location: string | null;
  /** A .co.ke/.ke domain matching their name is already registered. */
  domainRegistered: boolean;
};

/**
 * 0–100: how likely this business is to want and pay for a website. No site at all scores highest; a phone
 * means we can reach them; reviews mean it's an active, trading business; matching the target lists helps.
 */
export function prospectScore(p: Prospect, targets: { categories: string[]; locations: string[] }) {
  let score = 20;
  if (p.website === "none") score += 30;
  else if (p.website === "social") score += 18;
  if (p.domainRegistered) score -= 12; // they may have a site Google doesn't know about
  if (p.hasPhone) score += 12;
  // Busier businesses can afford a site and lose more without one. Log-scaled so 10, 100 and 1,000
  // reviews land at 6, 12 and 18 points instead of all maxing out.
  const reviews = Math.max(0, p.reviews ?? 0);
  score += Math.min(18, Math.round(6 * Math.log10(1 + reviews)));
  // A good rating counts once there are enough reviews to mean something: 4.0 → 4, 4.5 → 8, 5.0 → 12.
  if (reviews >= 5 && p.rating != null) score += Math.max(0, Math.min(12, Math.round((p.rating - 3.5) * 8)));
  // "bakeries" should match "Bakery", "salons" should match "Hair salon"
  const singular = (w: string) => w.trim().toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
  const has = (list: string[], value: string | null) =>
    !!value && list.some((t) => singular(t) && singular(value).includes(singular(t)));
  if (has(targets.categories, p.category)) score += 4;
  if (has(targets.locations, p.location)) score += 4;
  return Math.max(0, Math.min(100, score));
}
