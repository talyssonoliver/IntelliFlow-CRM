# System Audit (Cutover + Evidence Bundles)

This repo uses a tiered, evidence-first audit framework:

- Cutover policy: `audit-cutover.yml`
- Tool matrix: `audit-matrix.yml`
- Runner: `tools/audit/run_audit.py`
- Sprint 0 views: `tools/audit/status_snapshot.py` and
  `tools/audit/sprint0_audit.py`
- Attestations (per task): `tools/audit/attestation.py` (schema:
  `docs/attestation-schema.yaml`)

## Local usage

```bash
# Recommended: PR-style run (Tier 1 + Tier 2, affected scope)
python tools/audit/run_audit.py --mode pr --base-ref origin/main --resume --concurrency 2

# Recommended: nightly/full run (Tier 1 + Tier 2 + Tier 3, full scope)
python tools/audit/run_audit.py --mode nightly --concurrency 2

# Legacy / explicit tiers (still supported)
# Tier 1 only
python tools/audit/run_audit.py --tier 1

# Tier 1 + Tier 2 in one bundle
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-local"
python tools/audit/run_audit.py --tier 1 --run-id "$RUN_ID"
python tools/audit/run_audit.py --tier 2 --run-id "$RUN_ID"

# Sprint 0 governance views
python tools/audit/status_snapshot.py
python tools/audit/sprint0_audit.py --run-id "$RUN_ID"

# Post-cutover attestations (per task)
python tools/audit/attestation.py generate --task-id IFC-160 --run-id "$RUN_ID" --attested-by "Tech Lead"
python tools/audit/attestation.py validate --task-id IFC-160
```

See `docs/ops/audit-performance-and-iteration.md` for affected-scope outputs,
caching, resume, and concurrency details.

## What reviewers look at

- `artifacts/reports/system-audit/<RUN_ID>/summary.md`
- `artifacts/reports/sprint0-audit.md`
- `artifacts/reports/review-queue.md`
- `artifacts/debt-ledger.md`
