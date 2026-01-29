# Legacy System Migration - Cutover Plan

**Task ID**: IFC-145
**Cutover Date**: [To be scheduled - minimum 48 hours notice]
**Estimated Duration**: 3.5 hours (target: <4 hours)
**Downtime Window**: Scheduled maintenance window (off-peak hours)
**Target Date Criteria**: Post-12:00 UTC on weekday (not Friday)

---

## Document Control

| Version | Date | Author | Approval | Status |
|---------|------|--------|----------|--------|
| 1.0 | 2025-12-29 | Migration Team | Pending | Ready for Review |

---

## Executive Summary

This document outlines the detailed cutover plan for migrating from the legacy CRM system to IntelliFlow CRM. The plan includes step-by-step execution procedures, rollback triggers and procedures, and contingency plans to minimize business risk and ensure data continuity.

**Key Metrics**:
- Target Migration Time: <4 hours
- Data Completeness Target: ≥99%
- Acceptable Data Loss: 0 critical records
- Rollback Time: <15 minutes
- Post-cutover Validation: 2-4 hours

---

## 1. Pre-Cutover Phase (48 Hours Before)

### 1.1 Stakeholder Communication
- [ ] Send cutover notification to all stakeholders (48 hours notice)
- [ ] Publish cutover schedule in company-wide channels
- [ ] Prepare user communication message (why cutover, what to expect)
- [ ] Set up war room conference bridge (accessible 24/7 during window)
- [ ] Distribute runbook to on-call team members

### 1.2 System Preparation
- [ ] Verify production database backup completed and validated
- [ ] Confirm target database is clean and ready
- [ ] Test database connectivity from all migration nodes
- [ ] Verify ETL pipeline resources (CPU, memory, disk space)
- [ ] Validate network bandwidth (minimum 100 Mbps required)
- [ ] Check SSL certificates for database connections (expiry >30 days)

### 1.3 Data Validation
- [ ] Run final reconciliation against legacy system
- [ ] Verify data completeness metrics (target: ≥99%)
- [ ] Validate all enum mappings are correct
- [ ] Check for new records created since rehearsal test
- [ ] Confirm ID mapping table is current and validated
- [ ] Test foreign key constraints in target environment

### 1.4 Monitoring Setup
- [ ] Deploy application performance monitors (APM) agents
- [ ] Configure dashboards for key metrics:
  - Database query latency (target: <20ms)
  - Application response times (target: <100ms p95)
  - Error rates (target: <0.1%)
  - User login success rate (target: >99.9%)
  - CPU/Memory utilization (alert at >80%)
  - Disk I/O (alert at >90%)
- [ ] Test alerting system with test alerts
- [ ] Prepare on-call escalation procedure

### 1.5 Rollback Preparation
- [ ] Verify rollback snapshot exists and is valid
  - SHA256: [to be filled]
  - Size: 847 MB
  - Location: `/db-snapshots/legacy-2025-12-29-pre-migration.sql`
- [ ] Test rollback procedure in staging environment
- [ ] Prepare rollback scripts and executables
- [ ] Document rollback confirmation checklist
- [ ] Brief rollback team on procedures

### 1.6 User Preparation
- [ ] Notify users of scheduled downtime
- [ ] Provide login credentials for new system (if changed)
- [ ] Publish FAQ addressing common questions
- [ ] Prepare support tickets/email template for post-cutover issues
- [ ] Schedule post-cutover training sessions (optional)

---

## 2. Cutover Execution Phase (On Day)

### Phase 2.0: Pre-Execution (T-30 minutes)

**Execution Time**: T-30:00
**Duration**: 30 minutes
**Responsibility**: Migration Lead + Infrastructure Team

#### Steps
1. **Final System Check**
   - [ ] Confirm all team members are online and ready
   - [ ] Verify war room is operational
   - [ ] Test conference bridge and chat channels
   - [ ] Check monitoring dashboards are loading
   - [ ] Verify backups are complete and documented

2. **Data Sync Verification**
   - [ ] Confirm legacy system is operating normally
   - [ ] Execute test data query against legacy system
   - [ ] Verify target environment is clean
   - [ ] Document time of data freeze

3. **Approval to Proceed**
   - [ ] Database Administrator: Ready ✅
   - [ ] Infrastructure Lead: Ready ✅
   - [ ] Application Lead: Ready ✅
   - [ ] Migration Lead: Ready ✅

   **Proceed to Phase 1** only when all sign off.

---

### Phase 2.1: Legacy System Shutdown (T-0:00 to T+0:30)

**Execution Time**: T-0:00
**Duration**: 30 minutes
**Responsibility**: Infrastructure Team + Application Team

#### Steps
1. **Place Legacy System in Read-Only Mode**
   ```bash
   # Command executed on legacy-db-prod
   ALTER SYSTEM SET default_transaction_read_only = on;
   SELECT pg_reload_conf();
   ```
   - [ ] Confirm all UPDATE/DELETE operations are blocked
   - [ ] Verify SELECT operations still work
   - [ ] Wait 2 minutes for all connections to respect setting
   - [ ] Log timestamp: ____________

2. **Disconnect Legacy Application Servers**
   - [ ] Stop application servers (graceful shutdown, 60 second timeout)
   - [ ] Verify no active connections remain
   - [ ] Confirm application health checks are failing (expected)
   - [ ] Document number of active sessions at shutdown

3. **Archive Legacy Application Logs**
   - [ ] Compress application logs for archival
   - [ ] Upload to backup storage
   - [ ] Verify integrity (SHA256 hash match)
   - [ ] Log location: ____________

4. **Create Pre-Migration Snapshot**
   ```bash
   # Snapshot created at T+0:20
   pg_dump --format=custom legacy-db-prod > /db-snapshots/legacy-2025-12-29-cutover.sql
   ```
   - [ ] Verify snapshot size: ≥800 MB
   - [ ] Calculate SHA256: ____________
   - [ ] Confirm backup location is accessible
   - [ ] Test restore procedure (simulation only)

**Completion Criteria**: Legacy system fully isolated, no read-only violations, snapshot verified.
**Go/No-Go Decision**: ✅ GO / ❌ NO-GO

---

### Phase 2.2: Final Data Synchronization (T+0:30 to T+0:45)

**Execution Time**: T+0:30
**Duration**: 15 minutes
**Responsibility**: Migration Team + Database Team

#### Steps
1. **Execute Delta Sync**
   ```bash
   # Extract changes since rehearsal test
   python3 scripts/migration/delta-sync.py \
     --source legacy-db-prod \
     --target crm-db-prod \
     --since 2025-12-29T15:00:00Z
   ```
   - [ ] Records to sync: ____________
   - [ ] Transformation pipeline complete
   - [ ] Conflicts identified and resolved: ____________
   - [ ] Data integrity checks passed

2. **Validate Sync Completeness**
   - [ ] Row count matches expected
   - [ ] Checksums match between source and target
   - [ ] Foreign key constraints still valid
   - [ ] No data loss or truncation detected

3. **Final Reconciliation**
   ```bash
   # Run reconciliation report
   python3 scripts/migration/reconciliation.py \
     --target crm-db-prod \
     --output /artifacts/misc/reconciliation-final.csv
   ```
   - [ ] User count: 156 ✅
   - [ ] Lead count: 8,234 ✅
   - [ ] Contact count: 5,421 ✅
   - [ ] Account count: 1,847 ✅
   - [ ] Opportunity count: 12,563 ✅
   - [ ] Task count: 19,771 ✅
   - [ ] Audit log count: 47,892 ✅
   - [ ] Data completeness: ≥99% ✅

**Completion Criteria**: All data synced, reconciliation passed, checksums verified.
**Go/No-Go Decision**: ✅ GO / ❌ NO-GO

---

### Phase 2.3: Target Database Validation (T+0:45 to T+1:00)

**Execution Time**: T+0:45
**Duration**: 15 minutes
**Responsibility**: Database Team + QA Team

#### Steps
1. **Integrity Check Suite**
   ```bash
   # Run comprehensive validation
   python3 scripts/migration/validate-target.py \
     --database crm-db-prod \
     --output /var/log/migration/validation-2025-12-29.log
   ```
   - [ ] Primary key uniqueness: ✅
   - [ ] Foreign key constraints: ✅
   - [ ] NOT NULL constraints: ✅
   - [ ] UNIQUE constraints: ✅
   - [ ] Check constraints (enums, ranges): ✅
   - [ ] Default values applied correctly: ✅

2. **Data Type & Format Validation**
   - [ ] Email format validation: 13,811 records
   - [ ] Phone E.164 format: 8,156 records
   - [ ] URL validation: 1,847 records
   - [ ] Decimal precision (15,2): 1,847 records
   - [ ] Date range (2020-2025): 95,884 records
   - [ ] Enum values: 89,237 records

3. **Index and Performance Validation**
   - [ ] All indexes created successfully
   - [ ] Index sizes within expected range
   - [ ] Sample query execution time: <20ms for lead lookup
   - [ ] Connection pool initialization: ✅

**Completion Criteria**: All validation checks passed, no errors or warnings.
**Go/No-Go Decision**: ✅ GO / ❌ NO-GO

---

### Phase 2.4: DNS Switch & Routing Update (T+1:00 to T+1:10)

**Execution Time**: T+1:00
**Duration**: 10 minutes
**Responsibility**: Infrastructure Team + Network Ops

#### Steps
1. **Pre-Switch Verification**
   - [ ] Confirm target database is fully operational
   - [ ] Verify application servers are ready (waiting for DB switch)
   - [ ] Check DNS records current configuration
   - [ ] Test switchover in parallel environment

2. **DNS Update**
   ```bash
   # Update DNS A record
   # Old: crm-db.internal -> legacy-db-prod (203.0.113.50)
   # New: crm-db.internal -> crm-db-prod (203.0.113.100)

   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file:///tmp/dns-change.json
   ```
   - [ ] DNS change submitted
   - [ ] Propagation monitoring started
   - [ ] Change timestamp: T+1:00

3. **Connection String Update**
   - [ ] Update application environment variables
   - [ ] Verify connection pool redirects to new database
   - [ ] Monitor connection success rate

4. **Post-Switch Verification**
   - [ ] Verify DNS resolution points to new database
   - [ ] Check database connection from application: ✅
   - [ ] Confirm write operations succeeding: ✅
   - [ ] Monitor error logs for connection issues

**Completion Criteria**: DNS switch complete, application fully connected to target database.
**Go/No-Go Decision**: ✅ GO / ❌ NO-GO

---

### Phase 2.5: Application Startup (T+1:10 to T+1:40)

**Execution Time**: T+1:10
**Duration**: 30 minutes
**Responsibility**: Application Team + DevOps

#### Steps
1. **Prepare Application Servers**
   - [ ] Clear application caches
   - [ ] Reset connection pools
   - [ ] Load new database schema into application memory
   - [ ] Prepare rolling restart strategy

2. **Rolling Application Restart**
   ```bash
   # Restart application servers one by one
   # Rolling 3-minute restart window ensures high availability
   for server in app-01 app-02 app-03 app-04; do
     kubectl rollout restart deployment/web -n prod
     sleep 180  # Wait 3 minutes between restarts
     verify_health_check $server
   done
   ```
   - [ ] App server 1: Started ✅ | Health check: ✅
   - [ ] App server 2: Started ✅ | Health check: ✅
   - [ ] App server 3: Started ✅ | Health check: ✅
   - [ ] App server 4: Started ✅ | Health check: ✅

3. **Health Check Validation**
   - [ ] Application responding to HTTP requests: ✅
   - [ ] Database health check passing: ✅
   - [ ] Authentication functional: ✅
   - [ ] Sample API endpoints responding: ✅
   - [ ] Error logs showing no critical errors: ✅

4. **Smoke Test Execution**
   - [ ] User login successful: ✅
   - [ ] Lead listing returning data: ✅
   - [ ] Contact creation functional: ✅
   - [ ] Search functionality working: ✅
   - [ ] File upload/download functional: ✅

**Completion Criteria**: All application servers healthy, smoke tests passed, users can access system.
**Go/No-Go Decision**: ✅ GO / ❌ NO-GO

---

## 3. Post-Cutover Validation Phase (T+1:40 to T+3:40)

### Phase 3.1: Immediate System Validation (T+1:40 to T+2:20)

**Duration**: 40 minutes

#### Steps
1. **Data Verification** (5 minutes)
   - [ ] Query lead count: Expected 8,234, Actual: __________
   - [ ] Query contact count: Expected 5,421, Actual: __________
   - [ ] Query account count: Expected 1,847, Actual: __________
   - [ ] Query user count: Expected 156, Actual: __________
   - [ ] Spot check 5 random records match legacy system

2. **Application Functionality** (15 minutes)
   - [ ] Users can log in successfully
   - [ ] Dashboard loads without errors
   - [ ] All navigation menus accessible
   - [ ] Search functionality returns accurate results
   - [ ] Create/Update/Delete operations working
   - [ ] File uploads/downloads functional
   - [ ] Email notifications being sent
   - [ ] Background jobs executing

3. **Performance Monitoring** (20 minutes)
   - [ ] API response times (target: <100ms p95)
   - [ ] Database query latency (target: <20ms)
   - [ ] Page load times (target: <2 seconds)
   - [ ] CPU utilization (normal: <60%)
   - [ ] Memory utilization (normal: <70%)
   - [ ] Disk I/O (normal: <50%)
   - [ ] Error rate (target: <0.1%)
   - [ ] User session stability

### Phase 3.2: Business Logic Validation (T+2:20 to T+3:20)

**Duration**: 60 minutes

#### Steps
1. **User Access Verification** (15 minutes)
   - [ ] 20+ users successfully logged in
   - [ ] Role-based permissions working correctly
   - [ ] User preferences loaded correctly
   - [ ] Team/account assignments correct
   - [ ] Permission inheritance working

2. **Data Integrity Verification** (30 minutes)
   - [ ] Lead-Contact relationships intact
   - [ ] Account-Contact relationships intact
   - [ ] Opportunity-Account relationships intact
   - [ ] Task-Lead/Contact/Opportunity relationships valid
   - [ ] User ownership chains correct
   - [ ] Audit log entries showing correct user references

3. **Feature Validation** (15 minutes)
   - [ ] AI scoring (if enabled): Running without errors
   - [ ] Lead status workflow: Transitions working
   - [ ] Opportunity pipeline: Stages functioning
   - [ ] Task assignments: Notifications sent
   - [ ] Calendar integration (if applicable): Working
   - [ ] Reporting: Data aggregation correct

### Phase 3.3: Analytics & Monitoring (T+3:20 to T+3:40)

**Duration**: 20 minutes

#### Steps
1. **Key Metrics Review**
   - [ ] System uptime: 100% ✅
   - [ ] Error rate: <0.1% ✅
   - [ ] User success rate: >99% ✅
   - [ ] Data consistency: 100% ✅
   - [ ] Performance SLA: Met ✅

2. **Post-Cutover Monitoring**
   - [ ] Continue 24/7 monitoring for next 48 hours
   - [ ] Alert on: Error rate >1%, response time >500ms, CPU >80%
   - [ ] Daily health check report for 7 days
   - [ ] Weekly data integrity audit for 30 days

**Completion Criteria**: All validation checks passed, system fully operational, metrics within SLA.
**Sign-Off**: ✅ CUTOVER SUCCESSFUL

---

## 4. Rollback Procedures

### When to Trigger Rollback

**Rollback should be triggered if ANY of the following occur**:

1. **Data Loss Detection**
   - More than 10 records missing (>0.01%)
   - Critical business data (leads, opportunities) missing
   - Audit trail incomplete or corrupted
   - User data corrupted or inaccessible

2. **System Failure**
   - Database connection loss >5 minutes
   - Application not responding
   - Authentication system failure
   - Critical business logic failing

3. **Unrecoverable Errors**
   - Data integrity check failure
   - Cascading system failures
   - Data corruption detected and unfixable
   - Unexpected cascading data loss

4. **Performance Degradation**
   - Query latency >500ms (>5x normal)
   - API response time >1000ms (>10x normal)
   - System load average >80% sustained
   - Out of memory or disk space errors

5. **Business Decision**
   - Executive decision to halt cutover
   - Critical business process blocked
   - Regulatory/compliance requirement

### Rollback Decision Criteria

**Rollback decision authority**: Database Administrator + Infrastructure Lead (must both agree)

**Rollback window**: Must be initiated within 2 hours of cutover start (T+2:00 latest)

**Rollback trigger point**: Restore from pre-migration snapshot

---

### Phase 4.1: Rollback Initiation (T+0 to T+5)

**Duration**: 5 minutes
**Responsibility**: Database Administrator

#### Steps
1. **Decision Documentation**
   ```
   Rollback Initiated: [timestamp]
   Reason: ___________________________
   Decision Authority: __________________
   Approval from: DBA ✅ | Infra Lead ✅
   ```
   - [ ] Reason documented
   - [ ] Approval obtained
   - [ ] War room notified
   - [ ] Escalation initiated

2. **Stop All Connections**
   ```bash
   # Disconnect all application servers
   # Kill all idle connections
   SELECT pg_terminate_backend(pid)
   FROM pg_stat_activity
   WHERE pid <> pg_backend_pid();
   ```
   - [ ] Application servers shut down
   - [ ] All database connections terminated
   - [ ] No new connections allowed

3. **Preserve Post-Cutover Database**
   - [ ] Backup current database state (for debugging)
     ```bash
     pg_dump --format=custom crm-db-prod > /db-snapshots/failed-cutover-2025-12-29.sql
     ```
   - [ ] Store logs and diagnostics
   - [ ] Calculate SHA256 for integrity

---

### Phase 4.2: Restore Legacy System (T+5 to T+10)

**Duration**: 5 minutes
**Responsibility**: Database Administrator + Database Team

#### Steps
1. **Initiate Restore**
   ```bash
   # Restore from pre-migration snapshot
   pg_restore --format=custom --clean --create \
     --dbname=legacy-db-prod \
     /db-snapshots/legacy-2025-12-29-pre-migration.sql
   ```
   - [ ] Restore process started (monitor progress)
   - [ ] Expected duration: 4-6 minutes
   - [ ] Monitor disk space (need 2GB free minimum)

2. **Verify Restore Completion**
   - [ ] Restore process completed without errors
   - [ ] Error log reviewed (warnings acceptable, errors critical)
   - [ ] Final record count matches expected
   - [ ] Integrity checks run on restored data

---

### Phase 4.3: Reconnect Legacy Application (T+10 to T+15)

**Duration**: 5 minutes
**Responsibility**: Infrastructure Team + Application Team

#### Steps
1. **Revert DNS**
   ```bash
   # Point DNS back to legacy system
   aws route53 change-resource-record-sets \
     --hosted-zone-id Z1234567890ABC \
     --change-batch file:///tmp/dns-revert.json
   ```
   - [ ] DNS change submitted
   - [ ] DNS propagation initiated

2. **Restart Application Servers**
   - [ ] Clear all cached connections
   - [ ] Restart application servers (rolling)
   - [ ] Monitor for successful database connections

3. **Verify Connectivity**
   - [ ] Application responding to requests
   - [ ] Database queries executing
   - [ ] Users can log in
   - [ ] Sample data retrieval working

---

### Phase 4.4: Rollback Validation (T+15 to T+20)

**Duration**: 5 minutes
**Responsibility**: QA Team + Business Stakeholders

#### Steps
1. **System Functionality Check**
   - [ ] Users can log in: ✅
   - [ ] Dashboard loads: ✅
   - [ ] Data visible in UI: ✅
   - [ ] Basic queries work: ✅

2. **Data Integrity Verification**
   - [ ] Record count validation
   - [ ] Spot check 10 random records
   - [ ] User permissions correct
   - [ ] Recent changes visible

3. **Notification**
   - [ ] Notify all stakeholders of rollback completion
   - [ ] Provide status update to users
   - [ ] Schedule post-rollback analysis meeting
   - [ ] Document rollback reason and findings

**Rollback Completion Criteria**: Legacy system fully operational, users have access, data integrity confirmed.

---

## 5. Contingency Plans

### Contingency 1: Partial Data Loss (1-100 records)

**Trigger**: Row count variance >0.01% but <0.1%

**Recovery**:
1. Do NOT rollback immediately
2. Identify missing records from logs
3. Execute targeted re-sync for missing records
4. Validate data integrity post-sync
5. If successful, proceed with monitoring
6. If unsuccessful, execute full rollback

**Time window**: 30 minutes to identify and fix

---

### Contingency 2: Foreign Key Constraint Violations

**Trigger**: Constraint violation errors during application startup

**Recovery**:
1. Do NOT rollback immediately
2. Run constraint validation query
3. Identify orphaned references
4. Execute cleanup script (delete orphaned records)
5. Restart application and validate
6. If successful, proceed with monitoring
7. If unsuccessful, execute full rollback

**Time window**: 20 minutes to identify and fix

---

### Contingency 3: DNS Propagation Failure

**Trigger**: DNS still resolves to legacy after 5 minutes of change

**Recovery**:
1. Check DNS change was applied correctly
2. Clear local DNS cache on application servers
3. Restart application servers to pick up new DNS
4. If DNS change failed, reapply and verify
5. If widespread DNS issue, contact ISP/DNS provider
6. Consider direct IP routing as fallback

**Time window**: 15 minutes maximum

---

### Contingency 4: Application Startup Failure

**Trigger**: Application health check failing after restart

**Recovery**:
1. Check application logs for errors
2. Verify database connectivity
3. Check for dependency issues (cache, queue, etc.)
4. Restart specific failing service
5. If isolated to one server, skip and restart others
6. If cascading failure, stop restart and investigate
7. If not resolved in 15 minutes, execute rollback

**Time window**: 15 minutes maximum

---

### Contingency 5: Performance Degradation

**Trigger**: Query latency >500ms or response time >1000ms sustained

**Recovery**:
1. Check database load and connections
2. Review slow query logs
3. Rebuild indexes if needed
4. Check for resource contention (CPU, memory, disk)
5. If issue identified and fixable, apply fix and monitor
6. If issue persists >30 minutes, execute rollback

**Time window**: 30 minutes maximum

---

## 6. Communication Plan

### Pre-Cutover (48 hours before)
- **To**: All Stakeholders
- **Message**: Cutover notification with date, time, expected downtime
- **Channel**: Email, Slack, all-hands meeting
- **Action**: Ask for confirmation of availability

### 2 Hours Before Cutover
- **To**: War room team
- **Message**: Final preparation reminder, meeting links, call times
- **Channel**: Email + Slack
- **Action**: Team confirmation and readiness

### 30 Minutes Before Cutover
- **To**: All Users
- **Message**: System going offline in 30 minutes, downtime estimated 3-4 hours
- **Channel**: In-app banner, email, Slack bot
- **Action**: Users should save work and log out

### During Cutover (Every 30 minutes)
- **To**: War room team + stakeholders
- **Message**: Status update (phase complete, metrics, no issues)
- **Channel**: Slack status thread + email updates
- **Action**: Keep team informed, escalate issues immediately

### Post-Cutover Success
- **To**: All Users
- **Message**: Migration successful, system is operational, thank you for patience
- **Channel**: In-app notification, email, Slack
- **Action**: Provide support contact for issues

### Post-Cutover Failure (Rollback)
- **To**: All Users
- **Message**: Technical issue detected, system rolled back to legacy while we investigate
- **Channel**: In-app notification, email, Slack, status page
- **Action**: Apologize, provide timeline for next attempt, link to support

---

## 7. Success Criteria

**Cutover is considered SUCCESSFUL when**:

✅ All data migrated (≥99% completeness)
✅ Zero critical data loss (no lost leads, contacts, accounts)
✅ All users can log in
✅ Dashboard and key features working
✅ Query performance meets SLA (<20ms)
✅ API response times meet SLA (<100ms p95)
✅ Error rate <0.1%
✅ No critical errors in logs
✅ All integrity checks passed
✅ Post-cutover validation completed in <4 hours

**Cutover is considered FAILED if**:
❌ Data loss >0.1%
❌ Critical business data missing or corrupted
❌ Application cannot start
❌ Users cannot log in
❌ Query performance >500ms sustained
❌ Error rate >1%
❌ Critical errors in logs
❌ Data integrity check failed
❌ Cannot be resolved within 2-hour window

---

## 8. Post-Cutover Activities

### Week 1 (Daily)
- [ ] Daily health check report
- [ ] Monitor error logs for anomalies
- [ ] Check user feedback for data issues
- [ ] Validate key business metrics (lead counts, opportunity values)

### Week 2-4 (Weekly)
- [ ] Weekly reconciliation report
- [ ] Performance trend analysis
- [ ] User feedback summary
- [ ] Data consistency audit
- [ ] Backup verification

### Month 2-3 (Monthly)
- [ ] Decommission legacy system (30 days after cutover)
- [ ] Archive legacy backups
- [ ] Close migration tickets
- [ ] Post-mortem meeting and lessons learned
- [ ] Update disaster recovery procedures

---

## Appendix: Rollback Checklist

### Pre-Rollback Checklist
- [ ] Rollback decision documented
- [ ] Approval from DBA and Infrastructure Lead obtained
- [ ] War room notified
- [ ] Pre-migration snapshot verified (location, size, checksum)
- [ ] Rollback scripts tested in staging
- [ ] Team members briefed on procedures

### Rollback Execution Checklist
- [ ] All connections terminated
- [ ] Pre-migration snapshot location verified
- [ ] Restore process initiated
- [ ] Restore process completed successfully
- [ ] DNS reverted to legacy system
- [ ] Application servers restarted
- [ ] Legacy system connectivity verified
- [ ] User access confirmed

### Post-Rollback Checklist
- [ ] Users notified of rollback
- [ ] Legacy system functionality verified
- [ ] Data integrity validated
- [ ] Post-mortem analysis started
- [ ] Failed cutover database preserved for debugging
- [ ] Next cutover date scheduled
- [ ] Lessons learned documented

---

## Sign-Off

This cutover plan requires approval from all key stakeholders before execution:

| Role | Name | Signature | Date | Approval |
|------|------|-----------|------|----------|
| Database Administrator | | | | ☐ |
| Infrastructure Lead | | | | ☐ |
| Application Lead | | | | ☐ |
| Migration Lead | | | | ☐ |
| Project Manager | | | | ☐ |

**Plan Status**: Pending Approval

---

**Document Version**: 1.0
**Last Updated**: 2025-12-29
**Next Review**: To be scheduled after cutover approval
