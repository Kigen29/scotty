---
"scotty": minor
---

Scotty replies to new enquiries on its own, and holds the risky ones for you.

When an enquiry arrives, Claude now also says whether the owner should answer personally: complaints,
discounts or custom pricing, contracts and payment terms, legal or refund questions, firm commitments,
existing clients, and tests or unclear messages. Plain code in `api/_lib/autoreply.ts` then decides.

- A genuine new enquiry gets the drafted reply straight away.
- Anything flagged, plus existing clients, suppliers, job seekers and "other", is held, with the reason
  shown in Conversations and in the alert email ("Needs you: …").
- Spam is ignored silently.
- It never emails anyone `canReply()` refuses, and stops after two automatic replies to one person in a
  day, so two automated mailboxes can't loop.

Settings → Automation has the kill switch: "Reply to enquiries automatically", on by default. Every step
is written to the new `scotty.agent_events` table, which feeds the Agent activity screen in the redesign.
Replies show who sent them: you, or Scotty ("Auto").
