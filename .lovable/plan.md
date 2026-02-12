

# Plan: Implement Multi-Agent System from Specification

## Overview
Enhance the existing system to match the uploaded specification by adding the missing agent capabilities, portfolio data, and improved lead intelligence.

## Phase 1: Portfolio Database and Better Email Personalization

### 1A. Add portfolio data to settings
Store your actual projects (heartbeatsafaris.com, rangautiles.com, lakevictoriaaquaculture.com, itchyfeet.co.ke) in a structured format so AI agents can reference relevant examples when crafting emails.

- Add a `portfolio_projects` JSONB column to the `settings` table
- Pre-populate with your projects: industry, URL, features, problem solved
- Update the email generation prompts in `generate-email` and `auto-discover` to include relevant portfolio examples matched by industry

### 1B. Update Settings Page UI
- Add a "Portfolio Projects" section where you can add/edit projects with fields: URL, Industry, Features, Problem Solved
- Display them as editable cards

## Phase 2: Analyst Agent (Business Intelligence)

### 2A. Create `analyze-lead` edge function
A new edge function that takes a lead ID and performs deeper research:
- Uses Firecrawl to scrape the lead's social media or directory listing (if URL exists)
- Uses AI to identify specific pain points for that business type
- Matches the business to relevant portfolio projects
- Generates a priority score (1-10) based on: no website, has email, business size signals, industry fit
- Stores analysis results in a new `lead_analysis` column (JSONB) on the leads table

### 2B. Auto-trigger analysis
- In `auto-discover`, after inserting a lead, call the analysis logic inline before generating the email
- This way emails reference specific pain points and relevant portfolio examples

### Database changes:
- Add `priority_score` (integer, default 5) column to `leads` table
- Add `analysis` (JSONB, nullable) column to `leads` table for storing pain points, recommended solutions, matched portfolio projects

## Phase 3: Engagement Agent (Response Handling)

### 3A. Create `classify-response` edge function
When a reply comes in (manually logged or via future webhook):
- AI classifies the response: interested, questions, not_now, not_interested, objection
- Generates an appropriate reply draft
- Updates lead status automatically
- Flags "interested" leads for human review

### 3B. Add Conversations UI improvements
- Show response classification badges
- Show AI-suggested replies
- Add a "Hot Leads" filter on Dashboard for leads classified as "interested"

## Phase 4: Enhanced Reporting

### 4A. Improve Reports page
- Add week-over-week trend indicators
- Add "Hot Leads" section showing interested/high-priority leads
- Fix funnel bar colors for better contrast (same issue as before with HSL variables)
- Add daily activity chart using recharts (already installed)

## Phase 5: Email Best Practices from Spec

### 5A. Add unsubscribe handling
- Append "Reply STOP to unsubscribe" to all outgoing emails
- Add an `unsubscribed` boolean column to leads table
- In `auto-follow-up` and `send-email`, skip leads where `unsubscribed = true`

### 5B. Email warm-up logic
- Start with lower daily limits (20/day for first week)
- Add a `created_at` check on settings to auto-calculate warm-up phase
- Gradually increase sending volume

## Technical Details

### New database migrations:
```sql
-- Add analysis columns to leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS priority_score integer DEFAULT 5;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS analysis jsonb DEFAULT NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unsubscribed boolean DEFAULT false;

-- Add portfolio projects to settings
ALTER TABLE settings ADD COLUMN IF NOT EXISTS portfolio_projects jsonb DEFAULT '[]'::jsonb;
```

### Files to create:
1. `supabase/functions/analyze-lead/index.ts` - Analyst agent

### Files to modify:
1. `supabase/functions/auto-discover/index.ts` - Add inline analysis + portfolio matching before email generation
2. `supabase/functions/generate-email/index.ts` - Use analysis data and portfolio matches in prompts
3. `supabase/functions/auto-follow-up/index.ts` - Skip unsubscribed leads, add unsubscribe footer
4. `supabase/functions/send-email/index.ts` - Add unsubscribe footer to all emails
5. `src/pages/SettingsPage.tsx` - Add portfolio projects editor
6. `src/pages/Dashboard.tsx` - Add "Hot Leads" section
7. `src/pages/Reports.tsx` - Fix colors, add trends chart
8. `src/pages/LeadDiscovery.tsx` - Show priority score and analysis data on lead cards

### Priority order:
1. Portfolio data + better email personalization (biggest impact on conversion)
2. Unsubscribe handling (compliance requirement)
3. Priority scoring (better targeting)
4. Analyst agent (deeper personalization)
5. Enhanced reporting (operational visibility)
6. Engagement agent (response handling - needs webhook setup)

