

# ScoutAgent: Next-Level Feature Recommendations

Based on deep research into Agentible, and competitors like Instantly, Smartlead, Woodpecker, Oppora, Amplemarket, and Sendr, here are the high-impact features that would elevate ScoutAgent from a solid MVP to a competitive outreach platform.

---

## Tier 1 — High Impact, Feasible Now

### 1. Email Verification & Bounce Prevention
**Why:** Agentible emphasizes "clean, verified leads" and "stable inbox placement." ScoutAgent currently stores emails without verification, risking domain reputation.
**What to build:**
- Integrate a free/low-cost email verification API (e.g., ZeroBounce, Hunter.io) via an edge function
- Add a `verified` boolean + `verification_status` column to `leads`
- Auto-verify emails before any outreach is sent
- Show verification badges in the UI

### 2. ICP (Ideal Customer Profile) Definition & Lead Scoring
**Why:** Every top tool (Agentible, Amplemarket, Knock) centers around ICP-based targeting. ScoutAgent has `priority_score` but no structured ICP.
**What to build:**
- New `icp_profiles` table: industry, size, location, revenue range, pain points, weight per signal
- Score leads against the active ICP automatically during analysis
- Filter/sort leads by ICP match percentage
- Settings page section to define and save ICP profiles

### 3. Multi-Step Email Sequences (Drip Campaigns)
**Why:** Agentible's core is "AI-personalized cold email sequences." ScoutAgent sends individual emails + follow-ups but lacks structured multi-step sequences.
**What to build:**
- New `sequences` table: name, steps (JSON array of templates with delays)
- Assign leads to sequences instead of one-off campaigns
- Auto-advance steps based on reply/open status
- Sequence builder UI with drag-to-reorder steps
- Stop sequence automatically when lead replies

### 4. Meeting/Call Booking Integration
**Why:** Agentible's entire funnel ends at "booked call." ScoutAgent currently ends at "interested" status.
**What to build:**
- Add a Calendly/Cal.com link field in Settings
- Auto-include booking link in outreach emails when lead shows interest
- New `meetings` table to track booked calls
- Dashboard metric: "Meetings Booked" as the ultimate conversion KPI

---

## Tier 2 — Competitive Differentiators

### 5. Email Warmup & Deliverability Dashboard
**Why:** Prospeo, Woodpecker, and Smartlead all emphasize warmup. Poor deliverability kills outreach.
**What to build:**
- Track bounce rate, open rate, and spam complaints per sender email
- Deliverability health score on Dashboard (green/yellow/red)
- Recommended daily volume based on domain age and reputation
- Auto-throttle sending when bounce rate exceeds threshold

### 6. AI Response Classification & Auto-Routing
**Why:** Agentible converts "replies into booked meetings." ScoutAgent has `classify-response` but doesn't auto-route.
**What to build:**
- Enhance response classification: interested, not now, unsubscribe, question, meeting request
- Auto-actions per classification: "interested" → send booking link, "not now" → schedule 30-day follow-up, "unsubscribe" → mark lead
- Show classification labels in Conversations page

### 7. Lead Enrichment Pipeline
**Why:** Amplemarket, Cognism, and Apollo all enrich leads with company size, revenue, tech stack.
**What to build:**
- Edge function that uses AI to research a lead and fill in: estimated size, social profiles, tech used, key decision-maker
- Store enrichment in the existing `analysis` JSON column
- "Enrich" button per lead + bulk enrich action
- Display enrichment data in a lead detail drawer/modal

### 8. A/B Testing for Email Templates
**Why:** Top tools test subject lines and body copy to optimize open/reply rates.
**What to build:**
- Allow 2 variants per sequence step
- Track open/reply rates per variant
- Auto-select winner after statistical significance
- Show A/B results in Reports

---

## Tier 3 — Advanced / Long-term

### 9. Landing Page Builder for Leads
**Why:** Since ScoutAgent targets businesses without websites, offering to instantly generate a simple landing page as a "proof of value" would be a killer differentiator no competitor has.
**What to build:**
- AI-generated single-page site based on lead's business info
- Store as HTML in Supabase Storage
- Include preview link in outreach: "Here's what your website could look like"
- Massive conversion booster for the specific Kenyan market

### 10. CRM Pipeline View (Kanban Board)
**Why:** Every serious outreach tool has a visual pipeline. ScoutAgent uses tables only.
**What to build:**
- Kanban board: Discovered → Qualified → Contacted → Responded → Interested → Meeting → Won
- Drag-and-drop leads between stages
- Pipeline value tracking

### 11. Unified Inbox
**Why:** Agentible and Instantly track "every open, reply, and booked meeting" in one place.
**What to build:**
- Single page showing all inbound replies across email, WhatsApp, Instagram
- Thread view per lead with full conversation history
- Reply directly from the inbox

---

## Recommended Implementation Order

| Phase | Features | Estimated Effort |
|-------|----------|-----------------|
| Phase 1 | ICP Profiles + Lead Scoring, Multi-Step Sequences | 3-4 messages |
| Phase 2 | Email Verification, Meeting Booking | 2-3 messages |
| Phase 3 | Lead Enrichment, AI Auto-Routing | 2-3 messages |
| Phase 4 | Deliverability Dashboard, A/B Testing | 3-4 messages |
| Phase 5 | Kanban Pipeline, Unified Inbox, Landing Page Builder | 4-5 messages |

---

## Technical Notes

- All new tables need RLS policies scoped to `user_id`
- Email verification and enrichment would be new edge functions
- Multi-step sequences require a new `pg_cron` job to advance steps
- The landing page builder would use Lovable AI + Supabase Storage
- No new external API keys required for Phase 1-3 (Lovable AI covers enrichment/scoring)

