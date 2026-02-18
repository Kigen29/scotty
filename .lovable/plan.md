
## Changes: Clean Up Lead Cards & Enforce Contact Info

### What's changing

Three focused changes to `src/pages/LeadDiscovery.tsx` and `supabase/functions/auto-discover/index.ts`:

---

### 1. Remove the website filter bar (UI)

The "All / No Website / Has Website" filter buttons are no longer meaningful since the pipeline now exclusively discovers businesses without websites. These buttons will be removed entirely.

The `WebsiteFilter` type, `websiteFilter` state, `noWebsiteCount`/`hasWebsiteCount` variables, and the filter bar JSX block will all be deleted.

The "No Website" / "Website" indicator in the top-right of each card will also be removed — it's redundant noise since every lead by definition has no website.

The date filter (Today, This Week, etc.) stays — that's still useful.

---

### 2. Add a Google Maps link to each lead card (UI)

Each lead card will get a "View on Google Maps" button in the card footer. It reads from `lead.social_links?.google_maps` (already stored by the agent). For Instagram/TikTok leads, it falls back to `lead.social_links?.instagram` or `lead.social_links?.tiktok`.

The link opens in a new tab with a map pin icon so you can quickly look up the business yourself.

---

### 3. Enforce that leads must have at least one contact method before being saved (agent)

In `auto-discover/index.ts`, before inserting a new lead, add a guard:

```typescript
// Skip leads with no contact info at all
if (!biz.phone && !biz.email) {
  console.log(`Skipping ${biz.business_name} — no contact info`);
  continue;
}
```

This ensures every lead that enters the system has at minimum a phone number or email. Leads with no way to contact them are useless and waste database space.

The same guard will be added to `social-discover/index.ts` for consistency.

---

### Technical Details

**Files changing:**
| File | What changes |
|---|---|
| `src/pages/LeadDiscovery.tsx` | Remove website filter bar + website indicator badge; add Google Maps / social profile link button on each card |
| `supabase/functions/auto-discover/index.ts` | Add `!biz.phone && !biz.email` guard before insert |
| `supabase/functions/social-discover/index.ts` | Add same contact info guard before insert |

**The Google Maps link logic:**
```typescript
const mapsUrl = lead.social_links?.google_maps 
  || lead.social_links?.instagram 
  || lead.social_links?.tiktok;
// If no stored URL, fall back to a Google search link:
// `https://www.google.com/search?q=${encodeURIComponent(lead.business_name + ' ' + lead.location)}`
```

This means even leads that don't have a stored Maps URL will get a fallback "Search on Google" link so you can still look them up easily.
