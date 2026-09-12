---
"scotty": patch
---

Fix the release workflow after the `changesets/action` v1 → v2 bump.

v2 renamed its inputs — `version` → `version-script`, `title` → `pr-title`,
`commit` → `commit-message` — and hard-errors on the old names. Because
`release.yml` only runs on push to `main`, the action bump merged green and
broke the release on the very next push.
