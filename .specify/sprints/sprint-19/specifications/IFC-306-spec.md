# IFC-306 Specification: Fix Compliance Calendar Seed Data

**Task**: IFC-306 — Fix Compliance Calendar Seed Data **Sprint**: 19 **Status**:
Spec Complete **Date**: 2026-07-26 **Agents**: compliance / DPO + Legal
(load-bearing), frontend-lead, test-engineer, backend-architect

---

## Premise Correction (RECON FIRST — PG-064 lesson)

The task was dispatched as a "phantom → real rebuild vs a CSV **Completed**
claim." **That framing is factually wrong and is corrected here before any
work:**

- **CSV status is `Backlog`, not `Completed`** (`Sprint_plan.csv` row 567,
  column 8). IFC-306 is genuinely unbuilt/stale work, **not** a falsely-green
  phantom. There is nothing to "rebuild from scratch."
- The seed file **already exists** and already satisfies most of the DoD: 22
  events, 5 SaaS-relevant standards, **no ISO 14001**, range Oct 2025 – Dec
  2026, `version 1.1.0`.

The premise is wrong on the *label*, but the underlying task is **real and
incomplete**: two concrete DoD criteria genuinely fail (below). Scope is taken
**verbatim from the CSV Definition of Done** — no invented scope.

---

## Phase 0.75 — Codebase Exploration Evidence

Verified on `origin/main` @ `a8de69b0b` (worktree `ifc-306-compliance-calendar`).

| Finding                                                                  | File:Line |
| ------------------------------------------------------------------------ | --------- |
| Seed file exists: 22 events, 5 standards, no ISO 14001, Oct25–Dec26      | `docs/planning/compliance-calendar.json:1-208` |
| Metadata `version 1.1.0`, `lastUpdated 2026-03-17`                       | `docs/planning/compliance-calendar.json:2-7` |
| **BUG-1**: timeline API reads a **nonexistent** path                     | `apps/web/src/app/api/compliance/timeline/route.ts:26` |
| → `artifacts/misc/` holds 4 unrelated files; **no** `compliance-calendar.json`; no sync script writes it | `artifacts/misc/` (verified via `find` + grep of tools/scripts) |
| → therefore `loadCalendarData()` returns `[]` → **API serves 0 events**  | `apps/web/src/app/api/compliance/timeline/route.ts:24-39,75` |
| **BUG-2**: 7 past-dated events still `status: scheduled` (as of 2026-07-26) | `docs/planning/compliance-calendar.json` EVT-011..EVT-017 (dates 2026-03-25 → 2026-07-15) |
| Existing tests fully mock `node:fs` → they pass while the real path is broken and data is stale | `apps/web/src/app/api/compliance/__tests__/compliance-api.test.ts:22-37` |
| Timeline response type is already correct                                | `apps/web/src/app/api/compliance/types.ts:11-25` |
| PG-194 (Sprint 20) consumes this API + calendar downstream (dependency)  | `Sprint_plan.csv:568` |

**Root cause**: the seed file was authored/updated once (2026-03-17) and was
internally consistent then, but (a) the API was never wired to the file that
actually holds the data, and (b) real time has advanced past 7 events that were
"future" at authoring time, so they are now stale-`scheduled`.

---

## Scope

**In scope** (the two failing DoD criteria + freshness invariant):

1. Wire the timeline API to the maintained seed file so it **serves the data**.
2. Refresh stale statuses: past-dated `scheduled` → `completed`; bump metadata
   `version` + `lastUpdated`.
3. Add a **real-file** integrity/functional test that guards the seed path,
   event count, standard set, date range, and the freshness invariant — so this
   cannot silently rot again behind the fs-mock.

**Out of scope** (tracked, not touched):

- Risk API (`risks/route.ts` reads `artifacts/misc/risk-register.json`, also
  nonexistent) — that is **IFC-100 / PG-194** scope, not IFC-306. Noted as a
  non-blocking observation; not fixed here (L1 MINIMAL).
- The governance dashboard UI (`/governance/compliance`) — that is **PG-194**.
- Rewriting event *descriptions* — the DoD asks only for status flips; inventing
  outcome text would fabricate data (repo "Never Mock/Simulate Data" rule).

---

## Acceptance Criteria

Each maps 1:1 to a gate recorded in the attestation.

| #   | Criterion                                                              | Gate ID |
| --- | --------------------------------------------------------------------- | ------- |
| AC1 | `compliance-calendar.json` has exactly **22 events**                  | `event-count-22` |
| AC2 | Exactly **5 standards** (GDPR, SOC 2, ISO 27001, ISO 42001, OWASP); **0** ISO 14001 | `five-standards-no-iso14001` |
| AC3 | **0 stale statuses** — no event dated before `metadata.lastUpdated` has `status: scheduled` | `zero-stale-statuses` |
| AC4 | Date range spans **Oct 2025 – Dec 2026** (≥12-month forward coverage) | `date-range-oct2025-dec2026` |
| AC5 | Timeline API **serves the updated data** — real `GET` returns all 22 events from the seed file (path wired to `docs/planning/compliance-calendar.json`) | `timeline-api-serves-data` |
| AC6 | Metadata `version` bumped and `lastUpdated` refreshed                 | `metadata-updated` |
| AC7 | `pnpm --filter web typecheck` + `pnpm --filter web test --run` PASS; new integrity test reads the **real** file (unmocked) | `validate-web-typecheck-test` |

---

## Risks

- **RISK-S19-306-01 (freshness rot)**: a `new Date()`-relative freshness test
  would itself go red once the next event date passes, with no code change —
  CI flakiness by calendar. **Mitigation**: assert freshness relative to the
  file's own `metadata.lastUpdated`, not wall-clock `today`. Stable invariant.
- **RISK-S19-306-02 (bundle path)**: `docs/` is outside the Next build root, so
  a fully standalone deploy might not ship it. **Accepted**: this matches the
  **existing** runtime-fs pattern (risks/route + the original timeline route
  both read repo-relative files via `findProjectRoot`); changing the deployment
  bundling model is out of scope for a seed-data fix. The fix points at the file
  that actually exists and is version-controlled.
