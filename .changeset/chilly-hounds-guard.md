---
"scotty": major
---

Stop Scotty contacting businesses that were never real.

Three functions asked a language model to produce businesses — names, plausible
`+254` phone numbers, inferred email addresses — and inserted them as
`status: 'qualified'`, where the sender picked them up highest-priority-first:

- `ai-discover` generated leads outright. Deleted.
- `discover-leads` fell back to generation whenever Firecrawl was unavailable or
  returned nothing. It now fails with a clear 422 instead.
- `social-discover` generated whenever a platform search came back empty. It now
  skips the platform.

A new `leads.verification_state` records provenance and every sender requires
`verified`. Existing rows are backfilled: leads from real search results are
`verified`; leads from the generative path are `rejected`; Instagram and TikTok
leads are held as `unverified` because that function wrote generated and scraped
leads under the same `discovery_source`, so they cannot be told apart after the
fact.

**This will reduce your contactable lead count, possibly sharply.** Those leads
were not prospects; some of the phone numbers belong to real people who are not
your prospects either.

Also adds the first two indexes this schema has ever had, on the columns the
senders actually filter by.
