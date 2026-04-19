-- PG-185 Ticket Settings Hardening — CHECK constraints + AI-default
-- restatements per docs/planning/module-settings-playbook.md §4, §7.

-- Tag colorToken CHECK constraint (18 allowlist tokens — matches
-- packages/validators/src/contact-settings.ts TAG_COLOR_TOKENS; re-used
-- by deal_tags hardening too).
ALTER TABLE "ticket_tags"
    ADD CONSTRAINT "ticket_tags_colorToken_check"
    CHECK ("colorToken" IN (
        'slate','red','orange','amber','yellow','lime','green','emerald','teal',
        'cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'
    ));

-- autoCloseIdleDays bounds (0..365). 0 disables auto-close; >365 would
-- signal a misconfigured policy.
ALTER TABLE "ticket_automation_settings"
    ADD CONSTRAINT "ticket_automation_settings_autoCloseIdleDays_check"
    CHECK ("autoCloseIdleDays" >= 0 AND "autoCloseIdleDays" <= 365);

-- Restate AI defaults FALSE — explicitly (playbook §7: even no-op
-- restatements keep migration history self-documenting).
ALTER TABLE "ticket_automation_settings"
    ALTER COLUMN "aiDuplicateDetection" SET DEFAULT false,
    ALTER COLUMN "aiAutoCategorization" SET DEFAULT false,
    ALTER COLUMN "aiSentimentAnalysis" SET DEFAULT false,
    ALTER COLUMN "aiNextStepRecommendation" SET DEFAULT false,
    ALTER COLUMN "aiTagSuggestions" SET DEFAULT false,
    ALTER COLUMN "aiInsightGeneration" SET DEFAULT false;
