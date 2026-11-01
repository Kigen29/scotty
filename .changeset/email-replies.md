---
"scotty": minor
---

Email replies come back into Scotty and get answered like enquiries.

Scotty's emails now set their reply address to `reply+<lead id>@INBOUND_DOMAIN`. When someone replies, Resend
receives it and posts `email.received` to `/api/inbound/email`. Scotty verifies the signature, fetches the
message, keeps only what they wrote this time (quoted history, Outlook headers and signatures stripped), and files
it on the right lead.

Before any AI is involved:
- Out-of-office notices, bounces and bulk mail are recorded and never answered, so two robots can't loop.
- "STOP", "unsubscribe" and "remove me" mark the person don't-contact immediately.

Then it runs the same pipeline as a website enquiry, except that Claude now sees the conversation so far: it
answers in context, doesn't repeat the pitch, and holds anything risky for you. Inactive until
`INBOUND_DOMAIN` and `RESEND_WEBHOOK_SECRET` are set.
