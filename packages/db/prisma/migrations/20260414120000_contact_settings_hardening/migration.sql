-- PG-182 audit hardening:
--   1. CHECK constraint on contact_tags.colorToken to match the Zod allowlist.
--   2. Flip AI defaults OFF so new tenants start in an opt-in stance.
--   Existing tenants keep their explicitly-saved values.

-- 1. colorToken CHECK
ALTER TABLE "contact_tags"
    ADD CONSTRAINT "contact_tags_colorToken_check"
    CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
        'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
        'purple', 'fuchsia', 'pink', 'rose'
    ));

-- 2. AI defaults — opt-in stance.
ALTER TABLE "contact_automation_settings"
    ALTER COLUMN "aiDuplicateDetection" SET DEFAULT false;

ALTER TABLE "contact_automation_settings"
    ALTER COLUMN "aiTagSuggestions" SET DEFAULT false;

ALTER TABLE "contact_automation_settings"
    ALTER COLUMN "aiInsightGeneration" SET DEFAULT false;
