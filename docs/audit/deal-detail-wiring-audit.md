# Deal / Opportunity Detail — Wiring Audit

**Detail Page**: `apps/web/src/app/deals/[id]/page.tsx` (~792 lines) **List
Page**: `apps/web/src/app/deals/(list)/page.tsx` (~531 lines) **List
Component**: `apps/web/src/components/deals/DealListView.tsx` (~675 lines)
**Forecast Page**: `apps/web/src/app/deals/forecast/page.tsx` (~733 lines)
**Deal Forecast Page**: `apps/web/src/app/deals/[id]/forecast/page.tsx` (~205
lines) **API**: `apps/api/src/modules/opportunity/opportunity.router.ts` (~919
lines, 11 procedures) **Pipeline Config**:
`apps/api/src/modules/opportunity/pipeline-config.router.ts` (~259 lines, 5
procedures) **Domain**: `packages/domain/src/crm/opportunity/Opportunity.ts`
(~454 lines) **Service**:
`packages/application/src/services/OpportunityService.ts` (~830 lines)
**Repository**:
`packages/adapters/src/repositories/PrismaOpportunityRepository.ts` (~306 lines)
**Date**: 2026-03-06 (created — comprehensive flow analysis)

---

## Summary

| Category                 | Wired  | Partially Wired | Not Wired |
| ------------------------ | ------ | --------------- | --------- |
| Deal Detail — All Fields | 0      | 0               | 15        |
| Deal List / Pipeline     | 8      | 1               | 1         |
| Forecast (Portfolio)     | 6      | 2               | 0         |
| Forecast (Per-Deal)      | 4      | 1               | 0         |
| Detail Action Buttons    | 1      | 0               | 14        |
| Create / Edit Forms      | 0      | 0               | 2         |
| Activity Feed            | 1      | 0               | 0         |
| Related Tasks            | 1      | 0               | 0         |
| Filters                  | 1      | 1               | 1         |
| **Total**                | **22** | **5**           | **33**    |

### Comprehensive Flow Analysis

| Category                  | CRITICAL | HIGH   | MEDIUM | LOW    | Test Gaps |
| ------------------------- | -------- | ------ | ------ | ------ | --------- |
| Frontend — Detail Page    | 2        | 3      | 2      | 3      | —         |
| Frontend — Action Buttons | 1        | 1      | 0      | 0      | —         |
| Frontend — List/Forecast  | 0        | 1      | 4      | 2      | —         |
| Backend Security          | 2        | 0      | 1      | 0      | —         |
| Backend Logic             | 0        | 4      | 4      | 5      | —         |
| Integration / Events      | 0        | 2      | 1      | 0      | —         |
| Test Coverage             | —        | —      | —      | —      | 4         |
| **Total**                 | **5**    | **11** | **12** | **10** | **4**     |

**Grand total: 42 findings** (5 CRITICAL, 11 HIGH, 12 MEDIUM, 10 LOW, 4 test
gaps)

The deal domain is the **worst-wired entity** in the CRM. The detail page is
entirely hardcoded with `SAMPLE_DEAL` (zero API calls), 14 action buttons are
no-ops, no create/edit forms exist, and the backend has cross-tenant data leak
vulnerabilities. The list/pipeline views and forecast pages are well-wired by
contrast.

---

## 1. Deal Detail Page — 100% Hardcoded (CRITICAL)

### Finding F-01 (CRITICAL) — Entire Detail Page Uses SAMPLE_DEAL

```
deals/[id]/page.tsx lines 116-150, 684:
const SAMPLE_DEAL: Deal = {
  id: 'DL-4920',
  name: 'Acme Corp Software License',
  value: 125000,
  stage: 'PROPOSAL',
  probability: 60,
  expectedCloseDate: '2025-01-24',
  source: 'Web Referral',
  owner: { name: 'Jane Doe', avatar: 'JD' },
  account: { name: 'Acme Corp', location: 'San Francisco, CA' },
  contact: { name: 'Robert Fox', title: 'CTO', avatar: 'RF' },
  products: [...], nextSteps: [...], files: [...]
};

Line 684: const deal = SAMPLE_DEAL;
// Comment: "In production, fetch deal data based on dealId"
```

The `dealId` from `useParams()` is captured but never used for any data fetch.
Every deal detail page renders the same static deal regardless of URL. This
violates the "Never Mock or Simulate Data" project rule. The only real API
connections on this page are `ActivityFeed` (line 773) and `RelatedTasksCard`
(line 784) which receive `entityId={dealId}`.

| Field          | Source                                              | Real? |
| -------------- | --------------------------------------------------- | ----- |
| Deal name      | `SAMPLE_DEAL.name` = `'Acme Corp Software License'` | NO    |
| Deal value     | `SAMPLE_DEAL.value` = `125000`                      | NO    |
| Stage          | `SAMPLE_DEAL.stage` = `'PROPOSAL'`                  | NO    |
| Probability    | `SAMPLE_DEAL.probability` = `60`                    | NO    |
| Expected close | `SAMPLE_DEAL.expectedCloseDate` = `'2025-01-24'`    | NO    |
| Source         | `SAMPLE_DEAL.source` = `'Web Referral'`             | NO    |
| Owner          | `SAMPLE_DEAL.owner.name` = `'Jane Doe'`             | NO    |
| Account        | `SAMPLE_DEAL.account.name` = `'Acme Corp'`          | NO    |
| Contact        | `SAMPLE_DEAL.contact.name` = `'Robert Fox'`         | NO    |
| Products       | 2 hardcoded products                                | NO    |
| Next steps     | 2 hardcoded tasks                                   | NO    |
| Files          | 2 hardcoded files                                   | NO    |
| Activity feed  | `ActivityFeed` component with `entityId`            | YES   |
| Related tasks  | `RelatedTasksCard` with `entityId`                  | YES   |

### Finding F-02 (CRITICAL) — No `/deals/new` Route

```
deals/(list)/page.tsx lines 454, 492:
Both "New Deal" buttons link href='/deals/new'
but no page file exists at apps/web/src/app/deals/new/
Clicking produces a Next.js 404 page.
```

### Finding F-03 (HIGH) — No Auth Guard on Deal Detail

```
deals/[id]/page.tsx:
No useRequireAuth() call. Page renders to any visitor.
List page, forecast pages all have useRequireAuth().
When SAMPLE_DEAL is replaced with real data, this is a security gap.
```

### Finding F-04 (HIGH) — STAGES Constant Mismatches Domain

```
deals/[id]/page.tsx lines 104-110:
const STAGES = ['PROSPECTING', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'CLOSED']
- Uses 'CLOSED' — domain has CLOSED_WON and CLOSED_LOST (separate stages)
- Omits 'NEEDS_ANALYSIS' — domain has 7 stages, this has 5
- StageProgress component renders this mismatch
```

### Finding F-05 (HIGH) — StageProgress References SAMPLE_DEAL Directly

```
deals/[id]/page.tsx line 273:
StageProgress sub-component references SAMPLE_DEAL.value directly
in its JSX rather than using the deal prop — bypasses prop-based data flow.
```

### Finding F-06 (MEDIUM) — Dead Code \_SAMPLE_ACTIVITIES

```
deals/[id]/page.tsx lines 152-203:
const _SAMPLE_ACTIVITIES = [...] // 5 hardcoded activity events
Prefixed with _, never referenced. Dead code.
```

### Finding F-07 (LOW) — No Clickable Account/Contact Links

```
deals/[id]/page.tsx:
Account card shows name/location as text only — no href to /accounts/[id]
Contact card shows name/title as text only — no href to /contacts/[id]
When wired to real data, these should link to entity detail pages.
```

---

## 2. Deal Detail Action Buttons — 14 No-Ops

### Finding F-08 (CRITICAL) — EntityHeader 6 No-Op Buttons

All `onClick: () => {}` (empty function) on the deal detail page:

| Button     | Line    | Handler                                                          |
| ---------- | ------- | ---------------------------------------------------------------- |
| Won        | 715-720 | `onClick: () => {}`                                              |
| Lost       | 705-709 | `onClick: () => {}`                                              |
| Edit       | 710-713 | `onClick: () => {}`                                              |
| Clone Deal | 747     | `onClick: () => {}`                                              |
| Archive    | 748     | `onClick: () => {}`                                              |
| Delete     | 749     | `onClick: () => {}` (marked `destructive: true` but still no-op) |

Only the Forecast button (line 701-704) works — links to
`/deals/${dealId}/forecast`.

### Finding F-09 (HIGH) — Stakeholder & Product & File Buttons — 8 No-Ops

| Button                     | Line     | Handler                   |
| -------------------------- | -------- | ------------------------- |
| Stakeholders "Edit"        | ~361     | No `onClick` prop         |
| Account "open in new" icon | ~373-376 | No `onClick`              |
| Account "web" icon         | ~377-380 | No `onClick`              |
| Contact "mail" icon        | ~394-399 | No `onClick`              |
| Contact "phone" icon       | ~400-405 | No `onClick`              |
| Products "Add product" (+) | ~593-596 | No `onClick`              |
| Files upload icon          | ~645-648 | No `onClick`              |
| File download links        | ~651-668 | `href="#"` — goes nowhere |

---

## 3. Deal List / Pipeline — Mostly Wired

| Feature                    | Status        | Notes                                                                                      |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| Pipeline board (kanban)    | Wired         | `trpc.opportunity.list.useQuery` (line 226-233), `moveStage.useMutation` (line 263-300)    |
| List view (table)          | Wired         | `DealListView.tsx` has own `trpc.opportunity.list.useQuery` (line 323-333) with pagination |
| Stage move (kanban DnD)    | Wired         | Fires `moveStage` mutation with `LossReasonModal` for CLOSED_LOST                          |
| Stage move (list dropdown) | Wired         | `StatusSelectDialog` → `update` mutation                                                   |
| Delete (list)              | Wired         | `ConfirmationDialog` → `delete` mutation                                                   |
| Bulk stage move            | Wired         | Parallel `update` mutations for selected deals                                             |
| Bulk delete                | Wired         | Parallel `delete` mutations for selected deals                                             |
| View toggle (kanban/list)  | Wired         | URL push + state management                                                                |
| New Deal button            | **Not Wired** | F-02 — links to `/deals/new` which is a 404                                                |
| Error/retry states         | Wired         | Both views have error display with retry button                                            |

### Finding F-10 (HIGH) — DealFilters Not Passed to API

```
deals/(list)/page.tsx line 214:
const [filters, setFilters] = useState<DealFiltersValue>({})
DealFilters component updates this state, but the trpc.opportunity.list.useQuery
call at line 226 IGNORES filters entirely — ownerId and dateRange selections
have no effect on displayed data. DealListView has its own independent filter state.
```

### Finding F-11 (MEDIUM) — "More Filters" Button No-Op

```
DealFilters.tsx:
"More Filters" button has no onClick handler — dead button.
```

### Finding F-12 (MEDIUM) — Owner Filter Only Has 2 Options

```
DealFilters.tsx:
Owner dropdown: ['All Deals', 'My Deals'] — hardcoded, no dynamic user list.
```

### Finding F-13 (LOW) — DealQuickView Is a Stub

```
DealQuickView.tsx (49 lines):
Renders "Deal details will be shown here in a future update."
with a single "View Details" navigation button. Not used in any page.
```

---

## 4. Forecast Pages — Mostly Wired

### Portfolio Forecast (`deals/forecast/page.tsx`)

| Feature               | Status              | Notes                                               |
| --------------------- | ------------------- | --------------------------------------------------- |
| Forecast data         | Wired               | `trpc.opportunity.forecast.useQuery` (line 514-518) |
| Pipeline value        | Wired               | From API response                                   |
| Weighted forecast     | Wired               | From API response                                   |
| Stage breakdown       | Wired               | From API response                                   |
| At-risk deals table   | Wired               | From API response with row click navigation         |
| Win rate trend        | Wired               | From API (but backend has hardcoded months — B-06)  |
| Export Report         | Wired               | Full CSV build + Blob download                      |
| "This Quarter" button | **Partially Wired** | F-14 — toast stub referencing IFC-048               |
| "USD" currency button | **Partially Wired** | F-15 — toast stub referencing IFC-201               |

### Finding F-14 (MEDIUM) — Forecast Quarter Filter Stub

```
deals/forecast/page.tsx lines 649-654:
onClick: () => toast({
  title: 'Quarter filter not yet implemented',
  description: 'Coming in IFC-048'
})
```

### Finding F-15 (MEDIUM) — Forecast Currency Stub

```
deals/forecast/page.tsx lines 660-665:
onClick: () => toast({
  title: 'Multi-currency not yet implemented',
  description: 'Coming in IFC-201'
})
```

### Finding F-16 (LOW) — Forecast Trend Values Hardcoded

```
deals/forecast/page.tsx lines 709-710:
PipelineValueCard trend={12}
WeightedForecastCard trend={5}
No trend computation from API — static numbers.
```

### Finding F-17 (LOW) — At-Risk Table Uses window.location.href

```
deals/forecast/page.tsx line 353:
window.location.href = `/deals/${deal.id}`
Causes full page reload instead of SPA navigation via router.push()
```

### Per-Deal Forecast (`deals/[id]/forecast/page.tsx`)

| Feature              | Status              | Notes                                                 |
| -------------------- | ------------------- | ----------------------------------------------------- |
| Deal forecast data   | Wired               | `trpc.opportunity.dealForecast.useQuery` (line 74-77) |
| Probability gauge    | Wired               | From API response                                     |
| Risk factors         | Wired               | From API response                                     |
| Confidence indicator | Wired               | From API response                                     |
| Forecast history     | Wired               | From API response                                     |
| Recommended actions  | **Partially Wired** | F-18 — `onActionClick` prop not wired at page level   |

### Finding F-18 (LOW) — RecommendedActions Click Not Wired

```
deals/[id]/forecast/page.tsx line 160:
<RecommendedActions recommendations={[...data.recommendations]} />
// onActionClick prop not passed — clicking action cards is a no-op
```

---

## 5. Backend — Tenant Isolation (CRITICAL)

### Finding B-01 (CRITICAL) — Cross-Tenant Data Leak via Repository

```
PrismaOpportunityRepository.ts line 82:
findById(id) calls prisma.opportunity.findUnique({ where: { id } })
NO tenantId in WHERE clause.

Affected procedures (all reachable from router):
- getById: read any tenant's deal
- update: modify any tenant's deal
- delete: remove any tenant's deal
- moveStage: change any tenant's deal stage
- dealForecast: read any tenant's deal forecast data

Root cause: PrismaOpportunityRepository does not filter by tenantId
in findById() or findByOwnerId(). The router passes raw service calls
without prismaWithTenant protection for these code paths.
```

### Finding B-02 (CRITICAL) — Zero Audit Logging

```
opportunity.router.ts + pipeline-config.router.ts:
Zero auditLogger.log() calls across all 16 procedures.
No audit trail for: deal creation, updates, deletion,
stage transitions (including CLOSED_WON/CLOSED_LOST),
or pipeline config changes.
```

### Finding B-03 (MEDIUM) — Create Notification Uses Raw ctx.prisma

```
opportunity.router.ts create procedure:
Fire-and-forget createNotification() uses raw ctx.prisma
(not prismaWithTenant) for the notification query.
```

---

## 6. Backend Logic — Correctness Issues

### Finding B-04 (HIGH) — Name Updates Silently Dropped

```
OpportunityService.ts line 313:
// TODO: Add updateName method to Opportunity domain entity
The update procedure accepts 'name' in input schema but the service
never persists name changes. Silently drops the update.
```

### Finding B-05 (HIGH) — Probability Unwrapping May Be Undefined

```
opportunity.router.ts line 460:
data.probability?.value
If percentageSchema returns a plain number (not { value: number }),
then .value is undefined — probability updates are silently dropped.
```

### Finding B-06 (HIGH) — Win Rate Trend Hardcoded Months

```
forecast-algorithm.ts line 283:
const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
Static months regardless of current date. For a March 2026 request,
the data window is Oct-Mar but the trend displays May-Oct.
Semantically incorrect data returned to client.
```

### Finding B-07 (HIGH) — Schema Key Mismatch (data vs opportunities)

```
validators/opportunity.ts line 88:
opportunityListResponseSchema uses { data: z.array(...) }
opportunity.router.ts line 437 returns { opportunities: [...] }
Key name mismatch — validator would reject actual response.
Same pattern as Account (B-09) and Contact.
```

### Finding B-08 (MEDIUM) — Stage Probabilities Diverge Between Layers

```
validators/opportunity.ts DEFAULT_STAGE_PROBABILITIES:
  NEEDS_ANALYSIS=30, PROPOSAL=70

domain/Opportunity.ts + service + router + forecast-algorithm:
  NEEDS_ANALYSIS=40, PROPOSAL=60

Pipeline config UI shows 30/70 while domain logic uses 40/60.
```

### Finding B-09 (MEDIUM) — VALIDATION_ERROR Mapped to NOT_FOUND

```
opportunity.router.ts line 55:
throwOpportunityCreateError maps VALIDATION_ERROR to NOT_FOUND.
Wrong HTTP semantic — validation errors should be BAD_REQUEST.
```

### Finding B-10 (MEDIUM) — validateStageDeactivation Throws Plain Error

```
validators/opportunity.ts line 214:
validateStageDeactivation throws new Error(...)
pipeline-config.router.ts lines 106, 163 call this function.
Plain throw becomes INTERNAL_SERVER_ERROR (500) instead of BAD_REQUEST (400).
```

### Finding B-11 (MEDIUM) — mapOpportunityToResponse Drops closedAt

```
shared/mappers.ts lines 88-108:
mapOpportunityToResponse returns currency, weightedValue, isClosed,
isWon, isLost but does NOT include closedAt.
opportunityResponseSchema defines closedAt but mapper never emits it.
Clients always receive closedAt: undefined.
```

### Finding B-12 (LOW) — CLOSED_LOST No-Reason Validation Gap

```
opportunity.router.ts line 322:
moveStage to CLOSED_LOST passes reason: input.reason || ''
moveStageSchema makes reason optional with min(10) when provided.
So moveStage({ targetStage: 'CLOSED_LOST' }) with no reason passes Zod
but service markAsLost() enforces min 10 chars → service-level error.
```

### Finding B-13 (LOW) — 11 Dead Service Methods

```
OpportunityService.ts — not reachable from any router procedure:
- listOpportunities() (bypassed by router's direct Prisma query)
- advanceStage()
- updateValue() (standalone, unused)
- updateProbability() (standalone, unused)
- updateExpectedCloseDate() (standalone, unused)
- reopenOpportunity() (no router endpoint)
- getPipelineForecast() (router has inline implementation)
- getOpportunitiesClosingSoon()
- getHighValueOpportunities()
- getOpportunitiesByAccount()
- getOpportunitiesByContact()
- getWinRateStatistics()
```

### Finding B-14 (LOW) — toMoney/toPercentage Silent Zero Fallback

```
PrismaOpportunityRepository.ts lines 25-38:
Invalid money/percentage in DB → silently returns 0 with console.warn.
Domain entity gets value=0 without error propagation.
```

### Finding B-15 (LOW) — buildMonthlyRevenue Locale-Dependent

```
forecast-algorithm.ts line 269:
toLocaleString('en-GB', { month: 'short' })
On servers with non-en-US locale this could produce unexpected month names.
```

### Finding B-16 (LOW) — TOCTOU in Stage Transitions

```
No optimistic locking (version field) in Opportunity aggregate.
Concurrent moveStage requests could produce invalid state transitions.
```

### Finding B-17 (LOW) — Event Publish Failure Swallowed

```
OpportunityService.ts line 824:
eventBus.publishAll() failure caught with console.error only.
Domain events lost with no retry, alert, or rollback.
```

---

## 7. Events Worker — Partial Coverage

### Finding W-01 (HIGH) — Only opportunity.won Handled

```
events-worker/src/main.ts:
DOMAIN_EVENT_TYPES defines 4 opportunity types:
- OPPORTUNITY_CREATED (opportunity.created) — NO handler
- OPPORTUNITY_STAGE_CHANGED (opportunity.stage_changed) — NO handler
- OPPORTUNITY_WON (opportunity.won) — HAS handler (line 342)
- OPPORTUNITY_LOST (opportunity.lost) — NO handler

Only 1/4 event types has a registered handler.
Global wildcard (*) catches unhandled events for audit logging only.
```

### Finding W-02 (HIGH) — Missing Events for Description Updates

```
Opportunity.updateDescription() (domain line 416):
No domain event emitted for description changes.
No OpportunityDescriptionUpdatedEvent defined.
```

### Finding W-03 (MEDIUM) — Sidebar Folders Hardcoded

```
sidebar/configs/deals.ts:
"My Folders" section uses static labels/hrefs:
- /deals?folder=enterprise-q1
- /deals?folder=smb-renewals
- /deals?folder=at-risk
No API backing for folder data. settingsHref points to
/settings/deals which doesn't exist (should be /settings/pipeline).
```

---

## 8. Type Safety — transformDeals Loose Casting

### Finding F-19 (MEDIUM) — transformDeals Uses Record<string, unknown>

```
components/deals/types.ts lines 102-119:
transformDeals accepts Record<string, unknown>[] and manually casts
every field: as string, as number, as OpportunityStage, as Record<string, string>.
No runtime validation — bypasses TypeScript structural type checking
at the API boundary.
```

---

## 9. Cross-Entity References

| From Entity           | To Deals                       | Status                                      |
| --------------------- | ------------------------------ | ------------------------------------------- |
| Lead detail           | "Est. Deal Value" label only   | Not linked — no related deals list          |
| Contact detail        | Full Deals tab with deal cards | Wired — from `apiContact.opportunities`     |
| Account detail        | Opportunities tab with list    | Wired — from `api.account.getOpportunities` |
| Deal detail → Account | Text card only                 | Not linked — no href to `/accounts/[id]`    |
| Deal detail → Contact | Text card only                 | Not linked — no href to `/contacts/[id]`    |

---

## 10. Test Coverage Analysis

### Test Files

| File                                      | Lines | Coverage                                               |
| ----------------------------------------- | ----- | ------------------------------------------------------ |
| **API Router**                            |       |                                                        |
| `opportunity.router.test.ts`              | 963   | create, getById, list, update, delete, stats, forecast |
| `opportunity.router.additional.test.ts`   | 337   | Error mapping, edge cases                              |
| `opportunity.router.won-closure.test.ts`  | 122   | moveStage → CLOSED_WON                                 |
| `opportunity.router.lost-closure.test.ts` | 177   | moveStage → CLOSED_LOST                                |
| `pipeline-config.router.test.ts`          | 401   | All 5 pipeline config procedures                       |
| `pipeline-config.integration.test.ts`     | 180   | Tenant isolation, batch upsert                         |
| **Contract**                              |       |                                                        |
| `opportunity.contract.test.ts`            | 620   | Input/output schemas for all procedures                |
| **Components**                            |       |                                                        |
| `DealCard.test.tsx`                       | 186   | Card rendering, stage, value                           |
| `DealFilters.test.tsx`                    | 109   | Filter state, owner, date range                        |
| `DealQuickView.test.tsx`                  | 84    | Slide-over panel                                       |
| `StageColumn.test.tsx`                    | 174   | Kanban column, drag/drop                               |
| `ValueSummary.test.tsx`                   | 100   | Revenue totals                                         |
| `PipelineBoard.test.tsx`                  | 446   | Full board, drag events                                |
| `LossReasonModal.test.tsx`                | 162   | Modal, reason selection                                |
| **Forecast Components**                   |       |                                                        |
| `ForecastHeader.test.tsx`                 | 167   | Header, weighted/total values                          |
| `ProbabilityGauge.test.tsx`               | 108   | Gauge rendering                                        |
| `RiskFactorsCard.test.tsx`                | 114   | Risk factor list                                       |
| `RecommendedActions.test.tsx`             | 111   | Action items                                           |
| `ConfidenceIndicator.test.tsx`            | 119   | Confidence score                                       |
| `ForecastHistoryChart.test.tsx`           | 125   | Chart rendering                                        |
| `ForecastHistory.test.tsx`                | 104   | History list                                           |
| **Pages**                                 |       |                                                        |
| `(list)/__tests__/page.test.tsx`          | 670   | List page, filters, pagination                         |
| `forecast/__tests__/page.test.tsx`        | 196   | Portfolio forecast page                                |
| `[id]/forecast/__tests__/page.test.tsx`   | 192   | Per-deal forecast page                                 |
| **E2E**                                   |       |                                                        |
| `tests/e2e/pipeline-settings.spec.ts`     | 261   | /settings/pipeline UI only                             |

**Total: 24 test files, ~5,847 lines** — good component/list coverage but
critical gaps below.

### Test Gaps

| Gap                                  | Finding ID | Notes                                                                                                  |
| ------------------------------------ | ---------- | ------------------------------------------------------------------------------------------------------ |
| No deal detail page test             | T-01       | `deals/[id]/page.tsx` (792 lines with SAMPLE_DEAL) has ZERO test coverage                              |
| No deal E2E tests                    | T-02       | No Playwright spec for `/deals`, `/deals/[id]`, or `/deals/forecast` — only pipeline settings          |
| No cross-tenant access test          | T-03       | Router tests don't verify tenant A cannot read tenant B's opportunities                                |
| Contract test missing NEEDS_ANALYSIS | T-04       | `opportunity.contract.test.ts` defines only 6 stages (missing NEEDS_ANALYSIS), won't catch regressions |

---

## 11. Positive Findings (No Action Needed)

1. **Pipeline board (kanban)**: Fully wired with DnD stage moves, loss reason
   modal, and real API data
2. **List view**: Full CRUD with pagination, server-side search, bulk
   operations, confirmation dialogs
3. **Forecast pages**: Both portfolio and per-deal forecasts use real API data
4. **Export Report**: Full CSV export with Blob download — properly wired
5. **Pipeline config**: All 5 procedures have proper tenant isolation with
   explicit tenantId AND prismaWithTenant
6. **Avatars**: All initials-based, no Unsplash URLs
7. **Error states**: All pages have error display with retry buttons
8. **Loss reason modal**: Properly wired for CLOSED_LOST transitions
9. **Container wiring**: OpportunityService, CloseDealWonUseCase,
   CloseDealLostUseCase all properly registered
10. **Domain events**: 10 event types defined, comprehensive state change
    coverage
11. **Component test coverage**: 14 component test files covering all deal
    components except detail page

---

## Priority Fixes

| Priority | Finding IDs                              | Task    | Description                                                                 |
| -------- | ---------------------------------------- | ------- | --------------------------------------------------------------------------- |
| P0       | F-01, F-03, F-04, F-05, F-06, F-07       | IFC-278 | Replace SAMPLE_DEAL with real API data, add auth guard, fix STAGES          |
| P0       | B-01, B-02, B-03                         | IFC-281 | Fix cross-tenant data leak, add audit logging, fix notification tenant      |
| P0       | F-02                                     | IFC-279 | Create /deals/new route with deal creation form                             |
| P1       | F-08, F-09                               | IFC-280 | Wire 14 no-op action buttons (depends IFC-278)                              |
| P1       | B-04, B-05, B-07, B-09, B-10, B-11, B-12 | IFC-282 | Fix name drop, probability unwrap, schema mismatch, error mapping, closedAt |
| P1       | W-01, W-02                               | IFC-283 | Add event handlers for created/stage_changed/lost in events worker          |
| P2       | B-06, B-08, B-15, F-16, F-17             | IFC-284 | Fix hardcoded months, stage probabilities, locale, forecast trends          |
| P2       | F-10, F-11, F-12, F-19                   | IFC-287 | Wire filters to API, type safety fixes                                      |
| P2       | T-01, T-02, T-03, T-04                   | IFC-286 | Deal detail page tests, E2E, cross-tenant tests (depends IFC-278, IFC-280)  |
| P3       | B-13, B-14, B-16, B-17, F-13, F-18, W-03 | IFC-285 | Dead code, TOCTOU, stubs, sidebar                                           |

---

## Changes Log

| Date       | Change                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| 2026-03-06 | Created — 42 findings (5 CRITICAL, 11 HIGH, 12 MEDIUM, 10 LOW, 4 test gaps) |
| 2026-03-06 | Tasks assigned: IFC-278 to IFC-287 (10 tasks across sprints 16/18/20/22/24) |
