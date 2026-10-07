-- Ticket automation rules share routing_rules with lead routing rules, so the table needs a
-- discriminator. Class A (additive, ADR-069): one new enum and one new defaulted column.
-- Every existing row becomes 'LEAD', which is correct: the ticket UI could never create a
-- valid rule (the lead schema rejected its vocabulary) and the ticket engine never read one.
-- ADD COLUMN with a constant DEFAULT is metadata-only on PostgreSQL 11+ (no table rewrite,
-- no long-held lock). No existing data is deleted or rewritten; no index or constraint is
-- added, dropped or changed (routing_rules_tenantId_name_key stays).

-- CreateEnum
CREATE TYPE "RoutingRuleType" AS ENUM ('LEAD', 'TICKET');

-- AlterTable
ALTER TABLE "routing_rules" ADD COLUMN "ruleType" "RoutingRuleType" NOT NULL DEFAULT 'LEAD';
