-- MVP-012: the tenant currency defaults to GBP, the currency the whole app already shows.
--
-- Owner decision 22/11: the Report settings currency becomes the one tenant currency every money
-- figure is formatted in (no conversion: amounts are plain numbers in that currency). Until now the
-- setting did nothing and the row was created with a USD default nobody chose.
--
-- Class B (ADR-069 / docs/operations/agent-autonomy-policy.md): step 2 rewrites rows, so it needs one
-- escalation before production. Step 1 alone is Class A (a catalogue-only default change).
--   1. Column default USD -> GBP. New rows get GBP. No row is read or changed.
--   2. Rows still on the untouched default (currency USD and never updated since created) hold a
--      default, not a choice: set them to GBP. A row a person saved ("updatedAt" > "createdAt") is
--      left as it is. Measured 22/11 in production: 1 row, USD, never changed.
--
-- Recovery plan: forward-only. To undo step 2 for a tenant, the tenant (or an admin) picks USD again in
-- Analytics > Report settings. Reverting the default is another catalogue-only change.
-- Production applies only through the gated `prisma migrate deploy` workflow.

ALTER TABLE "report_settings" ALTER COLUMN "currency" SET DEFAULT 'GBP';

UPDATE "report_settings"
SET "currency" = 'GBP'
WHERE "currency" = 'USD'
  AND "updatedAt" <= "createdAt" + INTERVAL '1 second';
