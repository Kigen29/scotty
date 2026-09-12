---
"scotty": patch
---

Fix `auto-discover` calling `sanitizeForPrompt` without defining it.

Every other function that uses the sanitiser declares its own copy;
`auto-discover` did not. The resulting `ReferenceError` was thrown inside the
`try` block that wraps lead analysis and swallowed by its `catch`, so on the
Firecrawl discovery path every lead was written with no `analysis` and no
`priority_score`. Since `daily-outreach` orders by `priority_score`, those leads
sorted last and were effectively never contacted — silently, for as long as the
path has existed.

Found by adding `deno check` to CI, which reports it as
`TS2304: Cannot find name 'sanitizeForPrompt'`.
