# IFC-247 Specification: Lead Detail Page Tests

**Task**: IFC-247 — Lead Detail Page Tests
**Sprint**: 18
**Status**: Spec Complete
**Date**: 2026-06-29
**Agents**: test-engineer, frontend-lead, backend-architect

---

## Executive Summary

The Lead Detail page (`apps/web/src/app/leads/[id]/page.tsx`, 2908 lines) has a
test file with 19 existing tests covering only IFC-226 (AI null states) and
IFC-227 (account link). The task requires extending coverage to reach >=20 test
cases with comprehensive coverage of: tab navigation, addNote/logActivity
mutation behavior, error states (404/500/retry), and activity feed toggle.

**ARTIFACT PRECHECK RESULT**: Test file already exists at
`apps/web/src/app/leads/[id]/__tests__/page.test.tsx` (512 lines, 19 tests).
Spec scope = GAP FILL, not re-creation. Existing 19 tests must not be broken.

---

## Phase 0.75 — Codebase Exploration Evidence

All findings verified by reading actual files. Key citations:

| Finding | File:Line |
|---------|-----------|
| TabId type: 7 tabs total | page.tsx:76 |
| visibleCount state starts at 5 | page.tsx:2269 |
| Load more button renders when hasMore | page.tsx:1418 |
| addNote mutation defined | page.tsx:2358 |
| logActivity mutation defined | page.tsx:2384 |
| LeadErrorView component | page.tsx:498 |
| isServerError shows retry button | page.tsx:2518 |
| isNotFound renders "Lead Not Found" | page.tsx:2682 |
| addNote input contract | lead.router.ts:1790-1830 |
| logActivity input contract | lead.router.ts:1835-1904 |
| vitest include glob | apps/web/vitest.config.ts:include=['src/**'] |
| existing test mock pattern | page.test.tsx:1-275 |

---

## Phase 0.76 — Shared Component Audit

This is a TEST-only task. No new UI components are proposed. No shared
component audit applies (REUSES existing test infrastructure).

---

## Phase 0.77 — Route Conflict Audit

No new page.tsx files. IFC-247 adds only test code. Route audit: N/A.

No doc-co-change event (GOTCHA #9) — no new page.tsx.

---

## Round 1: ANALYSIS

### Current Coverage (from page.test.tsx)

**Suite 1**: "LeadDetailPage - Null AI Insight UX (IFC-226)" — 10 tests (lines 277-368)
Covers: ai-insights tab null states (engagement, sentiment, conversion, deal-value, lead-score)

**Suite 2**: "LeadDetailPage - Real AI Insight Rendering (IFC-226)" — 3 tests (lines 370-415)
Covers: ai-insights tab with real data

**Suite 3**: "LeadDetailPage - Empty State CTA" — 3 tests (lines 417-467)
Covers: empty activity array, CTA button, NEGOTIATING status badge

**Suite 4**: "LeadDetailPage - Company-to-Account Link (IFC-227)" — 3 tests (lines 469-511)
Covers: account link rendering

**Total: 19 tests — 1 short of KPI target**

### Coverage Gaps

1. **Tab navigation**: Only ai-insights tab is tested. No tests for overview,
   activity, tasks, notes, emails, files tab content rendering.

2. **addNote mutation** (page.tsx:2358): Not tested. Need:
   - Test that `mockAddNoteMutate` is called with `{leadId, content}` when
     Add Note button clicked on Notes tab
   - onSuccess callback behavior: toast + state clear
   - onError callback behavior: destructive toast
   - isPending=true disables button

3. **logActivity mutation** (page.tsx:2384): Not tested. Need:
   - Test that `mockLogActivityMutate` is called when Log Call form submitted
   - onSuccess: toast + close dialog + clear fields
   - onError: destructive toast
   - isPending=true disables submit

4. **Error states**: Not tested. Need:
   - 404: mockLeadQueryState.error = {data:{code:'NOT_FOUND'}} renders
     "Lead Not Found" text and Back to Leads link
   - 500: mockLeadQueryState.error = {data:{code:'INTERNAL_SERVER_ERROR'}}
     renders "Something Went Wrong" + retry button
   - Loading: isLoading=true renders skeleton (not error)

5. **Activity feed toggle**: Not tested. Need:
   - With >5 activities: "Load more activities" button renders
   - Clicking it shows more (triggers setVisibleCount +5)
   - With <=5 activities: no Load more button

6. **QuickLogComposer**: LeadTabBar (page.tsx:2038) includes QuickLogComposer
   which calls logActivityMutation.mutate with type='NOTE'. Not tested.

---

## Round 2: PROPOSAL

### Acceptance Criteria (AC)

**AC-01 [Tab Switching]**: Tab bar renders all 7 tab labels. Clicking each
tab label switches active content. Overview is default.

**AC-02 [Notes Tab + addNote mutation]**:
- Notes tab renders textarea with placeholder "Write a note..."
- Typing in textarea and clicking "Add Note" calls
  `api.lead.addNote.useMutation().mutate({leadId, content})`
- With `isPending: true`, the "Add Note" button is disabled
- onSuccess: test via mock verification (not UI state, as toast is mocked)

**AC-03 [logActivity mutation — QuickLogComposer]**:
- QuickLogComposer in LeadTabBar triggers logActivityMutation.mutate
- With `isPending: true`, submit is disabled

**AC-04 [Error: 404 Not Found]**:
- `mockLeadQueryState.error = { message: 'Not found', data: { code: 'NOT_FOUND' } }`
  renders "Lead Not Found" heading (page.tsx:2682)
- Back to Leads link present
- No retry button (only for server errors)

**AC-05 [Error: 500 Server Error]**:
- `mockLeadQueryState.error = { message: 'Internal error', data: { code: 'INTERNAL_SERVER_ERROR' } }`
  renders "Something Went Wrong" heading (page.tsx:2679)
- Retry button present (page.tsx:2518)

**AC-06 [Loading State]**:
- `mockLeadQueryState.isLoading = true` renders loading skeleton (not error)
- No error text renders during loading

**AC-07 [Activity Feed Toggle]**:
- With 6+ activities in mockLeadQueryState.data.activities, "Load more" button renders
- With 4 activities: no Load more button
- visibleCount starts at 5 (page.tsx:2269)

**AC-08 [Activity Tab renders ActivityFeed stub]**:
- Switching to 'Activity' tab renders the mocked ActivityFeed component
- (ActivityFeed is mocked at page.test.tsx:246)

### Files to Modify

1. `apps/web/src/app/leads/[id]/__tests__/page.test.tsx`
   - EXTENDS existing file: add new describe blocks after line 511
   - MUST NOT modify existing 19 tests
   - ADD: ~25-30 new tests across 5-6 new describe blocks
   - Total target: >=45 tests (well above 20 KPI)

**No new files**. No new components. No routing changes. Minimal change principle.

### Mock Requirements

The existing mocks (page.test.tsx:1-275) cover all needed imports. Required
additions/adjustments:
- `mockLeadQueryState` is already mutable — reuse pattern for error tests
- `mockAddNoteMutate` already defined (line 12) — use for mutation call assertions
- `mockLogActivityMutate` already defined (line 11) — use for logActivity assertions
- Need to add `isPending: true` variant in test setup for pending state tests
  (create local override mock within specific test)

The existing mock for `@/lib/api` (lines 86-136) returns fixed mutation objects.
For isPending tests, the mock factory must be called with a new mock per test.
**Solution**: Use `vi.mocked` + per-test `mockReturnValue` OR restructure the
specific test's module mock locally using `vi.doMock`.

Simpler approach: create mutable mock state refs alongside existing ones:
```ts
const mockAddNoteIsPending = { value: false };
// then in mock: isPending: mockAddNoteIsPending.value
```
Or use the simpler pattern of creating a new test-scoped describe that overrides
with `vi.mock` factory returning an isPending=true version.

### Test Structure (new describe blocks to add)

```
describe('LeadDetailPage - Tab Navigation') — ~5 tests
describe('LeadDetailPage - Notes Tab + addNote mutation') — ~6 tests
describe('LeadDetailPage - logActivity mutation') — ~4 tests  
describe('LeadDetailPage - Error States') — ~6 tests
describe('LeadDetailPage - Activity Feed Toggle') — ~4 tests
```

---

## Round 3: CHALLENGE

### Risk 1: Mock Isolation for isPending Tests
**Risk**: The module-level `vi.mock('@/lib/api', ...)` factory captures mutation
state at module init time, not per-test. Testing `isPending=true` requires
either: (a) a mutable ref approach or (b) a new describe block with a fresh
`vi.mock` factory.
**Mitigation**: Use mutable mock state refs (simple, minimal change). Vitest
`clearMocks: true` and `mockReset: true` in config (vitest.config.ts) reset
mock calls but NOT mock implementations — implementation must be made mutable.

### Risk 2: LeadTabBar Tab Button Labels
**Risk**: The test for switching tabs uses `getByRole('button', {name: /AI Insights/i})`.
Tab buttons are plain `<button>` elements (page.tsx:2020) rendering `tab.label`.
The label for ai-insights tab is 'AI Insights' (page.tsx:2600). Other labels:
'Overview', 'Activity', 'Tasks', 'Notes', 'Emails', 'Files'.
**Validation**: This exact pattern already works at page.test.tsx:307 — confirmed.

### Risk 3: Activity Tab Uses Mocked ActivityFeed
**Risk**: ActivityFeed is mocked as `() => <div>Activity Feed</div>` (line 246).
The load-more button lives inside `LeadActivityTab` (page.tsx:1418), which IS
the real component (not mocked). It renders based on `hasMore` prop.
**Mitigation**: The mock does NOT stub LeadActivityTab — it's in-file sub-component
rendered by Lead360Page. So tests CAN verify the load-more button by using
page.tsx's own sub-component rendering directly.

### Risk 4: Notes Tab Textarea Interaction
**Risk**: textarea does not have aria-label; need to use placeholder or role.
**Evidence**: `placeholder="Write a note..."` (page.tsx:1476). Use
`screen.getByPlaceholderText('Write a note...')`.

### Risk 5: Error State Triggering
**Risk**: Error state requires both `error` to be set AND specific `data.code`.
**Confirmed pattern**: `mockLeadQueryState.error = { message: '...', data: { code: 'NOT_FOUND' } }`
sets the mock that `api.lead.getById.useQuery()` returns (page.test.tsx:93-98).
Then `mockLeadQueryState.data = null` ensures the `!lead` path fires.

### Risk 6: 2026-03-04 Wiring Fixes
**Finding**: The task mentions "2026-03-04 wiring fixes" for addNote/logActivity.
From lead.router.ts:1790 (addNote) and 1835 (logActivity): both procedures call
the cache invalidation path that fires `utils.activityFeed.getUnifiedFeed.invalidate()`
and `utils.activityFeed.getEntityFeed.invalidate()`. The existing mock for
`api.useUtils()` only includes `lead.getById.invalidate` (page.test.tsx:88-90).
**Mitigation**: Add `activityFeed: { getUnifiedFeed: { invalidate: vi.fn() }, getEntityFeed: { invalidate: vi.fn() } }`
to the useUtils mock, otherwise the onSuccess callback will throw when trying
to call undefined.invalidate().

### Dead-on-Arrival Check
IFC-247 is TEST-ONLY. No new production runtime path is added. No dead-code risk.

---

## Round 4: CONSENSUS

### Agent Agreement

**test-engineer**: Approved. Extend page.test.tsx with 5 new describe blocks.
Coverage approach: mutable mock refs for isPending tests. useUtils mock needs
activityFeed extension. Target >=45 tests total.

**frontend-lead**: Approved. Tab buttons use plain text labels, confirmed via
page.tsx:2029. The existing fireEvent.click pattern works for all tabs.
QuickLogComposer is mocked (page.test.tsx:267) so the test verifies
logActivityMutation.mutate was called, not the QuickLogComposer render.
Wait — QuickLogComposer is mocked as `() => <div>Quick Log Composer</div>`
at line 267. The actual logActivity call happens via the real LeadTabBar
component passing props to the mocked QuickLogComposer. Since QuickLogComposer
is stubbed, it does NOT call logActivityMutation. The test for logActivity
must target the Log Call dialog instead (logCallOpen state, line 2298).

**backend-architect**: Approved. addNote contract: `{leadId: string, content: string}`.
logActivity contract: `{leadId: string, type: enum, title: string, description?: string}`.
useUtils mock needs activityFeed cache invalidators. Test must verify the
mutate calls, not the API handler.

### Modifications from Challenge

1. Add `activityFeed` to useUtils mock (Risk 6 mitigation)
2. logActivity test targets Log Call dialog path (not QuickLogComposer which is stubbed)
3. Use mutable mock refs for isPending tests
4. Error state tests must also set `mockLeadQueryState.data = null` for NOT_FOUND

---

## Acceptance Criteria (Final)

| AC | Description | Verification |
|----|-------------|--------------|
| AC-01 | Tab bar renders all 7 tab labels on default render | screen.getByRole('button', {name: /Overview/i}) exists |
| AC-02 | Clicking Activity tab renders ActivityFeed stub | screen.getByText('Activity Feed') after click |
| AC-03 | Clicking Notes tab renders textarea | screen.getByPlaceholderText('Write a note...') |
| AC-04 | Notes tab Add Note calls addNoteMutation.mutate | mockAddNoteMutate called with {leadId, content} |
| AC-05 | addNote isPending=true disables Add Note button | button.disabled === true |
| AC-06 | logActivity called from Log Call dialog form submit | mockLogActivityMutate called with title+type |
| AC-07 | 404 error renders "Lead Not Found" | screen.getByText(/Lead Not Found/i) |
| AC-08 | 500 error renders "Something Went Wrong" + retry | heading + retry button present |
| AC-09 | Loading state renders skeleton (not error) | no error text during isLoading=true |
| AC-10 | 6 activities: Load more button renders | screen.getByRole('button', {name: /Load more/i}) |
| AC-11 | 4 activities: no Load more button | queryByRole('button', {name: /Load more/i}) === null |
| AC-12 | Emails tab renders (after click) | screen.getByText(/Emails/i) in tab triggers render |
| AC-13 | Files tab renders (after click) | screen.getByText(/Files/i) in tab triggers render |
| AC-14 | Tasks tab renders RelatedTasksCard stub | screen.getByText('Related Tasks') after click |
| AC-15 | useUtils mock includes activityFeed invalidators | no runtime error on addNote onSuccess |

---

## Definition of Done

- [ ] page.test.tsx extended: >=45 tests total (was 19), all passing
- [ ] addNote mutation tested: call args + onSuccess + onError + isPending
- [ ] logActivity mutation tested: call args + isPending
- [ ] Error states tested: 404, 500+retry, loading skeleton
- [ ] Activity feed toggle tested: load more visible/hidden based on count
- [ ] All tab labels verified: overview, activity, tasks, notes, emails, files, ai-insights
- [ ] Coverage >=90% for changed lines (diff-coverage gate)
- [ ] No existing tests broken
- [ ] activityFeed cache invalidation covered in useUtils mock
- [ ] TypeScript: no type errors introduced
- [ ] Tests inside apps/web/src/** (vitest include glob confirmed)

---

## Related Documents

No PRD/ADR required (test-only task, no architectural decision needed).
References:
- apps/web/src/app/leads/[id]/__tests__/page.test.tsx (extend)
- apps/web/src/app/leads/[id]/page.tsx (source under test)
- apps/api/src/modules/lead/lead.router.ts (procedure contracts for mutation tests)
- apps/web/vitest.config.ts (coverage config)
