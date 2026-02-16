

# ScoutAgent: Multi-Channel Autonomous Pipeline Upgrade

## Overview
This plan adds social media discovery, multi-channel outreach intelligence, smarter autonomous lead selection, date-based filtering across all pages, and a sidebar styling fix.

---

## 1. Database Changes

Add new columns to support social media discovery and multi-channel contact methods:

**`leads` table updates:**
- `discovery_source` (text, default `'web'`) -- tracks where the lead was found: `web`, `instagram`, `tiktok`, `linkedin`
- `contact_channels` (jsonb, default `'[]'`) -- structured list of available contact methods, e.g. `[{"type": "email", "value": "..."}, {"type": "whatsapp", "value": "..."}, {"type": "instagram_dm", "handle": "..."}, {"type": "linkedin", "url": "..."}]`
- `social_links` column already exists but is underutilized -- we will populate it with Instagram/TikTok/LinkedIn URLs

**`email_campaigns` table updates:**
- `channel` (text, default `'email'`) -- the outreach channel used: `email`, `whatsapp`, `instagram_dm`, `linkedin`
- This lets the Campaigns page show all outreach types, not just email

---

## 2. Social Media Discovery Agent

**New edge function: `supabase/functions/social-discover/index.ts`**

Uses Firecrawl search to find Kenyan businesses on Instagram and TikTok:
- Search queries like `"site:instagram.com ${category} ${location} Kenya"` and `"site:tiktok.com ${category} ${location} Kenya business"`
- AI extracts business name, handle, bio info, any contact details (email in bio, phone, WhatsApp link)
- Inserts leads with `discovery_source: 'instagram'` or `'tiktok'` and populates `social_links` and `contact_channels`
- Runs inline analysis (same as current auto-discover) to score and enrich each lead
- Registered in `config.toml` with `verify_jwt = false`

**Update `supabase/functions/auto-discover/index.ts`:**
- After the existing web discovery loop, add a second pass that calls the social media search logic (Instagram + TikTok)
- Alternates between web and social sources on each cron run to avoid redundancy

---

## 3. Smart Daily Outreach Agent

**New edge function: `supabase/functions/daily-outreach/index.ts`**

This runs daily (or can be called by auto-follow-up) and:
1. Queries all leads with status `qualified` or `discovered` that were found today or have no outreach yet
2. Sorts by `priority_score` descending, picks the top N leads (based on `daily_send_limit`)
3. For each lead, determines the best contact channel:
   - If `email` exists: generate and queue an email (existing flow)
   - If no email but `phone` exists: generate a WhatsApp message template and store as a campaign with `channel: 'whatsapp'` (user sends manually or via WhatsApp Business API later)
   - If no email/phone but has Instagram handle: generate an Instagram DM draft with `channel: 'instagram_dm'`
   - If LinkedIn profile exists: generate a LinkedIn connection message with `channel: 'linkedin'`
4. Auto-sends email campaigns via Resend (existing flow)
5. Non-email channels are saved as `draft` for the user to copy-paste or send manually (with clear instructions in the UI)

**Update `auto-discover` to call `daily-outreach` logic at the end** so the full pipeline is: Discover -> Analyze -> Pick Hottest -> Draft Messages -> Send Emails.

---

## 4. Multi-Channel UI in Campaigns Page

Update `src/pages/Campaigns.tsx`:
- Add channel icons (Mail, Phone, Instagram icon, LinkedIn icon) next to each campaign
- Filter tabs: All | Email | WhatsApp | Instagram DM | LinkedIn
- For non-email drafts, show a "Copy Message" button instead of "Send" since those channels require manual sending
- Show the contact handle/number the message is addressed to

---

## 5. Date Filtering System (All Pages)

Add a reusable date filter component and apply it to every data page:

**New component: `src/components/DateFilter.tsx`**
- A horizontal bar with preset buttons: Today, Yesterday, This Week, This Month, All Time
- Optional date range picker using the existing Calendar component
- Returns a `{ from: Date, to: Date }` range

**Apply to these pages:**

- **Lead Discovery (`LeadDiscovery.tsx`)**: Filter leads by `discovered_at` / `created_at`. Default view shows "Today"
- **Campaigns (`Campaigns.tsx`)**: Filter by `created_at`. Default shows "Today"
- **Conversations (`Conversations.tsx`)**: Filter by `created_at`. Default shows "This Week"
- **Dashboard (`Dashboard.tsx`)**: Filter activities by date range
- **Reports (`Reports.tsx`)**: Filter all data by date range (replace hardcoded 7-day window)

---

## 6. Sidebar Text Color Fix

**Update `src/components/AppLayout.tsx`:**
- Change nav item text from `text-sidebar-foreground` (gray) to `text-foreground` (black/white depending on theme)
- Inactive items: `text-foreground` instead of `text-sidebar-foreground`
- Active items remain highlighted with `bg-sidebar-accent text-sidebar-primary`
- Sign Out button also updated to `text-foreground`

---

## 7. Settings Page Update

**Update `src/pages/SettingsPage.tsx`:**
- Add a "Social Media Channels" section where users can toggle Instagram and TikTok discovery on/off
- Add fields for WhatsApp Business number (used in outreach templates)

**Database:** Add `social_discovery_enabled` (boolean, default true) and `whatsapp_number` (text) to `settings` table.

---

## Technical Details

### Edge Function Changes Summary

| Function | Change |
|---|---|
| `auto-discover` | Add social media discovery pass (Instagram/TikTok via Firecrawl), call daily-outreach at end |
| `social-discover` (new) | Dedicated social media search + extraction + analysis |
| `daily-outreach` (new) | Pick hottest leads, determine best channel, generate messages, auto-send emails |
| `config.toml` | Register `social-discover` and `daily-outreach` |

### New Database Migration

```text
ALTER TABLE leads ADD COLUMN discovery_source text DEFAULT 'web';
ALTER TABLE leads ADD COLUMN contact_channels jsonb DEFAULT '[]';
ALTER TABLE email_campaigns ADD COLUMN channel text DEFAULT 'email';
ALTER TABLE settings ADD COLUMN social_discovery_enabled boolean DEFAULT true;
ALTER TABLE settings ADD COLUMN whatsapp_number text;
```

### New/Modified Frontend Files

| File | Change |
|---|---|
| `src/components/DateFilter.tsx` | New reusable date filter component |
| `src/components/AppLayout.tsx` | Black sidebar text |
| `src/pages/LeadDiscovery.tsx` | Add DateFilter, discovery source badges (web/instagram/tiktok), contact channel indicators |
| `src/pages/Campaigns.tsx` | Add DateFilter, channel filter tabs, multi-channel icons |
| `src/pages/Conversations.tsx` | Add DateFilter |
| `src/pages/Dashboard.tsx` | Add DateFilter to activities |
| `src/pages/Reports.tsx` | Add DateFilter for all metrics |
| `src/pages/SettingsPage.tsx` | Social discovery toggles, WhatsApp number field |

### Implementation Order

1. Database migration (new columns)
2. Sidebar color fix (quick win)
3. DateFilter component + apply to all pages
4. `social-discover` edge function
5. `daily-outreach` edge function
6. Update `auto-discover` to integrate social discovery + daily outreach
7. Update Campaigns page for multi-channel
8. Update Lead Discovery page with source badges and channel indicators
9. Settings page social media toggles
10. Deploy all edge functions and test end-to-end

