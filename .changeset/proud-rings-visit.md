---
"scotty": patch
---

Update lucide-react from 0.462.0 to 0.577.0.

A 115-version jump across 54 distinct icons in 37 files. Icons get renamed and
removed between lucide releases, and every one is a named import, so
`tsc --noEmit` is a genuine check here rather than a formality — it passes, so
no icon this app uses has been renamed or dropped.
