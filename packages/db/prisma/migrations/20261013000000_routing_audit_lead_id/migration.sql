-- RoutingAudit.ticketId is the only identifier column, and lead-routing audits
-- write the LEAD id into it (LeadRoutingService.routeLead, routing.router's
-- assignLead), mixed in with the real ticket ids TicketRoutingService writes.
-- One indexed column now means two different kinds of id (#770).
--
-- Class A (additive, ADR-069): one new nullable column, no backfill, no
-- existing row touched, no index/constraint dropped or changed. ticketId keeps
-- its current meaning and every existing row is left exactly as it is.
-- Lead-routing writers now also set leadId, so new rows carry their own kind
-- unambiguously; readers can prefer it over the old ticketId/details heuristic.
-- tools/scripts/backfill-routing-audit-lead-id.ts prepares the backfill for
-- pre-existing lead-routing rows (Class B — run only after the owner approves
-- the production mutation; this migration does not run it).
-- ADD COLUMN with no DEFAULT, nullable, is metadata-only on PostgreSQL 11+.

-- AlterTable
ALTER TABLE "routing_audits" ADD COLUMN "leadId" TEXT;

-- CreateIndex
CREATE INDEX "routing_audits_leadId_idx" ON "routing_audits"("leadId");
