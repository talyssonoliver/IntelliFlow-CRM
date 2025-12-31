# Notification Service Runbook - IntelliFlow CRM

**Document ID**: IFC-157-NOTIFICATION-RUNBOOK
**Version**: 1.0.0
**Last Updated**: 2025-12-31
**Owner**: STOA-Domain (Backend Dev + SRE)

---

## 1. Overview

This runbook provides operational procedures for the IntelliFlow CRM Notification Service, a unified notification delivery system supporting multiple channels with preference management and audit logging.

### 1.1 Service Description

The Notification Service provides:
- **Multi-channel delivery**: In-app, Email, SMS, Push, Webhook
- **User preferences**: Channel/category toggles, quiet hours, DND
- **Template system**: Consistent messaging with variable substitution
- **Retry logic**: Automatic retries with exponential backoff
- **DLQ handling**: Failed notifications moved to Dead Letter Queue
- **Audit logging**: 100% coverage of notification events

### 1.2 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   API Router    │────▶│ NotificationSvc  │────▶│  Delivery Svc   │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              │                        │
                              ▼                        ▼
                        ┌──────────┐            ┌────────────┐
                        │ Prefs DB │            │  Providers │
                        └──────────┘            │ SendGrid   │
                              │                 │ Twilio     │
                              ▼                 │ FCM        │
                        ┌──────────┐            └────────────┘
                        │ Notif DB │
                        └──────────┘
```

### 1.3 Related Components

- **IFC-144**: Event consumer framework (retry/DLQ)
- **IFC-098**: Audit logging
- **IFC-151**: DLQ runbook (see `dlq-triage.md`)

---

## 2. Key Metrics & Alerts

### 2.1 Prometheus Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| `notification_sent_total` | Total notifications sent | - |
| `notification_failed_total` | Total notifications failed | <1% of sent |
| `notification_filtered_total` | Notifications filtered by preferences | - |
| `notification_delivery_duration_seconds` | Delivery latency | p99 < 5s |
| `notification_retry_count` | Retry attempts | - |
| `notification_dlq_depth` | DLQ queue depth | 0 |

### 2.2 Prometheus Queries

**Delivery Success Rate**:
```promql
(
  sum(rate(notification_sent_total[5m]))
  /
  (sum(rate(notification_sent_total[5m])) + sum(rate(notification_failed_total[5m])) + 0.001)
) * 100
```

**Delivery Latency (p99)**:
```promql
histogram_quantile(0.99, sum(rate(notification_delivery_duration_seconds_bucket[5m])) by (le, channel))
```

**Filter Rate by Reason**:
```promql
sum by (reason) (rate(notification_filtered_total[5m]))
```

### 2.3 Alert Rules

```yaml
groups:
  - name: notification-service
    rules:
      - alert: NotificationDeliveryFailureHigh
        expr: |
          (sum(rate(notification_failed_total[5m])) / (sum(rate(notification_sent_total[5m])) + 0.001)) > 0.05
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Notification delivery failure rate above 5%"

      - alert: NotificationDLQGrowing
        expr: notification_dlq_depth > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Notification DLQ depth exceeds 10"

      - alert: NotificationLatencyHigh
        expr: |
          histogram_quantile(0.99, sum(rate(notification_delivery_duration_seconds_bucket[5m])) by (le)) > 10
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "Notification p99 latency exceeds 10 seconds"
```

---

## 3. Operational Procedures

### 3.1 Sending Notifications

**API Endpoint**: `POST /api/notifications/send`

**Request Body**:
```json
{
  "recipientId": "user-123",
  "channel": "email",
  "subject": "Your Lead Update",
  "body": "Lead status has changed to Qualified",
  "priority": "normal",
  "category": "updates"
}
```

**Response**:
```json
{
  "notificationId": "notif-abc123",
  "status": "sent",
  "providerMessageId": "sendgrid-xyz"
}
```

**Status Values**:
- `sent`: Notification delivered to provider
- `scheduled`: Notification scheduled for future delivery
- `filtered`: Notification blocked by user preferences
- `failed`: Delivery failed (will be retried)

### 3.2 Viewing User Preferences

**API Endpoint**: `GET /api/notifications/preferences/:userId`

**Response**:
```json
{
  "channels": {
    "in_app": { "enabled": true, "frequency": "realtime" },
    "email": { "enabled": true, "frequency": "realtime" },
    "sms": { "enabled": false, "frequency": "realtime" },
    "push": { "enabled": false, "frequency": "realtime" }
  },
  "categories": {
    "system": true,
    "transactional": true,
    "reminders": true,
    "marketing": false
  },
  "quietHours": {
    "start": "22:00",
    "end": "08:00",
    "enabled": true
  },
  "timezone": "America/New_York",
  "doNotDisturb": false
}
```

### 3.3 Updating Preferences

**API Endpoint**: `PUT /api/notifications/preferences/:userId`

**Request Body**:
```json
{
  "channel": { "channel": "email", "enabled": false },
  "quietHours": { "start": "23:00", "end": "07:00" }
}
```

---

## 4. Troubleshooting

### 4.1 Notifications Not Being Delivered

**Symptoms**: Users report not receiving notifications

**Diagnosis Steps**:

1. Check notification status in database:
```sql
SELECT id, status, channel, error, retry_count, created_at
FROM notifications
WHERE recipient_id = 'user-123'
ORDER BY created_at DESC
LIMIT 10;
```

2. Check user preferences:
```sql
SELECT *
FROM notification_preferences
WHERE user_id = 'user-123';
```

3. Check if filtered:
```bash
# Check filter metrics
curl http://localhost:3000/metrics | grep notification_filtered
```

**Common Causes**:
- Channel disabled in preferences
- Do Not Disturb enabled
- Quiet hours active
- Category disabled
- Provider API issues

### 4.2 High Failure Rate

**Symptoms**: `NotificationDeliveryFailureHigh` alert firing

**Diagnosis Steps**:

1. Check error distribution:
```sql
SELECT error, COUNT(*) as count
FROM notifications
WHERE status = 'FAILED'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY error
ORDER BY count DESC;
```

2. Check provider status:
   - SendGrid: https://status.sendgrid.com/
   - Twilio: https://status.twilio.com/
   - FCM: https://status.firebase.google.com/

3. Check rate limits:
```bash
# Check for rate limit errors
grep "rate limit" /var/log/api-server.log | tail -20
```

**Resolution**:
- If provider issue: Wait for recovery, messages will be retried
- If rate limit: Increase backoff intervals or request limit increase
- If configuration: Fix and redeploy

### 4.3 DLQ Growing

**Symptoms**: `NotificationDLQGrowing` alert firing

See [DLQ Triage Runbook](./dlq-triage.md) for detailed procedures.

**Quick Actions**:
```bash
# Check DLQ depth
psql $DATABASE_URL -c "SELECT COUNT(*) FROM notification_dlq WHERE status = 'PENDING';"

# View failing messages
psql $DATABASE_URL -c "SELECT channel, last_error, COUNT(*) FROM notification_dlq WHERE status = 'PENDING' GROUP BY channel, last_error;"

# Drain DLQ after fixing issue
curl -X POST http://localhost:3000/admin/notification-dlq/drain \
  -H "Authorization: Bearer $ADMIN_TOKEN"
```

---

## 5. Retry & DLQ Configuration

### 5.1 Retry Settings

```typescript
// Default configuration
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffMs: [1000, 5000, 30000], // 1s, 5s, 30s
  jitterFactor: 0.1, // 10% random jitter
};
```

### 5.2 DLQ Processing

Notifications move to DLQ when:
- Exceeded `maxRetries` (3)
- Permanent failure detected (invalid recipient, etc.)

**DLQ Status Values**:
- `PENDING`: Awaiting triage
- `RETRYING`: Being retried
- `RESOLVED`: Successfully processed
- `DISCARDED`: Manually discarded (data loss accepted)

### 5.3 Manual DLQ Operations

**Retry specific message**:
```bash
curl -X POST http://localhost:3000/admin/notification-dlq/retry \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"notificationId": "notif-abc123"}'
```

**Discard message** (when data loss is acceptable):
```bash
curl -X POST http://localhost:3000/admin/notification-dlq/discard \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"notificationId": "notif-abc123", "reason": "Invalid recipient - user deleted"}'
```

---

## 6. Template Management

### 6.1 Creating Templates

Templates are registered at application startup:

```typescript
notificationService.registerTemplate({
  id: 'lead-qualified',
  name: 'Lead Qualified Notification',
  channel: 'email',
  subject: 'Lead {{leadName}} has been qualified',
  bodyText: 'Hello {{userName}}, lead {{leadName}} from {{company}} has been qualified.',
  bodyHtml: '<h1>Lead Qualified</h1><p>{{leadName}} from {{company}}</p>',
  variables: ['userName', 'leadName', 'company'],
});
```

### 6.2 Template Variables

Use `{{variableName}}` syntax for variable substitution:

| Variable | Description |
|----------|-------------|
| `{{userName}}` | Recipient's name |
| `{{leadName}}` | Lead's full name |
| `{{company}}` | Company name |
| `{{dealValue}}` | Deal value (formatted) |
| `{{taskName}}` | Task title |
| `{{dueDate}}` | Due date (formatted) |

### 6.3 Listing Templates

```bash
curl http://localhost:3000/api/notifications/templates
```

---

## 7. Performance Tuning

### 7.1 Batch Processing

For high-volume scenarios, use batch sending:

```typescript
await notificationService.sendBatch([
  { recipientId: 'user-1', ... },
  { recipientId: 'user-2', ... },
]);
```

### 7.2 Rate Limiting

Default rate limits per channel:
- Email: 100/second (SendGrid limit)
- SMS: 10/second (Twilio limit)
- Push: 500/second (FCM limit)
- In-app: No limit (internal)

### 7.3 Database Indexes

Ensure these indexes exist for optimal query performance:

```sql
CREATE INDEX idx_notifications_tenant_recipient_status
ON notifications (tenant_id, recipient_id, status);

CREATE INDEX idx_notifications_scheduled
ON notifications (scheduled_at) WHERE status = 'PENDING';

CREATE INDEX idx_notifications_failed
ON notifications (failed_at) WHERE status = 'FAILED';
```

---

## 8. Audit & Compliance

### 8.1 Audit Log Queries

All notification events are logged to the audit system:

**Find notification history for a user**:
```sql
SELECT *
FROM audit_log_entries
WHERE resource_type = 'notification'
  AND actor_id = 'user-123'
ORDER BY timestamp DESC;
```

**Find preference changes**:
```sql
SELECT *
FROM audit_log_entries
WHERE event_type = 'NotificationPreferenceUpdated'
  AND actor_id = 'user-123'
ORDER BY timestamp DESC;
```

### 8.2 GDPR Compliance

- Users can disable all non-system notifications via preferences
- Notification content is retained per retention policy (7 years)
- Users can request notification history export

### 8.3 Retention Policy

```sql
-- Clean up old notifications (run weekly)
DELETE FROM notifications
WHERE created_at < NOW() - INTERVAL '7 years'
  AND status IN ('READ', 'DELIVERED', 'BOUNCED');
```

---

## 9. Emergency Procedures

### 9.1 Kill Switch - Disable All Notifications

```bash
# Set feature flag
curl -X POST http://localhost:3000/admin/feature-flags \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"flag": "notifications.enabled", "value": false}'
```

### 9.2 Provider Failover

If primary email provider fails:

1. Update environment variable:
```bash
export EMAIL_PROVIDER=backup-provider
```

2. Restart API server:
```bash
kubectl rollout restart deployment/api-server
```

### 9.3 Mass Notification Cleanup

If erroneous notifications were sent:

```sql
-- Mark as read (hide from UI)
UPDATE notifications
SET status = 'READ', read_at = NOW()
WHERE template_id = 'erroneous-template'
  AND created_at > '2025-12-31 00:00:00';

-- Log the action
INSERT INTO audit_log_entries (event_type, action, resource_type, metadata)
VALUES ('EmergencyCleanup', 'BULK_UPDATE', 'notification', '{"reason": "Erroneous template"}');
```

---

## 10. On-Call Contacts

| Role | Slack Handle | Escalation |
|------|--------------|------------|
| Notification Service Owner | @notification-team | First responder |
| Backend Lead | @backend-lead | 10 min |
| SRE Lead | @sre-lead | 20 min |
| CTO | @cto-oncall | 30 min (critical only) |

---

## Appendix: Quick Reference

### Status Codes

| Status | Description |
|--------|-------------|
| PENDING | Awaiting delivery |
| SENT | Delivered to provider |
| DELIVERED | Confirmed delivery |
| FAILED | Delivery failed |
| READ | Marked as read (in-app) |
| BOUNCED | Email bounced |

### Channel Types

| Channel | Provider | Rate Limit |
|---------|----------|------------|
| in_app | Internal | Unlimited |
| email | SendGrid | 100/s |
| sms | Twilio | 10/s |
| push | FCM | 500/s |
| webhook | Internal | 50/s |

### Common Errors

| Error | Cause | Resolution |
|-------|-------|------------|
| `CHANNEL_DISABLED` | User disabled channel | Check preferences |
| `INVALID_RECIPIENT` | Bad email/phone | Validate before send |
| `RATE_LIMIT_EXCEEDED` | Too many requests | Increase backoff |
| `PROVIDER_ERROR` | External service down | Wait and retry |
| `TEMPLATE_NOT_FOUND` | Unknown template ID | Register template |
