# ADR-038: Accessibility Architecture — Testing, CI Enforcement, and Compliance Documentation

**Status:** Accepted

**Date:** 2026-02-23

**Deciders:** QA (STOA-Security), DevOps, Frontend Lead

**Technical Story:** DOC-008

## Context and Problem Statement

IntelliFlow CRM needs a formalized accessibility compliance infrastructure. DOC-007 identified 16 WCAG 2.1 AA failures across 26 routes, 5 process infrastructure gaps (no axe-core tests in apps/web, Lighthouse accessibility at warn not error, no eslint-plugin-jsx-a11y, lighthouse-ci disabled in audit-matrix, no auth strategy for Lighthouse on gated routes), and 56% overall conformance. Post-remediation the codebase reached 96% conformance. The question is: how should the project architect its accessibility testing, CI enforcement, and compliance documentation to prevent regressions and meet enterprise procurement requirements?

## Decision Drivers

- Enterprise CRM buyers require VPAT 2.5 documents for Section 508 procurement
- WCAG 2.1 AA is the target conformance level (industry standard for SaaS)
- Regressions must be caught at CI time, not in production audits
- The existing test suite uses happy-dom in apps/web (incompatible with axe-core)
- 22 of 26 routes require authentication, limiting Lighthouse CI coverage
- eslint-plugin-jsx-a11y is already installed but some rules are at warn level

## Considered Options

- **Option 1**: axe-core + vitest-axe with dedicated jsdom config (component-level a11y tests)
- **Option 2**: pa11y with Playwright (full-page browser-based a11y tests)
- **Option 3**: @axe-core/playwright (browser-based axe-core via Playwright)
- **Option 4**: Lighthouse CI only (score-based enforcement, no unit-level a11y tests)

## Decision Outcome

Chosen option: "Option 1 (axe-core + vitest-axe)" for Sprint 14, with Option 3 (@axe-core/playwright) planned for Sprint 18+ E2E layer.

### Rationale

- `packages/ui` already uses vitest-axe (7 existing tests), providing a proven pattern
- Component-level tests catch ARIA structure issues at development time (fast feedback)
- jsdom is sufficient for structural ARIA/landmark/heading/label testing
- Lighthouse CI complements axe-core by catching color contrast and runtime rendering issues
- pa11y requires a running server, adding CI complexity without additional structural coverage
- @axe-core/playwright deferred because the Playwright E2E suite is not yet mature enough for Sprint 14

### Key Architectural Decisions

1. **Separate vitest config for a11y tests** — `tests/a11y/vitest.config.ts` with `environment: 'jsdom'` to avoid changing apps/web's happy-dom default
2. **Lighthouse CI accessibility promoted to error** — `lighthouserc.js` categories:accessibility changed from warn to error at minScore 0.9
3. **PR gate scoped to public routes** — Lighthouse in pr-checks.yml runs against 4 public routes only until auth strategy (PG-A11Y-005) is resolved
4. **audit-matrix.yml lighthouse-ci promoted to Tier 2** — enabled, required, with accessibility_min: 90
5. **VPAT 2.5 as snapshot document** — versioned with each remediation sprint, not a living document
6. **jsx-a11y warn rules promoted to error** — 6 of 7 warn rules upgraded; no-autofocus remains warn

### Positive Consequences

- Accessibility regressions caught at PR time via axe-core unit tests and Lighthouse CI
- VPAT 2.5 document available for enterprise procurement requests
- Clear separation between structural a11y testing (axe-core/jsdom) and visual a11y testing (Lighthouse/browser)
- Existing packages/ui vitest-axe pattern reused, minimizing learning curve

### Negative Consequences

- jsdom cannot detect color contrast issues (CSS computed styles not available) — Lighthouse required as complement
- Focus trap correctness (F-009) requires Playwright E2E tests, not axe-core
- Auth gap limits Lighthouse coverage to 4/26 routes in PR checks
- Separate vitest config adds maintenance overhead

## Links

- [DOC-007 Gap Assessment](../../compliance/accessibility-gap-assessment.md)
- [DOC-008 Specification](.specify/sprints/sprint-14/specifications/DOC-008-spec.md)
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [ITI VPAT 2.5 Template](https://www.itic.org/policy/accessibility/vpat)

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
