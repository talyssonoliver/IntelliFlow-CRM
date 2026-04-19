# ADR-038: Accessibility Architecture — Testing, CI Enforcement, and Compliance Documentation

**Status:** Accepted

**Date:** 2026-02-23

**Deciders:** QA (STOA-Security), DevOps, Frontend Lead

**Technical Story:** DOC-008

## Context and Problem Statement

IntelliFlow CRM needs a formalized accessibility compliance infrastructure.
DOC-007 identified 16 WCAG 2.1 AA failures across 26 routes, 5 process
infrastructure gaps (no axe-core tests in apps/web, Lighthouse accessibility at
warn not error, no eslint-plugin-jsx-a11y, lighthouse-ci disabled in
audit-matrix, no auth strategy for Lighthouse on gated routes), and 56% overall
conformance. Post-remediation the codebase reached 96% conformance. The question
is: how should the project architect its accessibility testing, CI enforcement,
and compliance documentation to prevent regressions and meet enterprise
procurement requirements?

## Decision Drivers

- Enterprise CRM buyers require VPAT 2.5 documents for Section 508 procurement
- WCAG 2.1 AA is the target conformance level (industry standard for SaaS)
- Regressions must be caught at CI time, not in production audits
- The existing test suite uses happy-dom in apps/web (incompatible with
  axe-core)
- 22 of 26 routes require authentication, limiting Lighthouse CI coverage
- eslint-plugin-jsx-a11y is already installed but some rules are at warn level

## Considered Options

- **Option 1**: axe-core + vitest-axe with dedicated jsdom config
  (component-level a11y tests)
- **Option 2**: pa11y with Playwright (full-page browser-based a11y tests)
- **Option 3**: @axe-core/playwright (browser-based axe-core via Playwright)
- **Option 4**: Lighthouse CI only (score-based enforcement, no unit-level a11y
  tests)

## Decision Outcome

Chosen option: "Option 1 (axe-core + vitest-axe)" for Sprint 14, with Option 3
(@axe-core/playwright) planned for Sprint 18+ E2E layer.

### Rationale

- `packages/ui` already uses vitest-axe (7 existing tests), providing a proven
  pattern
- Component-level tests catch ARIA structure issues at development time (fast
  feedback)
- jsdom is sufficient for structural ARIA/landmark/heading/label testing
- Lighthouse CI complements axe-core by catching color contrast and runtime
  rendering issues
- pa11y requires a running server, adding CI complexity without additional
  structural coverage
- @axe-core/playwright deferred because the Playwright E2E suite is not yet
  mature enough for Sprint 14

### Key Architectural Decisions

1. **Separate vitest config for a11y tests** — `tests/a11y/vitest.config.ts`
   with `environment: 'jsdom'` to avoid changing apps/web's happy-dom default
2. **Lighthouse CI accessibility promoted to error** — `lighthouserc.js`
   categories:accessibility changed from warn to error at minScore 0.9
3. **PR gate scoped to public routes** — Lighthouse in pr-checks.yml runs
   against 4 public routes only until auth strategy (PG-A11Y-005) is resolved
4. **audit-matrix.yml lighthouse-ci promoted to Tier 2** — enabled, required,
   with accessibility_min: 90
5. **VPAT 2.5 as snapshot document** — versioned with each remediation sprint,
   not a living document
6. **jsx-a11y warn rules promoted to error** — 6 of 7 warn rules upgraded;
   no-autofocus remains warn

### Positive Consequences

- Accessibility regressions caught at PR time via axe-core unit tests and
  Lighthouse CI
- VPAT 2.5 document available for enterprise procurement requests
- Clear separation between structural a11y testing (axe-core/jsdom) and visual
  a11y testing (Lighthouse/browser)
- Existing packages/ui vitest-axe pattern reused, minimizing learning curve

### Negative Consequences

- jsdom cannot detect color contrast issues (CSS computed styles not available)
  — Lighthouse required as complement
- Focus trap correctness (F-009) requires Playwright E2E tests, not axe-core
- Auth gap limits Lighthouse coverage to 4/26 routes in PR checks
- Separate vitest config adds maintenance overhead

## Links

- [DOC-007 Gap Assessment](../../compliance-and-governance/compliance/accessibility-gap-assessment.md)
- [DOC-008 Specification](.specify/sprints/sprint-14/specifications/DOC-008-spec.md)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ITI VPAT 2.5 Template](https://www.itic.org/policy/accessibility/vpat)

## Documentation Maintenance

### Update Triggers

The following trigger categories require updates to accessibility compliance
documents:

| #   | Trigger Category   | Description                                                                                                                            | Example                                                                                             |
| --- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| T1  | New Routes         | Any new `page.tsx` added to `apps/web/src/app/` that is not excluded from conformance scope (i.e., not under `(developer)/` or `api/`) | Adding `/insights/page.tsx` requires conformance statement scope update                             |
| T2  | Component Changes  | Modifications to interactive components that affect ARIA semantics, keyboard operability, or landmark structure                        | Changing `role="menu"` to `role="navigation"` on sidebar; adding `aria-modal` to a dialog           |
| T3  | WCAG Scope Changes | Changes to the target WCAG conformance level or adoption of a new WCAG version                                                         | Upgrading from WCAG 2.1 AA to WCAG 2.2 AA; adding Level AAA criteria                                |
| T4  | AT Findings        | New assistive technology test results revealing conformance gaps or regressions                                                        | NVDA testing reveals focus trap failure (F-009); VoiceOver testing finds landmark confusion (F-003) |

The table is intentionally extensible — new trigger categories can be appended
in future ADR amendments.

Each trigger requires updates to specific documents:

| Trigger                | VPAT 2.5                             | Conformance Statement          | Gap Assessment          | This ADR                                |
| ---------------------- | ------------------------------------ | ------------------------------ | ----------------------- | --------------------------------------- |
| T1: New Routes         | Route count (line 9)                 | Section 2 scope list + metrics | No                      | No                                      |
| T2: Component Changes  | Affected criteria rows               | Section 5 if new limitation    | If new failure          | If architectural decision changes       |
| T3: WCAG Scope Changes | Full document review                 | Full document review           | Full re-assessment      | Decision Outcome section                |
| T4: AT Findings        | Affected criteria conformance levels | Section 5 known limitations    | Add to failure registry | No (unless architectural change needed) |

### Enforcement Mechanisms

Three operational enforcement systems implement this policy:

| Mechanism                 | Task    | Artifact Path                                                                 | Type               | Trigger Coverage |
| ------------------------- | ------- | ----------------------------------------------------------------------------- | ------------------ | ---------------- |
| Route Reconciliation      | DOC-010 | `tools/scripts/a11y-route-reconcile.ts`                                       | CI runtime check   | T1               |
| Per-Task Compliance Gate  | DOC-011 | `.claude/skills/compliance-check/references/accessibility-doc-gate.md`        | Blocking task gate | T1               |
| Quarterly Holistic Review | DOC-012 | `docs/compliance-and-governance/compliance/quarterly-a11y-review-template.md` | Periodic review    | T1, T2, T3, T4   |

Per-task mechanisms (DOC-010, DOC-011) provide continuous enforcement at
implementation time. The quarterly review (DOC-012) provides periodic holistic
validation that per-task gates cannot perform.

### Responsibility

| Role                   | Responsibility                                                         |
| ---------------------- | ---------------------------------------------------------------------- |
| DRI (Responsible)      | QA Lead (STOA-Quality) — executes reviews and verifies updates         |
| Approver (Accountable) | PM (STOA-Automation) — approves completed reviews                      |
| Consulted              | Frontend Dev — provides implementation context for conformance changes |
| Informed               | Tech Lead — receives review summaries                                  |

For per-task enforcement: the task implementer is responsible for triggering
updates; the compliance gate enforces this automatically.

### Review Cadence

- **Per-task**: Enforced automatically by DOC-011 compliance gate on every
  PG-_/IFC-_ task with route changes
- **Periodic**: Every 4 sprints per DOC-012 quarterly template (Sprint 20, 24,
  28, 32, ...)
- **Extraordinary**: Triggered by route count delta >= 10, WCAG version change,
  or legal/regulatory event (per quarterly template lines 126-129)

This cadence supersedes the VPAT Document Control statement of "reviewed every 6
months" with a more frequent 4-sprint cycle (per quarterly template lines
122-123).

### Update Verification Process

1. **For T1 (New Routes)**: Run `npx tsx tools/scripts/a11y-route-reconcile.ts`
   — exit code 0 confirms conformance statement is current
2. **For T1 (Per-task)**: Compliance-check Section 11 runs automatically and
   reports PASS/FAIL for conformance statement scope, VPAT route count, and
   Document Control entries
3. **For T2-T4**: Quarterly review template Sections 1-5 checklists provide
   verification (no automated check — requires human review)
4. **For all triggers**: Document Control tables in VPAT and conformance
   statement must have a new version row referencing the triggering change

## Validation Criteria

- [ ] axe-core test suite runs in CI with zero violations
- [ ] Lighthouse accessibility score >= 0.9 on public routes
- [ ] VPAT 2.5 document covers all 50 WCAG 2.1 A+AA criteria
- [ ] WCAG conformance statement documents current conformance level
- [ ] eslint-plugin-jsx-a11y zero warnings on `pnpm lint`

### Rollback Plan

If axe-core tests produce excessive false positives in jsdom:

1. Disable axe-core test suite temporarily
2. Rely on Lighthouse CI and eslint-plugin-jsx-a11y as primary gates
3. Evaluate @axe-core/playwright as replacement in Sprint 18
