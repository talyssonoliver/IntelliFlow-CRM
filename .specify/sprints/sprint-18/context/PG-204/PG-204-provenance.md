# PG-204 pipeline provenance

This lists what ran late or was corrected during the 2026-10-13 remediation, after two runner audits of
the first exec session. All times are UTC from the transcript, logs or commit metadata.

## Steps first run during remediation (not during the original exec session)

- **/spec-exploration**: 8 Explore sub-agents, 06:12–06:17Z, findings E1–E33
  (`context/PG-204/PG-204-spec-exploration.md`). The original session skipped it.
- **/spec-consensus**: re-run on the amended spec, 8/8 APPROVED in one round, verdicts back by 06:20:57Z.
- **/hydrate-context**: run at 06:22:17Z, after the spec phase (`hydrated-context.json/.md`).
- **STOA (MATOP Phase 3)**: the Foundation, Domain, Quality and Security sub-agents wrote their own
  verdicts. Foundation, Domain and Quality passed. Security gave WARN for the pre-existing `sprintf-js`
  advisory (#876), so the aggregate is WARN.
- **/exec-metrics** session end: recorded in `attestations/PG-204/task-tracking.json`.
- **/code-review** (full mode) and **/sonarqube-fix**: run at `d7d91e5e8`. The original session had run
  only `code-review-analysis.ps1 -Quick`.
- **knip and the check-\* preflights** (worktree-landed, lighthouse evidence/waiver, attestation
  provenance/phrases, exec-readiness): run during remediation, logs in `matop/gates/`.

## Claims corrected

- A **Domain STOA verdict was hand-written** by the lead. It is kept only as
  `Domain.handwritten-superseded.json`; the sub-agent's verdict replaces it.
- **Back-dated hydration files**: the hand-made agent-selection and hydrated-context files carried an
  invented early timestamp. They are relabelled with their real provenance.
- **False RED claims**: the TDD table said "RED → GREEN per layer". It now claims a failing run only
  where one was observed.
- **The "8/8 consensus" claim**: it was 3 verdicts on a draft spec. The real 8/8 is the re-run above.
- Also corrected: invented or rounded status times in `task-tracking.json`, the plan reviewer's first
  verdict (REVISE, 6 errors / 5 warnings / 3 info, not 4/4/1), and `context_ack` `read_at` (a single
  hash time, not per-file read times).

## Tooling and environment

- **Codex fell back to Claude**: early `node scripts/codex-review.mjs` runs reviewed on the Claude
  fallback because a stale nvm-installed codex CLI was first on PATH. After the fix, codex itself
  reviewed `d7d91e5e8` (PASS, 0 findings). Later runs found real issues, each fixed test-first with no waivers:
  - `a31603d21`: a typed deadline was stored at UTC midnight (fixed in `13cf1f0db`).
  - `13cf1f0db`: a skipped day gave an Invalid Date (Claude fallback, codex capped; fixed in `07b2f9044`).
  - `07b2f9044`: the checklist order was lost on the case page (fixed in `653e23641`).
  - the staged tree: the list showed the deadline in London time, and offsets were rounded to whole minutes
    (fixed in `653e23641`).
  Codex then passed at `653e23641`.
- **Docker Desktop hung** about 03:47–07:30Z. Matrix rows 05–07 (06:41–06:44Z, including the DB
  integration test) fell in that window. They were re-run with Docker healthy, through the slot
  wrapper with `--exclusive intelliflow-db`. The new results replace the 06:44Z entries in
  `validation-matrix.json`, `PG-204-delivery.md` and the attestation.
  A machine reboot interrupted the lane at about 12:50Z. After it, the staged files were checked for truncation
  (none), and Docker was healthy again by 13:00Z. The re-runs took place at 13:53-14:23Z at `653e23641`/`731a83a99`:
  rows 03, 05-13 and the integration test (21 tests, Node 22).
- C: filled up twice. The lane's own gitignored `apps/web/.next` and `artifacts/coverage-parts` were
  deleted to recover. No tracked file was truncated: checked after each event and again after the
  reboot.

## Plan re-verify

- All 64 plan checkboxes were re-checked against code or logs (each kept box cites its evidence inline):
  63 kept, 1 unticked (apply the migration to the shared test DB via guard-db-target: only a scratch-DB deploy was done).
- The checks that were still missing were run during the re-verify: the requiredFields cardinality and tenant-cascade
  integration tests (`731a83a99`), and the design check against `case-new.png` (`matop/design-check-case-new.md`).

## Still open (NEEDS_HUMAN)

- **Lighthouse ≥ 90**: the pages are authenticated, there are no test credentials, and no waiver
  approver is named.
- **Gate 4b**: push, pre-ship and PR are run at the final SHA.
