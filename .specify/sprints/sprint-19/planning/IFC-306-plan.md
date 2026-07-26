# Execution Plan: IFC-306

**Task**: Fix Compliance Calendar Seed Data **Sprint**: 19 **Spec**:
`.specify/sprints/sprint-19/specifications/IFC-306-spec.md` **Date**: 2026-07-26

---

## Preflight Checks

1. Branch is `ifc-306-compliance-calendar`, base `a8de69b0b` (origin/main) — ✅
2. Dependency `IFC-073:FS` — compliance data foundation — present (calendar +
   API routes already exist on origin/main). ✅
3. Isolated worktree `../iflow-ifc-306-rebuild/`; primary tree never touched. ✅
4. Node **22.14.0** (nvm-windows) for all pnpm/test/build — default `node`
   v25.2.1 hangs pg writes (memory). No DB writes here (seed is a static JSON +
   fs read), but still run the web suite under Node 22 for parity.

---

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification |
| --- | --- | --- | --- |
| `docs/planning/compliance-calendar.json` | timeline API + PG-194 dashboard (Sprint 20) | refreshes stale seed | integrity test |
| `apps/web/.../timeline/route.ts` | `/api/compliance/timeline` (ComplianceTimeline UI) | fixes dead path → serves 22 events | functional test |
| `compliance-calendar.integrity.test.ts` (new) | Vitest (web) | guards seed + freshness (real file, unmocked) | `pnpm --filter web test` |

**Reachability**: `/api/compliance/timeline` is consumed by
`ComplianceTimeline.tsx` on the `/governance/compliance` page (PG-194). Not a
dead endpoint — the fix makes it serve real data instead of `[]`.

---

## Execution Steps (RED → GREEN → REFACTOR)

### Phase 1 — RED (failing tests first)

- [ ] **S1** — New file
      `apps/web/src/app/api/compliance/__tests__/compliance-calendar.integrity.test.ts`
      (NO `node:fs` mock — reads the real file). Resolve repo root by walking up
      from the test file's dir to `pnpm-workspace.yaml`, then read
      `docs/planning/compliance-calendar.json`. Assert:
  - AC1 `events.length === 22`
  - AC2 standard set === `{GDPR, SOC 2, ISO 27001, ISO 42001, OWASP}`, and **no**
    event whose `standard` matches `/14001/`
  - AC4 min date ≤ `2025-10-31` and max date ≥ `2026-12-01`
  - AC3 **freshness invariant**: for every event with
    `date < metadata.lastUpdated` (date part), `status !== 'scheduled'`
    (relative to the file's own `lastUpdated`, NOT wall-clock — RISK-306-01)
  - AC6 `metadata.version` and `metadata.lastUpdated` present & well-formed
- [ ] **S2** — In the same new file, a **functional** block importing the real
      `../timeline/route` `GET` (unmocked fs) and asserting the response
      `data.events.length === 22` — proves AC5 (API actually serves the seed).
- [ ] **S3** — Run the new test → expect **RED**: freshness fails (7 stale) and
      the functional block returns 0 events (route reads nonexistent path).

### Phase 2 — GREEN (minimal fix)

- [ ] **S4** — `timeline/route.ts:26`: change calendar path from
      `path.join(projectRoot, 'artifacts', 'misc', 'compliance-calendar.json')`
      → `path.join(projectRoot, 'docs', 'planning', 'compliance-calendar.json')`.
      (Single-line; matches the DoD-tracked FILE.)
- [ ] **S5** — `docs/planning/compliance-calendar.json`: flip `EVT-011..EVT-017`
      (dates 2026-03-25 → 2026-07-15) `status: scheduled` → `completed`. Leave
      `EVT-018..EVT-022` (2026-08-15 → 2026-12-01) as `scheduled`. Do **not**
      rewrite descriptions (no fabricated outcomes — repo data rule).
- [ ] **S6** — Bump `metadata.version` `1.1.0` → `1.2.0`; set
      `metadata.lastUpdated` → `2026-07-26T12:00:00Z`.
- [ ] **S7** — Re-run new test → expect **GREEN** (all ACs hold; freshness now
      measured against `2026-07-26`).

### Phase 3 — REFACTOR / regression

- [ ] **S8** — Confirm existing `compliance-api.test.ts` (fs-mocked) still
      passes unchanged — the path change is invisible to it (it mocks fs).
- [ ] **S9** — Scoped coverage on the touched route dir:
      `npx vitest run src/app/api/compliance --coverage --coverage.include='src/app/api/compliance/**'`
      → thresholds S≥90 / B≥80 / F≥90 / L≥90.

### Phase 4 — 4 mandatory validations (Node 22)

- [ ] **S10** — `pnpm --filter @intelliflow/web typecheck`
- [ ] **S11** — `pnpm --filter @intelliflow/web test --run` (compliance dir)
- [ ] **S12** — `pnpm --filter @intelliflow/web lint`
- [ ] **S13** — `pnpm --filter @intelliflow/web build`

### Phase 5 — Gates + attestation + PR

- [ ] **S14** — `/compliance-check`; author `attestation.json` (7 gates, all
      PASS) + `context_ack.json`.
- [ ] **S15** — CSV flip `IFC-306` Status `Backlog`→`Completed`, Percent `0`→
      `100`; regen splits (`split-sprint-plan.ts`) + SESSION_CONTEXT.
- [ ] **S16** — Commit (no Co-Authored-By, body ≤100), pre-ship at FINAL SHA
      (no bypass), PR, rebase-before-merge, merge on `mergeStateStatus: CLEAN`.

---

## Rollback

Pure additive/data change. Rollback = revert the single squash commit; no
migration, no schema, no data destruction. The route path change is reversible;
the JSON status flips are seed/planning data.
