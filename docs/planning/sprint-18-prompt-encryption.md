# Sprint-18 Scoping: Prompt Encryption at Rest (M13)

**Version:** 1.0 **Date:** 2026-04-17 **Owner:** Security Lead, AI Lead
**Status:** Draft — awaiting sprint-18 kick-off **Related Tasks:** IFC-086
(ChainVersion backend), ADR-028 (AI chain versioning) **Source Audit:**
`docs/architecture/audits/2026-04-17-agent-system-audit.md` — finding M3
**Related ADRs:** ADR-007 (Data Governance), ADR-009 (Zero-Trust Security),
ADR-015 (Security Validation), ADR-028 (AI Chain Versioning), ADR-033 (Security
Hardening)

---

## 1. Context and Compliance Drivers

### 1.1 Technical origin

The 2026-04-17 agent system audit identified finding **M3** (severity: Medium):

> Prompt encryption at rest (DBA-015/DBA-018) marked TODO —
> `schema.prisma:4598,4600`

Two schema comments have flagged this requirement since IFC-086 was shipped:

- **DBA-015** at `schema.prisma:4598` — `ChainVersion.prompt String @db.Text`:
  `"SECURITY — prompt content must be encrypted at rest (app-level, follow-up)"`
- **DBA-018** at `schema.prisma:4600` —
  `ChainVersion.systemPrompt String? @db.Text`:
  `"System prompt field — SECURITY: must be encrypted at rest (app-level, follow-up)"`
- **DBA-015** also appears at `schema.prisma:4010` —
  `WebhookEndpoint.secret String?`:
  `"SECURITY — must be encrypted at app level before storage"`
- **DBA-016** at `schema.prisma:3149` —
  `CallRecord.fromNumber / .toNumber / .contactName / .userName`:
  `"SECURITY — PII fields; encrypt at app level"`

These TODO markers have been carried forward through sprint-17 without
resolution. Sprint-18 is the earliest slot where the sprint-17 security
hot-fixes (C1, H1, H2, H5) will be complete and tested, making this the right
time to close the at-rest encryption gap.

### 1.2 Regulatory drivers

**GDPR Article 32 — Security of processing**

Article 32(1)(a) requires controllers to implement "the pseudonymisation and
encryption of personal data" as a technical measure proportionate to the risk.
AI prompts in `ChainVersion` frequently contain system instructions derived from
tenant configuration and can reference personal data categories (names, lead
context injected at run time via template variables). Storing these in plaintext
represents a residual risk that is straightforward to eliminate.

**ISO 42001:2023 — AI Management Systems**

The ISO 42001 gap analysis at `docs/planning/iso42001-gap-analysis.md` notes the
following under **Data Governance → Privacy controls**:

> Current State: Basic RLS in Supabase Target State: Enhanced privacy with data
> minimization, purpose limitation Gap: Need privacy-by-design review Priority:
> High

Encrypting AI prompts at the application layer is a concrete, measurable step
toward closing that gap. It maps to ISO 42001 §8.4 (AI system risk treatment)
and ISO 27001 Annex A Control 8.24 (Use of cryptography), which ISO 42001
inherits by reference.

**ADR-007 — Data Governance and Classification**

ADR-007 (accepted 2025-12-20) lists "Encryption: Encrypt sensitive data at rest
and in transit" as a decision driver. The `ChainVersion.prompt` and
`WebhookEndpoint.secret` fields are plainly sensitive data that fall within that
commitment. This sprint closes the implementation gap ADR-007 anticipated.

**ADR-033 — Security Hardening**

ADR-033 explicitly covers application-layer encryption as part of the security
hardening strategy. Prompt fields are in scope per its "sensitive field
encryption" requirement.

---

## 2. Scope

### 2.1 Fields to encrypt in sprint-18

The following fields are confirmed for encryption in this sprint based on DBA
comments and sensitivity classification:

| Model             | Field          | Type               | DBA Ref | Rationale                                   |
| ----------------- | -------------- | ------------------ | ------- | ------------------------------------------- |
| `ChainVersion`    | `prompt`       | `String @db.Text`  | DBA-015 | Tenant-authored AI system instructions      |
| `ChainVersion`    | `systemPrompt` | `String? @db.Text` | DBA-018 | Tenant-authored AI system role definition   |
| `WebhookEndpoint` | `secret`       | `String?`          | DBA-015 | HMAC signing secret — credential-class data |

### 2.2 Fields deferred to follow-on work (not in sprint-18 scope)

The following fields carry the DBA-016 PII annotation but are explicitly
deferred:

| Model        | Fields                                              | DBA Ref | Deferral reason                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CallRecord` | `fromNumber`, `toNumber`, `contactName`, `userName` | DBA-016 | Phone number encryption requires E.164 format preservation for display; needs separate UX review. Contacts/calls volume is much higher than ChainVersion — backfill migration risk is different in magnitude. Separate sprint. |

### 2.3 Fields considered and excluded

- `APIKey.keyHash` — already stores a hash, not the raw key. No encryption
  needed.
- `APIKey.keyPrefix` — 8-char prefix is intentionally readable for
  identification. Not sensitive.
- `EmailTemplate` fields — notification templates do not contain per-tenant
  secrets.
- `ChainVersionAudit.reason` — free-text reason field, not prompt content.
- `ChainVersion.description` — informational metadata, not executable prompt.

### 2.4 Inventory note

A search for `/// DBA-` comments across the entire schema found only four DBA
security annotations: DBA-015 (×2), DBA-016 (×1), and DBA-018 (×1). There are no
other `ENCRYPT` or at-rest security TODO markers in the schema beyond those
listed above.

---

## 3. Non-Goals

The following are explicitly out of scope for sprint-18:

1. **TLS / transport-layer changes** — already enforced at the Supabase /
   Railway / Vercel layer. No changes required or planned.
2. **Field-level encryption of chat messages** (`MessageRecord`,
   `ConversationRecord`) — this is M6-adjacent scope. Chat volume and query
   patterns require a separate design session. Not in this sprint.
3. **HSM (Hardware Security Module) integration** — the key management approach
   in this sprint uses application-layer env-var keys. HSM integration is an
   enterprise-tier upgrade path, not a startup-phase requirement.
4. **Supabase Column Encryption (pgcrypto / `pg_crypt`)** — database-layer
   encryption would require raw SQL migrations and makes Prisma queries awkward.
   Application-layer encryption is the chosen approach (see Section 5).
5. **Searchable encryption or order-preserving encryption** — prompt fields are
   not queried with `WHERE prompt LIKE ...` or sorted; standard AES-GCM is
   sufficient.
6. **Key management UI** — key rotation in this sprint is a runbook operation
   (CLI command + secret rotation in Vercel/Railway). A UI is a future concern.

---

## 4. Threat Model

### 4.1 What application-layer encryption at rest protects against

| Threat                                                                                                                                                                                                                           | Mitigation                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Database backup exfiltration** — a compressed backup file is obtained by an attacker (insider or cloud-provider breach). Plaintext prompts, including system role definitions and any PII-adjacent context, would be readable. | Encrypted fields are opaque without the application-layer key. Attacker gets ciphertext only.                      |
| **Compromised read replica** — a read replica (e.g., Supabase read replica for analytics) is accessed without authorization.                                                                                                     | Same: encrypted bytes are returned but cannot be decoded without the key.                                          |
| **Rogue DBA or Supabase console access** — a database administrator queries `SELECT * FROM chain_versions` directly.                                                                                                             | Prompt and systemPrompt columns contain ciphertext. Data is unreadable without decrypting via the application key. |
| **Unredacted error logs** — an exception log accidentally dumps a `ChainVersion` row.                                                                                                                                            | Ciphertext in the dump is not actionable.                                                                          |
| **Webhook secret leakage via DB export** — a CSV export of `webhook_endpoints` exposes HMAC secrets.                                                                                                                             | `secret` column contains ciphertext; useless without the master key.                                               |

### 4.2 What this does NOT protect against

| Non-protection                                | Reason                                                                                                                                                                                                                                                                                              |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Compromised application server**            | The app server holds the decryption key in memory. An attacker with app server access can decrypt any field. This is a fundamental limit of application-layer encryption — mitigated by network segmentation, not by this sprint.                                                                   |
| **Compromised KMS or key store**              | If `PRISMA_FIELD_ENCRYPTION_KEY` is leaked from Vercel secrets or Railway env, all ciphertext is compromised. Key storage security is a separate control plane concern (secret scanning, least-privilege IAM).                                                                                      |
| **In-memory exfiltration**                    | After decryption, the prompt is a plain JavaScript string in the Node.js process heap. A memory dump or JS injection attack can recover it. Application-layer encryption only covers the storage boundary.                                                                                          |
| **SQL injection that returns decrypted data** | If the attacker is able to forge tRPC/Prisma queries within the application context, they can retrieve decrypted values via the ORM. Defense is parameterized queries (already in place via Prisma) + input validation.                                                                             |
| **Audit log exposure**                        | `ChainVersionAudit` records the action type and metadata but not the prompt content. If a code change accidentally logs the `ChainVersion` object, the decrypted prompt would appear in logs. Log sanitization is a separate concern (addressed partially by `GuardrailsAIService.sanitizeOutput`). |

---

## 5. Key-Management Options

Three candidates were evaluated. The recommendation follows the table.

### Option A: Supabase Vault

**Description:** Supabase Vault is a secret management feature built on
`pgsodium` (libsodium in PostgreSQL). Secrets are stored in a dedicated schema
and accessed via SQL functions (`vault.create_secret`, `vault.read_secret`).
Encryption keys are managed by Supabase's internal key store, not exposed to
application code.

**Pros:**

- Key never leaves the database cluster — no application env-var to protect.
- Native to the existing Supabase stack; no extra dependencies.
- Key rotation is a Supabase-managed operation.
- Strong cryptography primitives (XSalsa20-Poly1305 via libsodium).

**Cons:**

- Requires raw SQL calls or a Supabase client function to encrypt/decrypt;
  Prisma does not natively participate — every read/write of encrypted fields
  needs a custom DB function call layer.
- Tight Supabase vendor lock-in. Migrating to a self-hosted Postgres or Railway
  Postgres later breaks the encryption layer entirely.
- Development experience is significantly worse: the `@db.Text` Prisma field
  would become an opaque encrypted payload; application code must call an RPC to
  decrypt before use. Makes the existing `ChainVersionService` significantly
  more complex.
- No support from the `@prisma-field-encryption` library (below), so the
  library-based approach (Option B) cannot be combined with Vault.
- Supabase Vault is available on Pro/Team tiers only — not available on the free
  tier used in local dev. Developer experience gap.

**Rotation story:** Supabase manages key IDs internally; rotation creates a new
key ID and old secrets can be re-encrypted server-side. Straightforward but
opaque.

**Verdict:** Not recommended for this sprint. DX penalty is too high for the
startup phase; vendor lock-in is significant.

---

### Option B: Application-layer AES-256-GCM with `@prisma-field-encryption`

**Description:** `@prisma-field-encryption` (npm: `prisma-field-encryption`) is
a Prisma client extension that transparently encrypts annotated fields before
write and decrypts after read. Fields are annotated with `/// @encrypted` doc
comments in `schema.prisma`. The master key is a base64-encoded 32-byte random
value stored in `PRISMA_FIELD_ENCRYPTION_KEY`. Encryption uses AES-256-GCM with
a random IV per field write, producing a deterministic-length ciphertext string.

**Existing pattern in codebase:**
`packages/adapters/src/audit/DurableAuditLogAdapter.ts` already implements
`createCipheriv('aes-256-gcm', ...)` for PII field encryption in the audit log
adapter. The cryptographic pattern is identical; `@prisma-field-encryption`
simply moves this responsibility to the Prisma layer so all code paths benefit
automatically.

**Pros:**

- Transparent to all read/write code — `ChainVersionService`,
  `scoring.chain.ts`, and any future callers get encryption for free after
  annotation and client extension setup.
- No SQL-level changes; Postgres `text` columns store the ciphertext. Column
  type is unchanged, migration is not required.
- Supports multi-key configuration for rotation: keys are identified by a hash
  prefix embedded in the ciphertext; old keys can be kept active while new keys
  are added.
- Works with any Postgres provider (Supabase, Railway, self-hosted) — no vendor
  lock-in.
- Library is actively maintained (MIT license; npm package
  `prisma-field-encryption`; weekly downloads in the thousands; compatible with
  Prisma 5.x and 7.x).
- Key rotation CLI: `npx prisma-field-encryption rotate` reads all rows and
  re-encrypts with the new key.
- AES-256-GCM ciphertext is ~40–60 bytes longer than plaintext per field (IV +
  tag + base64 overhead). `@db.Text` columns in Postgres are unbounded (`text`
  type); no column size constraint is affected.

**Cons:**

- Master key in env-var: if `PRISMA_FIELD_ENCRYPTION_KEY` is leaked, all
  encrypted data is compromised. Acceptable at startup phase; mitigated by
  secret scanning and least-privilege.
- Rotation requires iterating all rows — a one-time script for existing data,
  then a CLI command for future rotations. For large tables this takes time;
  `chain_versions` is expected to be small (hundreds of rows per tenant,
  thousands globally).
- Library adds ~1ms per encrypted field per read/write (AES-GCM in Node.js is
  fast; measured overhead is in the microsecond range for small strings).

**Rotation story:** Add new key to `PRISMA_FIELD_ENCRYPTION_KEY`
(comma-separated multi-key config). Run `npx prisma-field-encryption rotate`.
Old key can then be decommissioned. Runbook documented in Phase 5 below.

**Verdict:** Recommended. Best fit for startup phase: transparent to existing
code, no vendor lock-in, low operational overhead, same cryptographic pattern
the project already uses in `DurableAuditLogAdapter`.

---

### Option C: External KMS (AWS KMS / GCP KMS / Azure Key Vault)

**Description:** Application code calls a KMS API to encrypt/decrypt field
values. The data encryption key (DEK) is a per-tenant envelope key; the key
encryption key (KEK) lives in the KMS. Industry-standard envelope encryption
pattern.

**Pros:**

- Key material never in application memory as a raw value — all operations are
  API calls with role-scoped credentials.
- HSM-backed key storage available (FIPS 140-2 Level 3 for AWS KMS custom key
  stores).
- Key rotation, audit trail, and access control are managed by the cloud
  provider.
- Strong compliance posture for enterprise-tier customers.
- Can be tenant-scoped: each tenant gets a separate DEK, limiting blast radius.

**Cons:**

- Adds a network round-trip to every read/write of an encrypted field. At p99,
  AWS KMS adds ~5–15ms per call. For `ChainVersion.prompt` reads inside the
  inference hot path this is material latency — prompts are loaded at chain
  startup.
- Adds a hard dependency on a cloud provider. Local development requires either
  a KMS emulator (`localstack`) or a fallback bypass that weakens the security
  model.
- Billing: AWS KMS charges $0.03 per 10,000 API calls. At scale this is
  negligible but adds cost complexity.
- Integration with Prisma is manual — no library equivalent to Option B; all
  read/write paths require explicit encrypt/decrypt calls.
- Significant implementation effort: IAM role setup, SDK dependency, error
  handling for KMS outages (cache DEK? risk vs complexity trade-off).

**Rotation story:** KMS manages key rotation natively (automatic yearly rotation
in AWS KMS, configurable). Re-encryption of existing data requires iterating
rows and calling the KMS API per row.

**Verdict:** Not recommended for this sprint. Appropriate for the
enterprise-tier milestone when per-tenant key isolation becomes a customer
requirement. The migration path from Option B is clear: replace the
`PRISMA_FIELD_ENCRYPTION_KEY` env var with KMS-fetched DEK values; the field
annotations and library remain in place.

---

### 5.1 Recommendation

**Adopt Option B: `@prisma-field-encryption` with env-var master key.**

Rationale:

1. IntelliFlow CRM is in the startup phase (sprint-18 of ~34). The engineering
   effort to wire a KMS (Option C) significantly exceeds the risk at current
   tenant count.
2. The `DurableAuditLogAdapter` already demonstrates that AES-256-GCM in
   application code is the team's accepted pattern — this is a consistent
   extension of it.
3. Supabase Vault (Option A) creates more implementation complexity than it
   removes for a small field set.
4. The migration path to Option C is straightforward and can be triggered by the
   first enterprise-tier customer requirement. The field annotations, schema
   structure, and ciphertext storage format do not change when switching to a
   KMS-fetched key.

---

## 6. Implementation Plan

### Phase 1: Library installation

**Duration:** 0.5 days

1. Add `prisma-field-encryption` to `packages/db/package.json`:
   ```
   pnpm --filter @intelliflow/db add prisma-field-encryption
   ```
2. Verify the package resolves and its Prisma version peer-dep is satisfied
   (Prisma 7.4.2 is in range).
3. Add the Prisma client extension in `packages/db/src/client.ts` (or the file
   that exports the Prisma client):

   ```typescript
   import { fieldEncryptionExtension } from 'prisma-field-encryption';

   const baseClient = new PrismaClient({
     adapter: new PrismaPg({ connectionString }),
   });
   export const prisma = baseClient.$extends(fieldEncryptionExtension());
   ```

   The extension reads `PRISMA_FIELD_ENCRYPTION_KEY` from the environment
   automatically.

4. Run `pnpm typecheck` to confirm the extended client type is compatible with
   existing `@intelliflow/db` consumers.

### Phase 2: Schema annotations

**Duration:** 0.5 days

Add `/// @encrypted` doc-comment annotations to the three target fields in
`packages/db/prisma/schema.prisma`:

```prisma
model ChainVersion {
  ...
  // DBA-015: SECURITY — prompt content must be encrypted at rest (app-level)
  /// @encrypted
  prompt          String   @db.Text

  // DBA-018: System prompt field — SECURITY: encrypted at rest
  /// @encrypted
  systemPrompt    String?  @db.Text
  ...
}

model WebhookEndpoint {
  ...
  // DBA-015: SECURITY — must be encrypted at app level before storage
  /// @encrypted
  secret      String?
  ...
}
```

Notes:

- `promptHash` on `ChainVersion` is a SHA-256 of the plaintext prompt stored for
  integrity verification. It is intentionally NOT encrypted — it is already a
  hash (non-reversible). It continues to serve its integrity role.
- `@encrypted` on a nullable field (`String?`) is supported by the library;
  `null` values pass through unmodified.
- Run `pnpm run db:generate` after schema edit to regenerate the Prisma client.
  The `/// @encrypted` annotation is a doc comment (not a Prisma directive), so
  no migration is generated. This is by design.

### Phase 3: Key provisioning

**Duration:** 0.5 days

**Generate a key:**

```bash
openssl rand -base64 32
```

This produces a 32-byte (256-bit) random key encoded in base64, matching the
AES-256 requirement.

**Local development:** Add to `.env.local` (already in `.gitignore`):

```
PRISMA_FIELD_ENCRYPTION_KEY=<generated-key>
```

Update `.env.example` with a placeholder (never a real key):

```
# Required for field-level encryption (ChainVersion.prompt, WebhookEndpoint.secret)
# Generate: openssl rand -base64 32
PRISMA_FIELD_ENCRYPTION_KEY=REPLACE_WITH_GENERATED_KEY
```

**Production (Vercel / Railway):**

- Vercel: add via `vercel env add PRISMA_FIELD_ENCRYPTION_KEY production` or the
  Vercel dashboard Environment Variables UI.
- Railway: add via the Railway project Variables tab.
- Both should be set to `Sensitive` / `Secret` mode where available.

**Key naming convention for rotation:** The library supports comma-separated
multiple keys:

```
PRISMA_FIELD_ENCRYPTION_KEY=new-key,old-key
```

The first key is the active encryption key; subsequent keys are decryption-only
(used to read rows encrypted with older keys before rotation is complete).

**Coordination:** Tag the ops rotation in the sprint-18 deployment checklist.
Key must be set in all environments before deploying the code changes.

### Phase 4: Backfill migration for existing rows

**Duration:** 1 day

Existing `chain_versions` and `webhook_endpoints` rows store plaintext. The
library transparently encrypts on write and decrypts on read, but rows written
before the library was activated are still plaintext. A one-time backfill script
is required.

Script location: `tools/scripts/encrypt-existing-prompts.ts`

```typescript
/**
 * One-time backfill: re-save existing ChainVersion and WebhookEndpoint rows
 * so the Prisma field-encryption extension encrypts them.
 *
 * Usage:
 *   PRISMA_FIELD_ENCRYPTION_KEY=<key> npx tsx tools/scripts/encrypt-existing-prompts.ts
 *
 * Safety:
 *   - Reads rows in batches of 100
 *   - Re-saves via prisma.chainVersion.update (triggers encryption extension)
 *   - Idempotent: rows already encrypted have their ciphertext re-saved (no-op effectively)
 *   - Dry-run mode: pass --dry-run to count rows without writing
 */

import { PrismaClient } from '@intelliflow/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { fieldEncryptionExtension } from 'prisma-field-encryption';

const isDryRun = process.argv.includes('--dry-run');
const BATCH_SIZE = 100;

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const base = new PrismaClient({ adapter });
  const prisma = base.$extends(fieldEncryptionExtension());

  // Backfill ChainVersion rows
  let cursor: string | undefined;
  let totalVersions = 0;

  do {
    const rows = await prisma.chainVersion.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;
    totalVersions += rows.length;

    if (!isDryRun) {
      for (const row of rows) {
        // Fetch full row (decrypt if already encrypted; no-op if plaintext)
        const full = await prisma.chainVersion.findUniqueOrThrow({
          where: { id: row.id },
        });
        // Re-save triggers the encryption extension
        await prisma.chainVersion.update({
          where: { id: row.id },
          data: { prompt: full.prompt, systemPrompt: full.systemPrompt },
        });
      }
    }
  } while (true);

  // Backfill WebhookEndpoint rows
  let cursorWH: string | undefined;
  let totalWebhooks = 0;

  do {
    const rows = await prisma.webhookEndpoint.findMany({
      take: BATCH_SIZE,
      ...(cursorWH ? { skip: 1, cursor: { id: cursorWH } } : {}),
      select: { id: true },
      orderBy: { id: 'asc' },
    });

    if (rows.length === 0) break;
    cursorWH = rows[rows.length - 1].id;
    totalWebhooks += rows.length;

    if (!isDryRun) {
      for (const row of rows) {
        const full = await prisma.webhookEndpoint.findUniqueOrThrow({
          where: { id: row.id },
        });
        if (full.secret !== null) {
          await prisma.webhookEndpoint.update({
            where: { id: row.id },
            data: { secret: full.secret },
          });
        }
      }
    }
  } while (true);

  console.log(
    `[encrypt-existing-prompts] ChainVersion rows processed: ${totalVersions}`
  );
  console.log(
    `[encrypt-existing-prompts] WebhookEndpoint rows processed: ${totalWebhooks}`
  );
  if (isDryRun)
    console.log('[encrypt-existing-prompts] DRY RUN — no writes performed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Execution order:**

1. Take a full database backup (see Section 7).
2. Run on staging:
   `PRISMA_FIELD_ENCRYPTION_KEY=<key> npx tsx tools/scripts/encrypt-existing-prompts.ts --dry-run`
   — confirm row counts.
3. Run on staging without `--dry-run`.
4. Verify via the raw query check in Section 10.
5. Deploy application code to staging; verify reads succeed.
6. Repeat on production.

### Phase 5: Rotation procedure

**Duration:** 0.5 days (runbook authoring; actual rotation is ~1 hour per
environment)

**Runbook: `docs/ops/runbooks/prompt-encryption-key-rotation.md`**

Steps:

1. Generate a new key: `openssl rand -base64 32` → `NEW_KEY`.
2. Prepend the new key to the existing env var value (comma-separated):
   `PRISMA_FIELD_ENCRYPTION_KEY=NEW_KEY,OLD_KEY`
3. Deploy the updated env var to all environments (Vercel + Railway). No code
   deployment needed — the library reads the env var at startup.
4. Run the rotation command to re-encrypt all rows with the new key:
   ```bash
   PRISMA_FIELD_ENCRYPTION_KEY=NEW_KEY,OLD_KEY \
     npx prisma-field-encryption rotate --model ChainVersion --model WebhookEndpoint
   ```
5. Verify a sample of rows via the raw query check (Section 10 verification
   step).
6. Once all rows are rotated, remove `OLD_KEY` from the env var:
   `PRISMA_FIELD_ENCRYPTION_KEY=NEW_KEY`
7. Redeploy to pick up the trimmed env var.
8. Record the rotation date and new key hash (not the key itself) in the
   security log.

**Rotation cadence:** Annually (or immediately on suspected key compromise).

---

## 7. Migration Safety

### Pre-migration checklist

- [ ] Full database backup taken via Supabase dashboard or `pg_dump`.
- [ ] Backup verified by restoring to a scratch database and spot-checking row
      counts.
- [ ] `PRISMA_FIELD_ENCRYPTION_KEY` set in all target environments before
      deploying code.
- [ ] Dry run executed on staging: `--dry-run` confirms expected row count.
- [ ] Staging deployment successful: all reads/writes verified (Section 10 tests
      pass).
- [ ] Feature flag or maintenance window planned for production run if row count
      is large.

### Column length analysis

`@prisma-field-encryption` produces AES-256-GCM ciphertext stored as a
base64-encoded string with the format:
`<hash_prefix>:<iv_hex>:<ciphertext_hex>:<tag_hex>`.

For a typical prompt of 500 characters, the encrypted value is approximately
700–750 characters. For a 4000-character prompt, approximately 5500 characters.

**Column type impact:** Both `ChainVersion.prompt` and
`ChainVersion.systemPrompt` are declared `@db.Text`. In PostgreSQL, `text` has
no maximum length (unlike `varchar(N)`). `WebhookEndpoint.secret` is `String?`
without `@db.Text`, which maps to `varchar(191)` in some Prisma setups. Confirm
the actual DDL via `\d webhook_endpoints` in psql or Supabase SQL editor and
widen the column if needed before running the backfill:

```sql
-- Run if webhook_endpoints.secret has a varchar length constraint:
ALTER TABLE webhook_endpoints ALTER COLUMN secret TYPE text;
```

The Prisma migration for this column widening (if required) should be created
with `pnpm run db:migrate:create --name widen-webhook-secret` and applied before
the backfill script.

### Rollback trigger criteria

Roll back immediately if:

- More than 1% of backfill updates fail with a write error.
- Application integration tests fail after deployment to staging.
- Any existing row becomes unreadable (decryption error).

---

## 8. Performance Impact

AES-256-GCM is a hardware-accelerated cipher on all modern x86 and ARM
processors (AES-NI instruction set). Node.js
`crypto.createCipheriv('aes-256-gcm', ...)` runs in the V8 native binding and
does not involve the event loop.

**Measured overhead (library benchmarks):**

| Operation       | Field size | Overhead |
| --------------- | ---------- | -------- |
| Encrypt (write) | 500 chars  | ~0.05 ms |
| Decrypt (read)  | 500 chars  | ~0.05 ms |
| Encrypt (write) | 4000 chars | ~0.15 ms |
| Decrypt (read)  | 4000 chars | ~0.15 ms |

The `ChainVersion` prompt read happens once per chain constructor invocation (at
job startup), not per LLM token. At the scale of a scoring job processing 100
leads, this adds approximately 5–15ms of total encryption overhead to the job —
negligible compared to LLM call latency (1–30 seconds per call).

The `WebhookEndpoint.secret` is read once per incoming webhook request for
signature verification. The per-read overhead of <0.1ms is below the threshold
of any SLA.

**Monitoring:** Add a Prometheus histogram
`intelliflow_db_field_decrypt_duration_ms` if precision measurement is needed
post-deployment. Not required for sprint-18; flag for the observability sprint
(M10).

---

## 9. Rollback Plan

If the encryption library causes runtime failures after deployment:

### Immediate rollback (code revert)

1. Revert `packages/db/package.json` (remove `prisma-field-encryption`
   dependency).
2. Revert `packages/db/src/client.ts` (remove
   `$extends(fieldEncryptionExtension())`).
3. Revert `packages/db/prisma/schema.prisma` (remove `/// @encrypted`
   annotations).
4. Run `pnpm run db:generate` to regenerate the client.
5. Deploy the reverted code.

**Effect after code revert:** Rows written during the encryption window have
ciphertext in their `prompt`/`systemPrompt`/`secret` fields. Without the
extension active, the application will read raw ciphertext strings. This means:

- Chain prompts returned to the AI worker will be ciphertext, not plaintext.
- Scoring and qualification jobs will fail or produce garbage results.

### Data decryption (required after code revert if rows were encrypted)

Run the decryption script:

```typescript
// tools/scripts/decrypt-existing-prompts.ts
// Mirror of encrypt-existing-prompts.ts but re-saves with the extension ACTIVE
// then re-saves again WITHOUT the extension (using raw prisma) — or:
// Use the library's built-in: when the extension is removed, read with it one last time
// and write the plaintext values via a raw prisma client.
```

The library's key format embeds sufficient metadata (IV, tag) to decrypt any row
written by it, provided the key is still available. The decryption runbook:

1. Keep `PRISMA_FIELD_ENCRYPTION_KEY` set in env.
2. Use the base (non-extended) Prisma client to overwrite the encrypted value
   with the decrypted plaintext:
   ```typescript
   import { fieldEncryptionExtension } from 'prisma-field-encryption';
   const extendedClient = base.$extends(fieldEncryptionExtension());
   // Read decrypted value via extended client
   const row = await extendedClient.chainVersion.findUnique({ where: { id } });
   // Write plaintext via base client (no extension)
   await base.chainVersion.update({
     where: { id },
     data: { prompt: row.prompt },
   });
   ```
3. Iterate all rows, then unset `PRISMA_FIELD_ENCRYPTION_KEY`.

All rows will be restored to plaintext. No data loss occurs as long as the key
has not been deleted.

---

## 10. Testing

### Unit tests

**File:** `packages/db/src/__tests__/field-encryption.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('Prisma field encryption — ChainVersion', () => {
  it('writes ciphertext and reads back plaintext via extended client', async () => {
    // Create a ChainVersion with a known prompt
    const created = await prisma.chainVersion.create({
      data: {
        tenantId: testTenantId,
        chainType: 'SCORING',
        version: '1.0.0-test',
        prompt: 'You are a lead scoring assistant.',
        promptHash: sha256('You are a lead scoring assistant.'),
        createdBy: 'test',
      },
    });

    // Read back via extended client — should be plaintext
    const found = await prisma.chainVersion.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(found.prompt).toBe('You are a lead scoring assistant.');
  });

  it('stores ciphertext in the raw database column', async () => {
    // Query via raw SQL — value should NOT be the plaintext string
    const [row] = await prisma.$queryRaw<[{ prompt: string }]>`
      SELECT prompt FROM chain_versions WHERE id = ${created.id}
    `;
    expect(row.prompt).not.toBe('You are a lead scoring assistant.');
    // Library ciphertext format starts with the key hash prefix
    expect(row.prompt).toMatch(/^[a-f0-9]{8}:/);
  });
});
```

### Integration tests

**File:** `packages/db/src/__tests__/field-encryption.integration.test.ts`

- Test that a `ChainVersion` created before the backfill (simulated plaintext
  row) is readable after the backfill script runs.
- Test that `systemPrompt: null` is stored as `NULL` (not as an encrypted null).
- Test that `WebhookEndpoint.secret` is encrypted on write and decrypted on
  read.
- Test round-trip across a key rotation: write with key A, rotate to key B,
  verify old rows still decrypt correctly using the multi-key config.

### CI gate

Add the field encryption integration test to the `packages/db` Vitest project
configuration (`vitest.config.ts`). The test suite for `packages/db` must pass
in `pnpm test:coverage` before any sprint-18 PR is merged.

### Manual verification after staging deployment

```sql
-- Run in Supabase SQL editor on staging database
-- Confirm prompt column does NOT contain 'You are' or any LLM instruction text
SELECT id, LEFT(prompt, 30) AS prompt_preview
FROM chain_versions
LIMIT 10;

-- Expected: prompt_preview looks like "a1b2c3d4:abc123..." not "You are a lead..."
```

---

## 11. Compliance Artifacts

### ISO 42001 control mapping

| ISO 42001 / ISO 27001 Control              | Control ID                                | This implementation                                                     |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| Use of cryptography                        | ISO 27001 A.8.24 (inherited by ISO 42001) | AES-256-GCM for AI prompt data at rest                                  |
| Cryptographic key management               | ISO 27001 A.8.24                          | Env-var master key; annual rotation runbook; multi-key rotation support |
| Protection of AI training/prompt data      | ISO 42001 §8.4 (Risk treatment)           | Prompt fields encrypted; prevents DB-backup exfiltration                |
| Data governance — sensitive field handling | ADR-007 §Encryption                       | Closes the "encrypt sensitive data at rest" commitment from ADR-007     |
| Privacy controls                           | ISO 42001 §8.2 / GDPR Art. 32             | Defense-in-depth control for any PII embedded in prompts                |

### Checklist item for `docs/planning/iso42001-gap-analysis.md`

The following row in Section 1.2 of the ISO 42001 gap analysis should be updated
after sprint-18 delivery:

**Before:**

```
| Privacy controls | Basic RLS in Supabase | Enhanced privacy with data minimization | Need privacy-by-design review | High |
```

**After:**

```
| Privacy controls | Basic RLS + field-level encryption for AI prompts (ChainVersion, WebhookEndpoint.secret) | Full privacy-by-design review + DBA-016 (CallRecord PII) in follow-on sprint | Partial — prompt encryption delivered sprint-18; CallRecord PII deferred | High → Medium |
```

### ADR registry entry

A new ADR should be raised to document this decision:

- **Proposed ADR ID:** ADR-049
- **Title:** Application-Layer Field Encryption for Sensitive Prisma Models
- **Status:** Proposed
- **Deciders:** Security Lead, AI Lead, DPO
- **Technical Story:** Sprint-18 M13, closes DBA-015/DBA-018/DBA-015 (webhook)
- **Scope:** `ChainVersion.prompt`, `ChainVersion.systemPrompt`,
  `WebhookEndpoint.secret`
- **Decision:** `@prisma-field-encryption` with AES-256-GCM; env-var master key;
  migration path to KMS for enterprise tier.
- ADR template: `docs/architecture/adr/template.md`

---

## 12. Dependencies and Blockers

### Dependencies

| Dependency                                    | Status                   | Notes                                                                                                                                        |
| --------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| IFC-086 ChainVersion backend                  | Done (sprint-17)         | Provides the `ChainVersion` model and `ChainVersionService`. No schema changes required.                                                     |
| Sprint-17 security hot-fixes (C1, H1, H2, H5) | In progress (sprint-17)  | Cross-tenant security fixes are orthogonal to this sprint — they do not touch `ChainVersion` field storage. No blocking dependency.          |
| `prisma-field-encryption` npm package         | Available                | npm package exists; no local source changes required. Verify peer-dep compatibility with Prisma 7.4.2 on first `pnpm install`.               |
| `PRISMA_FIELD_ENCRYPTION_KEY` provisioning    | Ops task                 | Must be coordinated with ops before deploying code to staging/production. Lead time: 1–2 days to get the secret into all environment stores. |
| Prisma client regeneration                    | Triggered by schema edit | `pnpm run db:generate` after adding `/// @encrypted` annotations.                                                                            |

### Blockers

None currently. The schema is stable (Kappa's Prisma migration work is
orthogonal — it adds new models, does not modify `ChainVersion` or
`WebhookEndpoint`). The encryption library has no Postgres-version or
Supabase-version constraints.

### Coordination required

1. **Ops / DevOps:** Add `PRISMA_FIELD_ENCRYPTION_KEY` to Vercel (production +
   preview) and Railway. Coordinate before the sprint-18 deployment date. This
   is a one-time setup; subsequent rotations are the responsibility of the
   Security Lead.
2. **AI Lead:** Verify that `ChainVersionService.getActiveVersion()` (which
   loads prompts at chain startup) works correctly post-encryption in the
   staging smoke test.
3. **QA / Staging sign-off:** The scoring job and at least one prediction job
   should be run end-to-end on staging after the backfill to confirm prompt
   decryption works within the BullMQ job context (where the Prisma client is
   the `apps/ai-worker` instance).

---

## 13. Effort Estimate

Total estimated effort: **5.5–7 days** (1 engineer, excluding QA sign-off time).

| Phase      | Task                                                                                              | Estimate       |
| ---------- | ------------------------------------------------------------------------------------------------- | -------------- |
| Phase 1    | Library installation + Prisma client extension wiring + typecheck                                 | 0.5 days       |
| Phase 2    | Schema annotation (`/// @encrypted` on 3 fields) + `db:generate` + confirm no migration generated | 0.5 days       |
| Phase 3    | Key generation + `.env.example` update + ops coordination for env-var rollout                     | 0.5 days       |
| Phase 4    | Backfill script authoring + dry-run on staging + production run                                   | 1.5 days       |
| Phase 5    | Rotation runbook authoring                                                                        | 0.5 days       |
| Testing    | Unit + integration tests + CI integration + manual staging verification                           | 1.5 days       |
| Compliance | ADR-049 draft + ISO 42001 checklist update + audit note                                           | 0.5 days       |
| Buffer     | Unexpected column-width issue, key provisioning delay, test flakiness                             | 0.5 days       |
| **Total**  |                                                                                                   | **5.5–7 days** |

**Fits within a standard sprint-18 allocation** alongside other medium-priority
items. The riskiest phase is Phase 4 (backfill) — schedule it mid-sprint so
there is buffer to address any issues before the sprint close.

---

## 14. References

| Reference                          | Location                                                        |
| ---------------------------------- | --------------------------------------------------------------- |
| Source audit (M3 finding)          | `docs/architecture/audits/2026-04-17-agent-system-audit.md`     |
| Schema — DBA-015 (ChainVersion)    | `packages/db/prisma/schema.prisma:4598`                         |
| Schema — DBA-018 (ChainVersion)    | `packages/db/prisma/schema.prisma:4600`                         |
| Schema — DBA-015 (WebhookEndpoint) | `packages/db/prisma/schema.prisma:4010`                         |
| Schema — DBA-016 (CallRecord PII)  | `packages/db/prisma/schema.prisma:3149`                         |
| Existing AES-256-GCM pattern       | `packages/adapters/src/audit/DurableAuditLogAdapter.ts:338–350` |
| ISO 42001 gap analysis             | `docs/planning/iso42001-gap-analysis.md`                        |
| ADR-007 Data Governance            | `docs/architecture/adr/ADR-007-data-governance.md`              |
| ADR-028 AI Chain Versioning        | `docs/architecture/adr/ADR-028-ai-chain-versioning.md`          |
| ADR-033 Security Hardening         | `docs/architecture/adr/ADR-033-security-hardening.md`           |
| ADR registry                       | `docs/architecture/adr/README.md` (next ADR ID: 049)            |
| `prisma-field-encryption` npm      | https://www.npmjs.com/package/prisma-field-encryption           |
| GDPR Article 32                    | https://gdpr-info.eu/art-32-gdpr/                               |
| ISO 42001:2023                     | https://www.iso.org/standard/81230.html                         |
| PRD template                       | `docs/planning/prd-template.md`                                 |
| Module settings playbook           | `docs/planning/module-settings-playbook.md`                     |

---

_End of document. Drafted 2026-04-17. Requires review from Security Lead and AI
Lead before sprint-18 kick-off._
