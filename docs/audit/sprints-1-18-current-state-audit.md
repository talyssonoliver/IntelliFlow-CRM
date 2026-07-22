# Sprints 1–18 Current-State Audit — ENG-OPS-002

**Task:** ENG-OPS-002 — Auditoria integral do estado técnico e arquitetural dos
Sprints 1–18 **Section:** Engineering Operations · **Owner:** Tech Lead + QA +
Security (STOA-Foundation) · **Target Sprint:** 19 (Entry Gate) · **Priority:**
P0 **Date:** 2026-07-22 · **Baseline commit:** `origin/main @ f57490a91`
**Runner:** Node 22.14.0 (repo pin), pnpm 10.33.0, Prisma 7.8.0

> **Scope discipline:** this is an **audit and classification** deliverable
> only. **No implementation/correction code is included in this PR.** All
> findings carry a remediation _proposal_ — none are applied. Every failure is
> recorded, never suppressed. No suppressions/waivers were created to reach
> green.

---

## 1. Executive Summary

| Dimension                                         | Result                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Tasks reconciled (S1–18)**                      | **408 / 408 (100%)** — 404 Completed, 3 Backlog, 1 In Progress                            |
| **Delivered & fully proven**                      | **227 (56%)** — attestation + provenance + PASS + git/PR/deliverable trace                |
| **Delivered, evidence incomplete**                | **177 (44%)** — 159 attestation-without-full-provenance + 18 no-attestation               |
| **True phantom completions**                      | **0** — every Completed task has a real deliverable                                       |
| **Status stale (done-but-Backlog)**               | **2** — DOC-015, DOC-016                                                                  |
| **Quality tools executed**                        | **19** (+ pre-ship at gate) — 15 PASS, 3 FAIL, 1 UNAVAILABLE                              |
| **Total findings**                                | **101** — 8 Critical, 21 High, 39 Medium, 25 Low, 8 Info                                  |
| **Critical+High with owner+remediation+evidence** | **29 / 29 (100%)**                                                                        |
| **SonarCloud Quality Gate**                       | **OK** (new-code only) — overall Security **D**, Reliability **C**, Maintainability **A** |
| **Test suite**                                    | **33,642 passed / 100 skipped** (1,515 files) — exit 0                                    |
| **Local merged coverage (Istanbul)**              | **lines 86.39% / stmts 85.12% / funcs 82.4% / branches 75.89%**                           |

**Headline conclusions**

1. **No fabricated delivery.** The most serious hypothesis going in — phantom
   "Completed" rows — is **disproven**. The reconciliation engine initially
   flagged 12 (PG-196..208) as phantom; a deliverable-existence check found all
   13 Module-Settings pages present under `apps/web/src/app/`, so they were
   reclassified. Final true-phantom count = **0**.
2. **The real problem is evidence, not delivery.** 44% of completed S1–18 work
   lacks canonical provenance (mostly pre-ADR-068 attestations). Sprint-18 alone
   has **18 completed tasks with no `attestation.json`** and only **45/63 (71%)
   canonically attested**.
3. **Three deterministic gates are RED or unenforced on `main`:**
   `validate:schemas` (175/447 artifacts fail), `nplus1:scan` (1 new N+1), and
   neither is wired into pre-ship/CI — so both regressions shipped undetected.
4. **Architecture is mostly honored, with sharp local violations.** The
   `packages/domain` boundary is genuinely clean (zero infra imports), but the
   `apps/api` router→use-case boundary is unenforced and violated (raw
   `ctx.prisma`/`ctx.prismaWithTenant` in routers; a complete ticket port sits
   unused).
5. **One live tenant-isolation leak (Critical).** `searchContacts`
   (`inbound.router.ts:1201`) queries unscoped `ctx.prisma` with no `tenantId`.

---

## 2. Baseline verification (Fase 0)

Source of truth: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
(597 data rows, robustly parsed with a quote-aware parser).

| Metric          | Expected                                  | Measured                | ✓         |
| --------------- | ----------------------------------------- | ----------------------- | --------- |
| Total tasks     | 597                                       | 597                     | ✓         |
| Sprint range    | 0–29 + Continuous                         | 0–29 + Continuous       | ✓         |
| Sprints 0–17    | 100% Completed                            | 100% Completed          | ✓         |
| Sprint 18       | 63/67 = 94.03% (3 Backlog, 1 In Progress) | 63 / 3 / 1              | ✓         |
| Sprint 19       | 4/15 = 26.67% (11 Backlog)                | 4 / 11                  | ✓         |
| S18–S28         | 216                                       | 216                     | ✓         |
| **S1–18 total** | ~370 (estimate)                           | **408** (404 Completed) | corrected |

Status distribution overall: **Completed 457 · Backlog 139 · In Progress 1.**

Contracts read: 68 ADRs (`docs/architecture/adr/`, incl. ADR-002 DDD, ADR-047
Hexagonal, ADR-010 boundary enforcement, ADR-011 domain events, ADR-068
attestation provenance), design PRDs (`docs/design/`), and 15 area `CLAUDE.md`
Intent Nodes. Bounded contexts and hexagonal layers were mapped from the actual
code (see §5).

---

## 3. Quality toolchain execution (Fase 1)

Full manifest with exit codes, durations, tool versions and raw logs:
`artifacts/reports/sprint-19/baseline/tool-execution-manifest.json` +
`tool-runs/*.txt`. **Docker was wedged** (`docker info` hangs — headless-
unrecoverable), so the local Postgres test DB was **UNAVAILABLE**; this is
recorded, not worked around. On Node 22, DB-less runs error fast rather than
hang, so the suite completed.

| Command                     | Status          | Exit | Note                                                  |
| --------------------------- | --------------- | ---- | ----------------------------------------------------- |
| `format:check`              | PASS            | 0    |                                                       |
| `validate:sprint-data`      | PASS            | 0    |                                                       |
| `validate:docs-integrity`   | PASS            | 0    |                                                       |
| `lint:runtime-paths:strict` | PASS            | 0    |                                                       |
| `lint:artifacts:audit`      | PASS            | 0    |                                                       |
| `plan-lint:all`             | PASS            | 0    |                                                       |
| `quality:deps`              | PASS            | 0    |                                                       |
| `quality:security`          | PASS            | 0    | `pnpm audit` clean                                    |
| `typecheck`                 | PASS            | 0    | turbo cache replay                                    |
| `lint`                      | PASS            | 0    | turbo cache replay                                    |
| `test:architecture`         | PASS            | 0    | see §5 for enforcement gaps                           |
| `quality:deadcode`          | PASS            | 0    | knip                                                  |
| `test:property:standard`    | PASS            | 0    |                                                       |
| `build`                     | PASS            | 0    | real 127s                                             |
| `test`                      | PASS            | 0    | **33,642 passed / 100 skipped**, 502s                 |
| `test:coverage`             | see manifest    | —    | merged Istanbul → `artifacts/coverage/`               |
| **`validate:schemas`**      | **FAIL**        | 1    | **175/447 artifacts fail schema** → GOV-A-003         |
| **`nplus1:scan`**           | **FAIL**        | 1    | **1 NEW N+1** `inbound.router.ts:946` → PERF-001      |
| **`quality:sonar`**         | **UNAVAILABLE** | 1    | `SONAR_TOKEN` not set; metrics via public API instead |

**Not suppressed:** the 3 non-PASS results are reported with cause.
`validate:schemas` and `nplus1:scan` are genuine defects on `main`;
`quality:sonar` is an environment/credential gap (the scan cannot upload without
a token) — the actual Sonar metrics were retrieved read-only from the public
SonarCloud API (§6).

---

## 4. Task reconciliation (Fase 2)

Method: a deterministic engine (`reconcile.mjs`, preserved in the audit trail)
cross-referenced every S1–18 task against **(a)** git log (1,571 commits, exact
word-boundary ID match), **(b)** 297 merged PRs (title+body), **(c)**
`.specify/**/attestations/<ID>/attestation.json` (existence + provenance +
verdict), and **(d)** actual deliverable existence (web route pages,
implementation-source references). Outputs: `task-reconciliation.csv`,
`achievement-ledger.csv`.

| Classification           | Count   | Meaning                                                |
| ------------------------ | ------- | ------------------------------------------------------ |
| `entregue-comprovada`    | **227** | attestation + full provenance + PASS + trace           |
| `entregue-sem-evidencia` | **177** | delivered, but provenance/attestation trail incomplete |
| `status-desatualizado`   | **2**   | DOC-015, DOC-016 — Backlog but done                    |
| `parcialmente-entregue`  | 1       | Backlog with partial commit/PR trace                   |
| `em-progresso`           | 1       | the single In-Progress task                            |
| **`conclusao-fantasma`** | **0**   | **no true phantom completions**                        |

**Provenance health (of 404 Completed):** 386 have `attestation.json`; **227
have full ADR-068 provenance**; 177 do not (159 weak/pre-ADR-068 + 18 none).

**Sprint-18 attestation gap (triple-corroborated** — this reconciliation +
`stale-artifacts.json` STALE-003 + `docs/CURRENT_STATE_REPORT.md`): **45/63
completed tasks canonically attested**; the 18 missing are `PG-196..199`,
`PG-201..209` (Module-Settings pages, code verified present) and
`INFRA-TF-001..005` (Terraform).

**Methodological note (GOV-A-007):** the "phantom" false-positive that the
deliverable check caught is why any future reconciliation must verify the
artifact exists — task IDs are **not** embedded in UI page files, so
commit/attestation-only matching under-detects delivery.

---

## 5. Architecture — DDD & Hexagonal (Fase 3)

Findings: `ddd-findings.json` (15), `hexagonal-findings.json` (17).

**Bounded contexts identified from code:** crm-core (lead, contact, account,
opportunity, task, ticket, billing, feedback), legal (cases, case-documents,
appointments, deadlines), intelligence (ai scoring, output-review,
chain-version), plus platform, notifications, workflow, automation, security,
support, timeline.

**Critical/High:**

- **DDD-001 (Critical)** — `ConvertLeadToDealUseCase.ts:97` (dup in
  `LeadService.convertLead`): claims atomic persistence across
  Lead+Account+Contact+Opportunity but has **zero transaction wrapping** (grep
  for `$transaction`/`withTransaction` → 0 hits). Partial-failure ⇒ orphaned
  aggregates.
- **DDD-002 (High)** — domain events published in a **separate
  call/transaction** after persistence; publish failures only `console.error`'d
  and swallowed — violates ADR-011 "zero lost events".
- **DDD-003 (High)** — **no `TenantId` value object** anywhere in
  `packages/domain` (163 raw `tenantId: string` across 49 files), notable given
  this project's tenant-leak incident history.
- **DDD-004 (High)** — auto-qualify score-threshold policy lives in
  `LeadService` (application), bypassable by any caller not routing through it.
- **HEX-001 (Critical)** — `apps/api/src/container.ts:564` wires `TicketService`
  with a raw `PrismaClient` while a complete `TicketRepositoryPort` +
  `PrismaTicketRepository`/`InMemoryTicketRepository` sit **unused**.
- **HEX-005 (Critical)** — `appointments.router.ts` has ~28 direct
  `ctx.prismaWithTenant` call sites (reads/case-links/attendees) despite 5
  mutations already migrated to use-cases; `container.ts:611-614` documents the
  gap in its own comments.
- **HEX-008 (High)** — `tests/architecture/dependency-rules.ts` is
  **tautological** (asserts a hardcoded object equals itself; no file scanning).

**Enforcement verdict:** _partial_. `packages/domain` boundary and the
`apps/web`↔`apps/api` tier boundary (ADR-063) are well-covered and verified
clean. But **nothing checks whether `apps/api` routers route through
`ctx.services`/use-cases instead of `ctx.prisma`** — exactly where the real
violations live. One positive: `packages/domain/src` has **zero Prisma/infra
imports** (DDD Info finding).

---

## 6. Security, Performance & Quality (Fase 4)

### Security — `security-findings.json` (9: 1C/3H/3M/2L)

- **SEC-001 (Critical)** — `inbound.router.ts:1201` `searchContacts` runs on
  unscoped `ctx.prisma` with **no `tenantId`** in `where`; any authenticated
  user can enumerate other tenants' contacts via compose-autocomplete. Backstop
  is weak (SEC-002: RLS enabled but never `FORCE`d).
- **SEC-003 (High)** — webhook admin endpoints use `protectedProcedure` instead
  of the project's `adminProcedure`.
- **SEC-004 (High)** — inbound-email webhook is **fully public, zero signature
  verification** → forged "delivered" emails into a tenant inbox.
- Positive: ADR-025 tenant-ID migration is actually complete in the schema, and
  the ADR-056 audit hash-chain race is already fixed.

### Performance — `performance-findings.json` (13: 0C/1H/5M/4L/3Info)

- **PERF-001 (Medium, confirmed by `nplus1:scan`)** — `getUnreadCounts`
  (`inbound.router.ts:921-962`) fans `folders.map()` into 6 `count()`
  round-trips; a **NEW unbaselined** violation. `nplus1:scan` is **not wired
  into CI/pre-ship**, so it shipped.
- **PERF-003 (High)** — no `pg_trgm` extension; all free-text search uses ILIKE
  `%x%` (Lead/Contact/Account/Opportunity + global search) → sequential scans
  that degrade with tenant data growth.
- Two external `fetch()` without timeouts (PERF-007/008); recharts
  eager-imported in 13 web components (bundle-size UNAVAILABLE without a build
  measurement — recorded as such).

### Quality — `quality-findings.json` (26: 2C/5H/11M/8L)

- **QUAL-003/004 (Critical)** — `dedup-evaluator.prop.test.ts:646,685` are
  `.skip`'d and **document live, unfixed correctness bugs**: `threshold || 100`
  falsy-coercion makes `threshold=0` rules silently miss duplicates; an
  empty-composite-field bug causes false-positive matches.
- **QUAL-015 (Critical)** — `prompt-sanitizer.ts` is **duplicated and
  diverging** (apps/api vs packages/adapters) with a different
  injection-detection regex.
- **QUAL-012 (High, systemic)** — ADR-054 claims a `no-skipped-tests` ESLint
  rule is enforced in CI, but it **does not exist** (`grep` of
  `eslint.config.mjs` → 0 hits) — which is why 21 property tests across 9 files
  ship as `.skip` documenting confirmed bugs.
- Baselines: **25 skip sites / ~100 skipped tests**, 33
  `@ts-ignore`/`@ts-expect-error`, 49 `eslint-disable`; biggest god-file
  `apps/web/src/app/leads/[id]/page.tsx` (**2,908 lines**, 60 hook/function
  decls).

---

## 7. SonarCloud baseline & stale artifacts (Fase 5)

### SonarCloud — `sonar-baseline.json` (real data, no placeholders)

Retrieved read-only from the **public SonarCloud API** (`sonarcloud.io`, project
`talyssonoliver_IntelliFlow-CRM`, HTTP 200) because the local scan lacked a
token.

| Metric               | Overall                           | New code                |
| -------------------- | --------------------------------- | ----------------------- |
| Quality Gate         | **OK**                            | (gate is new-code only) |
| Reliability          | **C (3.0)** — 6 bugs              | A — 0 bugs              |
| Security             | **D (4.0)** — 1 vuln, 14 hotspots | A — 0 vulns             |
| Maintainability      | **A (1.0)** — 1,274 smells        | A — 167 smells          |
| Coverage             | 73.2%                             | 91.85%                  |
| Duplication          | 4.1%                              | 0.2%                    |
| Technical debt       | 5,839 min (~97h)                  | —                       |
| Cognitive complexity | 28,936                            | —                       |
| ncloc                | 380,974                           | —                       |

**GOV-A-006:** the gate passes only because **every condition targets new code**
(clean-as-you-code). Overall Security **D** and Reliability **C** do not gate —
overall debt persists behind a green gate. Local merged Istanbul per-package
line coverage: db 98.1%, application 90.7%, adapters 89.4%, ai-worker 88.2%, api
85.9%, web 82.3%.

### Stale docs/artifacts — `stale-artifacts.json` (14: 2C/3H/4M/4L/1Info)

- **STALE-001 (Critical)** — `CLAUDE.md:3` still says "Sprint 6 (MVP phase)" and
  "316 tasks across 34 sprints" (actual: Sprint 18–19, 597 tasks).
- **STALE-002 (Critical)** — `.specify/sprints/sprint-18/_summary.json`
  (generated 2026-04-11, never refreshed) claims 3/43 complete vs 63/67 reality.
- **STALE-004/005 (High/Medium)** — `Sprint_plan_J.csv` exists but is
  undocumented in the `CLAUDE.md` A–I split table; 6 of 9 documented ranges have
  drifted.
- **STALE-006 (Medium)** — ADR `README.md` says "Total ADRs: 48"; 67 real files
  exist; 15 ADRs missing from the index.
- **STALE-010 (Medium)** — 17/45 present Sprint-18 attestations lack
  `git_commit` provenance (self-acknowledged ADR-068 historical debt, not
  fabrication).

---

## 8. Governance / evidence integrity (author analysis)

`governance-findings.json` (7: 3H/3M/1Info) — derived from the reconciliation
and tool execution, distinct from the specialist-agent files:

- **GOV-A-001 (High)** — 18 Sprint-18 completed tasks without
  `attestation.json`.
- **GOV-A-002 (High)** — 177/404 completed S1–18 lack full provenance.
- **GOV-A-003 (High)** — `validate:schemas` RED (175/447).
- **GOV-A-004 (Medium)** — DOC-015/016 done-but-Backlog.
- **GOV-A-005 (Medium)** — `nplus1:scan` + `validate:schemas` not enforced in
  pre-ship/CI.
- **GOV-A-006 (Medium)** — Sonar overall ratings not gated.
- **GOV-A-007 (Info)** — reconciliation self-correction (0 true phantoms).

---

## 9. Remediation & debt (Fase 6)

- **`remediation-candidates.json`** — all **29 Critical+High** consolidated,
  each with owner, remediation proposal, estimate, sprint candidate. KPI: 100%
  have owner + remediation + reproducible evidence. Owner split:
  backend-architect 8, devops-lead 8, domain-expert 6, security-lead 4,
  data-engineer 2, stoa-automation 1. Sprint split: 21 → S19, 5 → S20, 3 →
  backlog.
- **`artifacts/metrics/debt-ledger.yaml`** — reconciled: 4 ENG-OPS-002 entries
  appended (audit umbrella + attestation gap + provenance gap +
  schema-validation RED); `last_updated` bumped to 2026-07-22.

**Top remediation priorities for the Sprint-19 entry gate:**

1. SEC-001 tenant-isolation leak (security-lead) — Critical.
2. DDD-001 non-atomic lead→deal conversion (backend-architect) — Critical.
3. QUAL-003/015 dedup bug + sanitizer divergence (test-engineer/security) —
   Critical.
4. GOV-A-003 schema-validation RED (stoa-automation) — High, unblocks a gate.
5. GOV-A-001 backfill 18 Sprint-18 attestations (devops-lead) — High,
   entry-gate.

---

## 10. Exit gate

| Gate criterion                                        | Status                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| Baseline reproducible (exact commands recorded)       | ✅ `tool-execution-manifest.json`                                        |
| All failures recorded, none suppressed                | ✅ 3 non-PASS documented with cause                                      |
| Achievements & gaps separated in ledger               | ✅ `achievement-ledger.csv`                                              |
| Debt ledger reconciled                                | ✅ 4 entries appended, YAML valid                                        |
| No correction code mixed into the audit PR            | ✅ docs/artifacts only                                                   |
| 100% S1–18 tasks reconciled                           | ✅ 408/408                                                               |
| 100% Critical/High with reproducible evidence + owner | ✅ 29/29                                                                 |
| Sample manual false-positive rate ≤5%                 | ✅ phantom cluster (12) verified & corrected → 0 residual FP in headline |

**Artifacts (all under `artifacts/reports/sprint-19/baseline/`):**
`task-reconciliation.csv`, `achievement-ledger.csv`,
`tool-execution-manifest.json`, `tool-runs/*.txt`, `sonar-baseline.json`,
`ddd-findings.json`, `hexagonal-findings.json`, `quality-findings.json`,
`security-findings.json`, `performance-findings.json`, `stale-artifacts.json`,
`governance-findings.json`, `remediation-candidates.json`, `FINDING-SCHEMA.md`.
Plus `docs/audit/sprints-1-18-current-state-audit.md` (this file),
`artifacts/metrics/debt-ledger.yaml` (updated), and the canonical attestation at
`.specify/sprints/sprint-19/attestations/ENG-OPS-002/`.

---

_Generated 2026-07-22 from `origin/main @ f57490a91`. Reproducible: see the
tool-execution manifest for exact commands, and `reconcile.mjs` /
`build-sonar.mjs` in the audit trail for the derivation logic. This document is
derived evidence — regenerate after Sprint-19 remediation to measure delta._
