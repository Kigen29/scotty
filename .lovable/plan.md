

## Plan: UI Overhaul, Bug Fixes, and Discovery Improvements

This is a significant UI and functionality upgrade across the entire app, inspired by Instantly.ai's clean dashboard aesthetic and Agentible's dark professional feel.

---

### 1. Fix Blocked Links (Google Maps, Instagram, TikTok)

**Problem**: The preview iframe blocks `google.com`, `instagram.com`, `tiktok.com` due to `X-Frame-Options` / CSP headers. Links with `target="_blank"` inside an iframe still get blocked.

**Fix**: Replace `<a href>` links with `window.open()` via button `onClick` handlers. This bypasses iframe embedding restrictions since it opens a new browser tab directly.

**Files**: `src/pages/LeadDiscovery.tsx`

---

### 2. Add "Football Pitches / Turfs" Category

Add `"football pitches"` to the categories array in `LeadDiscovery.tsx` and to the default `target_categories` in `SettingsPage.tsx`.

---

### 3. Prioritize Leads with Email Addresses

Update `supabase/functions/ai-discover/index.ts`:
- Modify the AI prompt to **strongly emphasize finding business email addresses** (e.g., from Google Business Profiles, Facebook pages, directory listings)
- Add email as a required field in the tool schema (change from optional to strongly requested)
- Add sorting logic: leads with emails get higher priority scores (+2 boost)

---

### 4. Lead Discovery Page -- Table View with Filters

Replace the current card grid with a professional **data table** layout inspired by Instantly.ai's leads view:

- **Top bar**: Search input, category dropdown, location dropdown, status dropdown, source dropdown, "Has Email" toggle -- all inline
- **Stats row**: Small stat badges showing totals (e.g., "91 leads · 45 with email · 23 qualified")
- **Data table** using the existing `Table` component:
  - Columns: Checkbox, Business Name, Category, Location, Phone, Email, Source, Status, Priority, Actions
  - Sortable columns (click header to sort)
  - Row click opens a slide-out detail panel (Sheet) with full lead info, analysis, and action buttons
  - Bulk actions bar: Approve Selected, Dismiss Selected, Generate Emails
- **Pagination** at the bottom
- Keep the "Discover Leads" search card at top but more compact

**Files**: `src/pages/LeadDiscovery.tsx` (full rewrite)

---

### 5. Dashboard -- Instantly.ai-Inspired Analytics

Redesign the Dashboard with:

- **Hero stats row**: 4 cards with large numbers, subtle icons, and trend indicators (like Instantly's "CONTACTED 1770", "OPENED 338", "POSITIVE 13" cards)
- **Pipeline funnel**: Horizontal progress bar visualization instead of the current box layout
- **Area chart**: Replace the bar chart with a stacked area chart (like Instantly's analytics view) showing discovered/contacted/responded over time using Recharts `AreaChart`
- **Hot leads**: Table format instead of list cards
- **Recent activity**: Cleaner timeline with icons and relative timestamps

**Files**: `src/pages/Dashboard.tsx` (rewrite), `src/pages/Reports.tsx` (rewrite)

---

### 6. Reports Page -- Professional Analytics

- **KPI cards** with sparkline mini-charts
- **Conversion funnel** as a horizontal bar with percentages
- **Campaign performance table** showing each campaign's open/reply rates
- **Leads by category** as a horizontal bar chart instead of grid boxes
- **Export** button kept

**Files**: `src/pages/Reports.tsx`

---

### 7. Campaigns Page -- Table Layout

Switch from card list to a proper data table:
- Columns: Subject, Lead, Channel, Status, Template, Date, Actions
- Inline send/copy buttons
- Better modal for email preview

**Files**: `src/pages/Campaigns.tsx`

---

### 8. Global UI Polish

- Tighten spacing, use consistent card borders with subtle shadows
- Add smooth transitions on hover states
- Make the sidebar more compact with smaller icons
- Add a top header bar with page breadcrumbs and user avatar

**Files**: `src/components/AppLayout.tsx`, `src/index.css`

---

### Files to Modify

| File | Change |
|---|---|
| `src/pages/LeadDiscovery.tsx` | Table view with filters, fix blocked links |
| `src/pages/Dashboard.tsx` | Instantly-style analytics |
| `src/pages/Reports.tsx` | Professional charts and tables |
| `src/pages/Campaigns.tsx` | Table layout |
| `src/components/AppLayout.tsx` | Header bar, compact sidebar |
| `src/index.css` | UI polish tweaks |
| `supabase/functions/ai-discover/index.ts` | Email prioritization in prompts |

This is a large UI overhaul. I recommend implementing it in 2-3 rounds: first the Lead Discovery table + bug fixes, then Dashboard/Reports, then Campaigns polish.

