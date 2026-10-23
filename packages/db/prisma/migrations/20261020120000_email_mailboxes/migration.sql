-- PG-207: user / company mailboxes and single-use OAuth connect state (ADR-085).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW tables with their own constraints, indexes and RLS policies.
--   * No existing table is altered and no row is written.
--   * Secret columns ("smtpPassword", "imapPassword", "refreshToken",
--     "codeVerifier") hold AES-256-GCM ciphertext written by the Prisma
--     field-encryption extension (ENCRYPTED_FIELDS); the API refuses to write
--     them when PRISMA_FIELD_ENCRYPTION_KEY is absent.
--
-- Recovery plan: forward-only. Operational rollback = disconnect mailboxes in
-- Email Settings (sending is refused with "Connect your mailbox"). A
-- down-migration (DROP TABLE x2) is Class C — human-only, never autonomous.
--
-- Production applies only through the gated `prisma migrate deploy` workflow,
-- before the API that uses these tables is promoted.

-- ── email_mailboxes ────────────────────────────────────────────────────────
CREATE TABLE "email_mailboxes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "userId" TEXT,
    "kind" VARCHAR(12) NOT NULL,
    "status" VARCHAR(14) NOT NULL DEFAULT 'ACTIVE',
    "lastErrorCode" VARCHAR(32),
    "fromAddress" VARCHAR(320) NOT NULL,
    "fromName" VARCHAR(100),
    "smtpHost" VARCHAR(253),
    "smtpPort" INTEGER,
    "smtpSecurity" VARCHAR(10),
    "smtpUsername" VARCHAR(320),
    "smtpPassword" TEXT,
    "imapHost" VARCHAR(253),
    "imapPort" INTEGER,
    "imapUsername" VARCHAR(320),
    "imapPassword" TEXT,
    "accountAddress" VARCHAR(320),
    "refreshToken" TEXT,
    "grantedScopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "tokenVersion" INTEGER NOT NULL DEFAULT 0,
    "imapUidValidity" BIGINT,
    "imapLastUid" BIGINT,
    "scanCursorAt" TIMESTAMP(3),
    "nextScanAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "sendWindowStart" TIMESTAMP(3),
    "sendWindowCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_mailboxes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_mailboxes_scope_check" CHECK ("scope" IN ('USER', 'TENANT')),
    -- A USER mailbox belongs to exactly one user; the TENANT mailbox to nobody.
    CONSTRAINT "email_mailboxes_scope_user_check" CHECK (("scope" = 'USER') = ("userId" IS NOT NULL)),
    CONSTRAINT "email_mailboxes_kind_check" CHECK ("kind" IN ('SMTP', 'GMAIL', 'MICROSOFT')),
    CONSTRAINT "email_mailboxes_status_check" CHECK ("status" IN ('ACTIVE', 'ERROR', 'DISCONNECTED')),
    CONSTRAINT "email_mailboxes_fromAddress_check"
        CHECK ("fromAddress" = lower(btrim("fromAddress")) AND position('@' IN "fromAddress") > 1),
    CONSTRAINT "email_mailboxes_smtpSecurity_check"
        CHECK ("smtpSecurity" IS NULL OR "smtpSecurity" IN ('SSL', 'STARTTLS')),
    -- TLS submission ports only (465 implicit TLS, 587/2525); IMAP over implicit TLS.
    CONSTRAINT "email_mailboxes_smtpPort_check" CHECK ("smtpPort" IS NULL OR "smtpPort" IN (465, 587, 2525)),
    CONSTRAINT "email_mailboxes_imapPort_check" CHECK ("imapPort" IS NULL OR "imapPort" = 993),
    CONSTRAINT "email_mailboxes_imap_fields_check" CHECK (
        ("imapHost" IS NULL) = ("imapPort" IS NULL) AND ("imapHost" IS NULL) = ("imapUsername" IS NULL)),
    -- An ACTIVE mailbox has what its kind needs to send.
    CONSTRAINT "email_mailboxes_smtp_active_check" CHECK (
        "kind" <> 'SMTP' OR "status" <> 'ACTIVE' OR (
            "smtpHost" IS NOT NULL AND "smtpPort" IS NOT NULL AND "smtpSecurity" IS NOT NULL
            AND "smtpUsername" IS NOT NULL AND "smtpPassword" IS NOT NULL)),
    CONSTRAINT "email_mailboxes_oauth_active_check" CHECK (
        "kind" = 'SMTP' OR "status" <> 'ACTIVE' OR ("refreshToken" IS NOT NULL AND "accountAddress" IS NOT NULL)),
    CONSTRAINT "email_mailboxes_counters_check"
        CHECK ("tokenVersion" >= 0 AND "failureCount" >= 0 AND "sendWindowCount" >= 0)
);

-- ── email_oauth_states ─────────────────────────────────────────────────────
CREATE TABLE "email_oauth_states" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" VARCHAR(10) NOT NULL,
    "provider" VARCHAR(12) NOT NULL,
    "stateHash" VARCHAR(64) NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_oauth_states_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "email_oauth_states_scope_check" CHECK ("scope" IN ('USER', 'TENANT')),
    CONSTRAINT "email_oauth_states_provider_check" CHECK ("provider" IN ('GMAIL', 'MICROSOFT')),
    CONSTRAINT "email_oauth_states_stateHash_check" CHECK ("stateHash" ~ '^[0-9a-f]{64}$')
);

-- ── Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX "email_mailboxes_tenantId_scope_idx" ON "email_mailboxes"("tenantId", "scope");
CREATE INDEX "email_mailboxes_status_nextScanAt_idx" ON "email_mailboxes"("status", "nextScanAt");
CREATE UNIQUE INDEX "email_mailboxes_tenantId_id_key" ON "email_mailboxes"("tenantId", "id");
CREATE UNIQUE INDEX "email_oauth_states_stateHash_key" ON "email_oauth_states"("stateHash");
CREATE INDEX "email_oauth_states_expiresAt_idx" ON "email_oauth_states"("expiresAt");
-- SQL-only (Prisma cannot express them; documented in schema.prisma).
CREATE UNIQUE INDEX "email_mailboxes_one_per_user_key"
    ON "email_mailboxes"("tenantId", "userId") WHERE "scope" = 'USER';
CREATE UNIQUE INDEX "email_mailboxes_one_per_tenant_key"
    ON "email_mailboxes"("tenantId") WHERE "scope" = 'TENANT';

-- ── Foreign keys ───────────────────────────────────────────────────────────
ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- users has no ("tenantId","id") unique, so this is a plain FK; the API sets
-- "userId" only from the authenticated user of the same tenant (D15).
ALTER TABLE "email_mailboxes" ADD CONSTRAINT "email_mailboxes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_oauth_states" ADD CONSTRAINT "email_oauth_states_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261017120000_contact_types) ──
ALTER TABLE "email_mailboxes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "email_oauth_states" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "email_mailboxes_tenant_isolation" ON "email_mailboxes"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "email_oauth_states_tenant_isolation" ON "email_oauth_states"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
