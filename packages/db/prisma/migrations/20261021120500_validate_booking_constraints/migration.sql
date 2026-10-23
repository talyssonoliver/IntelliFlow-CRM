-- PG-203: validate the NOT VALID constraints added by 20261021120100 and 20261021120400 (ADR-083).
--
-- Class A (ADR-069): VALIDATE CONSTRAINT takes only SHARE UPDATE EXCLUSIVE on the table (and ROW SHARE on
-- a referenced table), so reads and writes on "tenants", "appointments" and "leads" keep flowing while it
-- scans. It runs in its own migration (its own transaction) so it never scans while holding the ACCESS
-- EXCLUSIVE lock of an ADD COLUMN or the SHARE ROW EXCLUSIVE lock of an ADD FOREIGN KEY (independent SQL
-- review, PG-203). Every checked column is NULL on every existing row, so no validation can fail.
-- lock_timeout bounds how long each statement waits to acquire its lock.
--
-- Recovery plan: forward-only. If a VALIDATE is interrupted the constraint simply stays NOT VALID (still
-- enforced for new rows); re-running this migration finishes it. No data is changed.
SET LOCAL lock_timeout = '5s';

ALTER TABLE "tenants" VALIDATE CONSTRAINT "tenants_bookingHandle_check";
ALTER TABLE "tenants" VALIDATE CONSTRAINT "tenants_bookingPrivacyUrl_check";
ALTER TABLE "appointments" VALIDATE CONSTRAINT "appointments_bookedVia_check";
ALTER TABLE "appointments" VALIDATE CONSTRAINT "appointments_bookingAnswers_check";
ALTER TABLE "appointments" VALIDATE CONSTRAINT "appointments_tenantId_eventTypeId_fkey";
ALTER TABLE "appointments" VALIDATE CONSTRAINT "appointments_tenantId_leadId_fkey";
