-- PG-182 audit F4 follow-through: the 20260414120000_contact_settings_hardening
-- migration flipped defaults for aiDuplicateDetection, aiTagSuggestions,
-- aiInsightGeneration. The other two AI columns (aiEnrichment, aiAutoReplyDrafting)
-- were already `false` when they were added in 20260414100000_contact_ai_settings.
--
-- Restating them here as a no-op keeps the migration history a verbatim
-- match for the Prisma schema's "all five AI defaults are opt-in" contract
-- so a future reader / drift check sees one file per default.

ALTER TABLE "contact_automation_settings"
    ALTER COLUMN "aiEnrichment" SET DEFAULT false;

ALTER TABLE "contact_automation_settings"
    ALTER COLUMN "aiAutoReplyDrafting" SET DEFAULT false;
