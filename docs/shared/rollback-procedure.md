# Data Migration Rollback Procedure - IFC-070

## Overview

Immediate rollback instructions for legacy data migration cutover.
**Target rollback time:** <15 minutes

## Document Information

| Property | Value |
|----------|-------|
| Task ID | IFC-070 |
| Version | 1.0 |
| Last Updated | 2026-01-08 |
| Owner | Infrastructure Team |

## Automatic Rollback Triggers

The following conditions automatically trigger rollback evaluation:

| Trigger | Threshold | Action |
|---------|-----------|--------|
| Health check failures | 3 consecutive | Immediate rollback |
| Error rate | >5% within 5 minutes | Immediate rollback |
| P99 latency | >2x baseline (>400ms) | Evaluate rollback |
| Data integrity | >1% failure rate | Immediate rollback |
| Disk space | <10% remaining | Pause and evaluate |

## Prerequisites

Before initiating rollback, verify:

- [ ] Pre-migration snapshot exists: `/db-snapshots/pre-migration-[date].sql`
- [ ] Snapshot verified and tested in staging environment
- [ ] DBA and Infrastructure Lead are available
- [ ] Communication channels are accessible (#incident-response, status page)

## Rollback Decision Matrix

| Severity | Criteria | Decision |
|----------|----------|----------|
| **Critical** | Data loss detected, >10% error rate | Immediate rollback, no approval needed |
| **High** | >5% error rate, critical path blocked | Rollback with DBA approval |
| **Medium** | Performance degraded, non-critical errors | Evaluate, prepare rollback |
| **Low** | Minor issues, workarounds available | Monitor, defer rollback decision |

## Manual Rollback Procedure

### Step 1: Detection and Assessment (0-5 minutes)

1. **Confirm the issue**
   ```bash
   # Check health endpoints
   curl -s https://api.intelliflow.com/health | jq .

   # Check error rate in logs
   kubectl logs -l app=intelliflow-api --tail=100 | grep -c ERROR

   # Check database connectivity
   kubectl exec -it deploy/intelliflow-api -- nc -zv db.intelliflow.internal 5432
   ```

2. **Assess severity**
   - Review monitoring dashboards
   - Check affected user count
   - Verify data integrity status

3. **Document initial findings**
   - Create incident ticket immediately
   - Note timestamp and symptoms

### Step 2: Approval (0-2 minutes)

1. **Get required approvals**
   - DBA: Required for database rollback
   - Infrastructure Lead: Required for infrastructure changes

2. **Notify stakeholders**
   ```
   @channel [INCIDENT] Migration rollback initiated
   - Issue: [Brief description]
   - Impact: [Affected users/systems]
   - ETA: 15 minutes
   - Incident ticket: [Link]
   ```

3. **Update status page**
   - Set status to "Investigating"
   - Post initial incident update

### Step 3: Execution (<5 minutes)

1. **Stop application servers**
   ```bash
   # Scale down to 0 replicas
   kubectl scale deployment intelliflow-api --replicas=0

   # Verify all pods are terminated
   kubectl get pods -l app=intelliflow-api
   ```

2. **Restore database from snapshot**
   ```bash
   # Connect to database server
   ssh dba@db.intelliflow.internal

   # Restore from pre-migration snapshot
   pg_restore -h localhost -U dba -d intelliflow \
     --clean --if-exists \
     /db-snapshots/pre-migration-[date].sql

   # Verify restore completed
   psql -U dba -d intelliflow -c "SELECT COUNT(*) FROM leads;"
   ```

3. **Clear caches**
   ```bash
   # Flush Redis cache
   redis-cli -h redis.intelliflow.internal FLUSHALL

   # Clear CDN cache if applicable
   # [CDN-specific command]
   ```

4. **Restart application servers**
   ```bash
   # Scale back up
   kubectl scale deployment intelliflow-api --replicas=3

   # Wait for pods to be ready
   kubectl wait --for=condition=ready pod -l app=intelliflow-api --timeout=120s
   ```

### Step 4: Verification (2-5 minutes)

Run through verification checklist:

- [ ] Health check endpoints return 200
  ```bash
  curl -s https://api.intelliflow.com/health | jq .status
  # Expected: "healthy"
  ```

- [ ] User login works with restored data
  ```bash
  # Test login endpoint
  curl -X POST https://api.intelliflow.com/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@test.com","password":"test"}'
  ```

- [ ] Sample queries return expected results
  ```sql
  -- Verify lead count matches pre-migration
  SELECT COUNT(*) FROM leads;

  -- Verify recent data preserved
  SELECT MAX(created_at) FROM leads;
  ```

- [ ] Error rate normalized (<0.1%)
  ```bash
  kubectl logs -l app=intelliflow-api --since=5m | grep -c ERROR
  ```

- [ ] No new error spikes in monitoring

### Step 5: Communication

1. **Internal notification**
   ```
   @channel [RESOLVED] Migration rollback complete
   - Status: Systems restored to pre-migration state
   - Data: Verified intact
   - Duration: [X] minutes
   - Root cause investigation: In progress
   ```

2. **Update status page**
   - Set status to "Operational"
   - Post resolution update
   - Link to post-mortem (when available)

3. **Schedule post-mortem**
   - Within 24 hours for critical incidents
   - Within 48 hours for high severity
   - Include all stakeholders

## Automated Rollback Script

For faster execution, use the automated rollback script:

```bash
#!/bin/bash
# scripts/migration/emergency-rollback.sh

set -e

SNAPSHOT_DATE=${1:-$(date +%Y%m%d)}
SNAPSHOT_PATH="/db-snapshots/pre-migration-${SNAPSHOT_DATE}.sql"

echo "=== Emergency Rollback Initiated ==="
echo "Snapshot: $SNAPSHOT_PATH"
echo "Time: $(date -Iseconds)"

# 1. Stop application
echo "Stopping application servers..."
kubectl scale deployment intelliflow-api --replicas=0
kubectl wait --for=delete pod -l app=intelliflow-api --timeout=60s || true

# 2. Restore database
echo "Restoring database from snapshot..."
pg_restore -h $DB_HOST -U $DB_USER -d intelliflow \
  --clean --if-exists "$SNAPSHOT_PATH"

# 3. Clear caches
echo "Clearing caches..."
redis-cli -h $REDIS_HOST FLUSHALL

# 4. Restart application
echo "Restarting application servers..."
kubectl scale deployment intelliflow-api --replicas=3
kubectl wait --for=condition=ready pod -l app=intelliflow-api --timeout=120s

# 5. Verify
echo "Verifying health..."
sleep 10
curl -sf https://api.intelliflow.com/health || exit 1

echo "=== Rollback Complete ==="
```

## Rollback Verification Checklist

| Check | Command | Expected Result |
|-------|---------|-----------------|
| API Health | `curl /health` | `{"status":"healthy"}` |
| Database Connection | `psql -c "SELECT 1"` | `1` |
| User Count | `SELECT COUNT(*) FROM users` | Match pre-migration |
| Lead Count | `SELECT COUNT(*) FROM leads` | Match pre-migration |
| Recent Data | `SELECT MAX(created_at) FROM leads` | Pre-migration timestamp |
| Error Rate | Check monitoring | <0.1% |
| Response Time | Check monitoring | <200ms p99 |

## Post-Rollback Actions

1. **Preserve Evidence**
   - Export logs from rollback window
   - Screenshot monitoring dashboards
   - Save database state before rollback

2. **Root Cause Analysis**
   - Identify what triggered the rollback
   - Document the failure mode
   - Propose fixes before retry

3. **Update Runbooks**
   - Add any new learnings
   - Update thresholds if needed
   - Improve automation

4. **Plan Retry**
   - Fix identified issues
   - Schedule off-peak retry window
   - Ensure additional monitoring

## Related Documents

- [Cutover Plan](../operations/cutover-plan.md)
- [Migration Test Plan](../testing/migration-test-plan.md)
- [Incident Response](../operations/incident-response.md)
- [Release Rollback](../operations/release-rollback.md)

## Contacts

| Role | Name | Contact |
|------|------|---------|
| DBA On-Call | - | pager-dba@intelliflow.com |
| Infrastructure Lead | - | pager-infra@intelliflow.com |
| Engineering Manager | - | em@intelliflow.com |

---

*This document is part of IFC-070 (Data Migration from Legacy) and satisfies the rollback-procedure.md DoD artifact requirement.*
