-- IFC-314: enable Row Level Security on the portal-delivery tables.
-- Matches the repo-wide RLS-coverage contract (every public table must ENABLE
-- RLS; the TEST-RLS migration test enforces it). The CRM connects with a
-- privileged role that bypasses RLS, so ENABLE-only is the established pattern
-- (mirrors e.g. tenant_goal_default). Both tables are tenant-scoped via tenantId.

ALTER TABLE "setup_instalments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stripe_subscriptions" ENABLE ROW LEVEL SECURITY;
