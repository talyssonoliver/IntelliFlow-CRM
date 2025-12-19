# System Audit Tooling

Implements the audit cutover + tiered all-tools audit framework described in:

- `apps/project-tracker/docs/metrics/_global/audit_playbook.md`

## Quick start (local)

```bash
# Tier 1 only
python tools/audit/run_audit.py --tier 1

# Tier 1 + Tier 2 (same run-id bundle)
RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-local"
python tools/audit/run_audit.py --tier 1 --run-id "$RUN_ID"
python tools/audit/run_audit.py --tier 2 --run-id "$RUN_ID"

# Sprint 0 snapshot + audit views
python tools/audit/status_snapshot.py
python tools/audit/sprint0_audit.py --run-id "$RUN_ID"

# Per-task attestations (post-cutover completion contract)
python tools/audit/attestation.py generate --task-id IFC-160 --run-id "$RUN_ID" --attested-by "Tech Lead"
python tools/audit/attestation.py validate --task-id IFC-160
```

Outputs:

- `artifacts/reports/system-audit/<RUN_ID>/summary.md`
- `artifacts/reports/sprint0-audit.md`
- `artifacts/reports/review-queue.md`
- `artifacts/debt-ledger.md`

## Configuration

- Cutover config: `audit-cutover.yml`
- Tool matrix: `audit-matrix.yml`
