

## ScoutAgent Platform: Deep Analysis

### What It Is

ScoutAgent is an autonomous lead generation and outreach platform for a freelance web developer (Emmanuel Kigen) targeting Kenyan small businesses that lack websites. It discovers leads, analyzes them with AI, generates personalized outreach, and manages follow-ups.

---

### How It Works (End-to-End Flow)

```text
┌─────────────────┐     ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
│  DISCOVERY       │ ──► │  ANALYSIS     │ ──► │  OUTREACH      │ ──► │  FOLLOW-UP    │
│                  │     │              │     │               │     │              │
│ • Manual search  │     │ • AI scores   │     │ • AI drafts    │     │ • Auto        │
│ • Auto-discover  │     │   leads 1-10  │     │   emails       │     │   follow-ups  │
│ • Social media   │     │ • Pain points │     │ • Multi-channel│     │ • Classify    │
│   (IG, TikTok)   │     │ • Portfolio   │     │   (email, WA,  │     │   responses   │
│                  │     │   matching    │     │   IG DM, LI)   │     │              │
└─────────────────┘     └──────────────┘     └───────────────┘     └──────────────┘
```

**Discovery** (3 pipelines: Firecrawl, Lovable AI, OpenAI):
- `discover-leads`: Manual trigger from UI, respects pipeline setting
- `auto-discover`: Cron-triggered, picks random category+location, discovers leads, chains to `social-discover` then `daily-outreach`
- `social-discover`: Searches Instagram/TikTok for businesses with no website (requires Firecrawl)
- `ai-discover`: Pure AI research agent (no web scraping), used by Lovable AI and OpenAI pipelines

**Analysis** (`analyze-lead`): Scores leads 1-10, identifies pain points, matches portfolio projects, recommends solutions. Email leads get +2 priority boost.

**Outreach** (`generate-email`, `daily-outreach`): AI generates personalized emails/messages per channel. `daily-outreach` autonomously processes top leads sorted by priority score.

**Follow-up** (`auto-follow-up`): Sends pending drafts, generates follow-up emails on schedule (3/7/14 day intervals), supports 4-step sequence (first_touch, follow_up_1, follow_up_2, final_follow_up).

**Response Classification** (`classify-response`): AI classifies inbound replies (interested/questions/not_now/not_interested/objection) and drafts suggested replies.

**Email Delivery** (`send-email`): Uses Resend API with sender email from settings. Appends unsubscribe footer.

---

### What's Working

1. Full authentication flow (signup, login, email verification)
2. Triple-pipeline discovery (Firecrawl/Lovable AI/OpenAI) with pipeline switching in Settings
3. Lead table with filters, sorting, pagination, bulk actions, detail sheets
4. AI-powered lead analysis with priority scoring
5. Multi-channel outreach generation (email, WhatsApp, Instagram DM, LinkedIn)
6. Email sending via Resend
7. Follow-up sequence generation (4-step)
8. Response classification with AI suggested replies
9. Dashboard with metrics, pipeline funnel, 7-day chart, hot leads
10. Reports page with CSV export, conversion funnel, category breakdown
11. Conversations view grouped by lead thread
12. Settings page with profile, portfolio projects, pipeline selection, automation config

---

### What's Missing or Broken

#### Critical Issues

1. **No cron jobs are set up.** The memory says "discovery every 6 hours, follow-ups every 2 hours" but there are ZERO `pg_cron` entries in migrations. `auto-discover`, `auto-follow-up`, and `daily-outreach` are designed as cron functions but nothing triggers them. The autonomous pipeline is completely inert.

2. **`social-discover` hardcodes `FIRECRAWL_API_KEY` requirement.** If user is on Lovable AI or OpenAI pipeline, social discovery always fails because it demands Firecrawl. It should respect the pipeline setting or use AI fallback.

3. **Resend sender domain not configured.** `send-email` uses `from: "${fromName} <${senderEmail}>"` but Resend requires domain verification. If the user hasn't verified their domain with Resend, all emails will fail silently or bounce. There's no guidance or validation in the UI.

4. **No inbound email handling.** The `classify-response` function exists but is never called automatically. There's no webhook, no polling, and no UI to manually input a reply. Conversations page shows threads but there's no way to add inbound messages or trigger classification.

5. **Settings not auto-created.** If a new user signs up, they have no `settings` row. Multiple functions use `.maybeSingle()` and handle null gracefully, but `auto-discover` and `daily-outreach` query `settings` with `is_autonomous = true` -- new users won't appear. There's no migration or trigger to create a default settings row on signup.

#### Feature Gaps

6. **No lead deletion.** Users can dismiss leads but never permanently delete them. No bulk delete either.

7. **No campaign editing.** Draft emails can be sent or copied but never edited before sending. Users can't tweak AI-generated content.

8. **No email open/click tracking.** The `opened_at` column exists on `email_campaigns` but nothing populates it. Would need Resend webhooks to track opens.

9. **No unsubscribe handling.** The "Reply STOP" footer is appended to emails, but there's no webhook or mechanism to actually mark leads as `unsubscribed = true` when someone replies STOP.

10. **Conversations page has no compose/reply capability.** It's read-only -- no way to send a reply from within the app. The classify-response function generates suggested replies but there's no button to send them.

11. **No real-time updates.** No Supabase realtime subscriptions. User must manually refresh to see new leads, campaigns, or conversations.

12. **No mobile responsiveness.** The sidebar is fixed at 224px with no mobile collapse/hamburger menu. Tables overflow on small screens.

13. **`analyze-lead` is separate from discovery.** Manual discovery (`discover-leads`) does NOT auto-analyze leads. Only `auto-discover` and `social-discover` do inline analysis. A manually discovered lead has no `analysis` or `priority_score` until manually triggered.

14. **No webhook for Resend events.** Email bounces, opens, clicks, and spam complaints are not tracked. The `status` on `email_campaigns` only updates to "sent" -- never to "opened", "bounced", or "replied".

15. **No rate limiting or quota visibility.** The UI doesn't show how many emails were sent today vs. the daily limit, or how many AI credits remain.

---

### Priority Recommendations (What to Build Next)

| Priority | Item | Impact |
|----------|------|--------|
| **P0** | Set up pg_cron jobs for `auto-discover` (6h), `auto-follow-up` (2h), `daily-outreach` | Without this, "autonomous mode" doesn't work at all |
| **P0** | Create default settings row on user signup (database trigger) | New users can't use the platform properly |
| **P1** | Add Resend webhook endpoint for email tracking (opens, bounces, replies, unsubscribes) | Closes the feedback loop on outreach |
| **P1** | Add compose/reply UI to Conversations page | Currently no way to respond to leads from the app |
| **P1** | Make `social-discover` respect pipeline setting (AI fallback when no Firecrawl) | Social discovery breaks on non-Firecrawl pipelines |
| **P2** | Add campaign draft editing before send | Users can't customize AI-generated emails |
| **P2** | Auto-analyze leads after manual discovery | Manual leads miss analysis + scoring |
| **P2** | Add mobile responsive layout (collapsible sidebar) | App unusable on mobile |
| **P3** | Add lead deletion (single + bulk) | Data hygiene |
| **P3** | Add daily quota/usage indicators to Dashboard | Visibility into sending limits |
| **P3** | Real-time subscriptions for leads and campaigns | Better UX without manual refresh |

