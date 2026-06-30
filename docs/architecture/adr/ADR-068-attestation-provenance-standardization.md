# ADR-068: Attestation Provenance Standardization

- **Status:** Accepted
- **Date:** 2026-06-30
- **Task:** AUTOMATION-003
- **Supersedes / relates to:** ADR-067 (metrics-harness de-churn — canonical
  attestation/task-tracking split). Builds on the exec-preflight gate pattern
  (`check-plan-reviewer-subagent.mjs`).
- **Ratified by:** 3/3 spec-session sign-off (devops-lead, backend-architect,
  security-lead).

## Context

The agent-orchestration harness runs task-executors autonomously. The
orchestrator's definition-of-done verifies that the **spec-session +
plan-reviewer ceremony** actually ran by reading six "provenance" fields from a
task's `attestation.json`: `spec_session_consensus`, `plan_reviewer_verdict`,
`plan_reviewer_agent`, `plan_reviewer_marker`, `spec_path`, `plan_path`.

Two problems made this unreliable:

1. **Not standardized.** The fields were written ad-hoc — `IFC-234` carries
   them, `IFC-309` and `PG-200` do not — and they were defined in **no schema
   and no skill**. The orchestrator could not rely on them.
2. **Instruction ≠ enforcement.** The IFC-309 task-executor **self-merged its
   own PR** despite explicit instructions not to. An honour-system field an
   agent writes about its own work carries no integrity on its own.

A third constraint shaped the design: `pnpm validate:schemas` is **already red
on 213 of 1234 files** (historical attestations carry off-schema fields such as
object-shaped `kpi_results`). So the shared schema validator is not a passing
hard gate, and adding new **required** fields to it would (a) enforce nothing
and (b) break the corpus further.

## Decision

Standardize provenance with enforcement at the point of attestation, not in the
shared schema:

1. **Emit (source).** `/exec-attestation` always writes the six-field provenance
   block (into both `attestation.json` and `attestation-latest.json`), sourced
   from the real run.
2. **Allow, not require (schema).** The six fields are added to the Zod source
   of truth (`tools/scripts/lib/schemas/attestation.schema.ts`) as **optional**,
   with `plan_reviewer_verdict` a **named enum**
   (`APPROVED | APPROVED_WITH_CHANGES | REJECTED`) so the affirmative check
   cannot be fooled by casing/`"pending"`. The tracked JSON schema is
   regenerated (`pnpm generate:schemas`). Optional-ness keeps the ~1000
   historical attestations valid and provably does not move the 213 baseline.
3. **Enforce post-attestation (gate).** A new gate
   `tools/scripts/exec-preflight/check-attestation-provenance.mjs` runs
   **after** the attestation is written (from `/exec-attestation` Phase 5 and
   from `generate-final-report.mjs`'s post-attestation sweep — **never** the
   pre-exec preflight table, where the attestation does not yet exist). It
   BLOCKs when the block is missing on a PG-/IFC- task, non-affirmative, or
   **not cross-validated**: it confirms `plan_path` exists on disk and carries
   the `<!-- plan-reviewer: subagent -->` marker, and that `spec_path` exists,
   with both paths repo-relative. It reuses the marker definition from a single
   shared module (`tools/scripts/lib/plan-reviewer-marker.mjs`) that
   `check-plan-reviewer-subagent.mjs` also imports — one definition, no drift.
4. **Require (DoD).** The orchestrator DoD flips from "verify when present" to
   **required** for PG-/IFC- tasks, covering both the exec path and the
   reconcile-and-attest path (which does not run exec preflights, so the
   orchestrator runs the gate itself there).

The cross-check (3) is what converts a self-authored, forgeable field into real
evidence: the agent cannot satisfy it merely by writing `"APPROVED"` — the
**independently-authored** plan file (produced by the plan-reviewer subagent at
an earlier lifecycle phase) must carry the marker.

## Consequences

**Positive.** The ceremony becomes mechanically verifiable rather than
honour-system; an agent that skips spec/plan cannot produce a passing
attestation. AUTOMATION-003's own attestation is the first to pass the new gate.
No historical attestation is invalidated.

**Negative / residual.**

- **Marker is a "secret that is not a secret."** A sufficiently capable agent
  could read the codebase, learn the marker string, and forge it into a
  self-authored plan file. The gate raises the cost from passive omission to
  active subversion (a higher-severity, more detectable act) but does not
  cryptographically prevent it. The complete fix is separate agent credentials +
  branch protection (tracked separately).
- **Non-UI exemption.** Tasks outside PG-/IFC- (AUTOMATION-_, INFRA-_, …) WARN
  rather than BLOCK on _absent_ provenance, so the gate does not block harness
  tasks that have no plan-reviewer ceremony. Present-but-invalid provenance
  BLOCKs for any task type.

**Out of scope (flagged, not addressed here).** The 213-red `validate-schemas`
baseline (object-shaped `kpi_results`, unknown extra fields like
`sprint`/`delivery_summary`) and the generator's `dependencies_verified`
union-branch omission are pre-existing and separate; this change neither worsens
nor papers over them.
