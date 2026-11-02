-- PG-203: LeadSource gains BOOKING for leads created by the public booking page (ADR-083).
--
-- Class A (ADR-069 / docs/operations/agent-autonomy-policy.md): one new enum value, no change to any
-- existing row. It is the only statement in this migration because a value added by ALTER TYPE cannot be
-- used until its transaction commits (55P04); 20261021120100_event_types uses it as a DEFAULT and in a
-- CHECK. Precedent: 20260930000000_tenant_quotas_usage.
--
-- Recovery plan: forward-only. An enum value cannot be dropped in place; leaving it unused is harmless.
-- Production applies only through the gated `prisma migrate deploy` workflow, before the API ships.
ALTER TYPE "LeadSource" ADD VALUE IF NOT EXISTS 'BOOKING';
