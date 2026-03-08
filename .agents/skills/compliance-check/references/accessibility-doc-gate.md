# Compliance Check — Section 11: Accessibility Doc Gate (BLOCKING)

**Blocking**: Yes — new routes added without VPAT/conformance statement updates fail compliance.

## Purpose

Detects when PG-*/IFC-* tasks add or modify Next.js routes and blocks task completion
unless the VPAT 2.5 (`docs/compliance/vpat-2.5.md`) and WCAG conformance statement
(`docs/compliance/wcag-conformance-statement.md`) have been updated to reflect the change.

Without this gate, every new route silently widens the gap between documented conformance
scope and actual application surface area, making the VPAT and conformance statement
factually inaccurate for enterprise procurement evaluators (Section 508, EN 301 549).

## Applicability

**Applies to**: PG-* and IFC-* tasks where the plan's "Files to Create" or "Files to Modify"
contains paths matching `apps/web/src/app/**/page.tsx`.

**Excludes**:
- Paths under `apps/web/src/app/(developer)/` — developer portal is not in conformance scope
- Paths under `apps/web/src/app/api/` — route handlers, not pages

**Dynamic segments** (`[id]`, `[slug]`, etc.): Pages with dynamic route segments inherit conformance status from their parent static route. They do not require separate entries in the conformance statement scope list. Example: `/contacts/[id]/page.tsx` is covered by the `/contacts` parent route entry.

**If no matching paths → SKIP** (Section 11 is not applicable to this task).

## Detection Algorithm

### Step 1: Read Task Plan

Read the task plan at `.specify/sprints/sprint-{N}/planning/{TASK_ID}-plan.md`.

### Step 2: Extract File Paths

Parse all paths from the **"Files to Create:"** and **"Files to Modify:"** blocks.
These are Markdown bullet lists with paths like:
```
- `apps/web/src/app/insights/page.tsx`
```

### Step 3: Filter for Route Pages

Keep only paths matching the glob pattern: `apps/web/src/app/**/page.tsx`

### Step 4: Apply Exclusions

Remove paths that match:
- `apps/web/src/app/(developer)/**` — developer portal routes
- `apps/web/src/app/api/**` — API route handlers

### Step 5: Normalize to URL Routes

For each remaining path, convert filesystem path to URL route:
1. Strip the `apps/web/src/app/` prefix
2. Strip route group segments (parenthesized names like `(public)`, `(auth)`)
3. Strip the trailing `/page.tsx`
4. Prepend `/`
5. For dynamic segments (`[id]`, `[slug]`), return the parent route pattern

**Examples:**
| Filesystem Path | URL Route |
|----------------|-----------|
| `apps/web/src/app/insights/page.tsx` | `/insights` |
| `apps/web/src/app/(auth)/dashboard/page.tsx` | `/dashboard` |
| `apps/web/src/app/leads/[id]/page.tsx` | `/leads` |
| `apps/web/src/app/(developer)/docs/page.tsx` | EXCLUDED (developer) |
| `apps/web/src/app/api/webhooks/route.ts` | EXCLUDED (api) |

**Result:** A list of affected URL routes.

- If the list is **empty** → Section 11: **SKIP**
- If the list is **non-empty** → proceed to verification checks

## Modified vs New Route Distinction

| Change Type | Detection Source | Gate Severity | Required Doc Updates |
|-------------|----------------|---------------|---------------------|
| New route | "Files to Create" contains `page.tsx` | BLOCKING FAIL | Section 2 scope list + route counts + Document Control |
| Modified route | "Files to Modify" contains `page.tsx` | BLOCKING REVIEW | Document Control version bump + review note only |

For **modified routes**: the gate does NOT require adding the route to the scope list
(it should already be there). Instead, it requires:
- A Document Control version bump in both documents
- A review note confirming the modification does not degrade any existing conformance claim

## Verification Checks

For each detected route, run these 4 checks:

### Check 1: Conformance Statement Scope (BLOCKING)

Read `docs/compliance/wcag-conformance-statement.md` Section 2 (line 20 area).

- Verify the route appears in the Section 2 bullet list (backtick-enclosed route names)
- Verify the aggregate route count on line 20 ("all 26 configured routes") reflects the new total
- Verify Section 3 metrics table (lines 38-39) denominators are updated:
  - "Routes fully conformant: X of Y"
  - "Routes partially conformant: Z of Y"

**For new routes:** Route must appear in the scope list, and counts must be incremented.
**For modified routes:** Route should already be in scope. If missing, treat as new route.

### Check 2: VPAT Route Count (BLOCKING)

Read `docs/compliance/vpat-2.5.md` header (line 9).

- Verify the `(N routes)` count in the "Evaluation Methods Used" field reflects the new total
- Example: `Static code review (26 routes)` → should become `(27 routes)` if 1 new route added

### Check 3: Document Control Updates (BLOCKING)

Verify BOTH documents have a new version row for the current sprint:

**Conformance Statement** — `docs/compliance/wcag-conformance-statement.md` Document Control
(lines 163-165 area):
- Must have a new row with version, date, author, and changes referencing the current task ID

**VPAT** — `docs/compliance/vpat-2.5.md` Document Control (lines 129-133 area):
- Must have a new row with version, date, author, and changes referencing the current task ID

### Check 4: Route Reconciliation (NON-BLOCKING, informational)

Run the existing route reconciliation tool:
```bash
npx tsx tools/scripts/a11y-route-reconcile.ts
```

Report the `DISK_COVERED_BY_STATEMENT` gate result as informational context.
This check does NOT block — it provides visibility into overall route drift.

## Output Format

```markdown
### Accessibility Doc Gate
{{#if route_task}}
| Check | Status | Details |
|-------|--------|---------|
| Applicability | YES | {N} route(s) detected: {route list} |
| Conformance Statement Scope | PASS/FAIL | Route(s) {present/missing} in Section 2 |
| Conformance Statement Metrics | PASS/FAIL | Route counts {match/mismatch}: expected {N}, actual {M} |
| VPAT Route Count | PASS/FAIL | Header says {N} routes, expected {M} |
| Document Control (Conformance) | PASS/FAIL | Version {version} dated {date} |
| Document Control (VPAT) | PASS/FAIL | Version {version} dated {date} |
| Route Reconciliation | INFO | DISK_COVERED_BY_STATEMENT: {PASS/WARN} ({N} uncovered) |
{{else}}
N/A - Task does not add or modify routes
{{/if}}
```

## Verdict Rules

- **ALL** checks PASS → Section 11: **PASS**
- Applicability = SKIP → Section 11: **SKIP** (no route changes detected)
- **ANY** check FAIL → Section 11: **FAIL** (blocking — task cannot be marked Completed)

## Failure Recovery Steps

If Section 11 fails, follow these steps to remediate:

### Missing route in conformance statement scope

1. Open `docs/compliance/wcag-conformance-statement.md`
2. Go to Section 2 (line 20 area)
3. Add the route to the appropriate bullet list (public or authenticated)
4. Update the aggregate count: "all N configured routes" → "all N+1 configured routes"
5. Update Section 3 metrics (lines 38-39):
   - "Routes fully conformant: X of Y" → update Y to new total
   - "Routes partially conformant: Z of Y" → update Y to new total

### Wrong route count in VPAT

1. Open `docs/compliance/vpat-2.5.md`
2. Go to line 9 (Evaluation Methods Used)
3. Update `(N routes)` to the new total count

### Missing Document Control entry

1. Open the affected document (`wcag-conformance-statement.md` or `vpat-2.5.md`)
2. Go to the Document Control table at the end of the file
3. Add a new row:
   ```
   | {next_version} | {today's date} | Engineering ({TASK_ID}) | Added route(s): {route_list} |
   ```

### Re-run verification

After applying fixes, re-run Section 11 to confirm all checks pass.

## Dry-Run Example: PG-032

**Task**: PG-032 — Docs Index (Developer Documentation Portal Entry Point)
**Plan**: `.specify/sprints/sprint-15/planning/PG-032-plan.md`

### Walkthrough

1. **Read plan** → find "Files to Create" section
2. **Extract paths** → `apps/web/src/app/(developer)/docs/page.tsx` found
3. **Filter for page.tsx** → matches `apps/web/src/app/**/page.tsx` ✓
4. **Apply exclusions** → path contains `(developer)/` → **EXCLUDED**
5. **Result** → filtered list is EMPTY after exclusions
6. **Verdict** → Section 11: **SKIP** (not applicable — developer portal route excluded from conformance scope)

This demonstrates that developer portal tasks correctly bypass the accessibility doc gate.
