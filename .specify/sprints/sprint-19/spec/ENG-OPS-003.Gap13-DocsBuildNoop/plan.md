# Plan — ENG-OPS-003.Gap13 (Docs build silent no-op, #647)

TDD-flavored, minimal-diff plan. All work in isolated worktree
`../iflow-docs-build-647` (branch `feat/docs-build-647`), never the main checkout.

## Step 1 — RED: regression guard (`tools/scripts/__tests__/docs-build-scripts.test.ts`)

Assert the contract before the fix so the guard is proven to fail:

- `docs:build` / `docs:dev` do **not** match `--filter[=\s]+docs` (the empty,
  exit-0 form) and **do** match `--dir docs` + the correct `run` target
  (`build` / `start`).
- `docs/docusaurus.config.js` declares `path: '.'`.
- `pnpm-workspace.yaml` lists no `docs` package entry.

Runs under the `root` vitest project (file-only reads; no product imports).

## Step 2 — GREEN: fix defect 1 (silent no-op)

`package.json`:

- `docs:dev`  → `pnpm --dir docs --ignore-workspace run start`
- `docs:build`→ `pnpm --dir docs --ignore-workspace run build`

`--dir docs` runs the standalone project; `--ignore-workspace` makes it resolve
against `docs/`'s own lockfile/overrides (not the root workspace). Exit code
propagates → no more silent 0.

## Step 3 — GREEN: fix defect 2 config (content path)

`docs/docusaurus.config.js`: add `path: '.'` + minimal `exclude`
(`node_modules`, `src`, Docusaurus defaults). Removes the misleading "docs folder
does not exist" and makes the honest failure name the real content problem.

## Step 4 — hygiene + docs

- `docs/.gitignore`: ignore `build`, `.docusaurus`, `.cache-loader` (the site now
  produces real output).
- `pnpm-workspace.yaml`: update the rationale note — path is fixed, but the site
  still isn't MDX-clean, so `docs/` stays out of the workspace pending curation.

## Step 5 — verify

- New guard passes; prove it fails on regression (revert script → red).
- `pnpm --dir docs --ignore-workspace run build` runs docusaurus and exits ≠ 0
  (hard-error), captured as evidence — no silent success.
- Full local pre-ship clean at final SHA (test DB up on :5433; Node 22).

## Step 6 — ship

Attestation under
`.specify/sprints/sprint-19/attestations/ENG-OPS-003.Gap13-DocsBuildNoop/`,
PR referencing #647, rebase-before-merge, merge on `mergeStateStatus: CLEAN`
verified via the check-runs API. File the content-curation follow-up.

## Risk / blast radius

Tiny. `docs:build`/`docs:dev` are referenced **only** in `package.json` — no
pre-ship step and no CI workflow invokes them, so hard-erroring is gate-neutral.
No product code touched.
