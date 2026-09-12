---
"scotty": patch
---

Make CI pass on Dependabot pull requests.

Two things broke every one of them:

- The `branch-name` check held `dependabot/*` branches to our `<type>/<slug>`
  convention. Bots name their own branches, so those and `changeset-release/*`
  are now exempt.
- Dependabot PRs cannot read repository secrets — GitHub scopes them to a
  separate store — so `CI_POSTGRES_PASSWORD` was empty and the `Migrations`
  job failed its fail-fast secret check. The secret now exists in both stores.

Action updates are also grouped into one PR instead of one per action.
