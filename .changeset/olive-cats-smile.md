---
"scotty": patch
---

Ignore all npm major updates in Dependabot.

The previous rule covered only `vite`, `react`, `react-dom` and `tailwindcss`,
so the first run proposed a single PR bumping `typescript` 5 → 7, `eslint`
9 → 10, `vitest` 3 → 5, `eslint-plugin-react-hooks` 5 → 7 and
`@vitejs/plugin-react-swc` 3 → 4 together. It failed Build, Lint, Test and
Typecheck, and five simultaneous tool majors is not reviewable as one change.

Majors now land deliberately, one package per branch, with the app exercised by
hand. Patches and minors still arrive automatically.
