# Knip Batch-C Triage Report — All Unused Files Resolved

**Generated**: 2026-02-08 (post quick-win export localization + Batch C config tuning)
**Source**: `artifacts/reports/code-analysis/knip-report-latest.json`
**Cache Sync**: `artifacts/reports/code-analysis/latest.json`

## Current Snapshot (verified scan)

| Metric | Current |
|--------|---------|
| Unused files | **0** |
| Unused exports | **81** |
| Unused types | **169** |
| Knip unused deps (runtime) | **18** |
| Knip unused devDeps | **10** |
| Knip duplicates | **42** |

## Progress

| Baseline (07 Feb 2026) | Previous | Current | Delta |
|------------------------|----------|---------|-------|
| Unused files: 68 | 2 | **0** | **-68** |
| Unused exports: 315 | 147 | **81** | **-234** |
| Unused types: 490 | 165 | **169** | **-321** |

> All 68 unused files from the original baseline have been resolved through a combination of wiring, deletion, and migration.

## Completed Wire Actions (5 files resolved)

| File | Action Taken | Consumer | Task |
|------|-------------|----------|------|
| `apps/api/src/shared/audit-encryption-module.ts` | **Wired** into `apps/api/src/security/audit/writer.ts` | Opt-in `encryptSensitiveFields` config encrypts `beforeState`, `afterState`, `metadata` via AES-256-GCM before DB write | IFC-124 |
| `apps/api/src/shared/bias-detector.ts` | **Deleted** (exact duplicate) | `packages/adapters/src/shared/bias-detector.ts` is the canonical copy, already dynamically imported by `GuardrailsAIService.analyzeBiasMetrics()` | IFC-125 |
| `apps/api/src/shared/retry-policy.ts` | **Moved** to `packages/platform/src/resilience/retry-policy.ts` | Exported from resilience barrel; new `resilientCall()` helper combines circuit breaker + retry. Test import updated. Sprint_plan.csv artifact path updated. | IFC-122 |
| `apps/web/src/components/shared/entity-action-sheet.tsx` | **Wired** into all 5 entity detail pages | Used as overflow menu (Pin/Unpin, Share, Export + entity-specific actions) triggered by MoreActionsButton on leads, contacts, deals, tickets, accounts | - |
| `apps/web/src/components/shared/more-actions-button.tsx` | **Wired** into all 5 entity detail pages | Three-dot trigger button for EntityActionSheet on all entity detail pages | - |

### Entity-action-sheet + MoreActionsButton wiring details

| Entity Page | Integration Pattern | Extra Actions |
|-------------|-------------------|---------------|
| `apps/web/src/app/leads/[id]/page.tsx` | Inline after action buttons | Archive, Delete |
| `apps/web/src/app/contacts/[id]/page.tsx` | Inline after action buttons | Merge Duplicate, Archive, Delete |
| `apps/web/src/app/deals/[id]/page.tsx` | Via EntityHeader `endContent` prop | Clone Deal, Archive, Delete |
| `apps/web/src/app/tickets/[id]/page.tsx` | Inline after action buttons | Merge Ticket, Mark as Spam, Delete |
| `apps/web/src/components/accounts/AccountDetail.tsx` | Replaced inline Delete button | Merge Account, Archive, Delete |

Supporting changes:
- Added `endContent` prop to `EntityHeader` component (`entity-header.tsx`)
- Added `'ticket'` to `PINNABLE_ENTITY_TYPES` in `packages/validators/src/home.ts`
- Rebuilt validators and API packages for type propagation
- Removed unused Tooltip imports from AccountDetail after moving Delete to overflow

### Additional wiring completed (governance page)

| File | Action Taken | Details |
|------|-------------|---------|
| `apps/web/src/app/governance/compliance/components/index.ts` | **Wired** all 4 components into `page.tsx` | `RiskHeatMap` + `ComplianceTimeline` in 2-col grid; `ComplianceDetailPanel` as drill-down sheet triggered by card click; `ExportReportButton` replaces static button in header |

## Unused Dependencies (Knip — 18 runtime)

| Package | Declared In |
|---------|-------------|
| `@prisma/client` | `apps/web/package.json` |
| `use-debounce` | `apps/web/package.json` |
| `ioredis` | `apps/workers/notifications-worker`, `ingestion-worker`, `events-worker`, `ai-worker` |
| `@opentelemetry/exporter-metrics-otlp-http` | `apps/api/package.json` |
| `@opentelemetry/exporter-trace-otlp-http` | `apps/api/package.json` |
| `@sentry/tracing` | `apps/api/package.json` |
| `@upstash/ratelimit` | `apps/api/package.json` |
| `@upstash/redis` | `apps/api/package.json` |
| `@langchain/community` | `apps/ai-worker/package.json` |
| `langchain` | `apps/ai-worker/package.json` |
| `openai` | `apps/ai-worker/package.json` |
| `bullmq` | `packages/search/package.json` |
| `@opentelemetry/instrumentation` | `packages/observability/package.json` |
| `@opentelemetry/sdk-trace-node` | `packages/observability/package.json` |
| `@paralleldrive/cuid2` | `packages/domain/package.json` |

## Unused Dev Dependencies (Knip — 10)

| Package | Declared In |
|---------|-------------|
| `baseline-browser-mapping` | root `package.json` |
| `cspell` | root `package.json` |
| `license-checker` | root `package.json` |
| `madge` | root `package.json` |
| `markdownlint-cli` | root `package.json` |
| `testcontainers` | root `package.json` |
| `ts-prune` | root `package.json` |
| `react` | `packages/sdk/package.json` |
| `axe-core` | `packages/ui/package.json` |

## Duplicate Modules (42)

Top duplicates by category:

| Category | Files |
|----------|-------|
| AI worker services | `embedding-purge.service.ts`, `document-indexer.ts`, `retrieval-service.ts` |
| Security | `encryption.ts`, `key-rotation.ts` |
| Adapters connectors | `gmail/client.ts`, `sap/client.ts`, `outlook/client.ts`, `teams/client.ts` |
| Billing components | `invoice-list.tsx`, `payment-methods.tsx`, `subscription-manager.tsx`, `receipt-list.tsx`, `invoice-detail.tsx` |
| Auth/shared components | `password-reset.tsx`, `onboarding-flow.tsx`, `auth-background.tsx`, `email-verification.tsx`, `mfa-qr-generator.tsx`, `backup-codes-display.tsx`, `mfa-challenge.tsx` |
| Web shared | `page-header.tsx`, `reset-email.tsx`, `landing-builder.tsx`, `job-detail-template.tsx`, `apply-button.tsx`, `auth-card.tsx`, `oauth-callback.tsx`, `password-input.tsx`, `trust-indicators.tsx`, `entity-header.tsx` |
| Project tracker | `CollapsibleSection.tsx`, `DailyWorkflowSummary.tsx` |
| API | `subscription-demo.ts`, `conversation.router.ts`, `timeline.ts` |
| Workers | `ocr-worker.ts`, `reindex-worker.ts` |

## Top Unused Exports (by file)

| File | Count |
|------|-------|
| `packages/db/src/client.ts` | 5 |
| `packages/platform/src/workflow/rules-engine.ts` | 4 |
| `apps/web/src/components/sidebar/SidebarPortalContext.tsx` | 3 |
| `packages/adapters/src/shared/bias-detector.ts` | 3 |
| `packages/domain/src/notifications/Notification.ts` | 3 |
| `packages/search/src/index.ts` | 3 |

## Top Unused Types (by file)

| File | Count |
|------|-------|
| `packages/domain/src/ai/AIConstants.ts` | 15 |
| `apps/project-tracker/lib/types.ts` | 15 |
| `packages/domain/src/platform/PlatformConstants.ts` | 10 |
| `apps/web/src/components/sidebar/icon-reference.ts` | 7 |
| `packages/search/src/retrieval.ts` | 6 |
| `apps/workers/shared/src/types.ts` | 6 |

## Test Results After Wiring

| Suite | Tests | Status |
|-------|-------|--------|
| `tests/circuit-breaker.spec.ts` (retry policy moved) | 61 | All pass |
| `apps/api/src/security/__tests__/audit-coverage-test.test.ts` | 37 | All pass |
| `packages/adapters/src/external/__tests__/GuardrailsAIService.additional.test.ts` | 12 | All pass |
| TypeScript compilation (all packages) | 57 pre-existing errors in test files | No regressions |

## Knip Config Fix

Added targeted `ignoreIssues` rules in `knip.json` for test-only/reference modules:
- `apps/api/src/test/**` (`exports`, `types`)
- `apps/web/src/lib/test-runner/**` (`exports`, `types`)
- `apps/project-tracker/lib/data-sync/orchestrator.ts` (`exports`)
- `apps/project-tracker/lib/data-sync/validation.ts` (`exports`)

These are intentional keeps used by test/tooling entrypoints that are not part of runtime wiring.

## Recommended Next Steps

1. **Unused deps triage**: Many Knip "unused" runtime deps (ioredis, langchain, openai, @upstash/*) are actually needed at runtime but imported dynamically or via config. Safe to remove: `@sentry/tracing` (deprecated), `use-debounce`, `ts-prune`.
2. **Duplicates**: The 42 duplicates are mostly Knip detecting identical export names across packages (e.g., connector `client.ts` files). Most are intentional — review on case-by-case basis.
3. **Unused exports/types**: Remaining items are mainly intentional public APIs (platform/domain/search/web) and should be reviewed in the next batch for either consumer wiring or explicit keep annotations.
