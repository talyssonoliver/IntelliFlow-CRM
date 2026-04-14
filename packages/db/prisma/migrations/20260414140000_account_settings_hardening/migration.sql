-- PG-183 audit hardening:
--   1. CHECK constraint on account_tags.colorToken to match the Zod allowlist.
--   2. Flip AI defaults OFF so new tenants start in an opt-in stance for AI
--      features on the Accounts module.
--   Existing tenants keep their explicitly-saved values.

-- 1. colorToken CHECK
ALTER TABLE "account_tags"
    ADD CONSTRAINT "account_tags_colorToken_check"
    CHECK ("colorToken" IN (
        'slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green',
        'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet',
        'purple', 'fuchsia', 'pink', 'rose'
    ));

-- 2. AI defaults — opt-in stance for new tenants.
ALTER TABLE "account_automation_settings"
    ALTER COLUMN "aiIndustryInference" SET DEFAULT false;

ALTER TABLE "account_automation_settings"
    ALTER COLUMN "aiTagSuggestions" SET DEFAULT false;

ALTER TABLE "account_automation_settings"
    ALTER COLUMN "aiInsightGeneration" SET DEFAULT false;
