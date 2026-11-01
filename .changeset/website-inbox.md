---
"scotty": minor
---

Website enquiries arrive in Conversations, sorted by Claude, and replies are sent from Scotty.

code5developers.com now posts each contact-form enquiry to `/api/inbound/website`, which is authenticated
with a shared secret. Scotty finds or creates the lead (one per email address, so an outreach lead who fills
in the form joins their thread) and records the message. Claude labels it by type and urgency, summarises it,
and drafts a reply into the "AI Suggested Reply" panel, which never worked before. The studio gets an alert email.

**Send Reply now tells the truth.** It used to save the reply as sent first and then call a send function,
ignoring that function's failure, so "Reply sent" appeared when nothing went out. The server now sends first,
records only what actually went, and shows the error otherwise.

**Scotty only replies to people who wrote first.** Resend forbids cold outreach and Kenya's data protection
law requires consent for marketing, so `send-reply` refuses any lead without an inbound message, as well as
anyone unsubscribed.

Conversations gains channel, subject, urgency, category, summary and a suggested subject, through the
first migration in `db/migrations`, applied with `npm run db:migrate`. A "Sort with Claude" button re-runs
triage when the first attempt failed. The date filter defaults to all time, so older threads aren't hidden.
