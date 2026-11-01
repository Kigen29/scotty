---
"scotty": minor
---

Call-assisted outreach: a call list, prepared call notes, a free personal report, and consent recorded on the call.

Discovered businesses have phone numbers but almost never email addresses, and cold WhatsApp or SMS breaks Meta's
rules and Kenya's consent law. So outreach starts with a person calling.

- **Calls** screen: people who just opened their report (call now), call-backs due today in Nairobi time, and
  qualified businesses not yet called, best first.
- **Call panel** on each lead: Claude prepares an opener, three talking points, answers to likely objections and the
  ask. You log the outcome as no answer (retry in two days), call back (pick a time), not interested or interested.
- **Consent.** On "interested", ticking "they agreed to receive the free report" records consent. Only then can the
  report go out: WhatsApp or SMS from your phone with the message ready, or an email from Scotty. Consent also lets
  Scotty reply to them by email from then on.
- **Free report** at code5developers.com/r/<token>, served from `/api/public/report`: what they're missing, how
  many competitors in the same search already have a site, the package that fits and its price, and a relevant case
  study. The first time it's opened in a browser (link previews don't count), the studio gets an "Opened their
  report" email.
