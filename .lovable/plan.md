

# Plan: Personal Autonomous Outreach System

## Overview
Transform the system from a company-branded, semi-manual workflow into a fully autonomous personal outreach system that sends emails from Emmanuel Kigen (emmanuelkigen029@gmail.com) without requiring manual approval at any step.

## Changes

### 1. Edge Function: `send-email/index.ts`
- Change the `from` field from `${companyName} <${senderEmail}>` to `Emmanuel Kigen <emmanuelkigen029@gmail.com>` (or read sender name from settings instead of company_name)
- Remove dependency on `settings.company_name` for the "from" name

### 2. Edge Function: `auto-follow-up/index.ts`
- Change `from` field from `${companyName} <${senderEmail}>` to use a personal name (from settings or hardcoded)
- Remove company references from the AI follow-up prompts
- Add personal context: "You are Emmanuel Kigen, a freelance web developer reaching out personally"

### 3. Edge Function: `generate-email/index.ts`
- Remove all company references from the AI prompts (`companyName`, company portfolio, company services framing)
- Reframe the prompt as a personal outreach: "You are Emmanuel Kigen, a web developer..." instead of "Mention ${companyName} and our services"
- Keep services and portfolio but frame them as personal offerings, not company offerings
- Update signature handling to use personal name

### 4. Edge Function: `auto-discover/index.ts` (make fully autonomous)
- After discovering and inserting new leads, automatically:
  1. Set lead status to "qualified" (skip manual approval)
  2. Generate a first-touch email via AI (inline, same logic as generate-email)
  3. Insert the email campaign as "draft" (the auto-follow-up cron will pick it up and send it)
- This closes the loop: discover -> qualify -> draft email -> send (all automatic)

### 5. Settings Page (`src/pages/SettingsPage.tsx`)
- Replace "Company Name" label with "Your Name"
- Replace "Company Website" with "Your Website / Portfolio"
- Remove "Company Profile" card title, replace with "Your Profile"
- Pre-fill sender_email with emmanuelkigen029@gmail.com in the default state

### 6. Lead Discovery Page (`src/pages/LeadDiscovery.tsx`)
- No major changes needed (manual discovery still available as supplement)
- The autonomous flow handles everything automatically in the background

## Autonomous Flow (after changes)

```text
Every 6 hours (auto-discover cron):
  1. Pick random category + location from settings
  2. Search for businesses without websites (Firecrawl)
  3. Extract leads via AI
  4. Insert leads as "qualified" (skip manual approval)
  5. Generate personalized first-touch email via AI
  6. Save as draft campaign

Every 2 hours during 8am-5pm EAT (auto-follow-up cron):
  1. Send all draft emails (first-touch + follow-ups)
  2. Check contacted leads for follow-up timing
  3. Generate follow-up emails when intervals are met
  4. Save follow-ups as drafts (sent on next run)
```

## Important Note
Since the sender email is a Gmail address (emmanuelkigen029@gmail.com), it must be verified as a domain/sender in Resend. If using Resend's free tier, emails will be sent from Resend's shared domain unless the Gmail is added as a verified sender. This may need to be configured in the Resend dashboard.

