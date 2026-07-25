# Pre-ship attestation (final-SHA enforcement)

> Closes the gap reported in
> [#644](https://github.com/talyssonoliver/IntelliFlow-CRM/issues/644)
> (ENG-OPS-003.Gap13). Spec:
> `.specify/sprints/sprint-19/specifications/ENG-OPS-003.Gap13-FinalShaAttest-spec.md`.

## The problem this solves

`scripts/pre-ship.mjs` runs from `.husky/pre-push`, keyed to the SHA being
pushed. But a PR's **final** head SHA is routinely not a SHA any developer
machine ever pushed:

- branch protection on `main` sets `strict: true`, so `gh pr update-branch` (or
  the _Update branch_ button) is **mandatory** whenever `main` moves — and it
  builds that merge commit **server-side**;
- squash-merge creates yet another commit at merge time.

Neither passes through the hook. #637 shipped with three clean local pre-ship
runs on the branch while the merged head — `319b8df26`, produced by two
server-side update-branch merges — had none. Nothing detected it.

## What the control is

`pnpm preship:attest` publishes an **annotated tag object at
`refs/preship/<sha>`** whose message is a JSON payload recording that a local
pre-ship run produced a full-gate PASS for exactly that SHA. The
`Pre-ship Attestation` job in `.github/workflows/pr-checks.yml` verifies it for
`github.event.pull_request.head.sha`.

**This is an honesty / process control, not a security boundary.** Anyone with
push access can publish an attestation without running the gate — exactly as
`git push --no-verify` already bypasses the hook. It catches the _accidental_
gap: a merge moved the SHA out from under a developer who genuinely ran the
gate. It does not stop a determined bypass, and it must never be described as
though it does. Overselling a skippable gate is how the #265 `SKIP_PRESHIP`
erosion happened.

What the payload _does_ defend against is **accidental laundering of a degraded
run**. `scripts/pre-ship.mjs` writes `verdict: "PASS"` for a `--only=lint`
subset run and for a `PRESHIP_ALLOW_MISSING=1` run where a required guard never
executed. `scripts/preship-attest.mjs` therefore ignores the top-level verdict
and re-derives the result from `steps[]` against the run's recorded
`expected_step_ids`, refusing both cases.

## Normal flow

Nothing to do. The `pre-push` hook publishes the attestation automatically after
a green gate:

```
git push                     # pre-ship runs, goes green, attestation published
```

If publishing fails (offline, uncached credentials), the push still succeeds —
it is warn-only by design, because the CI check is the real enforcement point.
Publish it manually before merging:

```
pnpm preship:attest
```

## After `gh pr update-branch` — the policy

**The new head SHA must be attested locally before merge.** Full CI is _not_
accepted as a substitute for the server-side merge commit; that is the whole
point of #644.

```bash
git fetch origin
git checkout <new-head-sha>      # detached is fine
pnpm run pre-ship                # most steps hit the resumable cache
pnpm preship:attest
gh run rerun --job <failed-job-id>
```

The re-run is needed because publishing a ref creates no commit, so no
`synchronize` event fires and the failed check does not retrigger itself.

**Squash-merge commits are explicitly out of scope.** The squash commit is
created _after_ all checks pass and is tree-identical to the attested head, so
attesting it is impossible by construction and unnecessary in substance. This is
a recorded decision, not an oversight.

## Exemptions

Each prints an explicit `::notice` in the job log, so an exemption is always
visible rather than silent.

| Case                                             | Why                                                                                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `dependabot[bot]`, `github-actions[bot]` authors | the branch is created server-side; no developer machine exists to run the gate. Full CI is its gate.                               |
| Fork PRs                                         | a fork has no push access to the base repo and can never publish the ref. A maintainer gates it locally before merge.              |
| `merge_group` events                             | `github.event.pull_request` is null there; the queue ref is server-built and the PR head it came from carries its own attestation. |

## Making the check required

The workflow job alone is advisory. To enforce it, a repo admin adds the context
— **only after this workflow file is on `main`**. Adding it earlier makes it a
_permanently pending_ required context on every open PR whose base predates the
file: the job does not exist on those branches, so it can never report, and the
bot exemption cannot help.

```bash
gh api -X PATCH repos/talyssonoliver/IntelliFlow-CRM/branches/main/protection/required_status_checks \
  -f 'contexts[]=Unit Tests (sharded) / Merge Coverage Gate' \
  -f 'contexts[]=Unit Tests (sharded) / SonarCloud Scan' \
  -f 'contexts[]=Architecture Tests' \
  -f 'contexts[]=Build' \
  -f 'contexts[]=Integration Tests' \
  -f 'contexts[]=Lint & Format' \
  -f 'contexts[]=Sprint Plan Validation' \
  -f 'contexts[]=Type Check' \
  -f 'contexts[]=Deploy Preview' \
  -f 'contexts[]=PR Summary' \
  -f 'contexts[]=PR Validation' \
  -f 'contexts[]=Pre-ship Attestation'
```

Open PRs created before the merge need one `gh pr update-branch` to pick the job
up — and then, per the policy above, a fresh local attestation at the new head.

## Gotchas

- **`core.hooksPath` is absolute.** It resolves to the _main_ checkout's
  `.husky` directory, so a push from a sibling worktree runs the **main**
  checkout's hook, not the worktree's. Worktree pushes therefore do not
  auto-publish; use `pnpm preship:attest` explicitly. (This is how this
  feature's own PR was attested.)
- **Credential prompts.** The publish path sets `GIT_TERMINAL_PROMPT=0` so an
  uncached credential fails fast instead of hanging a non-interactive hook. If
  publishing fails this way, cache your credentials and re-run
  `pnpm preship:attest`.
- **A dirty working tree is refused.** Uncommitted changes mean the gate did not
  run against the commit as committed.
- **A stale `last-run.json` is refused.** The recorded `git_head` must equal the
  SHA being attested.
- **The gate version is pinned.** The payload carries the sha256 of the
  `scripts/pre-ship.mjs` that produced the run, and `--verify` re-hashes the
  file in the checkout under test. Editing the gate to narrow its step list
  invalidates existing attestations rather than silently inheriting them.

## Known follow-up

`refs/preship/*` grows by one small tag object per attested SHA and is never
swept. Client-side impact is nil — the namespace is outside the default fetch
refspec, so clones and `git fetch` are unaffected. A periodic cleanup workflow
was deliberately left out of scope; add one if the namespace becomes unwieldy.

## Reference

```
node scripts/preship-attest.mjs --publish
node scripts/preship-attest.mjs --verify --sha=<40-hex>

  --remote=<name|path>   default: $PRESHIP_ATTEST_REMOTE or "origin"
  --state=<path>         default: <repo>/artifacts/preship/last-run.json
  --preship-file=<path>  default: <repo>/scripts/pre-ship.mjs
```

Tests: `scripts/__tests__/preship-attest.test.ts` —
`pnpm exec vitest run --project root scripts/__tests__/preship-attest.test.ts`.
