# PG-208 findings (Task Automation, 2026-10-21)

Red flags and out-of-scope defects found while building task automation (plan Step 19 plus the refactor and review passes). Each one is tracked in all three places: a gh issue, `artifacts/metrics/debt-ledger.yaml`, and this file.

## Tracked (out of scope)

### T1 (a). readRequestBody buffers bodies with no size cap or timeout

- **File:** apps/api/src/http-server.ts:84-95 (called at :521)
- **gh issue:** #937
- **Debt ledger:** `PG-208-HTTP-BODY-NO-CAP-001`
- **Severity:** medium
- **Problem:** readRequestBody concatenates every chunk into memory for all non-GET/HEAD routes (Stripe webhook, pm-events, tRPC) with no maximum size and no read timeout. One large or slow-drip request can exhaust memory or hold a socket indefinitely.
- **Proposed fix:** Enforce a per-route byte cap (for example 1 MiB default, larger for the Stripe route) and a read timeout; reject with 413 / 408 and destroy the request. Add tests for oversize and stalled bodies.

### T2 (b). sendInternalError echoes error.message to clients

- **File:** apps/api/src/http-server.ts:286-301 (message at :299)
- **gh issue:** #938
- **Debt ledger:** `PG-208-HTTP-500-ECHOES-MESSAGE-001`
- **Severity:** low
- **Problem:** The 500 response body includes error.message verbatim, which can leak internal details (SQL, file paths, upstream hosts) to unauthenticated callers.
- **Proposed fix:** Return a generic message plus the correlation id already set by applyCorrelationHeaders; log the real error server-side only.

### T3 (c). pm-event bearer secret compared with !== (not constant-time)

- **File:** apps/api/src/modules/pm-events/process-pm-event.ts:50 (parts[1] !== secret)
- **gh issue:** #939
- **Debt ledger:** `PG-208-PM-EVENT-SECRET-COMPARE-001`
- **Severity:** low
- **Problem:** The bearer token is compared with !==, which short-circuits on the first differing byte and leaks timing information about the shared server-to-server secret.
- **Proposed fix:** Hash both sides (sha256) and compare with crypto.timingSafeEqual, or reuse an existing constant-time helper. Add a test for equal-length and different-length tokens.

### T4 (d). Stripe verifiers accept a NaN timestamp (replay window skipped)

- **File:** packages/webhooks/src/framework.ts:172 (stripeVerify) and apps/api/src/webhooks/handler.ts:133 (StripeSignatureVerifier.verify)
- **gh issue:** #940
- **Debt ledger:** `PG-208-STRIPE-VERIFY-NAN-TIMESTAMP-001`
- **Severity:** low
- **Problem:** A missing t= is rejected, but a present, garbled t= (for example t=abc) parses to NaN, and Math.abs(now - NaN) > tolerance is false, so the replay-window check is skipped. Forging a valid v1 still needs the secret, so this weakens replay protection rather than authentication. framework.ts also calls Number.parseInt without a radix.
- **Proposed fix:** Parse with Number.parseInt(t, 10), reject when !Number.isFinite(result), in both verifiers (or delete the duplicate and share one). Add tests for t=abc and t=.

### T5 (e). webhook dead-letter procedures open to any authenticated user

- **File:** apps/api/src/modules/webhooks/webhooks.router.ts:226 (getDeadLetterEntries), :244 (reprocessDeadLetter); same gate on :206 processRetries and :272 cleanup
- **gh issue:** #941
- **Debt ledger:** `PG-208-WEBHOOK-DEADLETTER-NO-ADMIN-001`
- **Severity:** medium
- **Problem:** These procedures use protectedProcedure, so any logged-in user can list failed webhook payloads and re-run them. registerSource/unregisterSource in the same file already use adminProcedure (:118, :147) and the comment at :116 states the intent.
- **Proposed fix:** Switch the dead-letter, processRetries and cleanup procedures to adminProcedure (confirm getSources/getMetrics intent), and add FORBIDDEN tests for a non-admin caller.

### T6 (f). assertTerritoryAdmin denials are not audit-logged

- **File:** apps/api/src/modules/account/account-territories.router.ts:32-38 (used at :235, :282, :319, :335)
- **gh issue:** #942
- **Debt ledger:** `PG-208-TERRITORY-ADMIN-DENIAL-NOT-AUDITED-001`
- **Severity:** low
- **Problem:** A non-admin attempting to create, update, delete or reorder territories gets FORBIDDEN, but no audit record is written, so privilege-probing is invisible.
- **Proposed fix:** Write an audit entry (actor, procedure, tenant) before throwing, using the same audit logger as the successful writes.

### T7 (h). bulk stage update / bulk convert publish no domain events

- **File:** apps/api/src/modules/opportunity/opportunity.router.ts:1608-1617 (bulkUpdateStage, updateMany) and apps/api/src/modules/lead/lead.router.ts:1539-1589 (bulkConvert, createMany)
- **gh issue:** #943
- **Debt ledger:** `PG-208-BULK-OPS-BYPASS-DOMAIN-EVENTS-001`
- **Severity:** medium
- **Problem:** Both mutations write with Prisma updateMany/createMany directly. No OpportunityStageChanged/Won/Lost or lead-converted events are published, so event consumers (including PG-208 task automation rules) never fire for bulk changes, and domain rules (closed deals cannot change) are skipped. Related but distinct from #908 item 3 (skipDuplicates).
- **Proposed fix:** Route each row through the services (or emit the same events after the bulk write, in the same transaction/outbox) and cover with tests that assert events.

### T8 (i). changeStage can close deals without won/lost events

- **File:** packages/domain/src/crm/opportunity/Opportunity.ts:267-288 (changeStage) vs :401-440 (markAsWon / markAsLost)
- **gh issue:** #944
- **Debt ledger:** `PG-208-CHANGESTAGE-CLOSES-WITHOUT-EVENTS-001`
- **Severity:** medium
- **Problem:** changeStage accepts any target stage, including the closing stages, and emits only OpportunityStageChangedEvent. markAsWon/markAsLost are the only paths that emit OpportunityWonEvent/OpportunityLostEvent (and set lost reason, close date). PG-208 works around this by mapping closing stage changes to won/lost triggers.
- **Proposed fix:** Reject CLOSED_WON/CLOSED_LOST in changeStage (force markAsWon/markAsLost) or have it delegate to them; update callers and tests, then drop the PG-208 mapping workaround.

### T9 (j). task settings defaults stored but never applied on task create

- **File:** apps/api/src/modules/task/task-settings.router.ts (settings CRUD) vs apps/api/src/modules/task/task.router.ts:247 (create path)
- **gh issue:** #945
- **Debt ledger:** `PG-208-TASK-SETTINGS-NEVER-READ-001`
- **Severity:** medium
- **Problem:** dueDateOffsetDays and reminderDefaults are saved per tenant, but no other code reads task settings (grep finds only task-settings.router.ts and router.ts), so the settings page changes nothing.
- **Proposed fix:** Read the tenant settings in task creation (default due date when none is given, default reminder) with tests; or remove the controls until wired.

### T10 (k). assignees cannot edit tasks; reminders/stats/getByEntity owner-only

- **File:** apps/api/src/modules/task/task.router.ts:213 (assignee widening), :423 (update), :770 (stats), :929-936 (getReminders), :951 (getByEntity)
- **gh issue:** #946
- **Debt ledger:** `PG-208-TASK-ASSIGNEE-ACCESS-GAPS-001`
- **Severity:** low
- **Problem:** PG-208 ruling 6 lets an assignee see tasks assigned to them, but update stays owner-scoped, and getReminders (overdue/due soon), stats and getByEntity do not include assigned tasks, so round-robin assignees are not reminded about work assigned to them.
- **Proposed fix:** Decide the assignee permission set (edit status/notes at least), widen the same way as the list query, and add tests per procedure.

### T11 (l). MemberMultiSelect accessible name omits visible label — fixed on the branch (79cb2fcf8)

- **File:** apps/web/src/components/shared/member-multi-select.tsx:68; caller apps/web/src/app/tasks/(list)/automation/components/ActionFields.tsx:170-176
- **gh issue:** #947
- **Debt ledger:** `PG-208-MEMBER-MULTISELECT-LABEL-IN-NAME-001`
- **Severity:** low
- **Problem:** The trigger button uses aria-label={`${label}, ${count} selected`}. When the caller shows a different visible Label (ActionFields shows "Assign in turn to" but passes label="Round-robin group"), the accessible name omits the visible text, so speech-input users cannot activate it by name.
- **Proposed fix:** Make the visible label the start of the accessible name (use aria-labelledby on the visible label plus the count, or require label to equal the visible text) and add an axe/RTL test.

### T12 (m). tagsRouter duplicated between task-automation and scheduled-reports

- **File:** apps/api/src/modules/task/task-automation.router.ts:541 and apps/api/src/modules/analytics/scheduled-reports.router.ts:465
- **gh issue:** #948
- **Debt ledger:** `PG-208-SETTINGS-TAGS-ROUTER-DUPLICATION-001`
- **Severity:** low
- **Problem:** Both define a near-identical tagsRouter (list/create/update/delete plus rename rewrites). The web TagsTab was already shared in PG-208; the API side was not, so fixes must be made twice.
- **Proposed fix:** Extract createSettingsTagsRouter(config) (model delegate, rewrite callback, role gate) and use it from both routers, keeping the existing tests green.

### T13 (n). lead.created source filter for automation rules (deferred feature)

- **File:** apps/api/src/modules/task/task-automation.router.ts:296-300 (event trigger columns carry only a toStage filter); apps/api/src/modules/task/automation/task-automation-event-intake.ts
- **gh issue:** #949
- **Debt ledger:** `PG-208-AUTOMATION-LEAD-CREATED-SOURCE-FILTER-001`
- **Severity:** low
- **Problem:** A lead.created rule fires for every new lead regardless of how it was created. Owner deferred a source filter (web form, import, manual) during PG-208.
- **Proposed fix:** Add an optional filter.source to the trigger schema, persist it with the event filter, evaluate it in the engine/intake, and expose it in the rule form.

### T14 (o). interval-runner duplicated with approval-sweep-scheduler

- **File:** apps/api/src/modules/task/automation/task-automation-runner.ts:15-64 and apps/api/src/agent/approval-sweep-scheduler.ts:14-63
- **gh issue:** #950
- **Debt ledger:** `PG-208-INTERVAL-RUNNER-DUPLICATION-001`
- **Severity:** low
- **Problem:** Both files hand-roll the same module-level timer plus running flag, skip-while-running tick, unref and stop logic.
- **Proposed fix:** Add createIntervalJob({ name, intervalMs, run }) returning start/stop, migrate both callers, keep their tests.

### T15 (p). triggerColumns keeps inapplicable day-of-week/month values

- **File:** apps/api/src/modules/task/task-automation.router.ts:282-310 (triggerColumns; day fields at :307-308)
- **gh issue:** #951
- **Debt ledger:** `PG-208-AUTOMATION-SCHEDULE-COLUMNS-NOT-CLEARED-001`
- **Severity:** low
- **Problem:** The SCHEDULE branch persists dayOfWeek/dayOfMonth whenever supplied, even for cadences that do not use them, leaving stale values. scheduled-reports has buildScheduleColumns (scheduled-reports.schedule.ts:112) which clears inapplicable day fields.
- **Proposed fix:** Reuse buildScheduleColumns (or extract it to a shared module) in triggerColumns and add a test that switching cadence clears the day fields.

### T16 (q). TaskRepository.findById is not tenant-scoped

- **File:** packages/domain/src/crm/task/TaskRepository.ts:23; packages/application/src/services/TaskService.ts:696-712 (only assignTask compares tenantId)
- **gh issue:** #952
- **Debt ledger:** `PG-208-TASK-REPOSITORY-FINDBYID-NO-TENANT-001`
- **Severity:** medium
- **Problem:** findById(id) is not tenant-scoped, so every mutator must remember to compare the loaded task tenant. Only assignTask does. OpportunityRepository.findById(id, tenantId?) already shows the pattern.
- **Proposed fix:** Add an optional tenantId to TaskRepository.findById (as OpportunityRepository), pass it from all TaskService mutators and the Prisma adapter, and add cross-tenant tests.

### T17 (r). schema.prisma vs migrations drift (4 items) on main

- **File:** packages/db/prisma/schema.prisma vs packages/db/prisma/migrations (found with prisma migrate diff from a freshly migrated DB to schema.prisma)
- **gh issue:** #953
- **Debt ledger:** `PG-208-PRISMA-SCHEMA-MIGRATION-DRIFT-001`
- **Severity:** medium
- **Problem:** Four differences: (1) cases FK (tenantId, caseTypeId) exists in the DB but is missing from schema.prisma; (2) document_type_definitions.updatedAt default differs; (3) report_templates index (tenantId, name) differs; (4) users.locale default is en-GB in the DB but en-US in the schema. Pre-existing on main, not caused by PG-208.
- **Proposed fix:** Decide the intended state for each, then reconcile with one additive Class A migration or a schema update (never db push); add a CI step that fails on migrate diff drift.

### T18 (s). pending-run claims and tag rewrites are one row at a time

- **File:** apps/api/src/modules/task/automation/task-automation-store.ts:390-405 (claimPendingRuns); apps/api/src/modules/task/task-automation.router.ts:521-537 (rewriteRuleTags)
- **gh issue:** #954
- **Debt ledger:** `PG-208-AUTOMATION-ONE-BY-ONE-WRITES-001`
- **Severity:** low
- **Problem:** claimPendingRuns issues one updateMany per candidate run, and rewriteRuleTags issues one updateMany per rule. Both are bounded (run batch size, 50 rules per tenant) so impact is small.
- **Proposed fix:** Claim with a single updateMany on the candidate ids (status guard kept) and re-read, and batch the tag rewrites in one statement or a Promise.all inside the transaction.

### T19. createTenantWhereClause treats only ADMIN as tenant-wide

- **File:** apps/api/src/security/tenant-context.ts:359
- **gh issue:** #959
- **Debt ledger:** `PG-208-TENANT-WHERE-ADMIN-ONLY-001`
- **Severity:** medium (pre-existing; PG-208 security review)
- **Problem:** OWNER and SUPER_ADMIN get owner scope on routers using the helper (task.list), while module gates such as assertTaskAutomationAdmin treat them as admins.
- **Proposed fix:** one shared tenant-wide role constant, explicit MANAGER scope, per-role tests.

### T20. Minor review follow-ups (a11y + webhook hardening)

- **gh issue:** #960
- **Debt ledger:** `PG-208-REVIEW-MINOR-FOLLOWUPS-001`
- **Severity:** low
- **Items:** Priority caption not a real `<label>`; VariablePicker raw `<textarea>`; focus loss when a focused control disables; toast and live-region double speech; webhook trusted-proxy hop config / `x-real-ip` (spec M9 assumption); db crypto helpers as root exports (spec M11); optional `CHECK (jsonb_typeof(actions) = 'array')`.

### T21. Lead conversion into an existing account suppresses its account.created rules

- **File:** apps/api/src/modules/task/automation/task-automation-event-intake.ts:148
- **gh issue:** #968
- **Debt ledger:** `PG-208-CONVERSION-EXISTING-ACCOUNT-001`
- **Severity:** low (Codex MEDIUM; waived per owner ruling 9, fingerprint 00e5b9b9…)
- **Proposed fix:** flag accounts actually created by the conversion and correlate only those.

### T22. Run retention purge (500/hour) can fall behind admission

- **File:** apps/api/src/modules/task/automation/task-automation-engine.ts `maintenance()`
- **gh issue:** #969
- **Debt ledger:** `PG-208-RUN-PURGE-THROUGHPUT-001`
- **Severity:** low (Codex MEDIUM; waived per owner ruling 9, fingerprint 28497224…)
- **Proposed fix:** drain expired rows in bounded batches each tick until none remain.

## Review outcomes (Step 23)

- **a11y-expert (WCAG 2.1 AA): PASS WITH FIXES.** Fixed on the branch (79cb2fcf8): MemberMultiSelect label-in-name and picked-order summary (this also fixes T11 / #947 on the branch; the issue closes when the PR merges), invalid wiring and focus for pool / recipients / tags, Test Rule unavailable state and live-region explanation, deferred and repeatable announcements, always-mounted duplicate warning, success-only focus moves after delete, CopyField name, runs loading status, read-only settings note, per-field insert-variable names, named row control groups. Not fixed: T20 items.
- **security-lead: PASS WITH FIXES, no critical or high.** Fixed on the branch (15cd8bca5): M1 webhook token in Sentry transactions / OTel spans (path not traced, transactions and span data scrubbed), L1 read failures counted and limiter eviction, L2 timed-out read closes the request, L3 C1 / zero-width / bidi stripped from templates, L4 Notify message no longer pulls payload keys, L5 expired previous secrets cleared by maintenance, L6 signature and Idempotency-Key headers dropped from Sentry, L7 API_PUBLIC_URL validated (https in production), L9 single-object AND kept. Also fixed: task.list widened an explicit owner filter to "or assigned to me" for admins (found by the full API suite). Tracked: T19 (pre-existing), T20 (L1 trusted-hop config, L8). Accepted as designed: the session-level tenant SET race (ADR-071, explicit tenantId filters are the boundary); rule definitions readable by every member (spec: other users read only).

- **Codex semantic review (`scripts/codex-review.mjs`):** 11 rounds. Every finding up to round 10 was fixed on the branch with tests (commits 0700b99d4 … 9618646a9; owner ruling 8 "fix now" made all run paths use one locked admission; RED evidence for the production-breaking `DB_NULL` and the ruling 9 fixes under `red-green/23-*`). Owner ruling 9 ("fix all 3, then stop") closed the loop: the confirming round found the ruling 9 schedule snapshot incomplete (fixed, 60a5baf8b) and two new mediums, tracked as T21 / T22 with owner-approved waivers.

## Not reproduced

- **(g) `redactSensitiveData` case-sensitivity.** `apps/api/src/agent/logger.ts:382` lowercases both the key and each configured field (`key.toLowerCase().includes(f.toLowerCase())`), so "Authorization" and "apiKey" are redacted. Not filed. Side observation only: the recursion at :384 skips arrays, so objects inside arrays are not redacted.

## CSV alignment

Step 18 changed `Sprint_plan.csv`, row PG-208, column "Artifacts To Track":

- **Old:** 4 ARTIFACT entries + the context_ack EVIDENCE entry.
- **New:** the same entries plus 15 ARTIFACT entries: domain constants, migration `20261020120000_task_automation`, 7 runtime files, 4 web components, the shared copy-field, and ADR-084.

## Deviations

- Extra file `apps/api/src/modules/task/automation/task-automation-runtime.ts` (not in the spec file list).
- Extra files `components/rule-form.ts` and the shared `components/shared/field-error.tsx`.
- Cadence includes `quarterly` (PG-201 reuse).
- Router outputs are explicit view contracts built from select allow-lists and schema-parsed triggers, not `.output()` schemas.
- Runtime RED was captured by mutation (tests written against the finished code, then mutated to fail).
- Web RED was captured against the stub page only (tests were written alongside the page).
- Migration index `(tenantId, createdAt)` was added after the SQL review; the runner (projects-8c) re-reviewed it on 2026-10-21 and kept it in the same migration.
