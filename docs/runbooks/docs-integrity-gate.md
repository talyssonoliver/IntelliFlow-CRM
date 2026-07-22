# Runbook — Docs Integrity Gate (DOC-016)

**Task:** DOC-016 · **Owner:** PM (STOA-Automation) · **Applies to:** any PR
that changes app routes (`apps/web/src/app/**/page.tsx`) or the design docs that
quote route totals.

## Why this exists

Seven design docs each quote a "Total Pages" figure and summary aggregates
(Public / Developer / Protected page counts). Historically these drifted apart —
different docs claimed 68 / 101 / 103 / 118 / 211 — because nothing forced them
to agree with the actual filesystem. DOC-015 reconciled them to the single
canonical total emitted by the live audit (currently **211**) and added a
regression _test_. DOC-016 promotes that guarantee into a **PR gate**: if a doc
drifts from the live audit, the PR fails.

The canonical number is **never hardcoded**. The oracle is
`runAudit(repoRoot).summary` in `tools/scripts/content-audit.ts`, which scans
`apps/web/src/app/**/page.tsx`. When routes are added or removed the expected
figures self-update, and any doc still quoting the old number is flagged.

## Components

| File                                                      | Role                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `tools/scripts/docs-integrity-audit.ts`                   | The gate. CLI that compares each doc's canonical lines to the live audit.    |
| `tools/scripts/__tests__/docs-integrity-audit.test.ts`    | Proves drift detection (100% of injected mismatches) + false-positive guard. |
| `tools/scripts/__tests__/docs-integrity.vitest.config.ts` | Build-free, coverage-enforced (≥90%) config for the test.                    |
| `.github/workflows/docs-integrity.yml`                    | CI gate — runs on route/doc changes, comments + fails the PR on drift.       |
| `scripts/pre-ship.mjs` (`docs-integrity` step)            | Same gate locally, so drift is caught before push, not after a CI round.     |

## What is checked

Against the live audit (`total`, `public`, `developer`, `protected`):

- **Canonical route total** — the `Total Pages` declaration line of all seven
  target docs (`sitemap.md`, `page-registry.md`, `PAGE_MAP_AND_FLOWS.md`,
  `ui-flow-mapping.md`, `navigation-reachability-audit.md`,
  `information-architecture.md`, `content-audit.md`).
- **Summary aggregates** — the `Public Pages` / `Developer Pages` /
  `Protected Pages` rows of the canonical summary tables in
  `PAGE_MAP_AND_FLOWS.md` and `information-architecture.md`, plus the
  `N auth-gated entries` line in `content-audit.md`.

Each check is anchored to a specific line shape (a Markdown table row, or the
`**Total Pages**:` header), so coincidental numbers — a
`### Public Pages (27 routes)` section header, a changelog "Updated to 102
pages" — are **not** mistaken for the canonical figure.

## Canonical counting semantics

`Total Pages` = every `page.tsx` under `apps/web/src/app` (route groups like
`(public)/` stripped, `[id]` dynamic segments collapsed, `app/api/` excluded).
Aggregates partition that total: `public` = routes under `(public)/`,
`developer` = routes under `(developer)/`, `protected` = everything else
(auth-gated). By construction `public + developer + protected == total`.

## How to fix a failure

The gate prints exactly which doc and which figure drifted, e.g.:

```
✗ FAIL — 1 drift finding(s):
  • docs/design/PAGE_MAP_AND_FLOWS.md: "Protected Pages" cites 162 but the live filesystem audit says 165.
```

1. Regenerate the canonical numbers from the filesystem:

   ```bash
   pnpm tsx tools/scripts/content-audit.ts
   ```

   This refreshes `artifacts/reports/content-audit-results.json` and prints the
   current `total / public / auth-gated / developer` counts.

2. Update the flagged `Total Pages` / summary-table lines in each named doc to
   the canonical values. Keep the `> **Canonical counts**` admonition intact.

3. Re-run the gate until green:

   ```bash
   pnpm run validate:docs-integrity   # the CLI gate
   pnpm run test:docs-integrity       # the gate's own tests (coverage-enforced)
   ```

## Local vs CI

- **Local:** the `docs-integrity` pre-ship step runs `validate:docs-integrity`
  on every push. It is build-free and needs no DB.
- **CI:** `docs-integrity.yml` runs on PRs touching routes/docs, comments the
  fix procedure on drift, and fails the required check.

Both share the same entry point (`tools/scripts/docs-integrity-audit.ts`), so a
green pre-ship means a green CI gate.

## Related

- DOC-015 — the reconciliation that established canonical 211 and the regression
  test `tools/scripts/route-total-consistency.test.ts`.
- `tools/scripts/content-audit.ts` — the audit oracle (also gated by
  `.github/workflows/content-audit.yml`).
