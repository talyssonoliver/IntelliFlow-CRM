# Encryption Architecture

**IMPLEMENTS**: IFC-113 (Secrets Management & Encryption)

## Overview

IntelliFlow CRM implements a comprehensive encryption architecture to protect sensitive data at rest and in transit. This document describes the encryption mechanisms, key management, and security controls.

## Encryption Strategy

### Data at Rest

All sensitive data stored in the system is encrypted using AES-256-GCM (Galois/Counter Mode), which provides both confidentiality and authenticity.

**Algorithm Details**:
- Cipher: AES-256-GCM
- Key Length: 256 bits (32 bytes)
- IV Length: 128 bits (16 bytes)
- Authentication Tag: 128 bits (16 bytes)
- Key Derivation: PBKDF2 with SHA-512, 100,000 iterations

### Data in Transit

All network communication is encrypted using TLS 1.2/1.3 with strong cipher suites. Service-to-service communication uses mutual TLS (mTLS).

**Supported Cipher Suites**:
- TLS 1.3: TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256
- TLS 1.2: ECDHE_ECDSA/RSA with AES_256_GCM_SHA384

## Architecture Components

### 1. Encryption Service

The `EncryptionService` class provides the core encryption/decryption functionality.

```typescript
import { EncryptionService, getEncryptionService } from './security/encryption';

// Get singleton instance
const encryption = getEncryptionService();

// Encrypt data
const encrypted = await encryption.encrypt('sensitive data');

// Decrypt data
const decrypted = await encryption.decrypt(encrypted);
```

**Features**:
- AES-256-GCM encryption
- Additional Authenticated Data (AAD) support
- Tamper detection via authentication tags
- Key version tracking for rotation

### 2. Key Providers

Key providers abstract key storage and retrieval:

#### EnvironmentKeyProvider
For development and testing, derives keys from environment variables.

```typescript
// Set master key
process.env.ENCRYPTION_MASTER_KEY = 'your-32-byte-master-key-here!!!';

const provider = new EnvironmentKeyProvider();
const key = await provider.getCurrentKey();
```

#### VaultKeyProvider
For production, integrates with HashiCorp Vault Transit backend.

```typescript
const provider = new VaultKeyProvider({
  address: 'https://vault.example.com:8200',
  token: process.env.VAULT_TOKEN,
  keyName: 'intelliflow-data-key',
});
```

### 3. Key Rotation Service

The `KeyRotationService` manages encryption key lifecycle:

```typescript
import { getKeyRotationService } from './security/key-rotation';

const rotationService = getKeyRotationService();

// Check if rotation is needed
if (await rotationService.isRotationNeeded()) {
  const result = await rotationService.rotateKeys();
  console.log(`Rotated from v${result.previousVersion} to v${result.newVersion}`);
}
```

**Features**:
- Automated rotation scheduling
- Pre/post rotation validation
- Key version retention
- Re-encryption utilities
- Audit trail

### 4. Vault Integration

HashiCorp Vault provides enterprise-grade secrets management:

**Configuration** (`artifacts/misc/vault-config.yaml`):
- KV v2 secrets engine for credential storage
- Transit engine for encryption-as-a-service
- Auto-rotation with configurable intervals
- Audit logging

**Secret Paths**:
```yaml
intelliflow_paths:
  config: secret/data/intelliflow/config
  openai: secret/data/intelliflow/openai
  supabase: secret/data/intelliflow/supabase
  redis: secret/data/intelliflow/redis
  encryption_keys: secret/data/intelliflow/encryption
```

### 5. TLS/mTLS Configuration

**mTLS Configuration** (`infra/tls/mtls-config.yaml`):
- Service certificate management
- Client authentication requirements
- Certificate revocation (CRL/OCSP)
- Automatic renewal

**Certificate Management** (`infra/tls/cert-manager.yaml`):
- Kubernetes cert-manager integration
- Self-signed CA for internal services
- ACME/Let's Encrypt for public endpoints

## Security Controls

### Key Security

| Control | Implementation |
|---------|----------------|
| Key Length | 256-bit minimum |
| Key Storage | Vault or KMS (never in code) |
| Key Rotation | 30-day default interval |
| Key Versioning | All encrypted data tagged with key version |
| Key Derivation | PBKDF2 with 100k iterations |

### Encryption Security

| Control | Implementation |
|---------|----------------|
| Algorithm | AES-256-GCM (authenticated) |
| IV/Nonce | 128-bit random per encryption |
| Authentication | GCM tag validates integrity |
| AAD Support | Optional context binding |
| Timing Attacks | Constant-time comparisons |

### Certificate Security

| Control | Implementation |
|---------|----------------|
| Key Algorithm | ECDSA P-384 (CA), P-256 (services) |
| Validity | 1 year (services), 10 years (root CA) |
| Renewal | Automatic at 66% lifetime |
| Revocation | CRL and OCSP support |
| mTLS | Strict mode in production |

## Data Flow

### Encryption Flow

```
Plaintext
    |
    v
+-------------------+
| Generate 128-bit  |
| random IV         |
+-------------------+
    |
    v
+-------------------+
| Get encryption    |
| key from provider |
+-------------------+
    |
    v
+-------------------+
| AES-256-GCM       |
| encrypt with      |
| IV + AAD          |
+-------------------+
    |
    v
+-------------------+
| Output:           |
| - IV (base64)     |
| - Ciphertext      |
| - AuthTag         |
| - KeyVersion      |
| - Timestamp       |
+-------------------+
```

### Key Rotation Flow

```
+-------------------+
| Check rotation    |
| schedule          |
+-------------------+
    |
    v
+-------------------+
| Pre-rotation      |
| validation        |
+-------------------+
    |
    v
+-------------------+
| Generate new      |
| key version       |
+-------------------+
    |
    v
+-------------------+
| Update current    |
| version pointer   |
+-------------------+
    |
    v
+-------------------+
| Post-rotation     |
| verification      |
+-------------------+
    |
    v
+-------------------+
| Deprecate old     |
| versions beyond   |
| retention         |
+-------------------+
    |
    v
+-------------------+
| Re-encrypt data   |
| (async batch)     |
+-------------------+
```

## Field-Level Encryption

For sensitive fields in database records:

```typescript
import { FieldEncryption } from './security/encryption';

// Encrypt specific fields
const user = {
  id: '123',
  email: 'user@example.com',
  ssn: '123-45-6789',
};

const encrypted = await FieldEncryption.encryptField(user, 'ssn');
// user.ssn is now encrypted

const decrypted = await FieldEncryption.decryptField(encrypted, 'ssn');
// user.ssn is restored
```

## Environment Configuration

### Development

```bash
# Required
ENCRYPTION_MASTER_KEY=your-32-byte-development-key!!!

# Optional (defaults to environment provider)
VAULT_ENABLED=false
```

### Production

```bash
# Vault configuration
VAULT_ENABLED=true
VAULT_ADDR=https://vault.production.example.com:8200
VAULT_TOKEN=${vault_token}  # From Kubernetes auth

# Key rotation
KEY_ROTATION_ENABLED=true
KEY_ROTATION_INTERVAL_DAYS=30
KEY_RETENTION_VERSIONS=5
KEY_ROTATION_WEBHOOK=https://alerts.example.com/key-rotation
```

## Compliance

### GDPR Requirements

- **Encryption at Rest**: All PII encrypted with AES-256-GCM
- **Encryption in Transit**: TLS 1.2+ for all connections
- **Key Management**: Keys stored in Vault, rotated regularly
- **Access Logging**: All key access logged to audit trail

### SOC 2 Controls

- **CC6.1**: Encryption of confidential data
- **CC6.6**: Secure key management
- **CC6.7**: Encryption key rotation

### ISO 27001

- **A.10.1.1**: Cryptographic controls policy
- **A.10.1.2**: Key management procedures

## Monitoring and Alerting

### Key Events

Monitor these events in the audit log:
- `KEY_ROTATION` - Successful key rotation
- `KEY_ROTATION_FAILED` - Failed rotation attempt
- `REENCRYPTION_STARTED` - Batch re-encryption started
- `REENCRYPTION_COMPLETED` - Re-encryption completed
- `KEY_DEPRECATED` - Old key version deprecated

### Metrics

Expose these Prometheus metrics:
- `encryption_operations_total{type="encrypt|decrypt"}`
- `encryption_errors_total{error_type="..."}`
- `key_rotation_last_success_timestamp`
- `key_versions_active`
- `certificate_expiry_seconds`

### Alerts

Configure alerts for:
- Key rotation failures
- Certificate expiry within 30 days
- Encryption operation errors
- Vault connectivity issues

## Disaster Recovery

### Key Recovery

1. **Vault HA**: Run Vault in HA mode with Raft storage
2. **Auto-unseal**: Use cloud KMS for automatic unseal
3. **Backup**: Regular encrypted snapshots of Vault data
4. **DR Replication**: Cross-region Vault replication

### Data Recovery

1. **Key Version Retention**: Keep 5 versions minimum
2. **Re-encryption**: Tools to re-encrypt with new keys
3. **Audit Trail**: Full history of key operations

## Security Considerations

### Dos

- Use the encryption service for all sensitive data
- Include AAD when context is available
- Monitor key rotation events
- Test encryption/decryption in CI/CD
- Use mTLS for service-to-service communication

### Don'ts

- Never store encryption keys in code
- Never log plaintext sensitive data
- Never disable certificate validation
- Never use deprecated algorithms (DES, 3DES, RC4)
- Never reuse IVs/nonces

## References

- [NIST SP 800-38D - GCM Mode](https://csrc.nist.gov/publications/detail/sp/800-38d/final)
- [HashiCorp Vault Transit Secrets Engine](https://www.vaultproject.io/docs/secrets/transit)
- [cert-manager Documentation](https://cert-manager.io/docs/)
- [TLS 1.3 RFC 8446](https://tools.ietf.org/html/rfc8446)
