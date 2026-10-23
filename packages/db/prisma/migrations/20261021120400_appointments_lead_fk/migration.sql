-- PG-203: appointments."leadId" → leads, tenant-safe (ADR-083).
--
-- Class A (ADR-069): the composite FK (tenantId, leadId) → leads(tenantId, id) means an appointment can only
-- point at a lead of its own tenant. It uses the leads_tenantId_id_key index built CONCURRENTLY by
-- 20261021120300. Added NOT VALID here (no scan; a brief SHARE ROW EXCLUSIVE lock on both tables, whose
-- wait is bounded by lock_timeout) and VALIDATEd in 20261021120500 under SHARE UPDATE EXCLUSIVE, which
-- does not block writes. Every appointments row holds NULL in "leadId", so validation cannot fail.
-- ON DELETE SET NULL ("leadId") (PostgreSQL 15+ column list) clears only the link, never the appointment's
-- NOT NULL "tenantId".
--
-- Recovery plan: forward-only; the constraint can be dropped with no data effect. Production applies only
-- through the gated `prisma migrate deploy` workflow, before the API ships.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "appointments" ADD CONSTRAINT "appointments_tenantId_leadId_fkey"
    FOREIGN KEY ("tenantId", "leadId") REFERENCES "leads"("tenantId", "id")
    ON DELETE SET NULL ("leadId") ON UPDATE CASCADE NOT VALID;
