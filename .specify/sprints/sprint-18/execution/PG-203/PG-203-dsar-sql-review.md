VERDICT: APPROVED WITH NOTES

Independent read-only SQL review (ADR-069 Class A gate; PG-203 plan Step D3), 2026-10-29.
Reviewed: pg-203-dsar/packages/db/prisma/migrations/20261022120000_dsar_requests/migration.sql (403 lines),
schema.prisma:2601-2677, the repos that call the SQL functions, tests/integration/dsar.test.ts, the drift log.
No DB was contacted. Nothing was executed; findings are from static reading, so items marked (verify) need one psql check.
Paths below are relative to C:\Users\talys\projects\intelliFlow-CRM-worktrees\pg-203-dsar.

Summary: no must-fix. The migration is additive and forward-fixable; no existing row is read, updated, deleted or rewritten.
Two should-fix items (lock level of DROP TRIGGER IF EXISTS; AB/BA lock order between AI writes and erasure) and several notes.

1. Class A classification - holds, with a scope caveat. [note]
   - No UPDATE/DELETE/INSERT on existing tables, no NOT NULL on populated columns, no ALTER of existing columns,
     no rewrite. Both new tables are created empty, so plain CREATE INDEX is fine (migration.sql:112-119, 149-154).
   - SET LOCAL lock_timeout = '5s' (line 34) is effective only because Prisma sends the file as one multi-statement
     simple query (implicit transaction). Same pattern as 20261021120100_event_types:24. Do not add BEGIN/COMMIT.
   - Scope drift: spec D-AC-01 (PG-203-spec.md:915) and plan D3 describe "two tables". The file now also adds 8 triggers
     on 6 existing tables (ai_scores, lead_ai_insights, contact_ai_insights, ai_insights, leads, contacts) and 9 functions.
     These are behaviour-changing on the write path (they can RAISE). They are inert today (no erased rows, no active
     restrictions exist), which keeps them Class A, but spec/plan text and attestation must say "tables + triggers".
     Fix: update spec AC-024 / D-AC-01 wording and the gate-6 lock note (item 2) before the attestation cites this review.

2. DROP TRIGGER IF EXISTS takes ACCESS EXCLUSIVE on leads/contacts/ai_* even when nothing is dropped. [should-fix]
   migration.sql:245, 249, 253, 258, 279, 283, 360, 364. (verify with a psql test: `BEGIN; DROP TRIGGER IF EXISTS x ON leads;`
   then read pg_locks mode for leads.) CREATE TRIGGER alone needs only SHARE ROW EXCLUSIVE (blocks writes, not reads).
   The ACCESS EXCLUSIVE lock is then held to the end of the transaction (line 402). If a long SELECT or open transaction
   is on leads/contacts, this statement queues for up to 5s and every new read of leads/contacts queues behind it.
   lock_timeout then aborts the migration cleanly (safe, rerunnable), but the 5s read stall is the exact "meaningful
   locking" that ADR-069 gate 6 asks to rule out. Header lines 9-14 and the plan's gate-6 note do not mention it.
   Fix: delete all eight DROP TRIGGER IF EXISTS lines (a first-time migration needs no idempotency; the functions use
   CREATE OR REPLACE and the migration is non-rerunnable anyway because CREATE TYPE/TABLE are not guarded). Then state in
   the header: "CREATE TRIGGER takes SHARE ROW EXCLUSIVE on leads/contacts/ai_* for milliseconds, bounded by lock_timeout 5s;
   FK creation takes the same lock on tenants/users." Deploy in a low-traffic window.

3. Lock-order inversion: AI write vs erasure can deadlock (it is not only an insight UPDATE). [should-fix]
   - AI path: PrismaProcessingRestrictionRepository.status(tx) takes dsar_subject_lock FIRST
     (packages/adapters/src/repositories/PrismaProcessingRestrictionRepository.ts:49), then the INSERT into ai_scores etc.
     fires dsar_lead_is_erased -> SELECT ... FOR KEY SHARE on the lead row (migration.sql:201).
     Order: advisory(address) -> lead row.
   - Erasure: PrismaSubjectDataRepository.ts:56/59 locks lead/contact rows FOR UPDATE, then takes the advisory lock (line 776).
     Order: lead row -> advisory(address).
   - AB/BA. Postgres resolves it after deadlock_timeout (1s) by aborting one side (40P01). Both are rolled back and safe, but
     the erasure has no 40P01 retry (grep: 40P01 handling exists only in partner.router.ts and reply-draft.job.ts), so an
     admin may get a 500 on a rare click and must re-run. The header (lines 5-8) describes this only as "insight UPDATE".
     Fix (either): wrap erase() in a retry on SQLSTATE 40P01 (it re-reads status under FOR UPDATE, so retry is idempotent);
     or take the advisory lock before the row locks in erase() using the request's subjectEmail (the second selection at
     line ~772 already re-reads after the lock). Add a real-DB test that forces the interleaving.

4. RLS - correct and consistent. [note]
   migration.sql:166-181: ENABLE RLS on both tables; policy USING and WITH CHECK both
   "tenantId" = current_setting('app.current_tenant_id', true) (NULL when unset = deny). Same shape as event_types (lines 140-151).
   No FORCE ROW LEVEL SECURITY anywhere in migrations (grep: none), so the owner role bypasses, matching house style; the
   SECURITY DEFINER guards therefore read leads/contacts without a tenant context and do not fail open. If FORCE is ever
   added to leads/contacts, dsar_lead_is_erased (line 201) would see zero rows and silently allow writes: add a note near line 194.
   Test: dsar.test.ts:302-313 asserts policy text; the real session test (315+) disclosed-skips when no `authenticated`
   role exists, so a CI Postgres without that role proves nothing about isolation. Make CI create the role, or fail instead of skip.
   rls-tenant-isolation.test.ts does not cover the new tables (only dsar.test.ts does).

5. Constraints and indexes - sound. [note]
   - Hash columns CHAR(64) with ^[0-9a-f]{64}$ CHECKs (85-90); NULL-guarded CHECKs correctly handle the NULL-passes pitfall (94, 101-105).
   - Partial unique "processing_restrictions_active_key" (153-154) matches the ON CONFLICT ... WHERE "liftedAt" IS NULL inference in
     dsar_carry_restriction (340) and upsertActiveRestriction. The extra plain (tenantId, subjectEmail) index (150) is redundant for
     active lookups; harmless.
   - FKs: tenant CASCADE, users SET NULL, composite unique (tenantId, id) as house pattern.
   - Gaps (all note): dsarRequestIds TEXT[] has no FK/validation; lift_check does not require liftedById with liftedAt;
     tenant CASCADE (122, 157) deletes the compliance evidence of DSAR handling if a tenant is hard-deleted (Class C territory
     operationally; confirm tenant deletion is soft or procedure-gated).
   - subjectEmail persists in dsar_requests after erasure (needed as evidence, documented); confirm that is the stated retention basis.

6. Functions and privileges. [note, one should-fix-lite]
   - SECURITY DEFINER functions all pin search_path = public, pg_temp (198, 206, 214, 224, 234, 318, 350). Good. Note pg_temp last is correct.
   - dsar_normalise_email (306) is NOT in the REVOKE lists (372-402), and neither it nor dsar_subject_lock (311) pins search_path
     (both are INVOKER). dsar_normalise_email is pure so low risk, but it stays callable by anon/authenticated through PostgREST RPC.
     Fix: add both to the REVOKE lists, and `SET search_path = pg_catalog, pg_temp` on dsar_normalise_email (it only calls
     lower/regexp_replace). If revoked, confirm the app's connecting role owns them (coordinator verified: postgres owner).
   - dsar_normalise_email is marked IMMUTABLE but lower() is collation-dependent (STABLE in strictness terms). Harmless now (no index
     on it), but mark it STABLE or do not later build an expression index on it without COLLATE "C"/ICU pinning.
   - JS vs SQL normalisation can differ on exotic input: JS trim() strips NBSP/BOM/U+2028; PG '\s' in a UTF8 database may not strip
     NBSP; JS toLowerCase() vs PG lower() differ for locale-specific letters. A subject whose address contains those characters
     could match in the API but not in SQL (restriction missed). Add a test with NBSP-padded and mixed-case Unicode addresses, or
     normalise in the app and compare with the CHECK (btrim + lower) only.
   - service_role keeps EXECUTE on dsar_carry_restriction (SECURITY DEFINER, caller-supplied tenant). service_role is already
     all-powerful; acceptable. No test asserts has_function_privilege('anon'/'authenticated', ...) = false; add one.
   - dsar_keep_erased (268) is INVOKER and touches no table; fine. Trigger functions need EXECUTE only at CREATE TRIGGER time, so the revokes are safe.

7. Trigger cost and behaviour on hot tables. [note]
   - leads_/contacts_ dsar_keep_erased and dsar_follow_email use "UPDATE OF email". Postgres fires these whenever email is in the
     UPDATE's SET list, even if unchanged. PrismaLeadRepository.save writes the full row (see PrismaLeadRepository.ts ~100-140), so
     both triggers fire on essentially every lead/contact save. Cost per row: one plpgsql call plus a string concat and compare
     (keep_erased), or two regexp_replace calls (follow). Microseconds, no table access unless the address truly changes.
     Cheap win: add `WHEN (OLD.email IS DISTINCT FROM NEW.email)` to all four CREATE TRIGGERs (280, 284, 361, 365) so the function is
     not called at all on unchanged emails.
   - AI-write guards run FOR KEY SHARE on a lead/contact row per inserted AI row (201, 209). That dirties the lead heap page and
     uses multixacts under bulk scoring. They also fire on every UPDATE of ai_scores/insight rows (246-260), but erasure deletes those
     rows, so only INSERT and UPDATE OF "leadId"/"contactId"/"entityId"/"entityType" matter. Fix: `BEFORE INSERT OR UPDATE OF "leadId"`
     (and the contact/entity equivalents). Less row-locking, same guarantee.
   - FOR KEY SHARE conflicts with erasure's email rewrite only because email is in a unique index: leads_email_tenantId_key and
     contacts_tenantId_email_key exist (baseline migration.sql:2679, 2733), so that UPDATE takes a key-update lock. Correct.
   - Self-DoS edge: a tenant user who sets a lead's email to the exact string erased-<that lead's id>@erased.invalid freezes that
     lead's email and blocks its AI data. Needs knowing the id, affects only their own tenant; note only. A validator rejecting
     the @erased.invalid domain on write closes it.

8. Carry function and advisory locks. [note]
   - dsar_carry_restriction (317-347) locks LEAST then GREATEST of the two normalised addresses (328-329): opposite-direction carries
     cannot deadlock each other. liftForRequest sorts COLLATE "C" while here LEAST/GREATEST use the database default collation; under
     a non-C collation the orders can disagree for a multi-address lift versus a carry. Fix: use LEAST(f COLLATE "C", t COLLATE "C"),
     GREATEST likewise.
   - hashtextextended gives a 64-bit key; collisions only cause extra waiting, not wrong results. Advisory locks are xact-scoped, so
     pooled connections are safe.
   - A single UPDATE that changes many addresses takes advisory locks per row in scan order: the documented rare deadlock; abort is safe.
   - A new address failing the subjectEmail CHECK (e.g. no "x@y") aborts the lead/contact email update, but only when an active
     restriction exists on the old address. Documented intent (line 303-304); make sure the API validates email shape before the write
     so users see a validation error and not a raw 23514.
   - updatedAt = now() into TIMESTAMP(3) without tz uses session TimeZone; Prisma defaults have the same trait. Supabase runs UTC; ok.

9. Drift (schema.prisma vs SQL). [note, clean]
   .specify/sprints/sprint-18/execution/PG-203/exec-PG-203-20261020/tdd/dsar/prisma-drift-dsar.sql.txt lists for the new objects only
   the five DROP CONSTRAINT lines on the users FKs (createdById, resolvedById, liftedById). Cause: schema.prisma:2634-2635, 2667-2672 declare
   those columns without @relation to User, so the SQL FKs are SQL-only. Same accepted pattern as event_types_hostUserId_fkey.
   Remaining drift entries (report_templates index, users locale default, appointments/event_types FKs, document_type_definitions
   updatedAt) are pre-existing or from earlier PG-203 migrations, not this one. Enum values, column types, defaults (ARRAY[]::TEXT[] vs
   @default([])), the unique/index set and @map names match. The partial unique index is SQL-only and not shown as drift; the schema
   comment at 2656 documents it. Risk: a future `prisma migrate dev` diff could try to drop those FKs; keep the drift-allowlist entry.

10. Recovery and deploy order. [note]
   - Header lines 21-29 give a forward-only plan and correctly classify DROP TABLE as Class C. Good; additive means old API code is
     unaffected, so deploy order (migrate before API) is safe and rolling back the API alone is safe.
   - Inaccuracy: the "DROP FUNCTION x4" reversal (24-26) is only safe after the API is rolled back, because the app calls
     dsar_normalise_email (PrismaSubjectDataRepository.ts:56-59, PrismaLeadRepository.ts:140), dsar_subject_lock
     (PrismaProcessingRestrictionRepository.ts:49,108,150,204) and dsar_carry_restriction (PrismaContactRepository.ts:64) directly.
     Fix the header: the safe operational rollback of the address-follow and erasure guards is DROP TRIGGER only; drop functions only
     after the API version that calls them is gone.
   - Gate 5/7 evidence: migrate-deploy-and-drift.txt shows migrate deploy on a fresh local test DB (85 migrations applied) and
     dsar.test.ts re-applies the file (line 43). Neither is a staging run over populated leads/contacts: attach the staging
     `migrate deploy` timing (look for lock wait) to satisfy gate 6 for the trigger/lock risk in item 2.

Sign-off conditions for APPROVED: items 2 and 3 resolved or explicitly accepted by the owner in the PR; spec/plan wording in item 1
updated; the remaining items are optional hardening that can land as a follow-up Class A migration (WHEN clauses, UPDATE OF narrowing,
REVOKE for dsar_normalise_email/dsar_subject_lock).
