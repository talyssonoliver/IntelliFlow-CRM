# Notifications Runbook

> Operational guide for the IntelliFlow CRM notification delivery system

**Task ID**: IFC-163
**Last Updated**: 2026-01-01
**Owner**: Platform Team

## Overview

The notifications-worker handles multi-channel delivery of notifications:

| Channel | Queue | Provider | Rate Limit |
|---------|-------|----------|------------|
| Email | `intelliflow:notifications:email` | SMTP/Nodemailer | 10/sec |
| SMS | `intelliflow:notifications:sms` | Twilio/MessageBird | Varies by provider |
| Webhook | `intelliflow:notifications:webhook` | HTTP | 100/sec |
| Push | `intelliflow:notifications:push` | FCM/APNs | 1000/sec |

## Quick Reference

### Check Notification Status

```bash
# Email queue depth
redis-cli LLEN intelliflow:notifications:email:wait

# SMS queue depth
redis-cli LLEN intelliflow:notifications:sms:wait

# Failed notifications (DLQ)
redis-cli LLEN intelliflow:notifications:email:failed
```

### Health Check

```bash
# Check all channels
curl http://localhost:3102/health/detailed | jq '.dependencies'

# Expected response:
# {
#   "email": { "status": "ok", "circuitState": "CLOSED" },
#   "sms": { "status": "ok" },
#   "webhook": { "status": "ok" },
#   "push": { "status": "degraded", "message": "Push channel disabled" }
# }
```

## Channel-Specific Operations

### Email Channel

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SMTP_HOST` | `localhost` | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP port (587 for TLS, 465 for SSL) |
| `SMTP_SECURE` | `false` | Use SSL (port 465) |
| `SMTP_USER` | - | SMTP username |
| `SMTP_PASSWORD` | - | SMTP password |
| `EMAIL_FROM` | `noreply@intelliflow.com` | Default from address |
| `EMAIL_FROM_NAME` | `IntelliFlow CRM` | Display name |

#### Common Issues

**1. Connection Refused**
```
Error: connect ECONNREFUSED 127.0.0.1:587
```
- Check SMTP host/port configuration
- Verify SMTP server is running
- Check firewall rules

**2. Authentication Failed**
```
Error: Invalid login: 535 5.7.8 Authentication failed
```
- Verify SMTP credentials
- Check if app password is required (Gmail, Outlook)
- Ensure account allows SMTP access

**3. Rate Limited**
```
Error: 450 4.7.1 Too many messages
```
- Reduce `rateLimit` in worker config
- Implement backoff strategy
- Consider using a transactional email service

**4. Certificate Error**
```
Error: self signed certificate in certificate chain
```
- Use `SMTP_SECURE=true` with proper SSL
- Or set `NODE_TLS_REJECT_UNAUTHORIZED=0` (development only)

#### Testing Email Delivery

```bash
# Send test email via API
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "EMAIL",
    "recipient": { "email": "test@example.com" },
    "content": { "subject": "Test", "body": "Hello World" }
  }'

# Check email logs
docker logs notifications-worker | grep -i "email"
```

### SMS Channel

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SMS_PROVIDER` | `mock` | Provider (twilio, messagebird, mock) |
| `TWILIO_ACCOUNT_SID` | - | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | - | Twilio Auth Token |
| `SMS_FROM` | - | Sender phone number (E.164 format) |

#### Twilio Setup

1. Get credentials from Twilio Console
2. Purchase a phone number
3. Configure environment:
   ```bash
   export SMS_PROVIDER=twilio
   export TWILIO_ACCOUNT_SID=ACxxxxxxxx
   export TWILIO_AUTH_TOKEN=xxxxxxxx
   export SMS_FROM=+15551234567
   ```

#### Common Issues

**1. Invalid Phone Number**
```
Error: The 'To' number is not a valid phone number
```
- Ensure E.164 format: `+1` prefix for US numbers
- Validate number before sending

**2. Insufficient Funds**
```
Error: Account has insufficient funds
```
- Check Twilio account balance
- Enable auto-recharge

**3. Unverified Number (Trial)**
```
Error: The number is unverified
```
- Verify recipient in Twilio Console (trial accounts only)
- Upgrade to paid account

#### Testing SMS Delivery

```bash
# Send test SMS (with mock provider)
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "SMS",
    "recipient": { "phone": "+15551234567" },
    "content": { "body": "Test SMS from IntelliFlow" }
  }'
```

### Webhook Channel

#### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_SIGNING_SECRET` | - | HMAC signing secret |
| `WEBHOOK_TIMEOUT_MS` | `30000` | Request timeout |
| `WEBHOOK_MAX_RETRIES` | `3` | Maximum retry attempts |
| `WEBHOOK_USER_AGENT` | `IntelliFlow-CRM/1.0` | User-Agent header |

#### Webhook Signature

Webhooks are signed with HMAC-SHA256:
```
X-Webhook-Signature: t=1234567890,v1=abc123...
```

To verify:
```typescript
const crypto = require('crypto');

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const [timestamp, hash] = signature.split(',').map(p => p.split('=')[1]);
  const signaturePayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac('sha256', secret)
    .update(signaturePayload)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}
```

#### Common Issues

**1. Timeout**
```
Error: Request timeout
```
- Increase `WEBHOOK_TIMEOUT_MS`
- Check endpoint performance
- Implement async processing on receiver

**2. SSL Certificate Error**
```
Error: unable to verify the first certificate
```
- Ensure valid SSL certificate on endpoint
- Check certificate chain

**3. Connection Refused**
```
Error: connect ECONNREFUSED
```
- Verify endpoint URL
- Check firewall/security groups
- Ensure endpoint is publicly accessible

#### Testing Webhook Delivery

```bash
# Use webhook.site for testing
curl -X POST http://localhost:3000/api/notifications/test \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "WEBHOOK",
    "recipient": { "webhookUrl": "https://webhook.site/your-uuid" },
    "content": { "body": { "event": "test", "data": {} } }
  }'
```

## Circuit Breaker

Each channel has an independent circuit breaker:

| Setting | Value | Description |
|---------|-------|-------------|
| Failure Threshold | 5 | Failures before opening |
| Reset Timeout | 60s | Time before half-open |
| Half-Open Max | 3 | Test calls in half-open |

### States

```
CLOSED → (5 failures) → OPEN → (60s) → HALF_OPEN → (success) → CLOSED
                                            ↓
                                       (failure)
                                            ↓
                                          OPEN
```

### Manual Reset

Restart the worker to reset all circuit breakers:
```bash
docker restart notifications-worker
```

## Retry Strategy

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1 | 1s | 1s |
| 2 | 5s | 6s |
| 3 | 30s | 36s |
| 4 (email only) | 2m | 2m 36s |
| 5 (email only) | 5m | 7m 36s |

## DLQ Handling

### View Failed Notifications

```bash
# List failed email jobs
redis-cli LRANGE intelliflow:notifications:email:failed 0 10

# Get job details
redis-cli HGETALL bull:intelliflow:notifications:email:JOB_ID
```

### Retry Failed Notifications

```bash
# Retry specific job
npx bullmq-cli retry intelliflow:notifications:email JOB_ID

# Retry all failed
npx bullmq-cli retry-all intelliflow:notifications:email
```

### Remove Failed Notifications

```bash
# Remove specific job
npx bullmq-cli remove intelliflow:notifications:email JOB_ID

# Clean old failed jobs (> 7 days)
npx bullmq-cli clean intelliflow:notifications:email failed 604800000
```

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `notifications_sent_total{channel}` | Total sent by channel | - |
| `notifications_failed_total{channel}` | Total failed by channel | > 5% of sent |
| `notification_delivery_duration_seconds` | Delivery latency | p95 > 10s |
| `notification_queue_depth{channel}` | Queue backlog | > 500 |
| `notification_circuit_state{channel}` | Circuit breaker | state = OPEN |

### Grafana Queries

```promql
# Delivery success rate by channel
sum(rate(notifications_sent_total{channel="email"}[5m])) /
(sum(rate(notifications_sent_total{channel="email"}[5m])) +
 sum(rate(notifications_failed_total{channel="email"}[5m])))

# Average delivery time
histogram_quantile(0.95,
  sum(rate(notification_delivery_duration_seconds_bucket[5m])) by (le, channel)
)
```

## Scaling

### When to Scale

| Metric | Threshold | Action |
|--------|-----------|--------|
| Queue depth | > 500 | Add worker instance |
| Delivery latency p95 | > 5s | Add worker instance |
| Error rate | > 5% | Investigate first |

### Provider Rate Limits

| Provider | Rate Limit | Recommendation |
|----------|------------|----------------|
| Gmail SMTP | 500/day | Use transactional service |
| SendGrid | 100/sec | Scale workers accordingly |
| Twilio | 1 msg/sec/number | Use multiple numbers |
| Mailgun | 300/min | Configure worker rate |

## Troubleshooting Flowchart

```
Notification not delivered?
          │
          ▼
    Is worker running?
    ┌─── No ───► Start worker
    │
    Yes
    │
    ▼
    Check queue depth?
    ┌─── High ───► Scale workers
    │
    Low
    │
    ▼
    Is job in DLQ?
    ┌─── Yes ───► Check error, retry/fix
    │
    No
    │
    ▼
    Check circuit breaker
    ┌─── OPEN ───► Wait or restart
    │
    CLOSED
    │
    ▼
    Check provider status
    ┌─── Down ───► Wait for recovery
    │
    Up
    │
    ▼
    Check logs for specific error
```

## Template System

### Template Variables

```typescript
// Available in notification content
{
  templateId: "welcome-email",
  templateData: {
    userName: "John",
    companyName: "Acme Inc",
    loginUrl: "https://app.example.com/login"
  }
}
```

### Common Templates

| Template ID | Purpose | Channel |
|-------------|---------|---------|
| `welcome-email` | New user welcome | Email |
| `password-reset` | Password reset link | Email |
| `invoice-reminder` | Payment reminder | Email, SMS |
| `deal-won` | Deal closed notification | Webhook |
| `task-assigned` | Task assignment | Push |

## Security

### Sensitive Data

- Never log full email bodies or phone numbers
- Mask recipient data in logs: `john@***` or `+1555***4567`
- Use environment variables for credentials
- Rotate SMTP/API credentials regularly

### Audit Trail

All notifications are logged with:
- Notification ID (UUID)
- Tenant ID
- Channel
- Recipient (masked)
- Status (sent/failed)
- Timestamp
- Delivery time

Query audit logs:
```sql
SELECT * FROM notification_log
WHERE tenant_id = 'xxx'
AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;
```

## Related Documentation

- [Workers Runbook](../workers-runbook.md) - General worker operations
- [DLQ Triage Runbook](./dlq-triage.md) - Dead letter queue handling
- [Event Contracts](../../events/contracts-v1.yaml) - Event schemas

## Support

**Escalation Path**:
1. Check this runbook
2. Review Grafana dashboards
3. Check provider status pages
4. Escalate to Platform Team

**Provider Status Pages**:
- SendGrid: https://status.sendgrid.com
- Twilio: https://status.twilio.com
- Firebase: https://status.firebase.google.com
