# MATOP summary: PG-208

**Run ID**: 20261020231931-3d9aa8b9
**HEAD validated**: `5f11ac307`, the merge of `origin/main` (`e7ce625b2`), plus `faf1e98d4` (rule-row layout fix) and `416b2a253` (IA router count).
**Consensus**: **PASS**. All three STOAs pass.

| STOA | Verdict | File | Why |
|---|---|---|---|
| Foundation | PASS (2026-10-21, at `743586efe`) | `stoa-verdicts/foundation.json` | Typecheck, lint, builds and integration all exit 0. The migration is Class A. No log/coverage/tsbuildinfo files, no package changes, no foreign icons. Re-confirmed after the merge by the `merge-*` gates below. |
| Domain | PASS (re-run 2026-10-22, at `5f11ac307`) | `stoa-verdicts/domain.json` | The merge touched no PG-208 domain, validator, router, store, runtime or page file. The hexagonal, Zod, tenant-scope, wiring and locked-admission findings still hold. AC-TA-019 is met by the authenticated Lighthouse run (performance 0.93–0.94, accessibility 0.93). Supersedes the 2026-10-21 NEEDS_HUMAN. |
| Security | PASS (re-run 2026-10-22, at `5f11ac307`) | `stoa-verdicts/security.json` | After #975, `pnpm audit --prod --audit-level high` exits 0. The gitleaks range scan is clean. The webhook HMAC, replay, limiter, scrubbing and RLS findings still hold. #977's merge-aware hook narrows the check without weakening it. The 2 moderate advisories are inherited and tracked in #876 and #979. Supersedes the 2026-10-21 FAIL (#974). |

## Gates

| Gate | Result | Evidence (`gates/`) |
|---|---|---|
| TypeScript (full), merged tree | PASS | `merge-01-typecheck.txt` |
| Lint (full), merged tree | PASS | `merge-02-lint.txt` |
| Tests + coverage, merged tree | PASS after the IA fix | `merge-03b-coverage.txt`: one web failure, `ia-reconciliation` router count 71 vs 72, fixed in `416b2a253`. `merge-03c-web-suites.txt`: page, settings-search and all `src/app/__tests__` suites pass (25 files, 312 tests). The pre-merge full run passed 17/17 (`final-03-coverage.txt`). |
| Diff coverage | PASS: 95.6% | `merge-04-diff-coverage.txt` |
| Web and API builds, merged tree | PASS | turbo build 14/14 (2026-10-22) and `final-05/06-*.txt` |
| Integration (ephemeral DB with main's migrations) | PASS: 46/46 | `merge-07-integration.txt` |
| migrate diff | No PG-208 or PG-199 drift. Exit 2 is main's pre-existing drift (#953). | `merge-08-migrate-diff.txt` |
| Dependency audit (high) | PASS | `final-10-audit-after-merge.txt` |
| Sonar guard (whole branch diff) | PASS: 101 files | `final-09-sonar-guard-branch.txt` |
| Lighthouse (authenticated, `/tasks/automation`) | PASS: performance 0.93/0.94/0.93, accessibility 0.93 ×3 | `artifacts/lighthouse/PG-208/auth/`, `waiver-evidence.md` |
| Design screenshots | Taken; a layout defect was found and fixed | `artifacts/screenshots/PG-208/`, `design-check.md` |
| SQL review (Class A) | APPROVED | `sql-review.md` |

## Tracked out-of-scope findings from this pass

- #978: some Material Symbols render clipped in shared components (sidebar, radio indicator).
- #979: moderate hono advisory via Prisma dev tooling.
- #871 and #540: shared contrast tokens. They fail the authenticated harness's extra colour-contrast assertion on every page.
