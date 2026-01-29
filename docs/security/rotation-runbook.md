# Secret Rotation Runbook

## Overview

This runbook describes procedures for rotating secrets in the IntelliFlow CRM system.

**Task**: IFC-121 - Secret Rotation & Vulnerability Updates
**Created**: 2025-12-29

---

## Quick Reference

| Secret Type | Rotation Interval | Method | Downtime |
|-------------|-------------------|--------|----------|
| Database credentials | 30 days | Rolling update | None |
| API keys | 90 days | Dual-key rotation | None |
| JWT signing keys | 7 days | Key versioning | None |
| Encryption keys | 365 days | Envelope rotation | Planned |

---

## Pre-Rotation Checklist

- [ ] Verify Vault connectivity: `vault status`
- [ ] Check current secret versions: `vault kv metadata get secret/intelliflow`
- [ ] Notify on-call team via Slack `#security-alerts`
- [ ] Ensure rollback plan is documented
- [ ] Verify backup of current secrets exists

---

## Rotation Procedures

### 1. Database Credentials

**Frequency**: Every 30 days
**Impact**: None (rolling update)

```bash
# 1. Generate new password
NEW_PASSWORD=$(openssl rand -base64 32)

# 2. Create new database user with new password
psql -h $DB_HOST -U postgres << EOF
CREATE USER intelliflow_new WITH PASSWORD '$NEW_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE intelliflow TO intelliflow_new;
EOF

# 3. Update Vault
vault kv put secret/intelliflow/database \
  username=intelliflow_new \
  password=$NEW_PASSWORD

# 4. Roll out to applications (zero-downtime)
kubectl rollout restart deployment/api
kubectl rollout restart deployment/web

# 5. Verify connectivity
pnpm --filter @intelliflow/api test:integration --grep "database"

# 6. Revoke old user (after 1 hour grace period)
psql -h $DB_HOST -U postgres -c "DROP USER intelliflow_old;"
```

### 2. API Keys (OpenAI, Stripe, etc.)

**Frequency**: Every 90 days
**Impact**: None (dual-key rotation)

```bash
# 1. Generate new API key from provider dashboard
# - OpenAI: https://platform.openai.com/api-keys
# - Stripe: https://dashboard.stripe.com/apikeys
# - Anthropic: https://console.anthropic.com/settings/keys

# 2. Store new key in Vault (as secondary)
vault kv put secret/intelliflow/openai \
  primary_key=$CURRENT_KEY \
  secondary_key=$NEW_KEY

# 3. Update application to use secondary key
# (Application automatically falls back to secondary)

# 4. Verify new key works
curl -H "Authorization: Bearer $NEW_KEY" \
  https://api.openai.com/v1/models

# 5. Promote secondary to primary
vault kv put secret/intelliflow/openai \
  primary_key=$NEW_KEY

# 6. Revoke old key from provider dashboard
```

### 3. JWT Signing Keys

**Frequency**: Every 7 days
**Impact**: None (key versioning)

```bash
# 1. Generate new key pair
openssl genrsa -out jwt-new.pem 4096
openssl rsa -in jwt-new.pem -pubout -out jwt-new.pub

# 2. Get current key version
CURRENT_VERSION=$(vault kv get -field=version secret/intelliflow/jwt)
NEW_VERSION=$((CURRENT_VERSION + 1))

# 3. Store new key with version
vault kv put secret/intelliflow/jwt \
  version=$NEW_VERSION \
  private_key=@jwt-new.pem \
  public_key=@jwt-new.pub

# 4. Application uses key versioning in JWT header (kid claim)
# Old tokens remain valid until expiry

# 5. Clean up
rm jwt-new.pem jwt-new.pub
```

### 4. Encryption Keys

**Frequency**: Every 365 days
**Impact**: Scheduled maintenance window required

```bash
# 1. Schedule maintenance window
# 2. Notify users of planned downtime

# 3. Generate new encryption key
vault write -f transit/keys/intelliflow-data/rotate

# 4. Re-encrypt sensitive data
npx tsx tools/scripts/rotate-secrets.ts re-encrypt \
  --key-version $(vault read -field=latest_version transit/keys/intelliflow-data)

# 5. Verify decryption works with new key
pnpm --filter @intelliflow/api test:security --grep "encryption"

# 6. Update key version in application config
# 7. Resume normal operations
```

---

## Emergency Rotation

If a secret is compromised:

1. **Immediately** rotate the compromised secret
2. **Invalidate** all sessions using the old secret
3. **Audit** access logs for unauthorized use
4. **Notify** security team and management
5. **Document** incident in security log

```bash
# Emergency rotation command
npx tsx tools/scripts/rotate-secrets.ts emergency \
  --secret DATABASE_URL \
  --reason "Potential compromise detected"
```

---

## Rollback Procedures

If rotation fails:

```bash
# 1. Check Vault for previous version
vault kv get -version=<previous> secret/intelliflow/<secret>

# 2. Restore previous version
vault kv rollback -version=<previous> secret/intelliflow/<secret>

# 3. Restart affected services
kubectl rollout restart deployment/<service>

# 4. Verify restoration
pnpm test:integration
```

---

## Monitoring & Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| Secret rotation overdue | >7 days past schedule | Trigger rotation workflow |
| Rotation failure | Any | Investigate immediately |
| High secret access rate | >1000/min | Check for compromise |

---

## Contact Information

| Role | Contact | Escalation |
|------|---------|------------|
| Security Engineer | security@intelliflow.com | PagerDuty |
| DevOps | devops@intelliflow.com | Slack #ops |
| CTO | cto@intelliflow.com | Phone |

---

*Last Updated: 2025-12-29*
