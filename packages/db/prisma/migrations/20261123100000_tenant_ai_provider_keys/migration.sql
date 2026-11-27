-- PG-199 BYOK: a workspace's own AI provider key ("bring your own key").
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * One NEW table with its own constraints, index and RLS policy.
--   * No existing table is altered and no row is written.
--   * "apiKey" holds AES-256-GCM ciphertext written by the Prisma field-encryption
--     extension (ENCRYPTED_FIELDS, TenantAIProviderKey); the API refuses to write it when
--     PRISMA_FIELD_ENCRYPTION_KEY is absent and never returns it to a client.
--
-- Recovery plan: forward-only. Operational rollback = remove the key in Model Config (the
-- tenant's AI calls return to the platform providers). A down-migration (DROP TABLE) is
-- Class C, human-only, never autonomous.
--
-- Production applies only through the gated `prisma migrate deploy` workflow, before the
-- API that uses this table is promoted.

CREATE TABLE "tenant_ai_provider_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" VARCHAR(12) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "last4" VARCHAR(4) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    "statusDetail" VARCHAR(200),
    "allowFallback" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_ai_provider_keys_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_ai_provider_keys_provider_check"
        CHECK ("provider" IN ('anthropic', 'openai', 'google', 'openrouter')),
    CONSTRAINT "tenant_ai_provider_keys_status_check"
        CHECK ("status" IN ('ACTIVE', 'INVALID', 'RATE_LIMITED', 'QUOTA_EXCEEDED')),
    CONSTRAINT "tenant_ai_provider_keys_last4_check" CHECK (char_length("last4") BETWEEN 1 AND 4),
    -- The key is only ever stored as field-encryption ciphertext ("v1:<iv>:<tag>:<data>"): a
    -- plaintext write (an un-extended client, a missing encryption key) is refused by the database.
    CONSTRAINT "tenant_ai_provider_keys_apiKey_ciphertext_check" CHECK ("apiKey" LIKE 'v1:%')
);

-- One key per workspace.
CREATE UNIQUE INDEX "tenant_ai_provider_keys_tenantId_key" ON "tenant_ai_provider_keys"("tenantId");

ALTER TABLE "tenant_ai_provider_keys" ADD CONSTRAINT "tenant_ai_provider_keys_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row-level security (defence in depth; shape of 20261020120000_email_mailboxes). ENABLE only,
-- never FORCE: the table owner keeps bypassing it, and the explicit tenantId in every query
-- remains the application-level boundary.
ALTER TABLE "tenant_ai_provider_keys" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tenant_ai_provider_keys_tenant_isolation" ON "tenant_ai_provider_keys"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
