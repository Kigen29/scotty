

# Plan: Fix UI Visibility and Target Businesses Without Websites

## Problem 1: Text Visibility Issues
The Lead Discovery page uses dark-theme CSS variables like `hsl(var(--info))`, `hsl(var(--success))`, and `hsl(var(--warning))` for badge colors. Some of these, combined with low-opacity backgrounds (`/10`), can make text hard to read depending on the theme. The status badges and some card text may blend into backgrounds.

**Fix:**
- Replace custom HSL color classes on badges with simpler, high-contrast Tailwind classes
- Ensure all text on cards (business name, location, phone, email) has strong foreground contrast
- Add explicit text colors to buttons and improve card styling with subtle borders

## Problem 2: Discovering Businesses WITH Websites Instead of WITHOUT

The current search query in `discover-leads/index.ts` appends `"Kenya business contact phone"` to the search, which naturally returns established businesses with websites. The AI extraction prompt also does not emphasize filtering for businesses **without** an online presence.

**Fix - Two changes:**

### A. Update the Firecrawl search query
- Change the search terms to target businesses that lack websites, e.g., `"Kenya business no website"` or `"small business"` instead of just `"Kenya business contact phone"`
- Add negative search terms to filter out directory pages that list well-known businesses

### B. Update the AI extraction prompt
- Explicitly instruct the AI to prioritize businesses that do NOT have their own website
- Mark `has_website: false` for businesses found only on directories (Google Maps, Yellow Pages, etc.)
- Tell the AI to skip businesses that clearly have professional websites
- Add a scoring/priority note: businesses without websites are the primary target

### C. Update the auto-discover function similarly
- Apply the same search query and prompt changes to `auto-discover/index.ts` for consistency

## Technical Details

### Files to modify:

1. **`supabase/functions/discover-leads/index.ts`**
   - Change search query from `"Kenya business contact phone"` to `"Kenya small business no website"` or similar
   - Update AI extraction prompt to explicitly filter for businesses without online presence
   - Instruct the AI to set `has_website: true` only if the business has its own domain, not just a listing on a directory

2. **`supabase/functions/auto-discover/index.ts`**
   - Apply the same search query and prompt changes

3. **`src/pages/LeadDiscovery.tsx`**
   - Fix badge styling: use explicit background + text color classes instead of HSL variable references with opacity
   - Add `border` to cards for better definition
   - Ensure the "No Website" vs "Has Website" indicator is prominent (add a text label next to the globe icon)
   - Add a filter toggle so the user can view "No Website" leads vs "Has Website" leads
   - Improve overall card contrast and readability

4. **`src/pages/Dashboard.tsx`** (minor)
   - Same badge color fixes for consistency

5. **`src/pages/Campaigns.tsx`** (minor)
   - Same badge color fixes for consistency

### Key search query change:
```
// Before
searchTerms.push("Kenya business contact phone");

// After  
searchTerms.push("Kenya small business no website local");
```

### Key AI prompt change:
```
// Add to extraction prompt:
"IMPORTANT: We are looking for businesses that do NOT have their own website.
- If a business has its own domain/professional website, set has_website to true and deprioritize it.
- If a business is only found on directories (Google Maps, Yellow Pages, Facebook), set has_website to false - these are our PRIMARY targets.
- Focus on small/local businesses that would benefit from getting a website built for them."
```

