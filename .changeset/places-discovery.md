---
"scotty": minor
---

Discovery finds real businesses on Google Maps that don't have a website.

The rebuilt Discovery screen searches Google Places (Text Search, New) for a kind of business in an area, in
Kenya: up to 60 results per search, 3 Google requests. It keeps operating businesses with no website or only a
social page (Facebook, Instagram, WhatsApp links and similar). For those it asks Kenya's registry (KeNIC RDAP)
whether a matching .co.ke or .ke domain is registered. Each lead gets a 0–100 prospect score: no site scores
highest, then a phone number, active reviews and a match with your target categories and areas. Every lead comes
from a real listing, with its Google rating, phone and map link. Nothing is generated.

There's a monthly allowance (`PLACES_MONTHLY_LIMIT`, default 900) to stay inside Google's 1,000 free requests. Under
Google's terms, discovered leads nobody acts on are cleared after 30 days, and the place id is kept for re-lookup.
Leads can be qualified, dismissed or restored. The old 765-line discovery page and its dead AI pipeline buttons are
gone. Lint debt drops from 122 to 102.
