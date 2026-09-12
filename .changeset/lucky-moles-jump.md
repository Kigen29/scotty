---
"scotty": patch
---

Update dependencies: the tooling group, next-themes, tailwind-merge,
@tanstack/react-query and sonner.

Consolidated from four Dependabot pull requests into one branch so the whole set
could be verified together, rather than merged one at a time with a rebase
between each.

All minors and patches. `next-themes` 0.3 → 0.4 and `eslint-plugin-react-refresh`
0.4 → 0.5 are 0.x bumps, which can carry breaking changes, so theming was
checked in a browser rather than assumed: the root class, `color-scheme` and the
painted background all switch correctly between light and dark.
