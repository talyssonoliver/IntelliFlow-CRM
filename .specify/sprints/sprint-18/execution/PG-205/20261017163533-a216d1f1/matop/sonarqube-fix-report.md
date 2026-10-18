# /sonarqube-fix: PG-205 (recovery lane, 2026-10-18T08:44Z-08:47Z, HEAD 7319f0d2c)

## Phase 1: discovery

- SonarCloud has no analysis of this branch until the PR exists. There is no local `artifacts/reports/sonarqube/`,
  and no Sonar MCP server is attached. Local proxies were used instead:
  - **sonarjs rules**: `CI=1 SONAR_GUARD_BASE=origin/main pnpm run lint:sonar:guard` over all 62 changed TS/TSX files
    (plus the web a11y guard on 29): **exit 0, 0 findings** (`gates/sonar-guard-branch.txt`). Earlier in the run
    the pre-commit guard found 3 real issues, all fixed before commit: `react/jsx-child-element-spacing` and
    `jsx-a11y/prefer-tag-over-role` (web, fixed before `b253a83ff`), and `sonarjs/cognitive-complexity` 16 > 15 in
    `assertContactTypeOnUpdate` (fixed by extracting `assertNewContactType`, `75bec9439`).
  - **new_coverage**: `check-diff-coverage.mjs` 95.4% (floor 80%).
  - **new_duplicated_lines_density** (gate 3%, which pre-ship does not check): jscpd 4.0.5 (min 100 tokens / 10
    lines) over the contacts/cases web, contact/legal/agent API modules, validators, domain and services:
    69 duplicated NEW lines in PG-205 files (DeleteContactTypeDialog 26, ContactTypeList 20, ContactTypesLoading 23,
    each mirroring its merged PG-204 case-types counterpart), out of 3451 added source lines ≈ 2.0%. The fourth
    clone (`new/page.tsx` ↔ `ContactForm.tsx` department options, 14 lines) is pre-existing code (git blame).
    (`gates/jscpd-report.json`, `gates/jscpd-touched.txt`)

## Phases 2-4: fixes

No open finding remains. The duplication sits below the gate, and it is the accepted PG-204 near-duplication
recorded in the findings doc. Folding the PG-204 and PG-205 dialog and skeleton into shared components would edit
merged PG-204 files (L1), so it was not done.

## Phase 5: validation

Typecheck 7/7, lint 7/7, full suites of all touched packages, web build: all exit 0 (Step 19 logs).

## Residual risk / next step

Sonar computes density on code lines (ncloc), not raw added lines, so the real value can be somewhat higher than
2.0%. After the PR opens, check the gate with
`curl -s "https://sonarcloud.io/api/qualitygates/project_status?projectKey=talyssonoliver_IntelliFlow-CRM&pullRequest=<N>"`.

## Summary

Issues analysed: 3 (pre-commit) + 0 (branch-wide guard); fixed: 3; remaining: 0. Duplication: 2.0% (est.)
against the 3% gate. Diff coverage: 95.4%.
