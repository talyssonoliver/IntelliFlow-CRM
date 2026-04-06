-- Backfill inconsistent breached tickets that have no due timestamps.
-- Prefer existing breach timestamp for deterministic elapsed-time rendering.
UPDATE "tickets" AS t
SET "slaResolutionDue" = COALESCE(
  t."slaBreachedAt",
  t."createdAt"
    + (
      CASE t."priority"
        WHEN 'CRITICAL' THEN p."criticalResolutionMinutes"
        WHEN 'HIGH' THEN p."highResolutionMinutes"
        WHEN 'MEDIUM' THEN p."mediumResolutionMinutes"
        ELSE p."lowResolutionMinutes"
      END
    ) * INTERVAL '1 minute'
)
FROM "sla_policies" AS p
WHERE t."slaPolicyId" = p."id"
  AND t."slaBreachedAt" IS NOT NULL
  AND t."slaResponseDue" IS NULL
  AND t."slaResolutionDue" IS NULL;

-- Ensure BREACHED status always has a breach timestamp.
UPDATE "tickets"
SET "slaBreachedAt" = COALESCE("slaBreachedAt", "slaResolutionDue", "slaResponseDue")
WHERE "slaStatus" = 'BREACHED'::"SLAStatus"
  AND "slaBreachedAt" IS NULL;

-- Prevent breached timestamps without any SLA deadline.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_sla_breach_requires_due_chk'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_sla_breach_requires_due_chk"
      CHECK (
        "slaBreachedAt" IS NULL
        OR "slaResponseDue" IS NOT NULL
        OR "slaResolutionDue" IS NOT NULL
      );
  END IF;
END $$;

-- Prevent BREACHED status without breach timestamp.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tickets_sla_status_breached_requires_timestamp_chk'
  ) THEN
    ALTER TABLE "tickets"
      ADD CONSTRAINT "tickets_sla_status_breached_requires_timestamp_chk"
      CHECK (
        "slaStatus" <> 'BREACHED'::"SLAStatus"
        OR "slaBreachedAt" IS NOT NULL
      );
  END IF;
END $$;
