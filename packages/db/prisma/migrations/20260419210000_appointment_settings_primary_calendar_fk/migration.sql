-- PG-189 follow-up: add FK from appointment_settings.primaryCalendarId → calendars.id.
-- Additive only. Existing rows with NULL primaryCalendarId are unaffected;
-- existing rows with non-null values must point to valid calendars (seeded
-- installs have none at this point).

CREATE INDEX IF NOT EXISTS "appointment_settings_primaryCalendarId_idx"
    ON "appointment_settings"("primaryCalendarId");

ALTER TABLE "appointment_settings"
    ADD CONSTRAINT "appointment_settings_primaryCalendarId_fkey"
    FOREIGN KEY ("primaryCalendarId") REFERENCES "calendars"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
