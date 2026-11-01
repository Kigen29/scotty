---
"scotty": patch
---

Update dependencies and clear the high-severity audit findings.

Consolidates five Dependabot pull requests (#55–#59): `@tanstack/react-query` 5.103.1, `typescript-eslint`
8.70.1, `eslint-plugin-react-refresh` 0.5.7, `@changesets/cli` 3.0.3, `@types/node` 22.20.3 and
`autoprefixer` 10.6.1. `npm audit fix` patches `source-map-js`, `postcss-selector-parser` and `minimatch`.

Removes `zod` and `@hookform/resolvers`, which nothing imports. They were Lovable template leftovers, and
`zod` 3 carried a high-severity advisory whose only fix is the 4.x major.

`react-router` still carries two moderate advisories that need the 6 → 7 major. One concerns server-side
rendering, which this single-page app doesn't do. That upgrade gets its own branch.
