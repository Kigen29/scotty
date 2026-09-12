---
"scotty": patch
---

Fix the gitleaks allowlist so the secret scan passes on a full-history scan.

The config used the `[[allowlists]]` array form, which requires gitleaks >= 8.21.
`gitleaks-action@v2` pins an older build that ignores it silently, so the
allowlist never applied and the scan failed on the public Supabase anon key.
Switched to the singular `[allowlist]` table, which both parsers honour.

This was invisible until now because on a pull request the action scans only
that PR's commits — and none of them touched `.env`. The first full-history
scan, on a push to main, is what surfaced it.
