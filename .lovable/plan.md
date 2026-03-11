

## Deep Project Analysis & Cleanup Plan

### WhatsApp Error
The "Account not registered" error (code 133010) means the recipient's phone number isn't registered on WhatsApp. The `daily-outreach` function should catch this specific error and mark the lead's WhatsApp channel as invalid instead of just logging a generic failure — preventing repeated failed attempts on the same number.

### Security Findings (2 Critical)

**1. All RLS policies are STILL RESTRICTIVE**
The previous migration did not fix the issue. All 21 policies across 14 tables remain `RESTRICTIVE` (confirmed by the scanner). This is blocking all data access. A new migration must explicitly drop every policy and recreate them with `AS PERMISSIVE`. The previous migration likely failed silently or used incorrect syntax.

**2. Team admin can self-escalate to owner**
The `team_members` INSERT policy doesn't restrict the `role` value. An admin can insert a duplicate row with `role='owner'`. Fix: add a `UNIQUE(user_id, team_id)` constraint and restrict insertable roles in the policy's `WITH CHECK`.

### Dead Code to Delete

| File | Reason |
|---|---|
| `src/pages/Index.tsx` | Not imported anywhere. Dashboard is at `/`. |
| `src/components/NavLink.tsx` | Not imported by any file. |

### Bug: `filterDateRange` missing from useMemo deps
In `LeadDiscovery.tsx` line 273, `filterDateRange` is used inside `useMemo` but not listed in the dependency array. Date filtering may not re-evaluate when the range changes.

### Bug: Conversations reply uses wrong send-email payload
In `Conversations.tsx` line 54, `send-email` is invoked with `{ to, subject, body }` but the edge function expects `{ campaign_id }`. The reply-via-email feature is silently broken.

### Improvement Opportunities

1. **WhatsApp error handling** — Detect error code 133010 and mark the lead's phone as invalid to stop retrying
2. **Conversations reply** — Either create a campaign record first, or add ad-hoc send support to the send-email function
3. **Reports daily chart** — Currently counts `activity_logs` actions containing "discover" and "email_sent", which may not match actual campaign data. Should use `email_campaigns.sent_at` directly like Dashboard does.

### Implementation Steps

1. **Database migration**: Drop all 21 RESTRICTIVE policies + recreate as PERMISSIVE. Add `UNIQUE(user_id, team_id)` on `team_members`. Update INSERT policy to prevent role escalation.
2. **Fix WhatsApp error handling** in `daily-outreach/index.ts`: Parse the 133010 error, mark lead phone as invalid, skip future WhatsApp attempts.
3. **Fix `filterDateRange` dep** in `LeadDiscovery.tsx` useMemo.
4. **Fix Conversations reply** — create an ad-hoc campaign before invoking send-email.
5. **Delete dead files**: `src/pages/Index.tsx`, `src/components/NavLink.tsx`.
6. **Fix Reports chart** to use campaign sent_at instead of activity_logs.

