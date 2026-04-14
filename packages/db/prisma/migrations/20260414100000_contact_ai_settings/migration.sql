-- PG-182 Contact AI Settings — adds AI & intelligence toggles to the
-- contact_automation_settings table.

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "aiDuplicateDetection" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "aiEnrichment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "aiTagSuggestions" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "aiInsightGeneration" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "contact_automation_settings"
    ADD COLUMN "aiAutoReplyDrafting" BOOLEAN NOT NULL DEFAULT false;
