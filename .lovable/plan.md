
## Refocusing Discovery Agents: Google Business Profile Leads with No Website

### The Problem with the Current Approach

Right now the agents search for businesses using general web queries and social media, then filter by `has_website`. The issue is:

- The search queries return a mix of results — some businesses already have professional websites, some are on directories, some are on social media
- The AI is doing "post-filter" filtering (find everything, then check if they have a website)
- This wastes API calls on businesses that are already served
- The social-discover agent finds Instagram/TikTok pages, but many of those businesses also have websites

### The New Approach: Google Business Profile (GBP) as the Source of Truth

Google Business Profiles are the ideal data source because:
- A business with a GBP but no website is **explicitly** signaling they have no web presence
- Google even marks these profiles with "No website" in Maps results
- GBP listings contain phone numbers, addresses, categories, and sometimes emails — ready to use
- This is where most small Kenyan businesses actually live (Google Maps / local search)

---

## What Changes

### 1. `auto-discover` — Complete Search Strategy Overhaul

**New search queries** specifically targeting Google Business Profiles with no website:

- `"${category} ${location} Kenya" site:maps.google.com`
- `"${category} ${location} Kenya" -site:*.co.ke -site:*.com "Google Maps"`
- `"${category} near ${location}" Kenya "no website" OR "visit us at" OR "call us"`
- Firecrawl's country filter `ke` ensures Kenyan results

**New AI extraction prompt** — strictly enforces the no-website rule:
- `has_website: true` → **skip entirely, do not insert**
- Only accept leads where the business is ONLY found on Google Maps, directories, or social profiles
- Extract: business name, phone, email, Google Maps URL, category, location, address
- The `google_maps_url` is stored in `social_links.google_maps` so you can verify the lead

**Hard filter in code**: After AI extraction, add a code-level check — if `has_website === true`, skip that business regardless of what the AI says. This double-ensures no website-having businesses slip through.

**New `discovery_source` value**: `'google_maps'` for web-discovered leads found via Google Business Profiles (more accurate than just `'web'`).

---

### 2. `social-discover` — Also Filtered to No-Website Businesses

The social discover agent currently searches Instagram/TikTok broadly. It will be updated so that:
- The AI extraction prompt explicitly says: **only extract businesses that have NO separate website** — if a business has `website_url` in their bio, skip them
- The `has_website` field is enforced — businesses with websites are dropped at the code level too
- Social media platforms (Instagram, TikTok) are themselves treated as indicators of no-website status — a business whose entire digital presence is an Instagram page is a perfect lead

---

### 3. What Stays the Same

- `daily-outreach` — no changes needed. It already picks the hottest leads and contacts them via the best available channel (Email → WhatsApp → Instagram DM → LinkedIn)
- `auto-discover` still chains to `social-discover` → `daily-outreach` at the end
- Database schema — no new columns needed, just better data going in

---

## Files to Change

| File | What Changes |
|---|---|
| `supabase/functions/auto-discover/index.ts` | New GBP-focused search queries, stricter AI extraction prompt, code-level `has_website` filter, `discovery_source: 'google_maps'` |
| `supabase/functions/social-discover/index.ts` | Stricter AI prompt (no-website only), code-level `has_website` filter on social leads too |

---

## Technical Details

### New Search Queries in `auto-discover`

Instead of one generic query, the agent will rotate through 3 targeted query patterns per run:

```text
Query 1: "${category} ${location} Kenya" "Google Maps" "No website"
Query 2: "${category} ${location} Kenya small business" -inurl:.co.ke -inurl:.com/
Query 3: "${category} near ${location}" Kenya phone contact
```

These target businesses that only appear in Google Maps/directory results, not those with their own domains.

### New AI Prompt Rules (auto-discover)

```text
STRICT RULES - NO EXCEPTIONS:
1. ONLY extract businesses with NO website of their own
2. If a result shows a business domain (e.g. "businessname.co.ke", "businessname.com"), 
   set has_website: true — these will be SKIPPED
3. Acceptable sources: Google Maps listing, Yellow Pages, Yelp, Facebook page only
4. Extract phone numbers aggressively — this is our primary contact method
5. Extract any email addresses visible in the listing
6. Store the Google Maps URL as the source reference
```

### Code-Level Hard Filter

```typescript
// After AI extraction — hard filter, no exceptions
const noWebsiteBusinesses = businesses.filter(b => !b.has_website);
// Only insert noWebsiteBusinesses
```

### New Lead Fields Populated

- `discovery_source`: `'google_maps'` (web agent) or `'instagram'`/`'tiktok'` (social agent)
- `social_links.google_maps`: the Maps URL for verification
- `phone`: extracted from GBP listing (primary contact method)
- `notes`: address and any other GBP details

---

## Result

After this change, every lead that enters the system will be a business that:
1. Has a Google presence (real, findable business)
2. Has NO website of their own
3. Has at least one contact method (phone number from GBP, or email, or social handle)
4. Is ready for the daily-outreach agent to contact them about getting a website built
