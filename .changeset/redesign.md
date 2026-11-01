---
"scotty": minor
---

A calmer interface, and the screens an automatic Scotty needs.

The Lovable-era look is gone: no emoji greetings, no icons in coloured tiles, no drop shadows, no amber hover
colour leaking into every menu and button. It's now Geist type, hairline borders, smaller corners and green only
for status and actions. The theme is the same green, in light and dark.

New screens:
- **Home**: what needs you, the last 7 days (enquiries, auto-replies, holds, median time to reply), what Scotty
  did, and the pipeline.
- **Inbox**: replaces Conversations. Threads are labelled *Needs you*, *Replied by Scotty* or *Waiting on them*.
  Held messages show the reason and open with Scotty's draft in the composer.
- **Leads**: a searchable, filterable table with bulk stage changes, deletes and "Add lead".
- **Lead page**: details, stage, notes that save on their own, a "Don't contact" switch, and one timeline of
  messages and agent decisions.
- **Agent**: the automatic-reply switch, the rules in plain words, weekly counts and the full activity log.

Campaigns, Sequences and Deliverability move under "Outreach · paused" with a note explaining why. Sign-in
drops the sign-up option. The never-working team and notification code is removed: the lint debt goes from 147
to 122 warnings.
