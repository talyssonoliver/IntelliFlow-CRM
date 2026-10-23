-- PG-203 DSAR: data subject requests and processing restrictions (spec Addendum A, ADR-007 addendum).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): additive only.
--   * Two NEW enums and two NEW tables with their own constraints, indexes, FKs and RLS.
--   * BEFORE INSERT/UPDATE triggers on ai_scores, lead_ai_insights, contact_ai_insights and
--     ai_insights that refuse AI-derived writes for an ERASED lead/contact (none exist before this
--     migration, so no current write is affected). A rare deadlock between an insight UPDATE and
--     an erasure is resolved by Postgres aborting one transaction; both are safe to retry.
--   * AFTER UPDATE OF email triggers on leads and contacts that carry an active restriction to the
--     record's new address (none exist before this migration, so no current write is affected).
--   * BEFORE UPDATE OF email triggers on leads and contacts that keep an erased record erased: they
--     act only on a row already holding its erased address, and none exists before this migration.
--   * No existing column, constraint or index is altered and no existing row is read, copied or
--     rewritten; the only changes to existing tables are those eight triggers.
--   * Plain (non-CONCURRENTLY) indexes are safe: both tables are created empty in this transaction.
--   * The users FKs use ON DELETE SET NULL so deleting a staff user never removes a request record.
--   * The raw-SQL data_subject_requests / legal_holds tables of the old Supabase design were never applied
--     to any environment (production schema snapshot 2026-02-27, every Prisma migration). The new names
--     are different on purpose, so no differently-shaped manual table can be picked up by mistake.
--
-- Recovery plan: forward-only. Operational rollback = stop serving the privacy routes; nothing else
-- reads these tables. A down-migration (DROP TABLE x2, DROP TYPE x2) is Class C — human-only, and it
-- deletes the record of requests already handled, which the firm must keep as evidence of compliance.
-- The address-follow triggers are reversible without data loss: DROP TRIGGER x2 (*_dsar_follow_email)
-- and DROP FUNCTION x4 (dsar_follow_subject_email, dsar_carry_restriction, dsar_subject_lock,
-- dsar_normalise_email).
-- The erasure guard alone is reversible without data loss: DROP TRIGGER x4 (the *_dsar_erased_guard
-- triggers) and DROP FUNCTION x5 (dsar_*), which deletes no row. So is the keep-erased guard:
-- DROP TRIGGER x2 (*_dsar_keep_erased) and DROP FUNCTION dsar_keep_erased.
--
-- Merged, NOT applied: production applies only through the gated `prisma migrate deploy` workflow, and
-- it must run BEFORE the API that reads these tables is promoted.

SET LOCAL lock_timeout = '5s';

-- ── Enums ──────────────────────────────────────────────────────────────────
CREATE TYPE "DsarRequestType" AS ENUM (
    'ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'PORTABILITY', 'OBJECTION');
CREATE TYPE "DsarRequestStatus" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED', 'COMPLETED', 'REJECTED');

-- ── dsar_requests ──────────────────────────────────────────────────────────
CREATE TABLE "dsar_requests" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "DsarRequestType" NOT NULL,
    "status" "DsarRequestStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "source" VARCHAR(20) NOT NULL,
    "subjectEmail" VARCHAR(320) NOT NULL,
    "capEmailHash" CHAR(64) NOT NULL,
    "details" TEXT,
    "objectionScope" VARCHAR(20),
    "identityMethod" VARCHAR(30),
    "identityNote" VARCHAR(500),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "receivedOnReason" VARCHAR(500),
    "verificationTokenHash" CHAR(64),
    "verificationExpiresAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "slaDeadline" TIMESTAMP(3),
    "extendedUntil" TIMESTAMP(3),
    "extensionReason" VARCHAR(500),
    "exportTokenHash" CHAR(64),
    "exportExpiresAt" TIMESTAMP(3),
    "exportIssuedAt" TIMESTAMP(3),
    "exportDownloads" INTEGER NOT NULL DEFAULT 0,
    "exportDownloadedAt" TIMESTAMP(3),
    "ipHash" CHAR(64),
    "createdById" TEXT,
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "noHoldConfirmedAt" TIMESTAMP(3),
    "marketingStopMethod" VARCHAR(500),
    "clockBreached" BOOLEAN NOT NULL DEFAULT false,
    "slaAlertedAt" TIMESTAMP(3),
    -- A staff-logged erasure runs only after the person's warning email was accepted.
    "erasureNoticeAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsar_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dsar_requests_source_check" CHECK ("source" IN ('PUBLIC_FORM', 'STAFF')),
    CONSTRAINT "dsar_requests_subjectEmail_check"
        CHECK ("subjectEmail" = lower(btrim("subjectEmail")) AND "subjectEmail" LIKE '%_@_%'),
    CONSTRAINT "dsar_requests_capEmailHash_check" CHECK ("capEmailHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "dsar_requests_verificationTokenHash_check"
        CHECK ("verificationTokenHash" IS NULL OR "verificationTokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "dsar_requests_exportTokenHash_check"
        CHECK ("exportTokenHash" IS NULL OR "exportTokenHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "dsar_requests_ipHash_check" CHECK ("ipHash" IS NULL OR "ipHash" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "dsar_requests_details_check" CHECK ("details" IS NULL OR char_length("details") <= 2000),
    CONSTRAINT "dsar_requests_resolutionNote_check"
        CHECK ("resolutionNote" IS NULL OR char_length("resolutionNote") <= 2000),
    -- IS NOT NULL guard: a NULL scope would make the first branch NULL, which a CHECK treats as passing.
    CONSTRAINT "dsar_requests_objectionScope_check" CHECK (
        ("type" = 'OBJECTION' AND "objectionScope" IS NOT NULL
            AND "objectionScope" IN ('MARKETING', 'OTHER'))
        OR ("type" <> 'OBJECTION' AND "objectionScope" IS NULL)),
    CONSTRAINT "dsar_requests_identityMethod_check" CHECK ("identityMethod" IS NULL
        OR "identityMethod" IN ('IN_PERSON_ID', 'KNOWN_CLIENT_CALLBACK', 'SIGNED_LETTER', 'OTHER')),
    -- A staff-logged request always records how identity was checked. The IS NOT NULL guard
    -- matters: char_length(btrim(NULL)) is NULL, which a CHECK would treat as satisfied.
    CONSTRAINT "dsar_requests_staff_identity_check" CHECK ("source" <> 'STAFF'
        OR ("identityMethod" IS NOT NULL AND "identityNote" IS NOT NULL
            AND char_length(btrim("identityNote")) >= 20)),
    -- The export token and its expiry are set (or cleared) together.
    CONSTRAINT "dsar_requests_export_pair_check"
        CHECK (("exportTokenHash" IS NULL) = ("exportExpiresAt" IS NULL)),
    CONSTRAINT "dsar_requests_exportDownloads_check" CHECK ("exportDownloads" BETWEEN 0 AND 5)
);

CREATE UNIQUE INDEX "dsar_requests_tenantId_id_key" ON "dsar_requests"("tenantId", "id");
CREATE INDEX "dsar_requests_tenantId_status_slaDeadline_idx"
    ON "dsar_requests"("tenantId", "status", "slaDeadline");
CREATE INDEX "dsar_requests_tenantId_subjectEmail_createdAt_idx"
    ON "dsar_requests"("tenantId", "subjectEmail", "createdAt");
CREATE INDEX "dsar_requests_tenantId_ipHash_createdAt_idx"
    ON "dsar_requests"("tenantId", "ipHash", "createdAt");
CREATE INDEX "dsar_requests_capEmailHash_createdAt_idx" ON "dsar_requests"("capEmailHash", "createdAt");

ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "dsar_requests" ADD CONSTRAINT "dsar_requests_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── processing_restrictions ────────────────────────────────────────────────
CREATE TABLE "processing_restrictions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subjectEmail" VARCHAR(320) NOT NULL,
    "blocksMarketing" BOOLEAN NOT NULL DEFAULT false,
    "dsarRequestIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "liftNote" VARCHAR(500),

    CONSTRAINT "processing_restrictions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "processing_restrictions_subjectEmail_check"
        CHECK ("subjectEmail" = lower(btrim("subjectEmail")) AND "subjectEmail" LIKE '%_@_%'),
    CONSTRAINT "processing_restrictions_lift_check"
        CHECK ("liftedAt" IS NOT NULL OR ("liftedById" IS NULL AND "liftNote" IS NULL))
);

CREATE UNIQUE INDEX "processing_restrictions_tenantId_id_key" ON "processing_restrictions"("tenantId", "id");
CREATE INDEX "processing_restrictions_tenantId_subjectEmail_idx"
    ON "processing_restrictions"("tenantId", "subjectEmail");
-- SQL-only: one ACTIVE restriction per person per firm; writes upsert into it (spec sign-off 1).
CREATE UNIQUE INDEX "processing_restrictions_active_key"
    ON "processing_restrictions"("tenantId", "subjectEmail") WHERE "liftedAt" IS NULL;

ALTER TABLE "processing_restrictions" ADD CONSTRAINT "processing_restrictions_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "processing_restrictions" ADD CONSTRAINT "processing_restrictions_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "processing_restrictions" ADD CONSTRAINT "processing_restrictions_liftedById_fkey"
    FOREIGN KEY ("liftedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Row-level security (defence in depth; shape of 20261021120100_event_types) ──
-- The application-level tenant boundary is the explicit tenantId in every query. The cross-tenant
-- anti-bombing count (capEmailHash) runs on the API's own BYPASSRLS connection by design.
ALTER TABLE "dsar_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "processing_restrictions" ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "dsar_requests_tenant_isolation" ON "dsar_requests"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "processing_restrictions_tenant_isolation" ON "processing_restrictions"
    USING ("tenantId" = current_setting('app.current_tenant_id', true))
    WITH CHECK ("tenantId" = current_setting('app.current_tenant_id', true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Erasure guard: no AI-derived data is stored again for an erased person (owner ruling) ──
-- Erasure (PrismaSubjectDataRepository.erase) rewrites the lead/contact email to
-- erased-<id>@erased.invalid and deletes ai_scores, lead_ai_insights, contact_ai_insights and the
-- ai_insights about them, in one transaction that holds the lead/contact row locks. An AI job
-- queued before the erasure may finish after it. These triggers refuse such a write:
--   * FOR KEY SHARE on the subject row waits for an erasure in flight (its email rewrite is a key
--     update: email is unique), then sees the erased address; ordinary lead edits do not block it;
--   * a write that took the key-share lock first makes the erasure wait, and the erasure then
--     deletes what was written.
-- Either order ends with no derived data for the erased person. Only the exact address erase()
-- writes counts, so a real address that merely ends in .invalid is never refused. The two checks
-- are SECURITY DEFINER (they return only a boolean) so a writer without a tenant context cannot
-- slip past them through RLS. Rows for people who were never erased are untouched, and no erased
-- rows exist before this migration, so this is additive.
CREATE OR REPLACE FUNCTION dsar_lead_is_erased(lead_id TEXT) RETURNS BOOLEAN
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE subject_email TEXT;
BEGIN
  SELECT email INTO subject_email FROM leads WHERE id = lead_id FOR KEY SHARE;
  RETURN COALESCE(subject_email = 'erased-' || lead_id || '@erased.invalid', FALSE);
END $$;

CREATE OR REPLACE FUNCTION dsar_contact_is_erased(contact_id TEXT) RETURNS BOOLEAN
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE subject_email TEXT;
BEGIN
  SELECT email INTO subject_email FROM contacts WHERE id = contact_id FOR KEY SHARE;
  RETURN COALESCE(subject_email = 'erased-' || contact_id || '@erased.invalid', FALSE);
END $$;

CREATE OR REPLACE FUNCTION dsar_refuse_erased_lead_write() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF dsar_lead_is_erased(NEW."leadId") THEN
    RAISE EXCEPTION 'DSAR: lead % was erased; AI-derived data is not stored', NEW."leadId"
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION dsar_refuse_erased_contact_write() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF dsar_contact_is_erased(NEW."contactId") THEN
    RAISE EXCEPTION 'DSAR: contact % was erased; AI-derived data is not stored', NEW."contactId"
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION dsar_refuse_erased_entity_insight() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW."entityId" IS NOT NULL AND (
       (NEW."entityType" = 'lead' AND dsar_lead_is_erased(NEW."entityId"))
    OR (NEW."entityType" = 'contact' AND dsar_contact_is_erased(NEW."entityId"))) THEN
    RAISE EXCEPTION 'DSAR: % % was erased; AI-derived data is not stored',
      NEW."entityType", NEW."entityId" USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "ai_scores_dsar_erased_guard" ON "ai_scores";
CREATE TRIGGER "ai_scores_dsar_erased_guard" BEFORE INSERT OR UPDATE ON "ai_scores"
  FOR EACH ROW EXECUTE FUNCTION dsar_refuse_erased_lead_write();

DROP TRIGGER IF EXISTS "lead_ai_insights_dsar_erased_guard" ON "lead_ai_insights";
CREATE TRIGGER "lead_ai_insights_dsar_erased_guard" BEFORE INSERT OR UPDATE ON "lead_ai_insights"
  FOR EACH ROW EXECUTE FUNCTION dsar_refuse_erased_lead_write();

DROP TRIGGER IF EXISTS "contact_ai_insights_dsar_erased_guard" ON "contact_ai_insights";
CREATE TRIGGER "contact_ai_insights_dsar_erased_guard"
  BEFORE INSERT OR UPDATE ON "contact_ai_insights"
  FOR EACH ROW EXECUTE FUNCTION dsar_refuse_erased_contact_write();

DROP TRIGGER IF EXISTS "ai_insights_dsar_erased_guard" ON "ai_insights";
CREATE TRIGGER "ai_insights_dsar_erased_guard" BEFORE INSERT OR UPDATE ON "ai_insights"
  FOR EACH ROW EXECUTE FUNCTION dsar_refuse_erased_entity_insight();

-- ── An erased record stays erased (codex HIGH) ───────────────────────────────────────────────
-- An ordinary edit reads the lead or contact, then saves the whole snapshot. If the read came
-- before an erasure and the save after it, the save would write the person's address, names and
-- phone back. Every such snapshot carries the old address, so once a row holds its erased
-- address, an update that changes the address is refused in the same statement, whichever code
-- path wrote it. The erasure itself (not yet erased) and writes that keep the address pass.
CREATE OR REPLACE FUNCTION dsar_keep_erased() RETURNS TRIGGER
  LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.email = 'erased-' || OLD.id || '@erased.invalid'
     AND NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'DSAR: % % was erased; its data is not written back', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "leads_dsar_keep_erased" ON "leads";
CREATE TRIGGER "leads_dsar_keep_erased" BEFORE UPDATE OF "email" ON "leads"
  FOR EACH ROW EXECUTE FUNCTION dsar_keep_erased();

DROP TRIGGER IF EXISTS "contacts_dsar_keep_erased" ON "contacts";
CREATE TRIGGER "contacts_dsar_keep_erased" BEFORE UPDATE OF "email" ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION dsar_keep_erased();

-- ── Restrictions follow the record when its address changes (codex HIGH x2) ─────────────────
-- A processing restriction is keyed by the person's normalised email. When a lead or contact
-- moves to another address (an edit, or a contact merge), the restriction must cover the new
-- address too, or the record escapes it. Two rules make that race-free:
--   * every write of an active restriction and every carry below first takes a transaction
--     advisory lock on (tenant, address) via dsar_subject_lock;
--   * the carry runs inside the transaction that changes the address (trigger below, and the
--     contact merge, which calls dsar_carry_restriction itself).
-- So a restriction verified for the old address either committed before the change (and is
-- carried) or is written after it (for an address the record no longer has). The old row stays
-- active: another record may still use that address. An erasure's rewrite to the erased
-- address is not carried (status() already treats an erased address as restricted).
-- Notes: the argument relies on READ COMMITTED (each statement after the lock sees committed
-- rows), the default for every connection here. A carried row is independent: lifting the old
-- address's restriction leaves the carried one in force (over-restriction, the safe side), and
-- an admin lifts it separately. One statement updating many addresses can, rarely, deadlock
-- with another; Postgres aborts one and it is safe to retry. A new address that fails the
-- subjectEmail check aborts the address change itself, on purpose: it is not a valid email.
-- The same key as normalizeSubjectEmail (trim().toLowerCase()): any outer whitespace.
CREATE OR REPLACE FUNCTION dsar_normalise_email(email TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(regexp_replace(email, '^\s+|\s+$', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION dsar_subject_lock(tenant_id TEXT, email TEXT) RETURNS VOID
  LANGUAGE sql AS $$
  SELECT pg_advisory_xact_lock(
    hashtextextended('dsar-subject:' || tenant_id || ':' || dsar_normalise_email(email), 0));
$$;

CREATE OR REPLACE FUNCTION dsar_carry_restriction(tenant_id TEXT, from_email TEXT, to_email TEXT)
  RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  f TEXT := dsar_normalise_email(from_email);
  t TEXT := dsar_normalise_email(to_email);
  src RECORD;
BEGIN
  IF f IS NULL OR t IS NULL OR f = t THEN
    RETURN;
  END IF;
  -- Both addresses, in a fixed order, so two carries in opposite directions cannot deadlock.
  PERFORM dsar_subject_lock(tenant_id, LEAST(f, t));
  PERFORM dsar_subject_lock(tenant_id, GREATEST(f, t));
  SELECT "blocksMarketing", "dsarRequestIds", "createdById" INTO src
    FROM processing_restrictions
    WHERE "tenantId" = tenant_id AND "subjectEmail" = f AND "liftedAt" IS NULL;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  INSERT INTO processing_restrictions
    (id, "tenantId", "subjectEmail", "blocksMarketing", "dsarRequestIds", "createdById", "updatedAt")
  VALUES (gen_random_uuid()::text, tenant_id, t, src."blocksMarketing", src."dsarRequestIds",
    src."createdById", now())
  ON CONFLICT ("tenantId", "subjectEmail") WHERE "liftedAt" IS NULL DO UPDATE SET
    "blocksMarketing" = processing_restrictions."blocksMarketing" OR EXCLUDED."blocksMarketing",
    "dsarRequestIds" = ARRAY(
      SELECT DISTINCT unnest(processing_restrictions."dsarRequestIds" || EXCLUDED."dsarRequestIds")
      ORDER BY 1
    ),
    "updatedAt" = now();
END $$;

CREATE OR REPLACE FUNCTION dsar_follow_subject_email() RETURNS TRIGGER
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.email IS NOT NULL AND NEW.email IS NOT NULL
     AND dsar_normalise_email(OLD.email) <> dsar_normalise_email(NEW.email)
     AND NEW.email IS DISTINCT FROM ('erased-' || NEW.id || '@erased.invalid') THEN
    PERFORM dsar_carry_restriction(NEW."tenantId", OLD.email, NEW.email);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS "leads_dsar_follow_email" ON "leads";
CREATE TRIGGER "leads_dsar_follow_email" AFTER UPDATE OF "email" ON "leads"
  FOR EACH ROW EXECUTE FUNCTION dsar_follow_subject_email();

DROP TRIGGER IF EXISTS "contacts_dsar_follow_email" ON "contacts";
CREATE TRIGGER "contacts_dsar_follow_email" AFTER UPDATE OF "email" ON "contacts"
  FOR EACH ROW EXECUTE FUNCTION dsar_follow_subject_email();

-- ── Only the owner may call these (SQL review: SECURITY DEFINER + PUBLIC EXECUTE) ───────────────
-- PUBLIC can execute a new function by default, and Supabase exposes public-schema functions to
-- the anon/authenticated API roles. The app connects as the owner and the triggers run as the
-- owner (SECURITY DEFINER above), so nothing else needs them.
REVOKE ALL ON FUNCTION dsar_lead_is_erased(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_contact_is_erased(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_refuse_erased_lead_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_refuse_erased_contact_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_refuse_erased_entity_insight() FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_subject_lock(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_carry_restriction(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_follow_subject_email() FROM PUBLIC;
REVOKE ALL ON FUNCTION dsar_keep_erased() FROM PUBLIC;
-- The Supabase API roles exist only on Supabase; elsewhere (local, CI) there is nothing to revoke.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION
      dsar_lead_is_erased(TEXT), dsar_contact_is_erased(TEXT),
      dsar_refuse_erased_lead_write(), dsar_refuse_erased_contact_write(),
      dsar_refuse_erased_entity_insight(), dsar_subject_lock(TEXT, TEXT),
      dsar_carry_restriction(TEXT, TEXT, TEXT), dsar_follow_subject_email(),
      dsar_keep_erased()
    FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION
      dsar_lead_is_erased(TEXT), dsar_contact_is_erased(TEXT),
      dsar_refuse_erased_lead_write(), dsar_refuse_erased_contact_write(),
      dsar_refuse_erased_entity_insight(), dsar_subject_lock(TEXT, TEXT),
      dsar_carry_restriction(TEXT, TEXT, TEXT), dsar_follow_subject_email(),
      dsar_keep_erased()
    FROM authenticated;
  END IF;
END $$;
