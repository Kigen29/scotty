---
"scotty": major
---

Stop initiating WhatsApp, Instagram DM and LinkedIn messages.

Email is now the only channel `daily-outreach` initiates on.

WhatsApp is removed because Meta only permits free-form messages inside a
24-hour window the *customer* opened. Business-initiated contact requires opt-in
and a pre-approved template, so cold free-form sending is a policy violation
that gets the number restricted — the error 133010 handling this code carried
suggests it was already happening.

Instagram DM and LinkedIn are removed because they never sent anything. They
generated a draft with an LLM call and stopped; no code path has ever delivered
one. That burned tokens and inflated the draft count with messages nobody could
receive.

Inbound WhatsApp is untouched — an owner messaging you still lands in
Conversations, and that is the compliant way for a WhatsApp conversation to
start. A lead reachable only by phone is now logged as needing a manual call
rather than silently skipped.
