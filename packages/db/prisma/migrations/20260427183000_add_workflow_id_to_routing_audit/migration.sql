-- IFC-032 — OpenTelemetry Monitoring: workflow correlation ID on routing_audits.
--
-- Adds an optional `workflowId` column + supporting index to the
-- `routing_audits` table. The column stores the workflow correlation UUID
-- emitted by LeadRoutingService.routeLead (ADR-017 §3 — "All workflow steps
-- emit OTel traces with route_id/workflow_id"). The same value is set as the
-- `workflow.id` attribute on the workflow.lead.route span so that operators
-- can pivot from a Tempo trace to the underlying RoutingAudit row in
-- Postgres.
--
-- This migration is PURELY ADDITIVE. The column is nullable with no default;
-- existing rows remain valid (workflowId IS NULL). No constraints are
-- changed; no data is rewritten.

-- Add workflowId column
ALTER TABLE "routing_audits" ADD COLUMN "workflowId" TEXT;

-- Index on workflowId (nullable column, sparse index in Postgres)
CREATE INDEX "routing_audits_workflowId_idx" ON "routing_audits"("workflowId");
