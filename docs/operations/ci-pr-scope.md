# PR CI scope: affected-only checks

Pull requests run only the work their diff can affect. Push to `main`,
`merge_group` and the nightly always run the full suite.

## How a PR is classified

`Detect Changes` (in `ci.yml` and `pr-checks.yml`) runs
`scripts/ci/affected.mjs` on the PR diff and picks one mode.

| mode       | when                                                                                                                                                                                                     | what runs                                                                                                                                                                                                                                      |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full`     | any root-level file (`package.json`, `pnpm-lock.yaml`, `turbo.json`, `tsconfig*.json`, `vitest.config.ts`, `.nvmrc`...), `.github/`, `packages/typescript-config/`, ESLint config, any unrecognised path | everything, as before                                                                                                                                                                                                                          |
| `affected` | workspace packages, `scripts/`, `tools/scripts/`, `tests/`                                                                                                                                               | lint / typecheck / build through turbo `--filter` for the changed packages plus every package that depends on them; unit shards for the tests under those directories; integration; architecture; boot smoke if `@intelliflow/web` is affected |
| `none`     | Markdown, `docs/`, `artifacts/`, `.specify/`, the project-tracker metrics, `tests/e2e/`, `tests/property/`                                                                                               | format check on the changed files; every other required job reports success without doing work                                                                                                                                                 |

The unit matrix is sized to the share of unit-test files selected: a change to
one worker gets 1 or 2 shards, a web-only change about 9, a `domain` change
nearly all 20.

## Guarantees

- **The 11 required checks always report.** Jobs are skipped with `if:` (a
  skipped job counts as passed) or run and do nothing. No workflow is
  path-filtered.
- **Detection failure means a full run.** Every consumer treats an empty output
  as `full`, and the jobs that need `Detect Changes` run with `!cancelled()`, so
  a broken detector cannot turn checks green by skipping.
- **The coverage gate judges the shards that ran.** `Merge Coverage Gate` fails
  on any failed, cancelled or unexpected skipped shard. The whole-repo coverage
  floor is enforced on full runs only (push to `main`, nightly), because an
  affected run covers a subset of files by design.

## Changing the rules

The path lists live at the top of `scripts/ci/affected.mjs` and are covered by
`scripts/__tests__/ci-affected.test.ts`. When in doubt, add a path to the full
list: a slower PR is cheaper than an untested merge.
