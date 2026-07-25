# Execution Plan: ENG-OPS-003

**Task**: Harness hardening Gaps #1–#4 + OSV PRs A/B (retroactive umbrella)
**Sprint**: 19 **Spec**:
`.specify/sprints/sprint-19/specifications/ENG-OPS-003-spec.md` **Date**:
2026-07-25

---

## Preflight Checks

1. Isolated worktree, not the user's checkout:
   ```
   git worktree add ../iflow-retro-governance -b chore/retro-governance-backfill origin/main
   git branch --show-current    # chore/retro-governance-backfill
   ```
   ✅ Branched from `origin/main` @ `f4ec0b0cb`.
2. Node pinned to the repo version (`.nvmrc` = 22; host default is v25.2.1,
   which silently hangs pg/Prisma writes):
   ```
   node --version    # must be v22.x
   ```
   ✅ v22.14.0.
3. Owner-ledger check (Global Rule 11) — is any other branch writing these
   files?
   ```
   git worktree list
   ```
   ⚠ `../iflow-r16-attest-backfill` holds a stranded commit touching
   `sprint-18/attestations/PG-206/attestation.json`. **Documented, not
   touched** — that branch has a separate owner.

---

## Implementation Reality Checks

| Surface                                | Production Consumer                        | Replaces / Blocks                             | Verification Command                    |
| -------------------------------------- | ------------------------------------------ | --------------------------------------------- | --------------------------------------- |
| `Sprint_plan.csv`                      | project-tracker dashboard, metrics sync    | Single source of truth — splits derive from it | `npx tsx tools/scripts/split-sprint-plan.ts` |
| `Sprint_plan_*.csv`                    | Derived — never hand-edited                | Regenerated, not authored                     | same                                    |
| `.specify/sprints/**`                  | Attestation evidence of record             | N/A (new files)                               | schema validation                       |
| `docs/operations/*.md`                 | Human/on-call reference                    | N/A (new files)                               | markdown lint via pre-ship              |
| `docs/SESSION_CONTEXT.md`              | Cross-session handoff — **derived**        | Regenerated, never hand-edited                | `npx tsx apps/project-tracker/scripts/generate-context.ts` |

**Zero production code.** If any step had produced a `.ts`/`.tsx` diff outside
`.specify`/docs/CSV, the task would be mis-scoped and must stop.

---

## Steps

### Phase 1 — Audit (read-only)

- [x] **S1** — Read `docs/operations/sprint-18-orchestrator-prompt.md`; extract
      the invocation template + 6-gate DONE definition + §A verify-and-attest
      flow.
- [x] **S2** — Enumerate the merge window with `gh pr list` rather than
      trusting the supplied list. **Found #627, which was missing.**
- [x] **S3** — For each PR, check `.specify` artifacts and the CSV row **on
      `origin/main`**.
- [x] **S4** — Verify attestation claims against real code, not against the
      attestation's own prose (PG-206 → `document-settings.router.ts:414-462`,
      validator `superRefine`, cross-tenant tests; IFC-033 → k6 script,
      thresholds, 11 evidence artifacts).

### Phase 2 — Backfill

- [x] **S5** — PG-206 CSV `Backlog` → `Completed` / 100 %, evidence cites
      `2ec7d0e49`.
- [x] **S6** — PG-206 `Artifacts To Track` reconciled to delivered artifacts
      (planned duplicate router/validator superseded by DRY reuse).
- [x] **S7** — Retrospective spec + plan for PG-206 and IFC-033, explicitly
      labelled RETROSPECTIVE.
- [x] **S8** — ENG-OPS-003 CSV row + spec + plan + attestation.
- [x] **S9** — `harness-hardening-ledger-2026-07-25.md` (8 PRs).
- [x] **S10** — `governance-retro-audit-2026-07-25.md`, including the audit-method
      correction and the R16 collision warning.

### Phase 3 — Regenerate derived state (Gate 6)

- [x] **S11** — `npx tsx tools/scripts/split-sprint-plan.ts`
- [x] **S12** — `npx tsx apps/project-tracker/scripts/generate-context.ts`

### Phase 4 — Ship

- [x] **S13** — `node scripts/codex-review.mjs` exits 0 **before** committing.
- [x] **S14** — Full pre-ship gate — no `--no-verify`, no
      `PRESHIP_ALLOW_MISSING`.
- [x] **S15** — Push, open PR, watch CI, merge only on zero-fail **and**
      zero-pending.

---

## Rollback

Every change is additive documentation plus two CSV cells. Revert = revert the
squash commit; no migration, no runtime effect, no data change.

---

## Risks

| Risk                                                            | Mitigation                                                                             |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| CSV rewrite churns the whole file (known PowerShell corruption gotcha) | Python `csv` round-trip proven byte-identical before editing; diff confirmed at 2 lines |
| Overwriting R16's stranded PG-206 attestation                   | Not touched. `main`'s post-#626 attestation is left authoritative; R16 documented as needing reconciliation |
| Retro spec/plan read as genuine pre-implementation artifacts    | Every retro file carries an explicit RETROSPECTIVE banner stating why steps are checked |
| Attestation fails schema validation                             | Written against `attestation.schema.json` (`additionalProperties: false`) — allowed properties only |
