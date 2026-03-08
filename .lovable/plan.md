

## Problem Diagnosis

The outreach agent **is working** -- it's discovering leads and generating email drafts successfully. However, **none of the emails are actually being sent**. All 20+ campaigns are stuck in `draft` status with `sent_at: null`.

**Root causes:**

1. **Resend requires a verified domain** -- Your sender email is `emmanuelkigen029@gmail.com`. Resend cannot send from Gmail addresses; it requires a custom domain (e.g., `you@yourdomain.com`). The Resend API call likely fails silently, or the condition check passes but the send returns an error.

2. **No visibility into agent activity** -- The Campaigns page shows campaigns but there's no clear indicator of which were auto-generated vs manually created, and no outreach agent status/log panel.

## Plan

### 1. Add "Outreach Agent" activity panel to Dashboard
- Add a new card/section showing recent autonomous outreach activity
- Display: campaigns generated (drafts), emails sent, failures
- Pull from `activity_logs` where `action LIKE 'auto%'` and from `email_campaigns` 
- Show agent status: last run time, next scheduled run, total drafts pending

### 2. Add "Source" badge to Campaigns page
- Tag campaigns as "Auto" vs "Manual" based on `template_type = 'first_touch'` and whether they were created by the agent (check if there's an activity log with matching timestamp)
- Simpler approach: add a `source` column to `email_campaigns` (values: `manual`, `auto_agent`) via migration

### 3. Add "Run Outreach Now" button on Dashboard
- Button that invokes `daily-outreach` function on demand
- Shows results: how many drafts created, how many sent, any errors

### 4. Fix the sending issue
- Update `daily-outreach` to use Resend's default `onboarding@resend.dev` sender when the user's sender email is a free email provider (Gmail, Yahoo, etc.), OR
- Better: surface a clear warning in Settings that Resend requires a verified custom domain for auto-sending
- For now, allow the agent to create drafts and show a "Send All Drafts" bulk action on the Campaigns page

### Database Migration
- Add `source` column to `email_campaigns`: `text DEFAULT 'manual'`
- Update `daily-outreach` edge function to set `source: 'auto_agent'` when inserting campaigns

### Files to modify
- `supabase/functions/daily-outreach/index.ts` -- set `source: 'auto_agent'`
- `src/pages/Dashboard.tsx` -- add agent activity panel with last run info and "Run Now" button
- `src/pages/Campaigns.tsx` -- show source badge (Auto/Manual), add bulk send action
- `src/pages/SettingsPage.tsx` -- add warning about sender email needing a verified domain
- New migration for `source` column

