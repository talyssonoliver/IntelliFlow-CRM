-- RACE-BOOKI-01/02: prevent appointment double-booking at the database level.
--
-- No two NON-cancelled appointments for the same (tenant, organizer) may have
-- overlapping [startTime, endTime) windows. This is the authoritative guarantee
-- under concurrency — application-layer conflict checks are read-check-write and
-- race (two requests both read "no conflict" then both insert).
--
-- EXCLUDE constraints are not expressible in schema.prisma, so this lives in raw
-- migration SQL. Apply via `prisma migrate deploy` (NOT `db push`, which ignores
-- it — db-push provisioned databases must run this file via `prisma db execute`).
--
-- Range semantics: tsrange default bounds are '[)' (inclusive start, exclusive
-- end) so back-to-back appointments (end == next start) do NOT conflict, matching
-- the domain ConflictDetector (strict overlap). Columns are TIMESTAMP(3) WITHOUT
-- TIME ZONE => tsrange (not tstzrange).
--
-- NOTE: deploying to a database that already contains overlapping rows will fail;
-- de-duplicate existing overlaps before applying in production.

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap_per_organizer"
  EXCLUDE USING gist (
    "tenantId" WITH =,
    "organizerId" WITH =,
    tsrange("startTime", "endTime") WITH &&
  )
  WHERE ("status" NOT IN ('CANCELLED', 'NO_SHOW'));
