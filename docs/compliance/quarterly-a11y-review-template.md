# Quarterly Accessibility Documentation Review

## Review Information

| Field                      | Value                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| **Review Sprint**          | <!-- FILL: Sprint number (e.g., Sprint 20) -->                           |
| **Review Date**            | <!-- FILL: YYYY-MM-DD -->                                                |
| **Reviewer**               | <!-- FILL: Name and role -->                                             |
| **Previous Review Sprint** | <!-- FILL: Previous sprint number, or "Initial" for the first review --> |

---

## Section 1: VPAT Accuracy

Verify that the VPAT document accurately reflects the current state of WCAG
conformance.

**Reference:** `docs/compliance/vpat-2.5.md`

- [ ] Spot-check WCAG Level A criteria (Table 1, 30 criteria) conformance levels
      in `docs/compliance/vpat-2.5.md` lines 40-75. For each sampled criterion,
      confirm the stated conformance level matches current implementation.
- [ ] Spot-check WCAG Level AA criteria (Table 2, 20 criteria) conformance
      levels in `docs/compliance/vpat-2.5.md` lines 77-102. For each sampled
      criterion, confirm the stated conformance level matches current
      implementation.
- [ ] Review Section 508 Functional Performance Criteria rows 302.1-302.8
      (`docs/compliance/vpat-2.5.md` lines 106+). Verify each row's conformance
      level and remarks are current.
- [ ] Verify Document Control table (`docs/compliance/vpat-2.5.md` lines
      129-135). Apply version increment rule: patch increment if no conformance
      level changes since last review; minor increment if any conformance level
      changed.
- [ ] Run `pnpm --filter @intelliflow/web lint` and record exit code below.

**ESLint jsx-a11y exit code:** <!-- FILL: exit code (0 = pass) -->

**Section 1 notes:**

<!-- FILL: any issues found, criteria that changed, or "No issues found" -->

---

## Section 2: Conformance Scope

Verify that the conformance statement accurately reflects the application's
current route structure.

**Reference:** `docs/compliance/wcag-conformance-statement.md` Section 2 (lines
18-37)

- [ ] Run `npx tsx tools/scripts/a11y-route-reconcile.ts` and record gate
      results below.
- [ ] Verify conformance statement Section 2 route list
      (`docs/compliance/wcag-conformance-statement.md` lines 18-37) matches the
      filesystem routes discovered by the reconciliation script.
- [ ] Check aggregate route count on line 20 of conformance statement. Update if
      route count has changed.
- [ ] Verify Section 3 metrics table denominators
      (`docs/compliance/wcag-conformance-statement.md` lines 39-44) match
      current criteria counts.
- [ ] Review route group assignments for correctness. Confirm each route is in
      the appropriate group.
- [ ] Verify dynamic segment parent-inherits policy still holds. Dynamic routes
      (e.g., `/contacts/[id]`) should inherit conformance from their parent
      static route.

**Route reconciliation gate results:**

<!-- FILL: G1-G5 results (e.g., G1: PASS, G2: PASS, G3: PASS, G4: WARN, G5: PASS) -->

**Section 2 notes:**

<!-- FILL: routes added/removed, group changes, or "No changes" -->

---

## Section 3: Route Coverage

Verify that new routes added since the last review have adequate accessibility
test coverage.

- [ ] Inventory routes added since last review. List count below.
- [ ] For each new route: confirm it appears in conformance statement Section 2
      (`docs/compliance/wcag-conformance-statement.md` lines 18-37).
- [ ] Check Lighthouse CI URL list coverage (`lighthouserc.js` lines 17-50,
      currently 26 URLs). Determine if new routes should be added to the
      Lighthouse CI URL list.
- [ ] Check axe-core test coverage for new shell/interactive components. Verify
      test skeletons exist in `tests/a11y/`.
- [ ] Run `npx vitest run --config tests/a11y/vitest.config.ts` and record pass
      count below.

**New routes since last review:**

<!-- FILL: count and list (e.g., "3 routes: /insights, /help-center, /contacts/[id]/edit") -->

**axe-core test results:** <!-- FILL: pass/total (e.g., "8/8 passed") -->

**Section 3 notes:**

<!-- FILL: routes needing Lighthouse CI addition, missing test coverage, or "All covered" -->

---

## Section 4: Known Limitations

Review and update known accessibility limitations.

**Reference:** `docs/compliance/wcag-conformance-statement.md` Section 5 (lines
68-78), `docs/compliance/accessibility-gap-assessment.md`

- [ ] Review conformance statement Section 5 open limitations
      (`docs/compliance/wcag-conformance-statement.md` lines 68-78). List each
      limitation and its current status.
- [ ] For each limitation: check if remediation was shipped since last review.
      If remediated, update the conformance level in the VPAT and conformance
      statement.
- [ ] Detect new limitations via Lighthouse CI accessibility assertions. Run
      `npx lhci autorun --config=lighthouserc.js` or review latest CI results.
- [ ] Verify workarounds for known limitations are still present in code.
      Confirm mitigation measures have not regressed.
- [ ] If SC 1.4.1 (Use of Color) limitation on `/deals` pipeline visualization
      has been remediated, update Section 508 FPC row 302.3 accordingly.
- [ ] Cross-reference `docs/compliance/accessibility-gap-assessment.md` failure
      registry. Verify no new failures have been introduced.

**Open limitations status:**

<!-- FILL: For each limitation, state: "[SC number] - [status: Open/Remediated/New]" -->

**Section 4 notes:**

<!-- FILL: limitations resolved, new limitations found, or "No changes" -->

---

## Section 5: AT Testing Schedule

Verify assistive technology testing is on schedule and configuration is current.

**Reference:** `docs/compliance/wcag-conformance-statement.md` Section 8 (lines
122-170)

- [ ] Review conformance statement Section 8 schedule adherence
      (`docs/compliance/wcag-conformance-statement.md` lines 122-170). Confirm
      AT testing was performed as scheduled.
- [ ] Verify AT combination matrix (4 combinations) and priority route list (8
      routes) are current. Update if application structure has changed
      significantly.
- [ ] Check AT software version currency. Verify testing uses current versions
      of NVDA, VoiceOver, JAWS, and TalkBack.
- [ ] Set next 4-sprint AT test schedule. Record planned test sprint below.
- [ ] Check `@axe-core/playwright` integration status (per ADR-038 line 33,
      deferred to Sprint 18+). Note whether integration is now available or
      still deferred.

**Next AT test sprint:** <!-- FILL: Sprint number (current + 4) -->

**@axe-core/playwright status:**

<!-- FILL: "Integrated" or "Deferred to Sprint N" -->

**Section 5 notes:**

<!-- FILL: AT version updates needed, schedule changes, or "On track" -->

---

## Governance

### Review Cadence

- **Frequency:** Every 4 sprints, starting Sprint 20
- **Schedule:** Sprint 20, 24, 28, 32, ... (aligned with quarterly business
  cadence)

### Responsibility

- **DRI (Responsible):** QA Lead (STOA-Quality) — executes the review using this
  template
- **Approver (Accountable):** PM (STOA-Automation) — approves the completed
  review
- **Consulted:** Frontend Dev — provides implementation context for conformance
  changes
- **Informed:** Tech Lead — receives review summary

### Cadence Authority

This quarterly review cadence supersedes the VPAT Document Control statement at
`docs/compliance/vpat-2.5.md` line 125 ("reviewed every 6 months") with a more
frequent 4-sprint cycle.

### Extraordinary Review Triggers

The following events require an immediate out-of-cycle review regardless of the
regular schedule:

1. **Route count delta >= 10** — 10 or more routes added or removed since last
   review
2. **WCAG version change** — a new WCAG version (e.g., WCAG 2.2, WCAG 3.0) is
   adopted
3. **Legal or regulatory event** — accessibility-related legal action,
   regulatory guidance, or compliance audit

### Relationship to Per-Task Compliance Checks

The quarterly review is complementary to the per-task compliance-check (Section
11: Accessibility Doc Gate). The per-task gate catches drift at implementation
time; this quarterly review provides a holistic cross-document consistency check
that individual task gates cannot perform.

### Review Instance Archiving

Completed reviews are archived as copies of this template (with all fields
filled) at:

```
docs/compliance/quarterly-a11y-reviews/sprint-{N}-review.md
```

Where `{N}` is the sprint number of the review.

---

## Sign-off

### Section Results

| Section                | Result                      | Notes                     |
| ---------------------- | --------------------------- | ------------------------- |
| 1. VPAT Accuracy       | <!-- FILL: PASS or FAIL --> | <!-- FILL: brief note --> |
| 2. Conformance Scope   | <!-- FILL: PASS or FAIL --> | <!-- FILL: brief note --> |
| 3. Route Coverage      | <!-- FILL: PASS or FAIL --> | <!-- FILL: brief note --> |
| 4. Known Limitations   | <!-- FILL: PASS or FAIL --> | <!-- FILL: brief note --> |
| 5. AT Testing Schedule | <!-- FILL: PASS or FAIL --> | <!-- FILL: brief note --> |

### Overall Result

**Overall:**

<!-- FILL: PASS (all 5 sections PASS) or FAIL (any section FAIL) -->

### Documents Updated

<!-- FILL: List all documents modified during this review, e.g.:
- docs/compliance/vpat-2.5.md (version increment)
- docs/compliance/wcag-conformance-statement.md (route count update)
Or "No documents updated" if no changes were needed.
-->

### Next Review

**Next review sprint:**

<!-- FILL: Current sprint + 4 (e.g., if this is Sprint 20, next is Sprint 24) -->

### Reviewer Sign-off

**Reviewer:** <!-- FILL: Name --> **Date:** <!-- FILL: YYYY-MM-DD -->
**Signature:** <!-- FILL: Approved / Approved with caveats -->

---

## Document Control

| Version | Date       | Author                | Changes                           |
| ------- | ---------- | --------------------- | --------------------------------- |
| 1.0.0   | 2026-03-01 | Engineering (DOC-012) | Initial quarterly review template |
