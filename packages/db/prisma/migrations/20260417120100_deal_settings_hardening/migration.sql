-- PG-184 Deal Settings Hardening — CHECK constraints + AI-default restatements
-- per docs/planning/module-settings-playbook.md §4, §7.

-- Tag colorToken CHECK constraint (18 allowlist tokens, matching
-- packages/validators/src/contact-settings.ts TAG_COLOR_TOKENS).
ALTER TABLE "deal_tags"
    ADD CONSTRAINT "deal_tags_colorToken_check"
    CHECK ("colorToken" IN (
        'slate','red','orange','amber','yellow','lime','green','emerald','teal',
        'cyan','sky','blue','indigo','violet','purple','fuchsia','pink','rose'
    ));

-- Win/loss category CHECK constraint.
ALTER TABLE "deal_win_loss_reasons"
    ADD CONSTRAINT "deal_win_loss_reasons_category_check"
    CHECK ("category" IN ('WON','LOST'));

-- Restate AI defaults FALSE — explicitly (playbook §7: even no-op
-- restatements keep migration history self-documenting).
ALTER TABLE "deal_automation_settings"
    ALTER COLUMN "aiDuplicateDetection" SET DEFAULT false,
    ALTER COLUMN "aiDealScoring" SET DEFAULT false,
    ALTER COLUMN "aiNextStepRecommendation" SET DEFAULT false,
    ALTER COLUMN "aiTagSuggestions" SET DEFAULT false,
    ALTER COLUMN "aiInsightGeneration" SET DEFAULT false,
    ALTER COLUMN "aiWinLossPrediction" SET DEFAULT false;
