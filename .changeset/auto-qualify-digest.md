---
"scotty": minor
---

Scotty sorts what Discovery finds, and emails a daily digest and a weekly report.

- **Auto-sorting.** After each Discovery search, Claude qualifies independent, trading businesses worth a call and
  dismisses chains and branches, government offices, schools, churches, non-businesses, duplicates and listings with
  no phone. Each decision carries a one-line reason, shown under the business. Dismissals can be restored. The Agent
  screen has a switch, and Discovery has a "Let Scotty sort these" button for anything unsorted.
- **Daily digest** at 08:00 Nairobi and a **weekly report** on Mondays, by Vercel Cron: what came in, what Scotty
  replied to or held, what needs you (with reasons), new enquiries, discovery results, and the top five qualified
  businesses to call with their numbers. The weekly report adds the pipeline.
- **Prospect scores spread out.** Reviews are now log-scaled and the rating counts once there are enough reviews,
  so busy, well-rated businesses no longer all tie at 100.
