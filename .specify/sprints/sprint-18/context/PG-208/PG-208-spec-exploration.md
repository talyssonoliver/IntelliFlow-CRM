# PG-208 spec exploration (Phase 0.75)

Run 2026-10-20 by `/spec-exploration PG-208`: five `Explore` subagents, in parallel, each with Read/Grep/Glob
(tool uses: Backend-Architect 46, Security-Lead 60, Frontend-Lead 39, Domain-Expert 64, Test-Engineer 68). Every
agent read well over three files and cited file:line. This file condenses their reports; the spec cites the findings
as E1..E10.

## Backend-Architect

- Playbook §4-§8, §10, §12 (`docs/planning/module-settings-playbook.md:87-212`).
- `task-settings.router.ts:55-93` upsert-only, no container wiring; `task.router.ts:204-274` create sets
  `ownerId = caller`, notifies the creator; `assign` (:805-867) links an entity, not a user.
- `model Task` `assigneeId` (`schema.prisma:1795-1801`) unused by validators/service/router.
- Round-robin: `AccountTerritory.rrCursor` (`schema.prisma:1108-1109`), atomic increment
  (`account-territory-assignment.ts:126-138`), pick (`territory-matching.ts:242-250`), eligibility before cursor
  (:106-124), fallback to creator (:207-216).
- Reference routers: `account-territories.router.ts:32-53,166-196,416-423`; `contact-types.router.ts:1-13,40,322`.
- Event runtime: dispatcher `register` (`event-dispatcher.ts:82-111`); `OutboxEvent.metadata.tenantId?` optional (:28);
  worker prisma only with `EVENTS_WORKER_USE_DATABASE=true` (`main.ts:935-948`, `config.ts:41`); handlers only log
  (:617-717); rules-engine `create_task` stub (`packages/platform/src/workflow/rules-engine.ts:537-559`); scheduled
  jobs plain `setInterval`, no lock (`scheduled-jobs.ts:70-108`).
- **E1** Container uses `InMemoryEventBus({record:false})` (`container.ts:376`); `OutboxEventBusAdapter` never built;
  sole outbox writer `subscription-sync.ts:102`; worker dormant (`deploy-workers.yml:8-14`).
- **E9** Runner that runs in prod: `approval-sweep-scheduler.ts:1-60`, advisory lock
  (`approval-escalation-sweep.ts:452-456`), started at `http-server.ts:562`; cron helpers
  `scheduled-reports.schedule.ts:43,84`.
- Webhooks: `webhooks.router.ts:57-74` new service per request, in-memory maps (`framework.ts:256-257,438-442`).
- Notifications: `createNotification` (`notifications.router.ts:761-860`); `NOTIFICATION_TYPES` has `task_assigned`
  (`validators/src/notifications.ts:49-53`), length test 55.
- Migrations: `20261007130000_account_territories` (CHECKs, lower(name) unique, composite FK, RLS);
  `packages/db/src/index.ts:23-91` type allowlist.

## Security-Lead

- Verifiers: `framework.ts:144-151` (no timestamp), `:156-181` Stripe-style ±300 s; 5 MB cap (:451,590).
- **E8** DB idempotency `pm-events/prisma-inbound-store.ts:57`; hashed key `security/partner-auth.ts:32-41,123-138`;
  encrypted fields `packages/db/src/field-encryption.ts:33-36,70-87` (plaintext fallback on read);
  anti-patterns: `process-pm-event.ts:50` (`!==` compare), `http-server.ts:72-84` (unbounded body),
  `http-server.ts:284-288` (`error.message`), `webhooks.router.ts:206,226,244,272` (protectedProcedure ops).
- tRPC: `publicProcedure` rate limit pass-through without Redis (`trpc.ts:91-98`); `adminTenantProcedure` lacks CSRF +
  rate limit (`trpc.ts:567-571`); inline admin gate precedent `account-territories.router.ts:32-38`.
- Tenancy: `tenant-context.ts:119-135` RLS is not the boundary; worker sets `tenantId` explicitly (`main.ts:310-356`).
- Logging: no pino `redact` (`packages/observability/src/logging.ts:60-133`); `redactSensitiveData` case bug (:494-516).
- Gitleaks: `secret_[A-Za-z0-9]{30,}` (notion rule) and `whsec_` rules → token prefix `tat_`; tests build secrets at
  runtime.
- Rate limiting: `middleware/rate-limit.ts:43-54,384,405,420-429`; `security/client-ip.ts:20-27`
  `pickTrustedForwardedIp`.

## Frontend-Lead

- Stub `automation/page.tsx:1-18`; siblings `task-settings/**` (PG-191), `task-types/page.tsx` (PG-209 stub, untouched);
  layout `(list)/layout.tsx:1-7` (TasksShell).
- References: PG-205 `ContactTypesContent.tsx:47-51,154-217,289-305`, `ContactTypeList.tsx:116-176`; PG-197
  `TerritoryMappingContent.tsx:34-290`, `TerritoryRulesEditor.tsx:35-181`, `MemberMultiSelect.tsx:13-37`; PG-196
  `AccountTiersLoading.tsx`, `BenefitsMatrixCard.tsx:35`; TagsTab `account-settings/components/TagsTab.tsx:58-65`,
  PG-201 `scheduled-reports/components/TagsTab.tsx:60-67`.
- Shared: `module-settings-shell.tsx:81-184`, `page-header.tsx:18-34`, `section-header.tsx:27-59`,
  `settings/DeleteTypeDialog.tsx:38-77`, `settings/TypeSettingsLoading.tsx:19-51`, `variable-picker.tsx:43,205`,
  `priority-select.tsx:47`, `tasks/EntitySearchField.tsx:45`; no shared copy-to-clipboard; ticket
  `AutomationRuleBuilder.tsx` is ticket-routing-specific; PG-201 `ScheduleDialog.tsx:46,71-75,115-121`.
- **E10** Route conflicts: none editing task automation; `/settings/automation` (`settings/automation/page.tsx:14-27`),
  `/tickets/automations`, `/cases/case-workflows` (`ActionConfig.tsx:24`) disjoint.
- Nav already wired: `sidebar/configs/tasks.ts:7`, `TaskSettingsPanel.tsx:23-29`.
- Registries: `PAGE_MAP_AND_FLOWS.md:215`, `sitemap.md:198,445`, `navigation-reachability-audit.md:367`,
  `page-registry.md` (PG-205 block :794-803), `ui-flow-mapping.md` (counts guarded by
  `ui-flow-mapping-reconciliation.test.ts:43-50`), `settings-search.ts:169-192`, WCAG statement :54/:272, VPAT :152;
  preflight `check-page-doc-cochange.mjs:33-37`.

## Domain-Expert

- `Task` aggregate `Task.ts:46-61,80,194,355-374`; `TaskEvents.ts:5-28,37-57,261-285`.
- **E2** `DomainEvent.ts:7-18` no tenantId. **E3** `LeadService.ts:140-143,758-761` publish in tx and propagate;
  `OpportunityService.ts:1065-1074`, `ContactService.ts:766-774`, `TaskService.ts:870-880` catch.
- **E4** `PrismaTaskRepository.ts:24-39,55-69` omit `assigneeId`.
- **E5** `TaskService.ts:132-147,820-826,858-864`.
- Event table (production publishing via router → service): `lead.created` (`lead.router.ts:490`),
  `lead.qualified` (:950), `lead.converted` (:1030), `contact.created` (`contact.router.ts:731`),
  `account.created` (`account.router.ts:298`), `opportunity.created` (`opportunity.router.ts:679`),
  `opportunity.stage_changed` (:613), `opportunity.won/lost` (:580-608 use cases); `task.assigned` never emitted;
  ticket and case events not on the bus (`TicketService.ts`, `cases.router.ts:483`).
- Vocabulary precedent: `packages/domain/src/workflow/node-catalog.ts:100-151`; `RoutingConstants.ts:55-59` (#771:
  never offer an option that silently does nothing).
- PRD: no Tasks addendum; AC-T* already used three times → **AC-TA-***.
- IFC-310/311/312 Completed and contact/account scoped → not a home for task-automation follow-ups.
- Round-robin pools: explicit member list (PG-197) filtered by `tenantUserWhere` (`packages/db/src/membership.ts:68-82`);
  `TeamMember.userId` has no FK to `User`.
- PG-191 claims verified; side finding: task settings unread at runtime.

## Test-Engineer

- `prismaMock` = `mockDeep` (`apps/api/src/test/setup.ts:110,137-145`); `$transaction` styles
  (`contact-types.router.test.ts:90`, `account-territories.router.test.ts:83-86,208,213`); cross-tenant styles
  (lookup-first :362-368; P2025 `deal-settings.router.test.ts:370-377`); helpers `prismaError`, `expectCode` (:69-75).
- Duplicate-pair validator precedent `approval-policies.test.ts:100-111`.
- Web mocks: PG-191 `TaskSettingsContent.test.tsx:9-37`; PG-205 hoisted + axe `ContactTypesContent.test.tsx:1-80,334`;
  page test `task-settings/__tests__/page.test.tsx:20-36`.
- Integration: `tests/integration/contact-types.test.ts:60-230` (`ensureMigrationSql`, `applySchemaSql`, CI db:push skips
  hand SQL, `ci.yml:334`).
- Events-worker not in Sonar scope (`sonar-project.properties:45-62`) — irrelevant now (engine lives in apps/api).
- `rls-migrations.test.ts` requires ENABLE RLS on every new table; `tenant-procedure-enforcement.test.ts:20-36`
  allowlist for public procedures (our webhook is a raw route, not a router).
- Count tests: `ui-flow-mapping-reconciliation`, `ia-reconciliation` (router count), `app-router.smoke.test.ts`.
- Clock pinning: `vi.useFakeTimers` + `setSystemTime`, restore in `afterEach` (`fe69874c6` lesson).
- Webhook test precedents: `http-server.stripe-webhook.test.ts:78-141`, `inbound.router.webhook-hmac.test.ts`.

## Verification checklist

- [x] Each agent called Read at least 2 times (39-68 tool uses each)
- [x] Agents cited specific file paths
- [x] Agents referenced line numbers
- [x] Discrepancies noted: owner ruling 1's "outbox handler in events-worker" path does not exist in production (E1) →
  owner ruling 2; `assigneeId` silently dropped (E4); PG-191 settings unread (side finding); `_J` split shows PG-208
  Backlog vs CSV Specifying (splits regenerated at session end).
