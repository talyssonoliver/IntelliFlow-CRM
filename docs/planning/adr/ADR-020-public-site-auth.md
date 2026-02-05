# ADR-020: Public Site and Auth Funnel (Marketing Pages + Sign-in/Sign-up)

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Product Lead, Frontend Lead, Growth Lead  
**Related Tasks:** PG-001–PG-018

## Context and Problem
- Marketing pages and auth flows were built across multiple tasks without a single contract for SEO, accessibility, and performance.
- Need consistent metrics (Lighthouse >90), auth security (CSRF, rate limits), and content source-of-truth.

## Decision
1) **Performance/SEO:** Lighthouse PWA/SEO/Best Practices >90; TTFB <200ms, LCP <2s on P95.  
2) **Accessibility:** Axe/WCAG AA gates on all public/auth pages.  
3) **Content Source:** Marketing copy comes from CMS/content files; no hardcoded lorem/placeholder; translations allowed via JSON.  
4) **Auth Security:** CSRF protection, rate limiting, captcha on signup, passwordless or OIDC flows only; no local password storage.  
5) **Evidence:** Lighthouse report, axe report, CSRF/rate-limit tests stored with build artifacts.

## Considered Options
- Page-by-page ad hoc rules (rejected).  
- Single bundle budgets and gates (chosen).

## Consequences
Positive: Consistent perf/SEO/a11y, reduced regressions. Negative: CI time for Lighthouse/axe checks.

## Implementation Notes
- shadcn/Tailwind tokens from design system; caching headers for static assets; ISR/edge where applicable.
- Auth routes behind rate-limit middleware; CSRF token tests in vitest/playwright.

## Verification
- MATOP Foundation + Quality STOAs parse Lighthouse/axe outputs and auth security tests; block on placeholder copy or failed gates.

## Links
- ADR-001, ADR-003, ADR-004, ADR-009.
