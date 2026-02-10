# FLOW-044: Encryption Key Management

## Overview

| Property | Value |
|----------|-------|
| **Flow ID** | FLOW-044 |
| **Name** | Encryption Key Management |
| **Category** | Security |
| **Priority** | Critical |
| **Sprint** | 0 (setup), 1 (integration) |
| **Related Tasks** | EXC-SEC-001, IFC-113, IFC-072 |

## Description

End-to-end encryption key lifecycle management via HashiCorp Vault's Transit secrets engine. Provides encryption-as-a-service for application data at rest, automatic key rotation on a monthly schedule, key versioning with configurable retention, and full audit logging of all cryptographic operations. Integrates with IntelliFlow's zero trust security model.

---

## Actors

- **Application Service**: Requests encrypt/decrypt operations via Vault Transit API
- **Vault Server**: Manages key material, performs cryptographic operations, enforces policies
- **Security Admin**: Configures keys, rotation schedules, and access policies
- **Audit System**: Logs all key operations for compliance
- **CI/CD Pipeline**: Uses AppRole auth for automated secret access

---

## Pre-conditions

- HashiCorp Vault installed and running (v1.21.1+)
- Vault initialized and unsealed (dev mode or auto-unseal via KMS)
- Transit secrets engine mounted at `transit/`
- KV v2 secrets engine mounted at `secret/`
- Vault policies configured for application roles
- TLS enabled for production (mTLS for service-to-service)

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ENCRYPTION KEY MANAGEMENT FLOW                           │
└─────────────────────────────────────────────────────────────────────────────┘

                     ┌─────────────────────┐
                     │ Security Admin      │
                     │ - Create keys       │
                     │ - Set rotation      │
                     │ - Configure policies│
                     └────────┬────────────┘
                              │
                              ▼
                     ┌─────────────────────┐
                     │ HashiCorp Vault      │ (http://127.0.0.1:8200)
                     │                     │
                     │ Transit Engine       │
                     │ ┌─────────────────┐ │
                     │ │ intelliflow-    │ │ AES-256-GCM
                     │ │ data-key        │ │ Auto-rotate: 30d
                     │ ├─────────────────┤ │
                     │ │ intelliflow-    │ │ RSA-4096
                     │ │ key-wrap        │ │ Key wrapping
                     │ ├─────────────────┤ │
                     │ │ intelliflow-    │ │ Ed25519
                     │ │ signing-key     │ │ Digital signatures
                     │ └─────────────────┘ │
                     │                     │
                     │ KV Engine            │
                     │ ┌─────────────────┐ │
                     │ │ secret/data/    │ │ API keys, DB creds,
                     │ │ intelliflow/*   │ │ service tokens
                     │ └─────────────────┘ │
                     │                     │
                     │ Audit Backend        │
                     │ ┌─────────────────┐ │
                     │ │ File + Syslog   │ │ JSON audit log
                     │ └─────────────────┘ │
                     └────────┬────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ API Server │  │ AI Worker  │  │ Web App    │
     │            │  │            │  │            │
     │ Encrypt:   │  │ Encrypt:   │  │ Read-only: │
     │ - PII      │  │ - Embeddings│ │ - Config   │
     │ - Secrets  │  │ - API keys │  │ - Feature  │
     │ Decrypt:   │  │ Decrypt:   │  │   flags    │
     │ - On read  │  │ - On use   │  │            │
     └────────────┘  └────────────┘  └────────────┘
```

---

## Flow Steps

### Step 1: Key Provisioning

**Trigger**: Security Admin creates encryption keys during initial setup or key rotation

**Keys Defined** (from `artifacts/misc/vault-config.yaml`):

| Key Name | Algorithm | Purpose | Auto-Rotate | Exportable |
|----------|-----------|---------|-------------|------------|
| `intelliflow-data-key` | AES-256-GCM | Data encryption at rest | 30 days | No |
| `intelliflow-key-wrap` | RSA-4096 | Key wrapping / envelope encryption | Manual | No |
| `intelliflow-signing-key` | Ed25519 | Digital signatures & integrity | Manual | No |

**Vault CLI**:
```bash
# Create data encryption key
vault write -f transit/keys/intelliflow-data-key \
  type=aes256-gcm96 \
  auto_rotate_period=720h \
  deletion_allowed=false

# Create key wrapping key
vault write -f transit/keys/intelliflow-key-wrap \
  type=rsa-4096 \
  deletion_allowed=false

# Create signing key
vault write -f transit/keys/intelliflow-signing-key \
  type=ed25519 \
  deletion_allowed=false
```

---

### Step 2: Encrypt Operation

**Trigger**: Application service needs to encrypt sensitive data before storage

**Vault API Call**:
```
POST /v1/transit/encrypt/intelliflow-data-key
{
  "plaintext": "<base64-encoded-data>"
}
```

**Response**:
```json
{
  "data": {
    "ciphertext": "vault:v1:XjsPWPjqPfBuyqhW...",
    "key_version": 3
  }
}
```

**Application Integration**:
```typescript
interface EncryptionService {
  encrypt(plaintext: string): Promise<string>;    // Returns vault:vN:ciphertext
  decrypt(ciphertext: string): Promise<string>;   // Returns plaintext
  sign(data: string): Promise<string>;            // Returns signature
  verify(data: string, signature: string): Promise<boolean>;
}
```

**Data Encrypted at Rest**:

| Entity | Fields | Rationale |
|--------|--------|-----------|
| Contact | email, phone | PII / GDPR |
| Lead | email, phone, company | PII / GDPR |
| Account | billingAddress | Financial PII |
| User | preferences (if contains PII) | Internal privacy |
| API Keys | keyValue | Security credential |
| AI Prompts | system prompts (if proprietary) | IP protection |

---

### Step 3: Decrypt Operation

**Trigger**: Application service reads encrypted data and needs plaintext

**Vault API Call**:
```
POST /v1/transit/decrypt/intelliflow-data-key
{
  "ciphertext": "vault:v1:XjsPWPjqPfBuyqhW..."
}
```

**Key Version Handling**: Vault automatically handles decryption with older key versions. The version is encoded in the ciphertext prefix (`vault:v1:`, `vault:v2:`, etc.).

---

### Step 4: Automatic Key Rotation

**Schedule**: Monthly (1st day, midnight UTC) via `auto_rotate_period: 720h`

**Rotation Process**:
```
┌──────────────┐
│ Cron Trigger │ (0 0 1 * *)
└──────┬───────┘
       ▼
┌──────────────────┐
│ Pre-Rotation     │ - Verify Vault health
│ Check            │ - Check active connections
│                  │ - Snapshot current key version
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Rotate Key       │ vault write -f transit/keys/intelliflow-data-key/rotate
│                  │ - New version created (v1 → v2 → v3)
│                  │ - Previous versions retained (max 5)
│                  │ - No data re-encryption needed
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Post-Rotation    │ - Verify new key version active
│ Verify           │ - Test encrypt/decrypt with new version
│                  │ - Verify old ciphertext still decryptable
│                  │ - Send notification webhook
└──────┬───────────┘
       ▼
┌──────────────────┐
│ Audit Entry      │ - key_name, old_version, new_version
│                  │ - rotation_timestamp
│                  │ - verification_status
└──────────────────┘
```

**Retention**: Last 5 key versions kept; older versions prunable after re-encryption

---

### Step 5: Secret Storage (KV Engine)

**Secret Paths**:

| Path | Contents | Access |
|------|----------|--------|
| `secret/data/intelliflow/config` | App configuration | All services |
| `secret/data/intelliflow/openai` | OpenAI API key | AI Worker only |
| `secret/data/intelliflow/supabase` | Supabase credentials | API + Web |
| `secret/data/intelliflow/redis` | Redis connection | API + AI Worker |
| `secret/data/intelliflow/encryption` | Encryption metadata | API only |
| `secret/data/intelliflow/tls` | TLS certificates | All services |

**KV v2 Features**:
- Version history (track secret changes)
- Check-and-set (prevent concurrent writes)
- Soft delete with recovery window

---

### Step 6: Audit Logging

**Audit Backends**:

| Backend | Format | Purpose |
|---------|--------|---------|
| File (`/var/log/vault/audit.log`) | JSON | Local audit trail |
| Syslog (`vault-intelliflow`) | JSON | Centralized logging |

**Audit Entry Fields**:
```json
{
  "time": "2026-02-09T00:00:00Z",
  "type": "request",
  "auth": {
    "client_token": "hmac-sha256:...",
    "accessor": "hmac-sha256:...",
    "policies": ["intelliflow-app-encrypt"]
  },
  "request": {
    "id": "uuid",
    "operation": "update",
    "path": "transit/encrypt/intelliflow-data-key",
    "remote_address": "10.0.0.5"
  },
  "response": {
    "data": { "ciphertext": "hmac-sha256:..." }
  }
}
```

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| Vault sealed/unavailable | Circuit breaker; queue operations; alert Security Admin |
| Key version exhaustion | Old versions auto-pruned after re-encryption campaign |
| Dev mode token expiry | Dev mode root token never expires; production uses renewable tokens |
| Cross-service key access | mTLS + policy enforcement; deny by default |
| Rotation during active transactions | Vault handles atomically; new encryptions use new key; old ciphertexts still decrypt |
| Key deletion attempt | `deletion_allowed: false` prevents accidental key destruction |
| Vault cluster failover | HA with Raft consensus; automatic leader election |

---

## Technical Artifacts

### Infrastructure (IMPLEMENTED)

| Artifact | Path | Status |
|----------|------|--------|
| Vault Config | `artifacts/misc/vault-config.yaml` | COMPLETE |
| Zero Trust Design | `docs/security/zero-trust-design.md` | COMPLETE |
| Task Status | `apps/project-tracker/docs/metrics/sprint-0/.../EXC-SEC-001.json` | COMPLETE |

### Application Integration (PARTIAL)

| Artifact | Path | Status |
|----------|------|--------|
| Encryption Service | `packages/adapters/src/security/vault-client.ts` | **NOT IMPLEMENTED** |
| Encryption Middleware | `apps/api/src/middleware/encryption.ts` | **NOT IMPLEMENTED** |
| Key Rotation Script | `scripts/security/rotate-keys.sh` | **NOT IMPLEMENTED** |
| Vault Health Check | `infra/monitoring/vault-health.yaml` | **NOT IMPLEMENTED** |

---

## Access Policies

| Policy | Path | Capabilities |
|--------|------|-------------|
| `intelliflow-app-encrypt` | `transit/encrypt/intelliflow-data-key` | update |
| `intelliflow-app-decrypt` | `transit/decrypt/intelliflow-data-key` | update |
| `intelliflow-key-admin` | `transit/keys/*` | create, read, update, delete, list |
| `intelliflow-secrets-read` | `secret/data/intelliflow/*` | read |

**Authentication Methods** (production):

| Method | Use Case |
|--------|----------|
| Kubernetes | Container workloads in K8s |
| AppRole | CI/CD pipelines and automated systems |
| OIDC | Human administrators via SSO |

---

## Compliance Requirements

| Regulation | Requirement | Implementation |
|------------|-------------|----------------|
| GDPR Art. 32 | Encryption of personal data | Transit engine for PII fields |
| SOC 2 Type II | Key management controls | Vault audit log + rotation |
| ISO 27001 A.10 | Cryptographic controls | AES-256-GCM + key versioning |
| PCI DSS 3.5 | Protect encryption keys | Non-exportable keys, policy-based access |

---

## Performance Requirements

| Metric | Target |
|--------|--------|
| Encrypt latency | <5ms |
| Decrypt latency | <5ms |
| Key rotation duration | <1s |
| Vault health check | <100ms |
| Setup time | <10 min (KPI from EXC-SEC-001) |

---

## Success Metrics

| KPI | Target | Validation |
|-----|--------|------------|
| Setup time | <10 min | Task completion timestamp |
| Zero manual key exposure | 0 incidents | Audit log review |
| Key rotation compliance | 100% on schedule | Monthly rotation log |
| Encryption coverage | 100% PII fields | Code audit |
| Vault availability | 99.9% | Health check monitoring |

---

## Related Flows

- **FLOW-040**: DSAR Erasure (key rotation after data purge)
- **FLOW-028**: Audit Logging (cryptographic operation logs)
- **FLOW-034**: Rate Limiting (Vault API rate limits)

---

## Implementation Tasks

| Task | Sprint | Status |
|------|--------|--------|
| EXC-SEC-001 (Vault Setup) | 0 | COMPLETED |
| IFC-072 (Zero Trust Model) | 1 | COMPLETED |
| IFC-113 (Secrets Management) | 1 | COMPLETED |
| **Vault Client Adapter** | TBD | NOT STARTED |
| **Encryption Middleware** | TBD | NOT STARTED |
| **Key Rotation Automation** | TBD | NOT STARTED |

---

*Flow documented: 2026-02-09*
*Last updated: 2026-02-09*
