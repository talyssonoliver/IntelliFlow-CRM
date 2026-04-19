-- PG-186 Document Settings Hardening — CHECK constraints + AI-default
-- restatements per docs/planning/module-settings-playbook.md §4, §7.

-- Tag colorToken CHECK constraint (18 allowlist tokens — matches
-- packages/validators/src/document-settings.ts DOCUMENT_TAG_COLOR_TOKENS).
ALTER TABLE "document_tags"
    ADD CONSTRAINT "document_tags_colorToken_check"
    CHECK ("colorToken" IN (
        'slate','red','orange','amber','yellow','lime','green','emerald','teal',
        'cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'
    ));

-- Restate AI defaults FALSE — explicitly (playbook §7: even no-op
-- restatements keep migration history self-documenting).
ALTER TABLE "document_automation_settings"
    ALTER COLUMN "autoVersionOnCollision" SET DEFAULT false,
    ALTER COLUMN "autoDetectDuplicates" SET DEFAULT false,
    ALTER COLUMN "autoExtractText" SET DEFAULT false,
    ALTER COLUMN "autoClassifyCategory" SET DEFAULT false,
    ALTER COLUMN "autoDetectPii" SET DEFAULT false,
    ALTER COLUMN "aiTagSuggestions" SET DEFAULT false,
    ALTER COLUMN "aiInsightGeneration" SET DEFAULT false;
