# Database Seed — Pre-Existing Bug Audit

**File**: `packages/db/prisma/seed.ts` (~9900 lines) **Date**: 2026-03-08
**Trigger**: Running `pnpm --filter @intelliflow/db run db:seed` — 36 of ~70
supplementary seed functions fail at runtime **Severity**: All supplementary
functions are wrapped in try/catch, so the seed completes — but ~50% of demo
data is missing from the database.

---

## Summary

| Bug Category                          | Count  | Severity |
| ------------------------------------- | ------ | -------- |
| Missing `tenantId` at call site       | 26     | HIGH     |
| Missing `tenantId` in function + data | 11     | HIGH     |
| Wrong field name (schema rename)      | 1      | MEDIUM   |
| Wrong enum value (string vs enum)     | 5      | MEDIUM   |
| Wrong FK value (`userId` as tenantId) | 1      | HIGH     |
| Snake_case → camelCase field names    | 1      | HIGH     |
| **Total distinct functions affected** | **36** |          |

---

## Root Causes

### A — Missing `tenantId` argument at call site (26 functions)

In `main()` (lines 9468–9824), many supplementary seed function calls omit the
`tenantId` argument. The function signatures accept `tenantId: string`, but
TypeScript doesn't enforce this at the call site because the parameter has no
`undefined` check — at runtime, `tenantId` becomes `undefined`, violating the
NOT NULL DB constraint.

**Pattern**: `await seedXxx()` should be `await seedXxx(tenantId)`

### B — Missing `tenantId` in function body + data objects (11 functions)

Some functions don't accept `tenantId` as a parameter at all, AND the data
objects don't include it. These need: (1) add parameter, (2) add field to every
data object, (3) fix call site.

### C — Schema renames not reflected in seed (1 function)

Prisma `@map()` means the Prisma client uses camelCase while the DB column is
snake_case. The seed must use the Prisma field name, not the DB column name.

### D — String literals instead of Prisma enum values (5 functions)

Prisma enum fields require the enum member name (`Sentiment.POSITIVE`), not a
raw string (`'positive'`).

---

## Per-Function Fix List

### Category A — Add `tenantId` to call site only

These functions already accept `tenantId` and use it in data objects. Only the
call in `main()` needs fixing.

| #   | Function                  | Call Site Line | Fix                                 |
| --- | ------------------------- | -------------- | ----------------------------------- |
| 1   | `seedTicketAttachments`   | 9492           | `seedTicketAttachments(tenantId)`   |
| 2   | `seedAgentActions`        | 9507           | `seedAgentActions(tenantId)`        |
| 3   | `seedDashboardActivities` | 9517           | `seedDashboardActivities(tenantId)` |
| 4   | `seedTeamMessages`        | 9539           | `seedTeamMessages(tenantId)`        |
| 5   | `seedPipelineSnapshots`   | 9544           | `seedPipelineSnapshots(tenantId)`   |
| 6   | `seedTrafficSources`      | 9549           | `seedTrafficSources(tenantId)`      |
| 7   | `seedGrowthMetrics`       | 9554           | `seedGrowthMetrics(tenantId)`       |
| 8   | `seedSalesPerformance`    | 9579           | `seedSalesPerformance(tenantId)`    |
| 9   | `seedChatMessages`        | 9640           | `seedChatMessages(tenantId)`        |
| 10  | `seedEscalationHistory`   | 9731           | `seedEscalationHistory(tenantId)`   |
| 11  | `seedReportDefinitions`   | 9767           | `seedReportDefinitions(tenantId)`   |
| 12  | `seedAIInsights`          | 9774           | `seedAIInsights(tenantId)`          |
| 13  | `seedWebhookEndpoints`    | 9798           | `seedWebhookEndpoints(tenantId)`    |
| 14  | `seedAPIKeys`             | 9805           | `seedAPIKeys(tenantId)`             |

### Category B — Add `tenantId` param + data field + call site

These functions don't accept `tenantId` at all. Need three changes each: (a) add
`tenantId: string` parameter, (b) add `tenantId` to every data object, (c) fix
call site in `main()`.

| #   | Function                  | Lines     | Call Site | Model                |
| --- | ------------------------- | --------- | --------- | -------------------- |
| 15  | `seedDealsWonMetrics`     | 5370–5403 | 9559      | `DealsWonMetric`     |
| 16  | `seedTeams`               | 6039–6078 | 9611      | `Team`               |
| 17  | `seedTeamMembers`         | 6080–6116 | 9616      | `TeamMember`         |
| 18  | `seedEmailTemplates`      | 6119–6161 | 9623      | `EmailTemplate`      |
| 19  | `seedEmailRecords`        | 6163–6220 | 9628      | `EmailRecord`        |
| 20  | `seedChatConversations`   | 6223–6265 | 9635      | `ChatConversation`   |
| 21  | `seedCallRecords`         | 6313–6376 | 9647      | `CallRecord`         |
| 22  | `seedDocuments`           | 6379–6435 | 9654      | `Document`           |
| 23  | `seedFeedbackSurveys`     | 7016–7071 | 9680      | `FeedbackSurvey`     |
| 24  | `seedAccountHealthScores` | 7119–7188 | 9692      | `AccountHealthScore` |
| 25  | `seedTicketCategories`    | 7748–7795 | 9721      | `TicketCategory`     |
| 26  | `seedSLABreaches`         | 7797–7835 | 9726      | `SLABreach`          |
| 27  | `seedWorkflowDefinitions` | 7881–7947 | 9738      | `WorkflowDefinition` |
| 28  | `seedWorkflowExecutions`  | 7949–8001 | 9743      | `WorkflowExecution`  |
| 29  | `seedBusinessRules`       | 8004–8055 | 9750      | `BusinessRule`       |
| 30  | `seedDashboardConfigs`    | 8058–8111 | 9757      | `DashboardConfig`    |
| 31  | `seedPerformanceMetrics`  | 8404–8449 | 9791      | `PerformanceMetric`  |

### Category C — Field name rename

| #   | Function              | Lines     | Wrong Field | Correct Field  | Occurrences |
| --- | --------------------- | --------- | ----------- | -------------- | ----------- |
| 32  | `seedTicketNextSteps` | 5404–5598 | `dueDate`   | `dueDateLabel` | ~21 entries |

**Context**: Schema has `dueDateLabel String @map("dueDate")`. The Prisma client
field is `dueDateLabel`; the DB column is `dueDate`. The seed uses the DB column
name instead of the Prisma client name.

### Category D — Enum value fixes

These functions use raw string literals for Prisma enum fields. Must use the
uppercase enum member name.

| #   | Function                | Lines     | Field       | Wrong Values              | Correct Values              |
| --- | ----------------------- | --------- | ----------- | ------------------------- | --------------------------- |
| 33  | `seedContactAIInsights` | 5047–5077 | `sentiment` | `'Positive'`              | `'POSITIVE'`                |
| 34  | `seedTicketAIInsights`  | 5696–5767 | `sentiment` | `'negative'`, `'neutral'` | `'NEGATIVE'`, `'NEUTRAL'`   |
| 35  | `seedCallRecords`       | 6313–6376 | `sentiment` | `'positive'`, `'neutral'` | `'POSITIVE'`, `'NEUTRAL'`   |
| 36  | `seedFeedbackSurveys`   | 7016–7071 | `sentiment` | `'positive'`, `'neutral'` | `'POSITIVE'`, `'NEUTRAL'`   |
| 37  | `seedWorkspaces`        | 5996–6037 | `plan`      | `'enterprise'`, `'trial'` | `'ENTERPRISE'`, `'STARTER'` |

**Note**: Prisma accepts the string name of the enum member (e.g., `'POSITIVE'`)
as well as the TypeScript enum import. Using the uppercase string is sufficient.

### Category E — Wrong FK value

| #   | Function            | Lines     | Field      | Wrong Value                      | Correct Value     |
| --- | ------------------- | --------- | ---------- | -------------------------------- | ----------------- |
| 38  | `seedCaseDocuments` | 6785–7013 | `tenantId` | `SEED_IDS.users.admin` (User PK) | default tenant ID |

**Context**: The function sets `const userId = SEED_IDS.users.admin` and then
uses `tenantId: userId` for every document, ACL entry, and audit record. This
passes a User UUID where a Tenant UUID is expected, causing a FK constraint
violation.

**Fix**: Add `tenantId` parameter to function, use it for `tenantId` fields, and
keep `userId` only for user-reference fields (`createdBy`, `updatedBy`,
`signedBy`, `grantedBy`, `userId`). Update call site to pass `tenantId`.

---

## Already Fixed (this session)

| Function                                   | Bug                                                                                        | Fix Applied                |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ | -------------------------- |
| `cleanDatabase` (L313)                     | `document_id` → `documentId` in `caseDocumentACL.deleteMany`                               | Renamed to camelCase       |
| `seedCaseDocuments` (L6790–6952)           | All data object fields used snake_case (`tenant_id`, `version_major`, `storage_key`, etc.) | Converted all to camelCase |
| `seedCaseDocuments` ACL/Audit (L6962–7009) | `document_id`, `tenant_id`, `principal_id`, etc. in Prisma calls                           | Converted all to camelCase |

---

## Fix Strategy (recommended order)

### Phase 1 — Call site fixes (14 functions, ~5 min)

Add `tenantId` argument to all call sites in `main()`. These functions already
have the parameter and data wiring — just the call is missing.

```typescript
// Lines 9492–9805 in main()
// Before:  await seedTicketAttachments();
// After:   await seedTicketAttachments(tenantId);
```

Affected lines: 9492, 9507, 9517, 9539, 9544, 9549, 9554, 9579, 9640, 9731,
9767, 9774, 9798, 9805.

### Phase 2 — Add `tenantId` param + data (17 functions, ~30 min)

For each function: (1) add `tenantId: string` parameter, (2) add `tenantId,` to
every data object literal, (3) fix call site.

Functions: `seedDealsWonMetrics`, `seedTeams`, `seedTeamMembers`,
`seedEmailTemplates`, `seedEmailRecords`, `seedChatConversations`,
`seedCallRecords`, `seedDocuments`, `seedFeedbackSurveys`,
`seedAccountHealthScores`, `seedTicketCategories`, `seedSLABreaches`,
`seedWorkflowDefinitions`, `seedWorkflowExecutions`, `seedBusinessRules`,
`seedDashboardConfigs`, `seedPerformanceMetrics`.

### Phase 3 — Field renames + enum fixes (5 functions, ~10 min)

1. `seedTicketNextSteps`: rename `dueDate` → `dueDateLabel` (21 occurrences)
2. `seedContactAIInsights`: `'Positive'` → `'POSITIVE'`
3. `seedTicketAIInsights`: `'negative'`/`'neutral'` → `'NEGATIVE'`/`'NEUTRAL'`
4. `seedCallRecords`: `'positive'`/`'neutral'` → `'POSITIVE'`/`'NEUTRAL'`
5. `seedFeedbackSurveys`: `'positive'`/`'neutral'` → `'POSITIVE'`/`'NEUTRAL'`
6. `seedWorkspaces`: `'enterprise'`/`'trial'` → `'ENTERPRISE'`/`'STARTER'`

### Phase 4 — Fix `seedCaseDocuments` FK (1 function, ~5 min)

Add `tenantId: string` parameter, replace `tenantId: userId` with `tenantId` in
all 5 document objects and the ACL/Audit create calls. Update call site to
`seedCaseDocuments(tenantId)`.

---

## RBAC Permission Warnings

The seed output also shows ~120 "Permission X not found, skipping" warnings in
`seedRBACRolePermissions`. This is because `seedRBACPermissions` creates 28
permissions with names like `leads.read`, `contacts.write`, etc., but
`seedRBACRolePermissions` references names like `lead:read`, `contact:write`
(colon-separated, singular). This is a naming convention mismatch.

**Root cause**: Permission names were changed from `entity:action` to
`entities.action` format but the role-permission mapping wasn't updated.

**Impact**: All 5 RBAC roles (admin, manager, sales_rep, support_agent, viewer)
have 0 permissions assigned. RBAC enforcement is effectively disabled for seed
data.

**Fix**: Either update `seedRBACRolePermissions` to use the new permission
names, or update `seedRBACPermissions` to use the old `entity:action` format —
whichever matches the runtime permission check format.

---

## Verification

After all fixes, running `pnpm --filter @intelliflow/db run db:seed` should
produce zero `⚠️` warnings and all supplementary data counts should match the
summary at the bottom of the seed output.
