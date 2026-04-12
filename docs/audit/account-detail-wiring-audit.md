# Account Detail (Account 360) — Wiring Audit

**Detail Page**: `apps/web/src/components/accounts/AccountDetail.tsx` (~751
lines) **List Page**: `apps/web/src/app/accounts/(list)/AccountsPageClient.tsx`
(~361 lines) **API**: `apps/api/src/modules/account/account.router.ts` → 12
procedures **Domain**: `packages/domain/src/crm/account/Account.ts` (~299 lines)
**Service**: `packages/application/src/services/AccountService.ts` (~913 lines)
**Repository**: `packages/adapters/src/repositories/PrismaAccountRepository.ts`
(~212 lines) **Date**: 2026-03-05 (created — comprehensive flow analysis)

---

## Summary

| Category            | Wired  | Partially Wired | Not Wired |
| ------------------- | ------ | --------------- | --------- |
| Core Account Data   | 12     | 1               | 0         |
| Contacts Tab        | 4      | 1               | 0         |
| Opportunities Tab   | 4      | 0               | 0         |
| Activity Tab        | 0      | 0               | 1         |
| Pipeline Tab        | 1      | 0               | 0         |
| Hierarchy Tab       | 3      | 0               | 0         |
| Action Buttons      | 8      | 2               | 0         |
| Owner Management    | 0      | 1               | 1         |
| Create / Edit Forms | 0      | 0               | 2         |
| **Total**           | **28** | **5**           | **6**     |

### Comprehensive Flow Analysis

| Category             | CRITICAL | HIGH   | MEDIUM | LOW   | Test Gaps |
| -------------------- | -------- | ------ | ------ | ----- | --------- |
| Frontend UX          | 0        | 5      | 2      | 4     | —         |
| Backend Security     | 1        | 3      | 3      | 2     | —         |
| Backend Logic        | 0        | 2      | 4      | 3     | —         |
| Integration / Events | 0        | 2      | 1      | 0     | —         |
| Test Coverage        | —        | —      | —      | —     | 5         |
| **Total**            | **1**    | **12** | **10** | **9** | **4**     |

**Grand total: 36 findings** (1 CRITICAL, 12 HIGH, 10 MEDIUM, 9 LOW, 4 test
gaps) — 7 findings resolved by IFC-267

Notable positive: Account domain is significantly better wired than Lead or
Contact — all 6 tabs use real API queries, auth guards are properly implemented,
hierarchy mutations work, delete has confirmation dialog, and initials-based
avatars avoid the Unsplash stranger photo problem.

Legend:

- **Wired** = fetches real data from API/DB, displays correctly
- **Partially Wired** = fetches some data but has hardcoded fallbacks, missing
  fields, or divergent logic
- **Not Wired** = hardcoded mock data, no-op buttons, or UI-only with no backend

---

## 1. Core Account Data — Mostly Wired

API: `account.getById` returns account with relations.

| Field        | Status              | Notes                                               |
| ------------ | ------------------- | --------------------------------------------------- |
| Name         | Wired               | From `account.name`                                 |
| Industry     | Wired               | From `account.industry`                             |
| Website      | Wired               | From `account.website`                              |
| Phone        | Wired               | From `account.phone`                                |
| Revenue      | Wired               | From `account.revenue` (formatted as `$X.XM`)       |
| Employees    | Wired               | From `account.employees`                            |
| Status       | Wired               | From `account.status`                               |
| Tier         | Wired               | Computed from `TIER_GRADIENTS` config (lines 49-55) |
| Health Score | Wired               | From `account.healthScore`                          |
| Created At   | Wired               | From `account.createdAt`                            |
| Updated At   | Wired               | From `account.updatedAt`                            |
| Address      | Wired               | From `account.address`                              |
| Description  | **Partially Wired** | Shown in overview but not editable inline           |

---

## 2. Owner Management — Partially Wired

| Feature            | Status              | Finding ID | Notes                                                                                                                                                                                                                       |
| ------------------ | ------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner card display | **Partially Wired** | F-01       | `AccountDetail.tsx` lines 436-454: Shows literal `"Owner Assigned"` text and `"Account Manager"` subtitle instead of actual owner name. `account.ownerId` is checked but owner relation is never accessed/returned from API |
| Assign owner       | **Not Wired**       | F-02       | No owner assignment UI or mutation. Owner card exists but is display-only with wrong data                                                                                                                                   |

### Finding F-01 (HIGH) — Owner Card Shows Static Text

```
Lines 436-454 in AccountDetail.tsx:
- Displays "Owner Assigned" as the name
- Displays "Account Manager" as the title
- account.ownerId is available but owner relation not included in getById query
- List page (AccountCard.tsx) correctly shows owner name/email — inconsistency
```

### Finding F-02 (HIGH) — No Assign Owner Action

```
No UI to assign or change account owner.
Owner exists in the data model (ownerId FK) but no mutation exposed.
AccountService has no updateOwner method.
```

---

## 3. Action Buttons — Critical Gaps

| Button                 | Status              | Finding ID | Notes                                                                                                         |
| ---------------------- | ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------- |
| Delete                 | Wired               | —          | `account.delete` mutation with AlertDialog confirmation (line 108-121)                                        |
| Edit                   | Wired               | —          | Navigates to edit route (but edit form doesn't exist — see §10)                                               |
| Merge Account          | **Partially Wired** | F-03       | Toast stub: `toast({ title: 'Merge initiated', description: 'This feature will be available with IFC-044' })` |
| Archive                | **Partially Wired** | F-04       | Toast stub referencing IFC-044, same pattern as merge                                                         |
| Create Deal (overview) | Wired               | F-05       | Opens `OpportunityCreateSheet` with accountId pre-filled (IFC-267)                                            |
| Add Contact (overview) | Wired               | F-06       | Opens `ContactAddSheet` with accountId pre-filled (IFC-267)                                                   |

### Finding F-05 ~~(CRITICAL)~~ RESOLVED — "Create Deal" Button Wired

```
RESOLVED by IFC-267 (2026-03-12):
AccountDetail.tsx: onClick={() => setCreateDealOpen(true)}
Opens OpportunityCreateSheet with accountId pre-filled.
Form creates opportunity via api.opportunity.create mutation.
Validates name, value (moneySchema), stage. Invalidates cache on success.
19 tests in OpportunityCreateSheet.test.tsx, 100% statement coverage.
```

### Finding F-06 ~~(CRITICAL)~~ RESOLVED — "Add Contact" Button Wired (Overview)

```
RESOLVED by IFC-267 (2026-03-12):
AccountDetail.tsx: onClick={() => setAddContactOpen(true)}
Opens ContactAddSheet with accountId pre-filled.
Form creates contact via api.contact.create mutation.
Validates firstName, lastName, email, phone. Invalidates cache on success.
17 tests in ContactAddSheet.test.tsx, 100% statement coverage.
```

---

## 4. Contacts Tab — Two No-Op "Add Contact" Buttons

API: `account.getContacts` returns contacts list — real data.

| Feature                            | Status              | Finding ID | Notes                                                                             |
| ---------------------------------- | ------------------- | ---------- | --------------------------------------------------------------------------------- |
| Contact list                       | Wired               | —          | Real API data via `api.account.getContacts.useQuery` (line 26-31)                 |
| Contact search                     | Wired               | —          | Client-side filter working                                                        |
| "Add Contact" button (header)      | Wired               | F-07       | Calls `onAddContact` callback → opens ContactAddSheet (IFC-267)                   |
| "Add Contact" button (empty state) | Wired               | F-08       | Calls `onAddContact` callback → opens ContactAddSheet (IFC-267)                   |
| Status filter options              | **Partially Wired** | F-09       | Hardcoded inline `<option>` values: ACTIVE, INACTIVE, LEAD — not from domain enum |

### Finding F-07 ~~(CRITICAL)~~ RESOLVED — "Add Contact" Header Button Wired

```
RESOLVED by IFC-267 (2026-03-12):
AccountContactsList.tsx: onClick={onAddContact} callback prop
AccountDetail.tsx passes onAddContact={() => setAddContactOpen(true)}
Opens ContactAddSheet with accountId pre-filled.
2 tests in AccountContactsList.test.tsx verify callback invocation.
```

### Finding F-08 ~~(CRITICAL)~~ RESOLVED — "Add Contact" Empty State Button Wired

```
RESOLVED by IFC-267 (2026-03-12):
AccountContactsList.tsx: onClick={onAddContact} on empty-state button
Same callback pattern as F-07 — both buttons share the same prop.
2 tests verify empty-state button calls onAddContact.
```

### Finding F-09 (MEDIUM) — Hardcoded Contact Status Filter

```
AccountContactsList.tsx lines 81-83:
<option value="ACTIVE">Active</option>
<option value="INACTIVE">Inactive</option>
<option value="LEAD">Lead</option>
// Should derive from ContactStatus domain enum
```

---

## 5. Opportunities Tab — Two No-Op "Create Opportunity" Buttons

API: `account.getOpportunities` returns opportunities list — real data.

| Feature                                   | Status        | Finding ID | Notes                                                                         |
| ----------------------------------------- | ------------- | ---------- | ----------------------------------------------------------------------------- |
| Opportunity list                          | Wired         | —          | Real API data via `api.account.getOpportunities.useQuery` (line 27-32)        |
| Opportunity search                        | Wired         | —          | Client-side filter working                                                    |
| "Create Opportunity" button (header)      | Wired         | F-10       | Calls `onCreateOpportunity` callback → opens OpportunityCreateSheet (IFC-267) |
| "Create Opportunity" button (empty state) | Wired         | F-11       | Calls `onCreateOpportunity` callback → opens OpportunityCreateSheet (IFC-267) |
| Stage filter options                      | **Not Wired** | F-12       | Hardcoded 6 stage values as inline strings, not from domain enum              |

### Finding F-10 ~~(CRITICAL)~~ RESOLVED — "Create Opportunity" Header Button Wired

```
RESOLVED by IFC-267 (2026-03-12):
AccountOpportunitiesList.tsx: onClick={onCreateOpportunity} callback prop
AccountDetail.tsx passes onCreateOpportunity={() => setCreateDealOpen(true)}
Opens OpportunityCreateSheet with accountId pre-filled.
2 tests in AccountOpportunitiesList.test.tsx verify callback invocation.
```

### Finding F-11 ~~(CRITICAL)~~ RESOLVED — "Create Opportunity" Empty State Button Wired

```
RESOLVED by IFC-267 (2026-03-12):
AccountOpportunitiesList.tsx: onClick={onCreateOpportunity} on empty-state button
Same callback pattern as F-10 — both buttons share the same prop.
2 tests verify empty-state button calls onCreateOpportunity.
```

### Finding F-12 (MEDIUM) — Hardcoded Stage Filter

```
AccountOpportunitiesList.tsx lines 109-114:
Hardcoded stage options: PROSPECTING, QUALIFICATION, PROPOSAL, NEGOTIATION, CLOSED_WON, CLOSED_LOST
Should derive from OpportunityStage domain enum or pipeline config
```

---

## 6. Activity Tab — Stub Data

| Feature           | Status        | Finding ID | Notes                                                                                                                                                                                                 |
| ----------------- | ------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity timeline | **Not Wired** | F-13       | `account.getActivity` router procedure exists but `AccountService.getAccountActivity()` (lines 748-785) returns synthetic/stub activities only — hardcoded activity descriptions, broken cursor logic |

### Finding F-13 (HIGH) — Activity Timeline Returns Stub Data

```
AccountService.ts lines 748-785:
getAccountActivity() creates synthetic activities from account metadata
rather than fetching real activity records. Activity descriptions are
template strings, not from an Activity model. Cursor/pagination logic
has edge cases (page calculation). Account detail page renders this
synthetic data as if it were real timeline events.
```

---

## 7. Pipeline Tab — Wired

Pipeline tab renders real data passed from the opportunities query. No findings.

---

## 8. Hierarchy Tab — Fully Wired

| Feature           | Status | Notes                                                                |
| ----------------- | ------ | -------------------------------------------------------------------- |
| Hierarchy display | Wired  | `api.account.getHierarchy.useQuery` (line 200)                       |
| Set Parent        | Wired  | `api.account.setParent.useMutation` (line 204-208) with confirmation |
| Remove Parent     | Wired  | Same mutation with null parent                                       |

No findings — hierarchy is the best-wired feature on account detail.

---

## 9. Revenue & Health Display

| Feature        | Status | Finding ID | Notes                                                                                         |
| -------------- | ------ | ---------- | --------------------------------------------------------------------------------------------- |
| Revenue format | Wired  | F-14       | `Number(account.revenue) / 1_000_000` at line 411 — NaN risk if revenue is non-numeric string |
| Health bar     | Wired  | F-15       | Arbitrary scale visualization, no documented max value                                        |
| Revenue chart  | Wired  | —          | `RevenueChart.tsx` receives props, has division guard (`totalValue > 0`)                      |

### Finding F-14 (LOW) — Revenue NaN Risk

```
AccountDetail.tsx line 411:
`$${(Number(account.revenue) / 1_000_000).toFixed(1)}M`
If account.revenue is null, undefined, or non-numeric string,
Number() returns NaN → renders "$NaNM" in the UI
```

### Finding F-15 (LOW) — Health Bar Arbitrary Scale

```
AccountDetail.tsx health bar rendering:
Uses percentage width but no documented max value.
Health score could exceed 100 causing visual overflow.
```

---

## 10. Create / Edit Forms — Missing

| Feature             | Status        | Finding ID | Notes                                                                              |
| ------------------- | ------------- | ---------- | ---------------------------------------------------------------------------------- |
| Account create form | **Not Wired** | F-16       | No create form page exists in frontend. Router has `create` procedure.             |
| Account edit form   | **Not Wired** | F-17       | Edit button navigates but no edit form/page exists. Router has `update` procedure. |

### Finding F-16 (HIGH) — No Account Create Form

```
No create form page at apps/web/src/app/accounts/(list)/new/page.tsx
or similar. Router `account.create` procedure exists but has no frontend
consumer. Users cannot create accounts via the UI.
```

### Finding F-17 (HIGH) — No Account Edit Form

```
Edit button on AccountDetail navigates to an edit route, but no edit
form component or page exists. Router `account.update` procedure exists.
Users can click Edit but land on a 404 or empty page.
```

---

## 11. Backend Security — Tenant Isolation Gaps

| Issue                          | Severity | Finding ID | Notes                                                                                                                                                                                                                        |
| ------------------------------ | -------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `filterOptions` raw prisma     | CRITICAL | B-01       | `account.router.ts` line 445: Uses `ctx.prisma` instead of `prismaWithTenant` for user lookup — bypasses tenant isolation                                                                                                    |
| Repository no tenant filter    | HIGH     | B-02       | `PrismaAccountRepository.ts`: ALL methods (`findById`, `findByName`, `findByOwnerId`, `findByIndustry`, `existsByName`, `delete`) have NO `tenantId` filter. Relies entirely on `prismaWithTenant` RLS proxy at router level |
| `existsByName` cross-tenant    | HIGH     | B-03       | `PrismaAccountRepository.ts` line 130-135: `existsByName()` blocks same account name across ALL tenants. Should only check within current tenant                                                                             |
| `sortBy` unsanitized           | MEDIUM   | B-04       | `account.router.ts` line 185: `sortBy` from user input used directly in Prisma `orderBy` — potential injection vector                                                                                                        |
| TOCTOU update/delete           | MEDIUM   | B-05       | Update and delete procedures fetch then modify without transaction — race condition window                                                                                                                                   |
| `user!.userId` non-null assert | LOW      | B-06       | `account.router.ts` line 596: Non-null assertion on user — throws unhelpful error if null                                                                                                                                    |
| Zero audit logging             | HIGH     | B-07       | No `auditLogger.log()` calls in any account mutation (create, update, delete, setParent)                                                                                                                                     |

### Finding B-01 (CRITICAL) — `filterOptions` Bypasses Tenant Isolation

```
account.router.ts line 445:
filterOptions procedure uses ctx.prisma (raw) instead of prismaWithTenant
for user lookup. User data from other tenants could leak into filter
dropdown options.
```

### Finding B-02 (HIGH) — Repository Has No Tenant Filtering

```
PrismaAccountRepository.ts:
Every method (findById, findByName, findByOwnerId, etc.) queries
without tenantId WHERE clause. This is "safe" only because the router
uses prismaWithTenant which applies RLS — but any direct service call
that passes the real prisma client would be cross-tenant.
Single-layer defense pattern — fragile.
```

### Finding B-03 (HIGH) — Cross-Tenant Name Uniqueness

```
PrismaAccountRepository.ts line 130-135:
existsByName(name) checks across all tenants.
Two different companies (tenants) cannot have an account named "Acme Corp".
This is a business logic error — name uniqueness should be per-tenant.
```

---

## 12. Backend Logic — Update Drops Fields

| Issue                                | Severity | Finding ID | Notes                                                                                                                                                                                                                    |
| ------------------------------------ | -------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Update drops fields                  | HIGH     | B-08       | `account.router.ts` lines 246-255: Update procedure accepts `revenue`, `employees`, `industry`, `parentAccountId` via schema but service ignores them — only passes `name`, `phone`, `website`, `address`, `description` |
| Schema key mismatch                  | HIGH     | B-09       | `accountListResponseSchema` uses `data` key but router returns `accounts` key — response doesn't match validator schema                                                                                                  |
| No `updateRevenue` procedure         | MEDIUM   | B-10       | Domain has `Account.updateRevenue()` but no router procedure exposes it — method unreachable via API                                                                                                                     |
| No `updateEmployeeCount` procedure   | MEDIUM   | B-11       | Domain has `Account.updateEmployeeCount()` but no router procedure — unreachable                                                                                                                                         |
| No `categorizeIndustry` procedure    | MEDIUM   | B-12       | Domain has `Account.categorizeIndustry()` but no router procedure — unreachable                                                                                                                                          |
| `WebsiteUrl` object returned         | MEDIUM   | B-13       | `mapAccountToResponse` returns raw `WebsiteUrl` value object, not string — frontend receives `{ value: 'https://...' }` instead of `'https://...'`                                                                       |
| `findAncestors` N+1                  | LOW      | B-14       | Repository lines 180-206: Iterative single-query ancestor walk — N+1 pattern for deep hierarchies                                                                                                                        |
| `toJSON` omits tenantId              | LOW      | B-15       | `Account.ts` lines 284-298: `toJSON()` excludes `tenantId` from serialized output                                                                                                                                        |
| `updateAccountInfo` return discarded | LOW      | B-16       | Service calls `account.updateAccountInfo()` but discards the `Result` return — silent validation failures                                                                                                                |

### Finding B-08 (HIGH) — Update Silently Drops Fields

```
account.router.ts lines 246-255:
updateAccountSchema includes: revenue, employees, industry, parentAccountId
But router only passes to service: name, phone, website, address, description
User can submit revenue/employee changes that are silently ignored.
```

### Finding B-09 (HIGH) — Schema/Router Key Mismatch

```
validators/src/account.ts line 75:
accountListResponseSchema uses z.object({ data: z.array(...) })
But account.router.ts list procedure returns { accounts: [...] }
Key mismatch — validator would reject the actual response.
```

---

## 13. Domain Model — Missing Events

| Issue                              | Severity | Finding ID | Notes                                                                                                                                         |
| ---------------------------------- | -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No `AccountDeletedEvent`           | MEDIUM   | D-01       | 5 events defined but no delete event — deletions produce no domain event. Audit handler has AccountDeleted mapping but event is never emitted |
| Dead code: `calculateHealth`       | LOW      | D-02       | `AccountService.calculateAccountHealth()` (line ~295) has no caller from router — unreachable via API                                         |
| Dead code: `getAccountWithContext` | LOW      | D-03       | `AccountService.getAccountWithContext()` (line ~366) has no caller — unreachable                                                              |

### Finding D-01 (MEDIUM) — No AccountDeletedEvent

```
AccountEvents.ts defines 5 events:
- AccountCreatedEvent
- AccountUpdatedEvent
- AccountRevenueUpdatedEvent
- AccountHierarchyUpdatedEvent
- AccountIndustryCategorizedEvent

Missing: AccountDeletedEvent
Audit handler at security/audit-event-handler.ts line 165 maps
'AccountDeleted' event type — but the event is never emitted.
```

---

## 14. Events Worker — Zero Account Handlers

| Issue                                | Severity | Finding ID | Notes                                                                                                                                                                                                 |
| ------------------------------------ | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No event handlers                    | HIGH     | W-01       | `events-worker/src/main.ts`: Zero account event handlers registered                                                                                                                                   |
| No event types                       | HIGH     | W-02       | `event-dispatcher.ts`: Zero account event types in `DOMAIN_EVENT_TYPES` map                                                                                                                           |
| Audit handler mapped but unreachable | MEDIUM   | W-03       | `audit-event-handler.ts` maps 3 account events (Created, Updated, Deleted) but events never reach the handler because events worker has no handlers and DOMAIN_EVENT_TYPES is missing account entries |

### Finding W-01 (HIGH) — Zero Event Handlers in Worker

```
events-worker/src/main.ts:
Has handlers for Lead events (LeadCreated, LeadUpdated, LeadScored, etc.)
Has handlers for Contact events (ContactCreated, ContactUpdated)
ZERO handlers for any Account event type.
Account mutations produce domain events that are never consumed.
```

---

## 15. List Page — Type Safety Issues

| Issue                         | Severity | Finding ID | Notes                                                                                                                                           |
| ----------------------------- | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `serverStats as any`          | MEDIUM   | L-01       | `AccountsPageClient.tsx` line 154: Stats query result cast to `any`                                                                             |
| Double unsafe cast            | MEDIUM   | L-02       | `AccountsPageClient.tsx` lines 206-208: `(stats as Record<string, unknown>)?.withOpportunities as number \| undefined` — cascading unsafe casts |
| Contact email not mailto      | LOW      | L-03       | Contact emails in contacts list rendered as plain text, not as `mailto:` links                                                                  |
| AccountTier local duplication | LOW      | L-04       | `AccountCard.tsx` defines `AccountTier` type and `getAccountTier()` locally — should use domain enum from `@intelliflow/domain`                 |

### Finding L-01 (MEDIUM) — Stats Cast to Any

```
AccountsPageClient.tsx line 154:
const { data: serverStats } = api.account.stats.useQuery(
  undefined,
  { enabled: isAuthenticated }
) as any;
// Loses all type safety for stats data
```

---

## 16. Merge/Archive — Toast Stubs

| Feature         | Status              | Finding ID | Notes                             |
| --------------- | ------------------- | ---------- | --------------------------------- |
| Merge Account   | **Partially Wired** | F-03       | Toast stub with IFC-044 reference |
| Archive Account | **Partially Wired** | F-04       | Toast stub with IFC-044 reference |

### Finding F-03 (LOW) — Merge Stub Toast

```
AccountDetail.tsx line ~261:
onClick={() => toast({
  title: 'Merge initiated',
  description: 'This feature will be available with IFC-044'
})}
No actual merge logic — but at least warns user.
```

### Finding F-04 (LOW) — Archive Stub Toast

```
AccountDetail.tsx line ~279:
Same pattern as merge — toast stub referencing IFC-044.
No archive mutation or status change.
```

---

## 17. Contact Avatar Risk

| Issue                    | Severity | Finding ID | Notes                                                                                                                                                             |
| ------------------------ | -------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `firstName[0]` undefined | LOW      | F-18       | `AccountContactsList.tsx`: Avatar fallback uses `contact.firstName[0]` — if firstName is empty string, returns `undefined` which renders as empty avatar or error |

---

## 18. Cross-Entity Overlap

Several account findings share patterns with Lead/Contact audits:

| Pattern              | Account                                         | Lead                          | Contact                       |
| -------------------- | ----------------------------------------------- | ----------------------------- | ----------------------------- |
| No-op action buttons | ~~6 buttons~~ 0 (F-05–F-11 resolved by IFC-267) | 8+ buttons                    | 6 buttons                     |
| Owner display wrong  | Static text (F-01)                              | Hardcoded "Account Executive" | Hardcoded "Account Executive" |
| Missing delete event | No AccountDeletedEvent (D-01)                   | —                             | No ContactDeletedEvent        |
| Event worker gaps    | Zero handlers (W-01, W-02)                      | —                             | Zero handlers                 |
| Schema key mismatch  | data vs accounts (B-09)                         | —                             | data vs contacts              |
| No audit logging     | Zero calls (B-07)                               | —                             | —                             |
| No create/edit forms | Both missing (F-16, F-17)                       | —                             | No create form                |
| Stub activity data   | Synthetic activities (F-13)                     | —                             | —                             |

---

## 19. Test Coverage Analysis

10 test files, 3,158 total lines — better coverage than Lead or Contact.

| File                                | Lines | Coverage                             |
| ----------------------------------- | ----- | ------------------------------------ |
| `account.router.test.ts`            | 1,549 | Good — covers CRUD, stats, filter    |
| `account.router.hierarchy.test.ts`  | 206   | Good — covers hierarchy mutations    |
| `AccountDetail.test.tsx`            | 322   | Basic — renders, tabs, delete dialog |
| `AccountHierarchy.test.tsx`         | 271   | Good — set/remove parent             |
| `AccountOpportunitiesList.test.tsx` | 168   | Basic — renders list                 |
| `AccountContactsList.test.tsx`      | 168   | Basic — renders list                 |
| `RevenueChart.test.tsx`             | 122   | Good — chart rendering               |
| `AccountCard.test.tsx`              | 97    | Basic — card rendering               |
| `page.test.tsx` (list)              | 146   | Auth guard, loading states           |
| `page.test.tsx` (detail)            | 109   | Auth guard, loading states           |

### Test Gaps

| Gap                        | Finding ID | Notes                                                                    |
| -------------------------- | ---------- | ------------------------------------------------------------------------ |
| No contract test           | T-01       | Accounts is the ONLY entity without a contract test file                 |
| ~~No-op buttons untested~~ | ~~T-02~~   | RESOLVED by IFC-267: All 6 buttons tested (36 tests across 5 test files) |
| Tenant isolation untested  | T-03       | Router tests don't verify tenant isolation                               |
| No E2E tests               | T-04       | No Playwright tests for account CRUD flow                                |
| Owner display untested     | T-05       | Tests don't verify owner name/title rendering                            |

---

## 20. Positive Findings (No Action Needed)

These areas are properly wired and require no remediation:

1. **Auth guards**: Both list and detail pages use `useRequireAuth()` correctly
2. **Hierarchy tab**: Fully wired with set/remove parent mutations and
   confirmation dialogs
3. **Delete flow**: AlertDialog confirmation + `account.delete` mutation +
   navigation on success
4. **Avatars**: Uses initials-based avatars (no Unsplash stranger photos like
   Lead/Contact)
5. **Revenue chart**: Division guards in place (`totalValue > 0` check)
6. **Tier computation**: Real `TIER_GRADIENTS` config, not mock data
7. **All 6 tabs**: Use real API queries — no hardcoded tab data
8. **Search/filter**: Client-side filtering works on contacts and opportunities
   lists

---

## Priority Fixes

| Priority | Finding IDs                                    | Task    | Description                                                                                      |
| -------- | ---------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------ |
| ~~P0~~   | ~~F-05, F-06, F-07, F-08, F-10, F-11~~         | IFC-267 | ~~Wire 6 no-op action buttons~~ RESOLVED (2026-03-12) — OpportunityCreateSheet + ContactAddSheet |
| P0       | B-01, B-02, B-03, B-04, B-05, B-07             | IFC-269 | Fix filterOptions tenant isolation, repository tenant filters, audit logging                     |
| P1       | F-01, F-02                                     | IFC-268 | Fix owner display and add owner assignment                                                       |
| P1       | B-08, B-09, B-10, B-11, B-12, B-13             | IFC-270 | Fix router update procedure, schema mismatch, expose domain commands                             |
| P1       | D-01, B-15, B-16, B-06                         | IFC-271 | Domain model fixes: AccountDeletedEvent, toJSON, Result handling                                 |
| P1       | W-01, W-02, W-03                               | IFC-272 | Add account event handlers to events worker (depends on IFC-271)                                 |
| P1       | F-13                                           | IFC-274 | Replace stub activity data with real timeline                                                    |
| P1       | F-16, F-17                                     | IFC-275 | Create account create and edit forms (depends on IFC-270)                                        |
| P2       | L-01, L-02, L-04, F-09, F-12                   | IFC-273 | Type safety fixes, domain enum usage for filters                                                 |
| P2       | T-01, T-02, T-03, T-04, T-05                   | IFC-276 | Contract test, button click tests, tenant tests, E2E (depends on IFC-267, IFC-268)               |
| P3       | F-03, F-04, F-14, F-15, F-18, B-14, D-02, D-03 | IFC-277 | Stub toasts, NaN guard, dead code cleanup                                                        |

---

## Changes Log

| Date       | Change                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| 2026-03-05 | Created — 43 findings (7 CRITICAL, 12 HIGH, 10 MEDIUM, 9 LOW, 5 test gaps)                                                |
| 2026-03-05 | Tasks assigned: IFC-267 to IFC-277 (11 tasks across sprints 16/18/20/22/24)                                               |
| 2026-03-13 | IFC-267 RESOLVED: F-05–F-11 (6 CRITICAL no-op buttons) all wired. T-02 resolved. Grand total 43→36 findings, CRITICAL 7→1 |
