Plan: Fix Tenant.ts Bloat + Migration Rebaseline

Context

packages/db/generated/prisma/models/Tenant.ts is 59,369 lines / 4.02 MB because
the Tenant model has 109 reverse ModelName[] relation fields. Prisma generates
~1,248 types combinatorially (972 _Without_ variants). This slows TypeScript
compilation and editor performance — packages/db/tsconfig.json includes
generated/\*_/_.ts, so typecheck parses this file directly.

Pre-MVP with zero users — full DB reset is safe. 32 migration directories have
accumulated drift-fix and remediation migrations that should be squashed.

Approach: Add @ignore to all 109 reverse relation fields on Tenant. This keeps
FK constraints in the database (no split-brain), shrinks Tenant.ts to ~1,036
lines, and avoids the referential integrity loss of dropping FKs. Then
rebaseline migrations into a single clean migration. The @ignore approach
produces identical codegen reduction to dropping relations entirely (~1,036
lines either way) but preserves DB-level FK enforcement.

What @ignore on Tenant reverse fields changes in the generated client (verified
by local Prisma 7.4.2 testing):

- Tenant.ts: 59,369 -> ~1,036 lines (~58x reduction)
- 119 other model files also shrink (lose tenant relation surface)
- Child-side XxxCreateInput loses tenant: { connect } field (use tenantId:
  "...")
- Child-side XxxSelect/XxxInclude lose tenant field
- tenantId scalar field preserved on all models
- DB FK constraints preserved — Prisma still models child-side @relation
- Zero production code uses any of the lost APIs (confirmed search: 0 matches
  across apps/api, apps/ai-worker, apps/web, packages/adapters,
  packages/application)

---

Phase 1: Schema Changes

File: packages/db/prisma/schema.prisma (Tenant model, lines 20-161)

1a. Add @ignore to all 109 reverse relation fields on Tenant

Standard fields (108 of 109): users User[] @ignore leads Lead[] @ignore contacts
Contact[] @ignore

The one named-relation field: dealRenewals DealRenewal[]
@relation("DealRenewals") @ignore

@ignore goes AFTER @relation(...). The DealRenewal model's forward relation
tenant Tenant @relation("DealRenewals", ...) is NOT touched — Prisma still
validates the named relation resolves.

Verification: rg -c "@ignore" packages/db/prisma/schema.prisma should
return 109.

1b. Add missing @@index([tenantId]) to 2 models

Only 2 models truly lack a tenantId-leading index (ZepEpisodeUsage and
LeadAutomationSetting already have @unique/@@unique on tenantId which creates an
implicit B-tree index):

- CaseDocumentACL (~line 3812): add @@index([tenantId])
- CaseDocumentAudit (~line 3845): add @@index([tenantId])

---

Phase 2: Test Fixes (2 files, 4 occurrences)

These tests are compile-time type assertions that verify tenant: { connect }
exists on CreateInput. After @ignore, child-side CreateInput loses the tenant
field. Change to assert tenantId instead.

packages/db/src/**tests**/help-article-schema.test.ts

3 test cases (lines 39-44, 80-85, 111-116):

// BEFORE (line 39-44) it('should have tenant relation', () => { const \_input:
Partial<Prisma.HelpArticleCreateInput> = { tenant: { connect: { id:
'test-tenant' } }, }; expect(\_input.tenant).toBeDefined(); });

// AFTER — switch to UncheckedCreateInput + tenantId scalar it('should have
tenantId field', () => { const \_input:
Partial<Prisma.HelpArticleUncheckedCreateInput> = { tenantId: 'test-tenant', };
expect(\_input.tenantId).toBeDefined(); });

Same pattern for ArticleSection (line 80) and ArticleFeedback (line 111).

packages/db/src/**tests**/ai-output-review-schema.test.ts

1 test case (lines 45-51):

// BEFORE const \_input: Partial<ReviewCreateInput> = { tenant: { connect: { id:
'test' } }, };

// AFTER — change ReviewCreateInput type alias at line 19 to Unchecked variant
type ReviewCreateInput = Prisma.AIOutputReviewUncheckedCreateInput; // Then:
const \_input: Partial<ReviewCreateInput> = { tenantId: 'test', };
expect(\_input.tenantId).toBeDefined();

---

Phase 3: Migration Rebaseline

3a. Archive and delete all existing migrations

Archive the old migration set (git history preserves them, but explicit archive
is safer). All commands run via the Bash tool (Git Bash on Windows):

# Archive timestamped migration dirs and loose SQL files

mkdir -p packages/db/prisma/\_archived_migrations for d in
packages/db/prisma/migrations/202*/; do mv "$d"
packages/db/prisma/\_archived_migrations/; done mv
packages/db/prisma/migrations/*.sql packages/db/prisma/\_archived_migrations/

Then remove the archived directory from git tracking (add to .gitignore or
delete after confirming the baseline works). Keep migration_lock.toml in
migrations/ (contains provider = "postgresql", no change needed).

Files being archived:

- All 32 timestamped migration directories
- All 7 loose SQL files: add_multi_tenancy_manual.sql, add-multi-tenancy.sql,
  add-multi-tenancy-diff.sql, case.sql, case-document.sql, tenant-rls.sql,
  zep-episode-tracking.sql

3b. Generate baseline DDL from schema

cd packages/db mkdir -p prisma/migrations/20260317000000_baseline npx prisma
migrate diff \
 --from-empty \
 --to-schema prisma/schema.prisma \
 --script > prisma/migrations/20260317000000_baseline/migration.sql

migrate diff --from-empty --to-schema generates a SQL script representing the
full schema from scratch — no shadow database needed, no drift prompts. This is
Prisma's recommended workflow for baselining/squashing migrations (see:
https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining). The output
contains all CREATE TYPE, CREATE TABLE, CREATE INDEX, ADD CONSTRAINT statements.

The extensions = [vector] + previewFeatures = ["postgresqlExtensions"] should
auto-generate CREATE EXTENSION "vector" — verify in the output.

3c. Edit the generated migration.sql — prepend + append custom SQL

PREPEND (before first Prisma-generated statement):

-- Supabase schema permissions (not generated by Prisma) DROP SCHEMA IF EXISTS
public CASCADE; CREATE SCHEMA public; GRANT USAGE ON SCHEMA public TO postgres,
anon, authenticated, service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN
SCHEMA public GRANT ALL ON TABLES TO postgres, anon, authenticated,
service_role; ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT
ALL ON ROUTINES TO postgres, anon, authenticated, service_role; ALTER DEFAULT
PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO
postgres, anon, authenticated, service_role; CREATE EXTENSION IF NOT EXISTS
"uuid-ossp" WITH SCHEMA "extensions";

Check if Prisma already generated CREATE EXTENSION "vector". If not, add it here
too.

APPEND (after all Prisma-generated DDL):

1.  RLS function + policies — consolidated from THREE sources into unified
    get_current_tenant_id() pattern:

CREATE OR REPLACE FUNCTION get_current_tenant_id() RETURNS TEXT AS $$ BEGIN
RETURN current_setting('app.current_tenant_id', true); END;

$$
LANGUAGE plpgsql SECURITY DEFINER;

 1. Source A — tenant-rls.sql (7 core CRM tables — CRITICAL, must not be dropped):
  - leads, contacts, accounts, opportunities, tasks, appointments, audit_logs
  - Original policies used request.jwt.claims — rewrite to get_current_tenant_id()
  - These tables are NOT in 20260203120000 — they only exist in tenant-rls.sql

 Source B — 20260203120000_enable_rls_policies (57 tables):
  - The migration contains 57 ALTER TABLE ... ENABLE ROW LEVEL SECURITY + 57
CREATE POLICY tenant_isolation_* statements
  - Tables: lead_activities, lead_files, lead_ai_insights, ai_scores,
contact_activities, contact_ai_insights, deal_products, deal_files,
activity_events, agent_actions, sla_notifications, ticket_attachments,
ticket_next_steps, related_tickets, ticket_ai_insights, sla_breaches,
escalation_history, routing_audits, sla_policies, message_records,
tool_call_records, appointment_attendees, appointment_cases, documents,
document_access_logs, document_shares, pipeline_snapshots, traffic_sources,
growth_metrics, deals_won_metrics, sales_performance, team_messages,
email_templates, email_records, email_attachments, chat_conversations,
chat_messages, call_records, workflow_definitions, workflow_executions,
business_rules, business_rule_executions, routing_rules, ticket_categories,
webhook_endpoints, webhook_deliveries, api_keys, api_usage_records,
dashboard_configs, report_definitions, report_schedules, report_executions,
feedback_surveys, account_health_scores, agent_skills, agent_availability,
ai_insights (+ 10 more — verify exact list from the migration file)
  - Already use get_current_tenant_id() — port as-is

 Source C — case.sql (2 tables):
  - cases, case_tasks
  - Original policies used auth.uid() — rewrite to get_current_tenant_id()

 Source D — case-document.sql (3 tables) — REQUIRES UUID-to-TEXT REWRITE:
  - case_documents, case_document_acl, case_document_audit
  - Original SQL uses UUID types throughout: tenant_id UUID (case-document.sql:14),
document_id UUID / user_id UUID (case-document.sql:103), ::uuid casts in
RLS policies (case-document.sql:313), UUID function params (case-document.sql:421)
  - Current Prisma schema uses String/CUID with @map("tenant_id"):
schema.prisma:3721, schema.prisma:3789, schema.prisma:3818
  - All case-document custom SQL must be rewritten:
      - RLS policies: drop ::uuid casts → "tenant_id" = get_current_tenant_id()
    - Function params: p_document_id UUID → p_document_id TEXT,
p_user_id UUID → p_user_id TEXT
    - Function return types with UUID columns → TEXT
    - Audit trigger: NEW.id is TEXT (CUID) — no UUID cast needed
    - All uuid_generate_v4() calls removed (Prisma uses cuid() for IDs)

 Total: 69 tables with RLS in baseline (7 + 57 + 2 + 3)
2. CHECK constraints:
  - tickets_sla_breach_requires_due_chk (from 20260212000000)
  - tickets_sla_status_breached_requires_timestamp_chk (from 20260212000000)
  - feedback_surveys_score_range (from 20260221180000)
  - feedback_surveys_rating_range (from 20260221180000)
3. Custom PL/pgSQL functions (from case.sql):
  - get_case_statistics()
  - get_upcoming_deadline_cases()
  - get_case_task_progress()
4. Custom PL/pgSQL functions (from case-document.sql):
  - audit_case_document_changes()
  - audit_case_document_acl_changes()
  - get_document_version_history()
  - user_has_document_access()
5. Audit triggers (from case-document.sql):
  - trg_audit_case_documents on case_documents
  - trg_audit_case_document_acl on case_document_acl

 DO NOT include:
- update_updated_at_column() function — was never defined in any migration
- update_cases_updated_at / update_case_tasks_updated_at triggers — they called
the undefined function; Prisma @updatedAt handles this at ORM level
- Data migration UPDATEs, INSERTs, DELETEs — empty DB, no data to migrate
- Enum rename dances — start with final enum names
- Column renames — start with final column names
- tenant-rls.sql OLD POLICY SYNTAX using request.jwt.claims — the 7 tables it
covers (leads, contacts, accounts, etc.) MUST still get RLS, rewritten to use
get_current_tenant_id() (see Section 1 above)

 3d. Verify unique indexes

 Cross-reference the generated migration against these business-logic unique indexes that
must exist (Prisma generates them if @@unique is in the schema — verify they're present):
- contacts_tenantId_email_key
- ticket_categories_tenantId_name_key
- webhook_endpoints_tenantId_name_key
- report_definitions_tenantId_name_key
- routing_rules_tenantId_name_key
- business_rules_tenantId_name_key
- workflow_definitions_tenantId_name_key
- email_templates_tenantId_name_key
- sla_policies_tenantId_name_key
- dashboard_configs_tenantId_name_key

 If any are missing from the Prisma-generated DDL, the @@unique directive is missing from
schema.prisma and must be added there (not manually in SQL).

 ---
Phase 4: Verification (exact order)

 All commands run from packages/db/ unless noted. Using Bash tool (Git Bash):

 # 1. Schema syntax
npx prisma validate

 # 2. Regenerate client
npx prisma generate

 # 3. Verify Tenant.ts shrunk (~1,036 lines, not 59K)
wc -l generated/prisma/models/Tenant.ts

 # 4. Verify RLS in baseline — both ENABLE and POLICY counts must be 69
rg -c "ENABLE ROW LEVEL SECURITY" prisma/migrations/20260317000000_baseline/migration.sql
rg -c "CREATE POLICY" prisma/migrations/20260317000000_baseline/migration.sql
# Also verify key tables are present (the 7 from tenant-rls.sql that were previously missed):
rg "ENABLE ROW LEVEL SECURITY" prisma/migrations/20260317000000_baseline/migration.sql \
  | rg -c '"(leads|contacts|accounts|opportunities|tasks|appointments|audit_logs)"'

 # 5. TypeScript (db package first, then full workspace from repo root)
pnpm --filter @intelliflow/db typecheck
cd ../.. && pnpm typecheck

 # 6. Tests (db package — verify 4 fixed tests)
pnpm --filter @intelliflow/db test

 # 7. Lint
pnpm lint

 # 8. Build (db package first, then full workspace)
pnpm --filter @intelliflow/db build
pnpm build

 # 9. Apply baseline to DB
cd packages/db
# For a fresh/empty DB — deploy applies unapplied migrations and records them:
npx prisma migrate deploy
# For an existing DB with old data — reset drops everything first, then applies + seeds:
# npx prisma migrate reset --force
# (migrate reset --force runs: drop DB → apply all migrations → run seed automatically)

 # 10. Seed (only needed after migrate deploy; migrate reset runs seed automatically)
npx prisma db seed

 ---
Out of Scope (follow-up items)

 - RLS coverage gaps: The baseline consolidates 69 tables with RLS (porting all 4
sources). 42/111 tenant-scoped models still lack RLS coverage (including User,
Session, Ticket, Notification, ChainVersion, HelpArticle, LeadStageConfig). Expanding
RLS to all tenant-scoped models is a separate task.
- User-level RLS: The old tenant-rls.sql and case.sql had user-based policies
(request.jwt.claims, auth.uid()) that provided row-level access control beyond
tenant isolation. The baseline replaces these with tenant-only isolation via
get_current_tenant_id(). If user-level RLS is needed (e.g., sales reps only see
their own leads), that's a separate design decision.
- CONCURRENTLY indexes: 8 indexes from 20260205000000 were CREATE INDEX CONCURRENTLY. Prisma generates them as plain CREATE INDEX in a transaction.
 If
production migration later needs CONCURRENTLY, create a separate migration.

 ---
Critical Files

 ┌───────────────────────────────────────────────────────────────────────────────────────────┬───────────────────────────────────────────────────┐
│                                           File                                            │                      Action                       │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/schema.prisma                                                          │ Add @ignore to 109 fields, add 2 @@index          │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/src/__tests__/help-article-schema.test.ts                                     │ Fix 3 tests                                       │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/src/__tests__/ai-output-review-schema.test.ts                                 │ Fix 1 test                                        │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/migrations/                                                            │ Archive all 32 dirs + 7 loose SQL to              │
│                                                                                           │ _archived_migrations/                             │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/migrations/YYYYMMDD_baseline/migration.sql                             │ Create: auto-gen DDL + custom SQL                 │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/migrations/20260203120000_enable_rls_policies/migration.sql            │ Reference: RLS to port                            │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/migrations/20260212000000_enforce_ticket_sla_integrity/migration.sql   │ Reference: CHECK constraints                      │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ packages/db/prisma/migrations/20260221180000_ifc068_feedback_survey_indexes/migration.sql │ Reference: CHECK constraints                      │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ Loose tenant-rls.sql                                                                      │ Reference: RLS for 7 core CRM tables (MUST port)  │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ Loose case.sql                                                                            │ Reference: 3 functions to port                    │
├───────────────────────────────────────────────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ Loose case-document.sql                                                                   │ Reference: functions, triggers, RLS to port       │
└───────────────────────────────────────────────────────────────────────────────────────────┴───────────────────────────────────────────────────┘

 ---
Risk Checklist

 ┌───────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│           Risk            │                                                    Mitigation                                                    │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ @ignore on named relation │ @ignore goes after @relation(...). Child-side relation not touched. Verify with prisma validate.                 │
│  "DealRenewals"           │                                                                                                                  │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Generated migration       │ Cross-reference 10 business-logic unique indexes against @@unique in schema. Fix in schema, not SQL.             │
│ missing unique indexes    │                                                                                                                  │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ migrate diff needs schema │ migrate diff --from-empty --to-schema reads the schema file only — no DB connection needed for DDL generation.   │
│  access                   │ DB connection needed only at step 9 (migrate deploy).                                                            │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ More tests affected than  │ Run pnpm test across full workspace after generate. rg "tenant:\s*\{" --type ts to find any remaining.           │
│ identified                │                                                                                                                  │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ RLS dropped from core     │ Baseline must include ALL 69 tables. Verify: ENABLE ROW LEVEL SECURITY count = 69, CREATE POLICY count = 69, and │
│ tables                    │  the 7 core CRM tables (leads, contacts, accounts, opportunities, tasks, appointments, audit_logs) are           │
│                           │ explicitly present.                                                                                              │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Seed uses tenant relation │ Verified: seed uses prisma.tenant.create() and tenantId: "..." only. No tenant: { connect }.                     │
│  API                      │                                                                                                                  │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ case-document custom SQL  │ Prisma schema uses String/CUID (schema.prisma:3720-3721). ALL custom SQL (RLS, functions, triggers) must be      │
│ uses UUID types           │ rewritten: drop ::uuid casts, change function params from UUID to TEXT, remove uuid_generate_v4(). See Phase 3c  │
│                           │ Source D for details.                                                                                            │
└───────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
$$
