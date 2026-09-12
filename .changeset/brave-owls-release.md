---
"scotty": patch
---

Fix the release workflow by moving CI to Node 24.

`@changesets/cli`'s entrypoint calls `module.enableCompileCache()`, which landed
in Node 22.1, so `changeset version` crashed with
`TypeError: enableCompileCache is not a function` on the Node 20 runner — while
every other CI job passed, because nothing else touches changesets.

The Node major is now pinned in one place (the composite setup action) and
mirrored in `.nvmrc`, so local and CI agree. That also closes the same class of
bug that bit the Deno job earlier in this pipeline's life.
