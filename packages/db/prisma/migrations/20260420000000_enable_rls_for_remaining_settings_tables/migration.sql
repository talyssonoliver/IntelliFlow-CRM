-- Enable Row-Level Security for settings tables that were added without RLS.
-- These 14 tenant-scoped tables were created across PG-18x settings migrations
-- (contact/deal/ticket settings) but missed the ALTER TABLE ... ENABLE RLS
-- statement; RLS enforcement is mandatory for every tenantId-scoped public
-- table. Surfaced by packages/db/src/__tests__/rls-migrations.test.ts.

-- Contact settings (PG-182)
ALTER TABLE "contact_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_duplicate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_required_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_tags" ENABLE ROW LEVEL SECURITY;

-- Deal settings (PG-184)
ALTER TABLE "deal_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_duplicate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_required_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_scoring_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "deal_win_loss_reasons" ENABLE ROW LEVEL SECURITY;

-- Ticket settings (PG-185)
ALTER TABLE "ticket_automation_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_duplicate_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_required_fields" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ticket_tags" ENABLE ROW LEVEL SECURITY;
