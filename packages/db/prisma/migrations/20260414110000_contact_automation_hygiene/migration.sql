-- PG-182 Contact Automation data-hygiene toggles.

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "normalizePhoneNumbers" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "autoCapitalizeNames" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "preventDeleteWithOpenDeals" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "notifyOnOwnerChange" BOOLEAN NOT NULL DEFAULT false;
