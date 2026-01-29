# File Ingestion Runbook

**Owner:** Backend Dev + Integration Eng
**Last Updated:** 2025-12-31
**Task:** IFC-153
**On-Call Escalation:** #engineering-oncall

---

## Overview

This runbook covers operational procedures for the **File Ingestion Pipeline**, which handles:
- Web uploads of case documents
- Email attachment processing
- Antivirus scanning
- Metadata extraction
- Storage management
- Event emission to downstream consumers

**Critical SLAs:**
- Upload latency (p95): <5s
- AV scan latency (p95): <10s
- End-to-end ingestion (p95): <15s
- Success rate: >99%
- Error rate: <1%

---

## Architecture Quick Reference

```
User Upload → API Validation → Quarantine Storage → AV Scan →
Metadata Extraction → Primary Storage → Document Created →
Event Emission → Indexing/Thumbnails/OCR
```

**Key Components:**
- **Ingestion API**: `/api/documents/upload` (tRPC)
- **AV Scanner Worker**: `av-scan-worker` (BullMQ)
- **Metadata Extractor**: `metadata-extraction-service`
- **Storage Buckets**: `case-documents` (primary), `case-documents-quarantine`
- **Event Bus**: Redis (BullMQ queues)

---

## Monitoring & Alerts

### Key Metrics

| Metric | Dashboard | Alert Threshold | Severity |
|--------|-----------|-----------------|----------|
| Ingestion success rate | Grafana: File Ingestion | <95% in 5min | P1 |
| AV scan queue depth | Grafana: Workers | >100 jobs | P2 |
| Storage bucket quota | Supabase Dashboard | >80% full | P2 |
| Dead Letter Queue size | Grafana: DLQ | >10 messages | P3 |
| Upload latency (p95) | Grafana: API Performance | >10s | P2 |
| AV scan failures | Grafana: AV Scanner | >5% in 10min | P1 |

### Alert Channels

- **P1 (Critical)**: PagerDuty → On-call engineer + Engineering manager
- **P2 (High)**: Slack #alerts-engineering + Email engineering@
- **P3 (Medium)**: Slack #ops-notifications

### Health Check Endpoints

```bash
# Ingestion API health
curl https://api.intelliflow.com/health/ingestion

# AV Scanner status
curl https://api.intelliflow.com/health/av-scanner

# Storage connectivity
curl https://api.intelliflow.com/health/storage
```

---

## Common Issues & Troubleshooting

### 1. Upload Failures (HTTP 500)

**Symptoms:**
- Users report "Upload failed" errors
- Logs show `StorageConnectionError` or `TimeoutError`
- Success rate drops below 95%

**Diagnosis:**
```bash
# Check recent upload errors
tail -f /var/log/intelliflow/api.log | grep "upload.*error"

# Check storage connectivity
curl -I https://your-project.supabase.co/storage/v1/bucket/case-documents

# View failed ingestion jobs
npm run cli jobs:failed -- --queue=ingestion --limit=20
```

**Resolution:**
1. **If storage is down**: Check Supabase status page, escalate to infrastructure team
2. **If quota exceeded**: Free up space or increase quota in Supabase dashboard
3. **If network timeout**: Restart ingestion service: `pm2 restart ingestion-api`
4. **If persistent**: Enable debug logging: `export LOG_LEVEL=debug && pm2 restart ingestion-api`

**Escalation:** If issue persists >15min, escalate to P1 (page on-call)

---

### 2. AV Scanner Backlog

**Symptoms:**
- AV scan queue depth >100 jobs
- Users see "Processing..." status for >2min
- Scanned rate drops below expected throughput (20 files/min)

**Diagnosis:**
```bash
# Check AV scanner queue
npm run cli jobs:queue-status -- --queue=av-scan

# Check ClamAV daemon status
systemctl status clamav-daemon

# View worker logs
pm2 logs av-scan-worker --lines 100
```

**Resolution:**
1. **If ClamAV is down**:
   ```bash
   sudo systemctl restart clamav-daemon
   sudo systemctl restart clamav-freshclam  # Update virus definitions
   pm2 restart av-scan-worker
   ```

2. **If backlog is growing**:
   - Scale up workers: `pm2 scale av-scan-worker +2`
   - Check virus definition updates: `sudo freshclam`
   - Increase worker concurrency: Set `WORKER_CONCURRENCY=5` in env

3. **If ClamAV is slow**:
   - Check CPU usage: `top -p $(pgrep clamd)`
   - Increase ClamAV threads in `/etc/clamav/clamd.conf`
   - Consider adding dedicated AV server

**Escalation:** If backlog >200 or queue stalled >10min, escalate to P2

---

### 3. Infected Files

**Symptoms:**
- Alert: "Virus detected in uploaded file"
- User notified of rejected upload
- File deleted from quarantine

**Diagnosis:**
```bash
# View recent virus detections
npm run cli av:recent-infections -- --hours=24

# Check quarantine bucket
aws s3 ls s3://case-documents-quarantine/ --recursive | grep infected
```

**Actions:**
1. **Log the incident**: Security team must be notified (auto-alert configured)
2. **Review upload source**: Check if user account is compromised
3. **Check for patterns**: If multiple infections from same tenant, investigate
4. **Update virus definitions**: `sudo freshclam && pm2 restart av-scan-worker`

**Escalation:** Single infection = P3 (log only). Multiple infections (>5/hour) = P1 (security incident)

---

### 4. Dead Letter Queue (DLQ) Build-up

**Symptoms:**
- DLQ size >10 messages
- Persistent failures for same file/user
- Logs show repeated retry exhaustion

**Diagnosis:**
```bash
# View DLQ messages
npm run cli jobs:dlq -- --queue=ingestion --limit=50

# Analyze failure reasons
npm run cli jobs:dlq-stats -- --queue=ingestion --group-by=error
```

**Common Failure Reasons:**

| Error | Cause | Resolution |
|-------|-------|------------|
| `StorageQuotaExceeded` | Bucket full | Increase quota or clean up old files |
| `InvalidMimeType` | User uploaded unsupported file | Update allowed MIME types or reject |
| `HashCollision` | Duplicate file upload | Idempotency check - return existing document ID |
| `MetadataExtractionFailed` | Corrupted file | Manual review, potentially re-upload |
| `ClassificationFailed` | Missing classification rules | Update ADR-007 rules |

**Resolution:**
1. **Review DLQ entries**:
   ```bash
   npm run cli jobs:dlq-review -- --interactive
   ```

2. **Retry recoverable failures**:
   ```bash
   npm run cli jobs:dlq-retry -- --error-type=StorageTimeout
   ```

3. **Delete unrecoverable**:
   ```bash
   npm run cli jobs:dlq-delete -- --job-id=<ID> --reason="Corrupted file"
   ```

**Escalation:** If DLQ >50 messages, escalate to P2 (investigate root cause)

---

### 5. Email Attachment Processing Failures

**Symptoms:**
- Email attachments not appearing in system
- Webhook errors from SendGrid/SES
- Logs show `EmailProcessingError`

**Diagnosis:**
```bash
# Check recent email ingestions
tail -f /var/log/intelliflow/email-inbound.log

# View webhook failures
curl -X GET "https://api.sendgrid.com/v3/user/webhooks/parse/stats" \
  -H "Authorization: Bearer $SENDGRID_API_KEY"

# Test webhook endpoint
curl -X POST http://localhost:3000/api/inbound/email \
  -H "Content-Type: multipart/form-data" \
  -F "attachment=@test-file.pdf"
```

**Resolution:**
1. **If webhook is failing**:
   - Check endpoint accessibility: `curl https://api.intelliflow.com/api/inbound/email`
   - Verify webhook signature validation
   - Review SendGrid webhook settings

2. **If attachments are rejected**:
   - Check file size limits (25MB for email)
   - Verify sender is authorized
   - Check MIME type restrictions

3. **If processing is slow**:
   - Scale up email processor workers
   - Check Redis queue health

**Escalation:** If email processing is down >30min, escalate to P1

---

## Maintenance Procedures

### Daily Tasks

1. **Monitor DLQ**: Check DLQ size and review any entries
   ```bash
   npm run cli jobs:dlq-summary -- --daily
   ```

2. **Check AV definitions**: Ensure virus definitions are updated
   ```bash
   sudo freshclam --check
   ```

3. **Review ingestion metrics**: Verify SLAs are met
   - Success rate >99%
   - Latency p95 <15s
   - Error rate <1%

### Weekly Tasks

1. **Clean up quarantine bucket**: Delete scanned files >7 days old
   ```bash
   npm run cli storage:cleanup-quarantine -- --days=7
   ```

2. **Review classification accuracy**: Check auto-classification errors
   ```bash
   npm run cli documents:classification-audit -- --sample=100
   ```

3. **Capacity planning**: Review storage growth trends
   - Check bucket size: `du -sh /mnt/storage/case-documents`
   - Project growth: Compare to last week

### Monthly Tasks

1. **Performance tuning**: Review slow uploads and optimize
   ```bash
   npm run cli ingestion:performance-report -- --month=current
   ```

2. **Security audit**: Review infected file incidents
   ```bash
   npm run cli security:virus-report -- --month=current
   ```

3. **Update documentation**: Keep runbook current with changes

---

## Performance Tuning

### Scaling Guidelines

| Load Level | Ingestion API Instances | AV Workers | Redis Config |
|------------|-------------------------|------------|--------------|
| Low (<100 uploads/day) | 1 | 1 | Default |
| Medium (100-1000/day) | 2 | 2-3 | Increase maxmemory to 2GB |
| High (1000-5000/day) | 3-4 | 4-6 | Dedicated Redis instance |
| Very High (>5000/day) | 5+ | 8+ | Redis cluster (3 nodes) |

### Optimization Tips

1. **Enable caching**: Cache duplicate hash lookups
   ```typescript
   // redis.set(`hash:${contentHash}`, documentId, 'EX', 3600);
   ```

2. **Batch AV scans**: Group small files for faster processing
   ```typescript
   // If file <1MB, add to batch queue instead of individual scan
   ```

3. **Parallel metadata extraction**: Extract metadata while AV scan runs
   ```typescript
   // Promise.all([avScan(file), extractMetadata(file)])
   ```

4. **Compress storage**: Enable compression for PDF and Office files
   ```bash
   # Supabase Storage settings: Enable automatic compression
   ```

---

## Incident Response Procedures

### P1: Ingestion Pipeline Down

**Definition:** No files being uploaded for >5min OR success rate <50%

**Immediate Actions:**
1. Acknowledge alert in PagerDuty
2. Check status page: `curl /health/ingestion`
3. Review recent deployments: `git log --oneline -10`
4. Check infrastructure: Supabase status, Redis health
5. If service is down, attempt restart: `pm2 restart ingestion-api`

**Investigation:**
```bash
# Check error logs
tail -f /var/log/intelliflow/api.log | grep ERROR

# Check service status
pm2 status | grep ingestion

# Check dependencies
curl https://your-project.supabase.co/rest/v1/
redis-cli PING
```

**Rollback Plan:**
```bash
# If recent deployment caused issue
git revert HEAD
npm run build
pm2 restart ingestion-api
```

**Communication:**
- Post in Slack #incidents
- Update status page if customer-facing
- Notify stakeholders if >15min downtime

---

### P2: High Error Rate

**Definition:** Error rate >5% for >10min

**Immediate Actions:**
1. Identify error type: Check logs for common pattern
2. If known issue, apply fix from troubleshooting section
3. If unknown, gather diagnostics and escalate

**Investigation:**
```bash
# Group errors by type
npm run cli logs:error-analysis -- --last=10m

# Check affected users/tenants
npm run cli logs:errors-by-tenant -- --last=10m
```

---

## Contact & Escalation

| Issue Type | Primary Contact | Escalation Path |
|------------|-----------------|-----------------|
| Ingestion failures | On-call engineer (#oncall-engineering) | → Engineering Manager → VP Engineering |
| Storage issues | Infrastructure team (#infrastructure) | → Platform Lead → CTO |
| Security (virus) | Security team (#security) | → Security Lead → CISO |
| Performance degradation | Backend team (#backend-dev) | → Tech Lead → VP Engineering |

**On-Call Rotation:** See PagerDuty schedule
**Runbook Updates:** PR to `docs/operations/runbooks/ingestion.md`

---

## Appendix A: CLI Commands Reference

```bash
# View ingestion job status
npm run cli jobs:status -- --queue=ingestion

# Retry failed jobs
npm run cli jobs:retry -- --job-id=<ID>

# View DLQ
npm run cli jobs:dlq -- --queue=ingestion

# Clean up old quarantine files
npm run cli storage:cleanup-quarantine -- --days=7

# Export ingestion metrics
npm run cli metrics:export -- --start=2025-01-01 --end=2025-01-31

# Test AV scanner
npm run cli av:test-scan -- --file=/path/to/test.pdf

# View recent virus detections
npm run cli av:infections -- --hours=24
```

---

## Appendix B: Configuration

Key environment variables:

```bash
# Storage
SUPABASE_STORAGE_URL=https://your-project.supabase.co/storage/v1
SUPABASE_STORAGE_KEY=your-service-role-key
STORAGE_BUCKET_PRIMARY=case-documents
STORAGE_BUCKET_QUARANTINE=case-documents-quarantine

# AV Scanner
CLAMAV_HOST=localhost
CLAMAV_PORT=3310
AV_SCAN_TIMEOUT=30000  # 30 seconds

# Ingestion
MAX_FILE_SIZE_WEB=52428800        # 50MB
MAX_FILE_SIZE_EMAIL=26214400      # 25MB
ALLOWED_MIME_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png

# Workers
WORKER_CONCURRENCY=3
RETRY_ATTEMPTS=3
RETRY_BACKOFF=exponential  # 1s, 2s, 4s

# Monitoring
ENABLE_METRICS=true
METRICS_PORT=9090
LOG_LEVEL=info
```

---

**Document Version:** 1.0.0
**Last Reviewed:** 2025-12-31
**Next Review:** 2026-01-31
