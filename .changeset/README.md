# Changesets

This folder holds **changesets** — short notes describing what a change does and
how it affects the version. They are the input to the `CHANGELOG.md` and to
version bumps.

Scotty is a private application, not a published package, so a changeset here is
really a **release note**: the changelog is the record of what shipped and when,
which matters a lot for an autonomous system that emails real businesses. When
something goes wrong in production, the changelog is the first place you look to
answer "what changed?".

## Adding one

```sh
npm run changeset
```

It asks for a bump type and a summary, then writes a markdown file here. Commit
that file with your change.

## Choosing the bump type

`scotty` is versioned `0.x` while pre-1.0, so treat the levels as:

| Bump | Use for | Examples |
| --- | --- | --- |
| **major** | Breaking change to data, schema, or the outbound contract | A migration that drops a column; changing what `discovery_pipeline` values mean; anything that can send differently to existing leads |
| **minor** | New capability | Inbound email ingestion; the approval inbox; a new discovery source |
| **patch** | Fixes, refactors, docs, chores, CI | The `sanitizeForPrompt` fix; renaming a label; adding an index |

When in doubt on anything that touches **sending, discovery, or the database**,
go one level higher. An accidental blast to real businesses is not recoverable.

## Writing the summary

The summary lands in the changelog, so write it for the person debugging at
07:00, not for the reviewer who already has your diff:

```
# good
Stop ai-discover inserting LLM-invented businesses into `leads`. Leads from that
path are quarantined as `unverified` and excluded from all send paths.

# bad
fix discovery
```

## Skipping one

Changes that touch no shipped behaviour — editing this file, a README, a comment
— do not need a changeset. CI's changeset check only requires one when the PR
touches `src/`, `supabase/`, or `package.json`, and you can override it by adding
the `no-changeset` label to the PR.
