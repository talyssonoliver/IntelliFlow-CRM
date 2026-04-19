# PRD: Public Site & Auth Funnel

**Version:** 1.0  
**Date:** 2026-02-02  
**Owners:** Growth Lead, Frontend Lead  
**Related Tasks:** PG-001–PG-018, PG-019, PG-020, PG-021, PG-022, PG-023,
PG-024, PG-124 **Decision Records:** ADR-020-public-site-auth.md,
ADR-039-saml-sso-integration.md

## Summary

Deliver marketing pages and auth flows with strong SEO/a11y/performance and
secure signup/signin.

## Goals

- Lighthouse PWA/SEO/Best Practices >90 across public/auth pages.
- Secure, rate-limited, CSRF-protected auth; passwordless or OIDC only.
- Content sourced from CMS/files, not placeholders.

## Non-Goals

- Deep app navigation beyond auth.
- Pricing logic (handled elsewhere).

## Users & Use Cases

- Prospects researching product.
- New users signing up; existing users signing in/out.

## Functional Requirements

- Public pages: home, features, pricing, blog, careers, etc.
- Auth flows: signup/signin/logout with captcha/rate-limit; email verification
  if applicable.
- CMS-backed content; localization ready.

## Non-Functional Requirements

- Performance: TTFB <200ms, LCP <2s P95.
- Accessibility: WCAG AA via axe checks.
- Security: CSRF, rate-limits, captcha; no password storage locally.

## Metrics

- Lighthouse scores >90; LCP <2s; bounce rate targets tracked.
- Auth error rate <0.5%; CSRF/rate-limit tests passing.

## Acceptance Criteria

- Lighthouse + axe reports attached for key routes.
- CSRF/rate-limit tests present and green.
- No placeholder copy in builds.

## Dependencies

- ADR-001, ADR-003, ADR-004, ADR-009, ADR-020, ADR-048 (hybrid AI inference).

## Risks / Mitigations

- Risk: SEO regressions → Mitigate with automated Lighthouse per commit.
- Risk: Abuse on auth → Mitigate with rate limits and captcha.
