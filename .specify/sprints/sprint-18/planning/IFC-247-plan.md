# Execution Plan: IFC-247

**Task**: Lead Detail Page Tests
**Sprint**: 18
**Spec**: .specify/sprints/sprint-18/specifications/IFC-247-spec.md
**Date**: 2026-06-29

---

## Preflight Checks

1. Confirm branch is `feat/ifc-247`
   ```
   git branch --show-current
   ```
2. Existing tests pass (baseline green):
   ```
   pnpm --filter @intelliflow/web exec vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx
   ```
3. TypeScript compiles for apps/web:
   ```
   pnpm --filter @intelliflow/web exec tsc --noEmit
   ```

---

## Implementation Reality Checks

| Surface | Production Consumer | Replaces / Blocks | Verification Command |
|---------|---------------------|-------------------|----------------------|
| `page.test.tsx` (new describe blocks) | Test runner only — no production change | N/A (test-only task) | `pnpm --filter @intelliflow/web exec vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx` |
| `useUtils` mock with `activityFeed` | `addNote.onSuccess` + `logActivity.onSuccess` callbacks in page.tsx:2359-2368 | Missing invalidators (would throw at runtime in tests) | Same vitest run command |

---

## Estimated Effort

| Phase | Estimate |
|-------|----------|
| RED (write failing tests) | ~30 minutes |
| GREEN (fix mocks + verify passing) | ~20 minutes |
| REFACTOR (clean up) | ~10 minutes |
| **Total** | **~60 minutes** |

---

## Files to Modify:
- `apps/web/src/app/leads/[id]/__tests__/page.test.tsx`

**Files to Create:**
- None

---

## Execution Steps

### Phase 1: RED — Write Failing Tests

**Step 1**: Extend the `useUtils` mock in `page.test.tsx` (line 87-90) to include `activityFeed` cache invalidators.

The current mock at line 88-90:
```ts
api.useUtils: () => ({
  lead: { getById: { invalidate: vi.fn() } },
}),
```

Must become:
```ts
api.useUtils: () => ({
  lead: { getById: { invalidate: vi.fn() } },
  activityFeed: {
    getUnifiedFeed: { invalidate: vi.fn() },
    getEntityFeed: { invalidate: vi.fn() },
  },
}),
```

This fixes the 2026-03-04 wiring: `addNote.onSuccess` (page.tsx:2363) and
`logActivity.onSuccess` (page.tsx:2377) both call `utils.activityFeed.*`.

**Step 2**: Add mutable isPending state references at module level (after existing
mockAddNoteMutate / mockLogActivityMutate declarations, line ~12):

```ts
const mockAddNoteState = { isPending: false };
const mockLogActivityState = { isPending: false };
```

Update the `@/lib/api` mock factory to use these:
```ts
addNote: {
  useMutation: () => ({
    mutate: mockAddNoteMutate,
    isPending: mockAddNoteState.isPending,
  }),
},
logActivity: {
  useMutation: () => ({
    mutate: mockLogActivityMutate,
    isPending: mockLogActivityState.isPending,
  }),
},
```

**Step 3**: Add `beforeEach` + `afterEach` in each new describe block to reset
state refs and clear mock call history (matching existing describe block pattern
at page.test.tsx:278-284):
```ts
beforeEach(() => {
  vi.clearAllMocks();
  mockLeadQueryState.error = null;
  mockLeadQueryState.isLoading = false;
  mockLeadQueryState.data.activities = [];
});
afterEach(() => {
  mockAddNoteState.isPending = false;
  mockLogActivityState.isPending = false;
});
```

**Step 4**: Add new describe block — Tab Navigation:
```ts
describe('LeadDetailPage - Tab Navigation (IFC-247)', () => {
  // AC-01: All 7 tab labels visible on default render
  it('renders all 7 tab labels', () => { ... });
  // AC-01: Overview is active by default
  it('Overview tab is active by default', () => { ... });
  // AC-02: Switching to Activity tab renders ActivityFeed stub
  it('clicking Activity tab renders ActivityFeed stub', () => { ... });
  // AC-14: Switching to Tasks tab renders RelatedTasksCard stub
  it('clicking Tasks tab renders RelatedTasksCard stub', () => { ... });
  // AC-12/13: Emails and Files tabs switch content
  it('clicking Emails tab shows email content area', () => { ... });
});
```

**Step 5**: Add new describe block — Notes Tab + addNote mutation:
```ts
describe('LeadDetailPage - Notes Tab + addNote mutation (IFC-247)', () => {
  // AC-03: Notes tab renders textarea
  it('clicking Notes tab renders Write a note... textarea', () => { ... });
  // AC-04: typing and clicking Add Note calls mutate
  it('Add Note button calls addNote.mutate with leadId and content', () => { ... });
  // AC-05: isPending=true disables button
  it('Add Note button is disabled when addNote isPending', () => { ... });
  // AC-15: activityFeed invalidation doesn't throw
  it('addNote onSuccess invalidates activityFeed cache', () => { ... });
  // addNote onError — destructive toast
  it('addNote onError triggers destructive toast', () => { ... });
});
```

**Step 6**: Add new describe block — logActivity mutation:

The Log Call trigger path is: `fireEvent.click(screen.getByRole('button', { name: /^Log Call$/ }))`.
This fires the real `<button>` at page.tsx:2101-2106 in `LeadPageHeader` (LeadPageHeader is NOT
mocked — no vi.mock for it in the test file). Clicking it calls `onLogCall` which sets
`logCallOpen=true` (page.tsx:2750), revealing the Log Call Dialog at page.tsx:795-866.

```ts
describe('LeadDetailPage - logActivity mutation (IFC-247)', () => {
  // AC-06: Log Call dialog — filling title and submitting calls logActivity.mutate
  // Trigger: click the real "Log Call" button in LeadPageHeader (page.tsx:2105)
  it('Log Call dialog submit calls logActivity.mutate with title and type', () => { ... });
  // logActivity isPending disables submit
  it('Log Call submit button is disabled when logActivity isPending', () => { ... });
  // logActivity onError — destructive toast
  it('logActivity onError triggers destructive toast', () => { ... });
});
```

**Step 7**: Add new describe block — Error States:
```ts
describe('LeadDetailPage - Error States (IFC-247)', () => {
  // AC-07: 404 renders Lead Not Found
  it('404 error renders Lead Not Found heading', () => { ... });
  // AC-07: 404 has Back to Leads link, no retry button
  it('404 error shows Back to Leads link but no retry button', () => { ... });
  // AC-08: 500 renders Something Went Wrong + retry button
  it('500 error renders Something Went Wrong heading', () => { ... });
  it('500 error shows retry button', () => { ... });
  // AC-09: Loading skeleton renders
  it('renders loading skeleton when isLoading is true', () => { ... });
  // No error text during loading
  it('loading state does not render error text', () => { ... });
});
```

**Step 8**: Add new describe block — Activity Feed Toggle:

IMPORTANT: The Load more button (page.tsx:1418) is inside `LeadActivityTab`, rendered only
when `activeTab === 'activity'`. Every test that asserts on the Load more button MUST first
click the Activity tab:
`fireEvent.click(screen.getByRole('button', { name: /Activity/i }))`.

```ts
describe('LeadDetailPage - Activity Feed Toggle (IFC-247)', () => {
  // AC-10: 6 activities → Load more button renders
  it('renders Load more button when activities exceed visibleCount of 5', () => {
    // 1. Set 6 activities on mockLeadQueryState.data.activities
    // 2. render(<Lead360Page />)
    // 3. fireEvent.click(screen.getByRole('button', { name: /Activity/i })) ← REQUIRED
    // 4. expect(screen.getByRole('button', { name: /Load more/i })).toBeInTheDocument()
  });
  // AC-11: 4 activities → no Load more button
  it('does not render Load more button when activities count is 4', () => { ... });
  // Load more button text shows remaining count
  it('Load more button shows remaining activity count', () => {
    // First switch to Activity tab, then assert on button text
  });
  // Clicking Load more increases visible activities (state change)
  it('clicking Load more renders more activities', () => {
    // First switch to Activity tab, then click Load more
  });
});
```

Run to verify RED (tests fail before implementation):
```
pnpm --filter @intelliflow/web exec vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx
```

### Phase 2: GREEN — Make Tests Pass

**Step 9**: Implement the tests with correct assertions. Tests will pass with the
real component (no production code changes needed — this is a test-only task).

Key implementation notes per test group:

**Tab Navigation**:
- Tab labels are rendered as `<button>` elements with exact label text
- Default active tab is 'overview' (page.tsx:2262 uses `resolveInitialLeadTab`)
- `fireEvent.click(screen.getByRole('button', { name: /Activity/i }))` switches tab
- After switching to Activity: `screen.getByText('Activity Feed')` (mocked ActivityFeed)
- After switching to Tasks: `screen.getByText('Related Tasks')` (mocked RelatedTasksCard)

**Notes Tab + addNote**:
- Click Notes: `fireEvent.click(screen.getByRole('button', { name: /Notes/i }))`
- Textarea: `screen.getByPlaceholderText('Write a note...')`
- Type: `fireEvent.change(textarea, { target: { value: 'Test note' } })`
- Click Add Note: `fireEvent.click(screen.getByRole('button', { name: /Add Note/i }))`
- Assert: `expect(mockAddNoteMutate).toHaveBeenCalledWith({ leadId: 'lead-1', content: 'Test note' })`

**logActivity via Log Call dialog**:
- Trigger: `fireEvent.click(screen.getByRole('button', { name: /^Log Call$/ }))`.
  This clicks the real `<button>` at page.tsx:2101-2106 in `LeadPageHeader`.
  LeadPageHeader is NOT mocked — only EntityActionSheet, MoreActionsButton, and PinButton
  are mocked, not LeadPageHeader itself. The real button text is "Log Call" (page.tsx:2105).
- Clicking it calls `onLogCall` → `setLogCallOpen(true)` (page.tsx:2750) → Dialog opens.
- Dialog has `<input id="log-call-title">` and a submit button that shows "Log Call".
- Note: there will be TWO buttons named "Log Call" in the DOM after the dialog opens
  (the header button + the dialog submit button). Use `getAllByRole` and pick the last one,
  or use `getByRole('button', { name: 'Log Call' })` inside DialogContent scope.
- Alternatively, use `screen.getByLabelText('Call Title')` to target the input unambiguously.

**Error States**:
- Set `mockLeadQueryState.error = { message: 'Not found', data: { code: 'NOT_FOUND' } }`
- Also set `mockLeadQueryState.data = null as any` to trigger `!lead` path (page.tsx:2667)
- 500: set `data.code = 'INTERNAL_SERVER_ERROR'` + keep data as null
- Loading: set `mockLeadQueryState.isLoading = true` + clear error
- Use `getByRole('heading', { name: /Lead Not Found/i })` and
  `getByRole('heading', { name: /Something Went Wrong/i })` per `<h2>` at page.tsx:515
  (validates heading semantics, not just text presence)

**Activity Feed Toggle**:
- Set `mockLeadQueryState.data.activities` to array of 6 activity objects
- Activity tab must be active to see the load-more button (it's inside LeadActivityTab)
- Switch to Activity tab first, then check for "Load more" button
- Each activity needs: id, type, title, description, timestamp, userName, metadata, sentiment

**Step 10**: Run tests to verify all pass:
```
pnpm --filter @intelliflow/web exec vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx
```

Expected: all existing 19 + 23 new tests = 42 total pass.
New tests: Tab Navigation 5 + Notes Tab 5 + logActivity 3 + Error States 6 + Activity Feed Toggle 4 = 23.

### Phase 3: REFACTOR — Clean Up

**Step 11**: Verify no TypeScript errors:
```
pnpm --filter @intelliflow/web exec tsc --noEmit
```

**Step 12**: Run lint on changed file:
```
pnpm --filter @intelliflow/web exec eslint src/app/leads/\\[id\\]/__tests__/page.test.tsx --max-warnings=0
```

**Step 13**: Run scoped coverage for leads/[id]/page.tsx to verify >=90% (Istanbul, scoped to avoid transitive dilution):
```
pnpm --filter @intelliflow/web exec vitest run --coverage --coverage.include='src/app/leads/\[id\]/page.tsx' src/app/leads/\\[id\\]/__tests__/page.test.tsx
```

**Step 14**: Run the full apps/web test suite to verify no regressions:
```
pnpm --filter @intelliflow/web exec vitest run
```

---

## Final Validation

1. All 42 tests in page.test.tsx pass (19 existing + 23 new)
2. TypeScript: no new errors (`pnpm --filter @intelliflow/web exec tsc --noEmit`)
3. Lint: no warnings on changed file
4. Coverage: >=90% for changed lines in page.test.tsx
5. All 5 requirement areas covered:
   - Tab navigation (AC-01, AC-02, AC-12, AC-13, AC-14)
   - addNote mutation (AC-03, AC-04, AC-05, AC-15)
   - logActivity mutation (AC-06)
   - Error states (AC-07, AC-08, AC-09)
   - Activity feed toggle (AC-10, AC-11)

---

## Validation Matrix

| Scope | Purpose | Command |
|-------|---------|---------|
| Target test file | Full IFC-247 test suite | `pnpm --filter @intelliflow/web exec vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx` |
| apps/web package | Full regression suite | `pnpm --filter @intelliflow/web exec vitest run` |
| TypeScript | No new type errors | `pnpm --filter @intelliflow/web exec tsc --noEmit` |
| Lint | No lint warnings in changed file | `pnpm --filter @intelliflow/web exec eslint src/app/leads/\\[id\\]/__tests__/page.test.tsx` |
| Coverage | Diff coverage >=80% on new lines | `pnpm --filter @intelliflow/web exec vitest run --coverage --coverage.include='src/app/leads/\[id\]/page.tsx' src/app/leads/\\[id\\]/__tests__/page.test.tsx` |

---

## Integration Checkpoints Summary

| After Step | Verification | Command |
|------------|--------------|---------|
| 1-3 (mock fixes) | baseline still passes | `vitest run src/app/leads/\\[id\\]/__tests__/page.test.tsx` |
| 4-8 (RED) | new tests appear in output (may fail) | same vitest run |
| 9-10 (GREEN) | all tests pass | same vitest run |
| 11 (REFACTOR) | TypeScript clean | `tsc --noEmit` |
| 12 (REFACTOR) | Lint clean | `eslint` on file |
| 14 (FINAL) | Full web suite passes | `pnpm --filter @intelliflow/web exec vitest run` |

---

## Plan-Reviewer Sign-off

<!-- plan-reviewer: subagent -->

Plan reviewed by `plan-reviewer-ifc247` (subagent). Initial verdict: REVISE with 3 ERRORs
and 4 WARNINGs. All 7 required fixes applied:
- ERROR-1: logActivity trigger path resolved to single definitive approach (real LeadPageHeader button)
- ERROR-2: Activity tab switch added as prerequisite to Load more button tests
- ERROR-3: Test count reconciled to 23 new + 19 existing = 42 total
- WARN-1: addNote onError test stub added
- WARN-2: logActivity onError test stub added
- WARN-3: vi.clearAllMocks() added to beforeEach in new describe blocks
- WARN-4: Error heading assertions use getByRole('heading') not getByText
- INFO-1: Coverage command scoped with --coverage.include

Plan is APPROVED after REVISE fixes.
