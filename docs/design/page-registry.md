# IntelliFlow CRM - Page Registry

> **Location**: `docs/design/page-registry.md` **Purpose**: Central registry of
> all UI pages with task IDs, KPIs, file paths, components, API routers, test
> paths, and RACI assignments **Last Updated**: 2026-04-12 (as of Sprint 17)
> **Total Pages**: 198

---

## Path Conventions

| Type               | Convention                                       | Example                                          |
| ------------------ | ------------------------------------------------ | ------------------------------------------------ |
| **Code**           | `apps/web/src/app/{route}/page.tsx`              | `apps/web/src/app/contacts/(list)/page.tsx`      |
| **Components**     | `apps/web/src/components/{domain}/`              | `apps/web/src/components/deals/`                 |
| **Design Mockups** | `docs/design/mockups/{name}.png`                 | `docs/design/mockups/contact-360-view.png`       |
| **E2E Tests**      | `tests/e2e/{name}.spec.ts`                       | `tests/e2e/auth-flow.spec.ts`                    |
| **API Routers**    | `apps/api/src/modules/{domain}/{name}.router.ts` | `apps/api/src/modules/contact/contact.router.ts` |

### Route Group Convention

Next.js route groups (parenthesized directories) control layout inheritance
without affecting the URL:

- `(public)/` — Public pages with PublicHeader/PublicFooter
- `(developer)/` — Developer portal pages
- `(list)/` — List views with sidebar layout (e.g., `leads/(list)/page.tsx` →
  `/leads`)

### Entry Format

Each route entry uses this standard table format:

| Field          | Description                                                                    |
| -------------- | ------------------------------------------------------------------------------ |
| **Task ID**    | Sprint_plan.csv task identifier(s). Primary listed first for multi-ID routes.  |
| **File Path**  | Actual `page.tsx` file path on disk                                            |
| **Layout**     | Nearest `layout.tsx` in parent hierarchy                                       |
| **API Router** | tRPC/REST router file, or `N/A` if no backend calls                            |
| **E2E Test**   | Playwright spec file, or `None`                                                |
| **Unit Tests** | Vitest test file, or `None`                                                    |
| **KPI**        | Lighthouse and performance targets                                             |
| **Status**     | `Implemented` (live data) / `Hardcoded` (static/mock data) / `Partial` (mixed) |
| **RACI**       | Responsible / Accountable / Consulted / Informed                               |
| **Components** | Key React components (authenticated routes only)                               |

### Status Legend

| Status          | Meaning                                                |
| --------------- | ------------------------------------------------------ |
| **Implemented** | Page uses live tRPC/REST data from backend             |
| **Hardcoded**   | Page displays static/mock data (backend not yet wired) |
| **Partial**     | Some data live, some hardcoded constants               |
| **Placeholder** | Stub page with minimal content                         |

---

## Section 1: Public Pages (27 routes)

### Home Page (`/`)

| Field          | Value                                                   |
| -------------- | ------------------------------------------------------- |
| **Task ID**    | PG-001, IFC-000                                         |
| **File Path**  | `apps/web/src/app/(public)/page.tsx`                    |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                  |
| **API Router** | N/A                                                     |
| **E2E Test**   | `tests/e2e/smoke.spec.ts`                               |
| **Unit Tests** | `apps/web/src/app/(public)/__tests__/home.test.tsx`     |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; CLS <0.1; SEO >=90 |
| **Status**     | Implemented                                             |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA            |

### About (`/about`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-004                                        |
| **File Path**  | `apps/web/src/app/(public)/about/page.tsx`    |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### Features (`/features`)

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| **Task ID**    | PG-002                                                       |
| **File Path**  | `apps/web/src/app/(public)/features/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                       |
| **API Router** | N/A                                                          |
| **E2E Test**   | None                                                         |
| **Unit Tests** | `apps/web/src/app/(public)/features/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                |
| **Status**     | Implemented                                                  |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA                 |

### Pricing (`/pricing`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-003                                                      |
| **File Path**  | `apps/web/src/app/(public)/pricing/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/pricing/layout.tsx`              |
| **API Router** | N/A                                                         |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/(public)/pricing/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90               |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA                |

### Contact (`/contact`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-005                                                      |
| **File Path**  | `apps/web/src/app/(public)/contact/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                      |
| **API Router** | N/A                                                         |
| **E2E Test**   | `tests/e2e/forms.spec.ts`                                   |
| **Unit Tests** | `apps/web/src/app/(public)/contact/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90               |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA                |

### Privacy Policy (`/privacy`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-050                                                      |
| **File Path**  | `apps/web/src/app/(public)/privacy/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                      |
| **API Router** | N/A                                                         |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/(public)/privacy/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; Response <200ms; SEO >=90                  |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Legal Counsel / C: Compliance / I: QA      |

### Terms of Service (`/terms`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-051                                                      |
| **File Path**  | `apps/web/src/app/(public)/terms/page.tsx`                  |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                      |
| **API Router** | N/A                                                         |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/(public)/terms/__tests__/page.test.tsx`   |
| **KPI**        | Lighthouse >=90; Response <200ms; SEO >=90                  |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Legal Counsel / C: Compliance / I: QA      |

### Cookie Policy (`/cookies`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-052                                                      |
| **File Path**  | `apps/web/src/app/(public)/cookies/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                      |
| **API Router** | N/A                                                         |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/(public)/cookies/__tests__/page.test.tsx`, `apps/web/src/lib/legal/__tests__/cookie-policy-tracker.test.ts` |
| **KPI**        | Lighthouse >=90; Response <200ms; SEO >=90                  |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Legal Counsel / C: Compliance / I: QA      |

### Partners (`/partners`)

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| **Task ID**    | PG-006                                                       |
| **File Path**  | `apps/web/src/app/(public)/partners/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                       |
| **API Router** | N/A                                                          |
| **E2E Test**   | None                                                         |
| **Unit Tests** | `apps/web/src/app/(public)/partners/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                |
| **Status**     | Implemented                                                  |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA                 |

### Press (`/press`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-007                                        |
| **File Path**  | `apps/web/src/app/(public)/press/page.tsx`    |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### Security (`/security`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-008                                        |
| **File Path**  | `apps/web/src/app/(public)/security/page.tsx` |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### Status (`/status`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-014                                        |
| **File Path**  | `apps/web/src/app/(public)/status/page.tsx`   |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### 404 Not Found (`/404`)

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Task ID**    | PG-055                                          |
| **File Path**  | `apps/web/src/app/404/page.tsx`                 |
| **Layout**     | `apps/web/src/app/layout.tsx`                   |
| **API Router** | N/A                                             |
| **E2E Test**   | None                                            |
| **Unit Tests** | `apps/web/src/app/404/__tests__/page.test.tsx`  |
| **KPI**        | Lighthouse >=90; Response <200ms; noindex route |
| **Status**     | Implemented                                     |
| **RACI**       | R: Frontend / A: SRE / C: Product / I: QA       |

### 500 Server Error (`/500`)

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Task ID**    | PG-056                                          |
| **File Path**  | `apps/web/src/app/500/page.tsx`                 |
| **Layout**     | `apps/web/src/app/layout.tsx`                   |
| **API Router** | N/A                                             |
| **E2E Test**   | None                                            |
| **Unit Tests** | `apps/web/src/app/500/__tests__/page.test.tsx`  |
| **KPI**        | Lighthouse >=90; Response <200ms; noindex route |
| **Status**     | Implemented                                     |
| **RACI**       | R: Frontend / A: SRE / C: Product / I: QA       |

### Blog (`/blog`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-009                                        |
| **File Path**  | `apps/web/src/app/(public)/blog/page.tsx`     |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### Blog Post (`/blog/[slug]`)

| Field          | Value                                            |
| -------------- | ------------------------------------------------ |
| **Task ID**    | PG-010                                           |
| **File Path**  | `apps/web/src/app/(public)/blog/[slug]/page.tsx` |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`           |
| **API Router** | N/A                                              |
| **E2E Test**   | None                                             |
| **Unit Tests** | None                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90    |
| **Status**     | Implemented                                      |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA     |

### Careers (`/careers`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-011                                        |
| **File Path**  | `apps/web/src/app/(public)/careers/page.tsx`  |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90 |
| **Status**     | Implemented                                   |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA  |

### Career Detail (`/careers/[id]`)

| Field          | Value                                             |
| -------------- | ------------------------------------------------- |
| **Task ID**    | PG-012                                            |
| **File Path**  | `apps/web/src/app/(public)/careers/[id]/page.tsx` |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`            |
| **API Router** | N/A                                               |
| **E2E Test**   | None                                              |
| **Unit Tests** | None                                              |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90     |
| **Status**     | Implemented                                       |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA      |

### Landing Page (`/lp/[slug]`)

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| **Task ID**    | PG-013                                         |
| **File Path**  | `apps/web/src/app/(public)/lp/[slug]/page.tsx` |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`         |
| **API Router** | N/A                                            |
| **E2E Test**   | None                                           |
| **Unit Tests** | None                                           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90  |
| **Status**     | Implemented                                    |
| **RACI**       | R: Frontend / A: DevRel / C: Product / I: QA   |

### Login (`/login`)

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Task ID**    | PG-015, IFC-001, IFC-006                                  |
| **File Path**  | `apps/web/src/app/(public)/login/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/login/layout.tsx`              |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                |
| **E2E Test**   | `tests/e2e/auth-flow.spec.ts`                             |
| **Unit Tests** | `apps/web/src/app/(public)/login/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms        |
| **Status**     | Implemented                                               |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA            |

### Signup (`/signup`)

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| **Task ID**    | PG-016, IFC-001                                            |
| **File Path**  | `apps/web/src/app/(public)/signup/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/signup/layout.tsx`              |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                 |
| **E2E Test**   | `tests/e2e/signup.spec.ts`                                 |
| **Unit Tests** | `apps/web/src/app/(public)/signup/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms         |
| **Status**     | Implemented                                                |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA             |

### Signup Success (`/signup/success`)

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| **Task ID**    | PG-017                                                             |
| **File Path**  | `apps/web/src/app/(public)/signup/success/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/signup/layout.tsx`                      |
| **API Router** | N/A                                                                |
| **E2E Test**   | `tests/e2e/signup.spec.ts`                                         |
| **Unit Tests** | `apps/web/src/app/(public)/signup/success/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                |
| **Status**     | Implemented                                                        |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                     |

### Forgot Password (`/forgot-password`)

| Field          | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| **Task ID**    | PG-019                                                              |
| **File Path**  | `apps/web/src/app/(public)/forgot-password/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                              |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                          |
| **E2E Test**   | `tests/e2e/auth-flow.spec.ts`                                       |
| **Unit Tests** | `apps/web/src/app/(public)/forgot-password/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                  |
| **Status**     | Implemented                                                         |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                      |

### Reset Password (`/reset-password/[token]`)

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| **Task ID**    | PG-020                                                             |
| **File Path**  | `apps/web/src/app/(public)/reset-password/[token]/page.tsx`        |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                             |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                         |
| **E2E Test**   | `tests/e2e/auth-flow.spec.ts`                                      |
| **Unit Tests** | `apps/web/src/app/(public)/reset-password/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                 |
| **Status**     | Implemented                                                        |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                     |

### Reset Password Callback (`/reset-password/callback`)

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| **Task ID**    | PG-020                                                                      |
| **File Path**  | `apps/web/src/app/(public)/reset-password/callback/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                                      |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                                  |
| **E2E Test**   | `tests/e2e/auth-flow.spec.ts`                                               |
| **Unit Tests** | `apps/web/src/app/(public)/reset-password/callback/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; Server <200ms                                     |
| **Status**     | Implemented                                                                 |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                              |

### Logout (`/logout`)

| Field          | Value                                          |
| -------------- | ---------------------------------------------- |
| **Task ID**    | PG-018                                         |
| **File Path**  | `apps/web/src/app/(public)/logout/page.tsx`    |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`         |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`     |
| **E2E Test**   | None                                           |
| **Unit Tests** | None                                           |
| **KPI**        | Lighthouse >=90; Server <200ms                 |
| **Status**     | Implemented                                    |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA |

### Auth Callback (`/auth/callback`)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| **Task ID**    | IFC-001                                                           |
| **File Path**  | `apps/web/src/app/(public)/auth/callback/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                            |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                        |
| **E2E Test**   | `tests/e2e/auth-flow.spec.ts`                                     |
| **Unit Tests** | `apps/web/src/app/(public)/auth/callback/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; Server <200ms                                    |
| **Status**     | Implemented                                                       |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                    |

### MFA Verify (`/mfa/verify`)

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| **Task ID**    | PG-022                                                         |
| **File Path**  | `apps/web/src/app/(public)/mfa/verify/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                         |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                     |
| **E2E Test**   | None                                                           |
| **Unit Tests** | `apps/web/src/app/(public)/mfa/verify/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; Server <200ms                        |
| **Status**     | Implemented                                                    |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                 |

### Verify Email (`/verify-email/[token]`)

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Task ID**    | PG-023                                                           |
| **File Path**  | `apps/web/src/app/(public)/verify-email/[token]/page.tsx`        |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                           |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                       |
| **E2E Test**   | None                                                             |
| **Unit Tests** | `apps/web/src/app/(public)/verify-email/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; Server <200ms                                   |
| **Status**     | Implemented                                                      |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                   |

### Verify Email Callback (`/verify-email/callback`)

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| **Task ID**    | PG-023                                                                    |
| **File Path**  | `apps/web/src/app/(public)/verify-email/callback/page.tsx`                |
| **Layout**     | `apps/web/src/app/(public)/layout.tsx`                                    |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                                |
| **E2E Test**   | None                                                                      |
| **Unit Tests** | `apps/web/src/app/(public)/verify-email/callback/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; Server <200ms                                            |
| **Status**     | Implemented                                                               |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                            |

---

## Section 2: Developer Portal (8 routes)

### Developer Apps (`/developers/apps`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-039                                                                 |
| **File Path**  | `apps/web/src/app/(developer)/developers/apps/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                              |
| **API Router** | `apps/api/src/modules/webhooks/webhooks.router.ts`                     |
| **E2E Test**   | None                                                                   |
| **Unit Tests** | `apps/web/src/app/(developer)/developers/apps/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                          |
| **Status**     | Implemented                                                            |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                        |

### Developer App Detail (`/developers/apps/[id]`)

| Field          | Value                                                                                                                                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-041                                                                                                                                                                                                                |
| **File Path**  | `apps/web/src/app/(developer)/developers/apps/[id]/page.tsx`                                                                                                                                                          |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                                                                                                                                                                             |
| **API Router** | N/A (demo data)                                                                                                                                                                                                       |
| **E2E Test**   | None                                                                                                                                                                                                                  |
| **Unit Tests** | `apps/web/src/app/(developer)/developers/apps/[id]/__tests__/page.test.tsx`, `apps/web/src/components/developer/__tests__/app-dashboard.test.tsx`, `apps/web/src/components/developer/__tests__/app-metrics.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                                                                                                                                                                         |
| **Status**     | Implemented                                                                                                                                                                                                           |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                                                                                                                                                                       |

### Docs Index (`/docs`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-032                                                      |
| **File Path**  | `apps/web/src/app/(developer)/docs/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                   |
| **API Router** | N/A                                                         |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90               |
| **Status**     | Implemented                                                 |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA             |

### API Docs (`/docs/api`)

| Field          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| **Task ID**    | PG-033                                                          |
| **File Path**  | `apps/web/src/app/(developer)/docs/api/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                       |
| **API Router** | N/A                                                             |
| **E2E Test**   | None                                                            |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/api/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                   |
| **Status**     | Implemented                                                     |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                 |

### Changelog (`/docs/changelog`)

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| **Task ID**    | PG-035                                                                |
| **File Path**  | `apps/web/src/app/(developer)/docs/changelog/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                             |
| **Component**  | Server Component                                                      |
| **API Router** | N/A                                                                   |
| **E2E Test**   | None                                                                  |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/changelog/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                         |
| **Status**     | Implemented                                                           |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                       |

---

### Integration Docs (`/docs/integrations`)

| Field          | Value                                                                    |
| -------------- | ------------------------------------------------------------------------ |
| **Task ID**    | PG-036, IFC-042                                                          |
| **File Path**  | `apps/web/src/app/(developer)/docs/integrations/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                                |
| **API Router** | `apps/api/src/modules/integrations/integrations.router.ts`               |
| **E2E Test**   | None                                                                     |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/integrations/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                            |
| **Status**     | Implemented                                                              |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                          |

### Webhook Docs (`/docs/webhooks`)

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Task ID**    | PG-036                                                               |
| **File Path**  | `apps/web/src/app/(developer)/docs/webhooks/page.tsx`                |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                            |
| **API Router** | `apps/api/src/modules/webhooks/webhooks.router.ts`                   |
| **E2E Test**   | None                                                                 |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/webhooks/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                        |
| **Status**     | Implemented                                                          |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                      |

### SDK Guides (`/docs/sdk`)

| Field          | Value                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Task ID**    | PG-036                                                                                                                                                                                           |
| **File Path**  | `apps/web/src/app/(developer)/docs/sdk/page.tsx`                                                                                                                                                 |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                                                                                                                                                        |
| **API Router** | N/A (static content)                                                                                                                                                                             |
| **E2E Test**   | None                                                                                                                                                                                             |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/sdk/__tests__/page.test.tsx`, `apps/web/src/components/developer/__tests__/sdk-guides.test.tsx`, `apps/web/src/lib/developer/__tests__/sdk-downloads.test.ts` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                                                                                                                                                    |
| **Status**     | Implemented                                                                                                                                                                                      |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                                                                                                                                                  |

### Architecture Docs (`/docs/architecture`)

| Field          | Value                                                                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-170                                                                                                                                    |
| **File Path**  | `apps/web/src/app/(developer)/docs/architecture/page.tsx`                                                                                 |
| **Layout**     | `apps/web/src/app/(developer)/layout.tsx`                                                                                                 |
| **API Router** | N/A (server-side fs read via adr-service.ts)                                                                                              |
| **E2E Test**   | None                                                                                                                                      |
| **Unit Tests** | `apps/web/src/app/(developer)/docs/architecture/__tests__/page.test.tsx`, `apps/web/src/components/developer/__tests__/adr-list.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; SEO >=90                                                                                             |
| **Status**     | Implemented                                                                                                                               |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                                                                                           |

---

## Section 3: Dashboard (3 routes)

### Dashboard (`/dashboard`)

| Field          | Value                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| **Task ID**    | PG-058, PG-129, IFC-182                                                                |
| **File Path**  | `apps/web/src/app/dashboard/page.tsx`                                                  |
| **Layout**     | `apps/web/src/app/dashboard/layout.tsx`                                                |
| **API Router** | `apps/api/src/modules/home/home.router.ts`, `apps/api/src/modules/lead/lead.router.ts` |
| **E2E Test**   | `tests/e2e/smoke.spec.ts`                                                              |
| **Unit Tests** | None                                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                        |
| **Status**     | Implemented                                                                            |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                          |
| **Components** | DashboardClient, server-side getAccessToken, fetchLeadStats (cached query)             |

### New Dashboard Widget (`/dashboard/new`)

| Field          | Value                                                   |
| -------------- | ------------------------------------------------------- |
| **Task ID**    | PG-058                                                  |
| **File Path**  | `apps/web/src/app/dashboard/new/page.tsx`               |
| **Layout**     | `apps/web/src/app/dashboard/layout.tsx`                 |
| **API Router** | N/A                                                     |
| **E2E Test**   | None                                                    |
| **Unit Tests** | None                                                    |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                     |
| **Status**     | Hardcoded                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA           |
| **Components** | "use client", Link, inline recordTypes navigation cards |

### Dashboard Customize (`/dashboard/customize`)

| Field          | Value                                                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Task ID**    | PG-058                                                                                                                               |
| **File Path**  | `apps/web/src/app/dashboard/customize/page.tsx`                                                                                      |
| **Layout**     | `apps/web/src/app/dashboard/layout.tsx`                                                                                              |
| **API Router** | N/A                                                                                                                                  |
| **E2E Test**   | None                                                                                                                                 |
| **Unit Tests** | None                                                                                                                                 |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                                                      |
| **Status**     | Hardcoded                                                                                                                            |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                                                        |
| **Components** | "use client", DndContext, SortableContext (@dnd-kit), LayoutBuilderGrid, WidgetCard, WidgetLibrary, WidgetDropZone, DashboardSidebar |

---

## Section 4: CRM Core — Leads (3 routes)

### Leads List (`/leads`)

| Field          | Value                                                                             |
| -------------- | --------------------------------------------------------------------------------- |
| **Task ID**    | PG-059, IFC-004, IFC-014                                                          |
| **File Path**  | `apps/web/src/app/leads/(list)/page.tsx`                                          |
| **Layout**     | `apps/web/src/app/leads/(list)/layout.tsx`                                        |
| **API Router** | `apps/api/src/modules/lead/lead.router.ts`                                        |
| **E2E Test**   | None                                                                              |
| **Unit Tests** | None                                                                              |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                        |
| **Status**     | Implemented                                                                       |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                     |
| **Components** | Server shell, LeadsPageClient (client island), fetchLeadsFirstPage (cached query) |

### New Lead (`/leads/new`)

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| **Task ID**    | PG-060, IFC-004                                                           |
| **File Path**  | `apps/web/src/app/leads/(list)/new/page.tsx`                              |
| **Layout**     | `apps/web/src/app/leads/(list)/layout.tsx`                                |
| **API Router** | `apps/api/src/modules/lead/lead.router.ts`                                |
| **E2E Test**   | `tests/e2e/forms.spec.ts`                                                 |
| **Unit Tests** | None                                                                      |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                        |
| **Status**     | Implemented                                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                             |
| **Components** | "use client", multi-step form, Card, ToastProvider, useFormUnsavedChanges |

### Lead Detail (`/leads/[id]`)

| Field          | Value                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Task ID**    | PG-061, IFC-006                                                                                  |
| **File Path**  | `apps/web/src/app/leads/[id]/page.tsx`                                                           |
| **Layout**     | `apps/web/src/app/leads/layout.tsx`                                                              |
| **API Router** | `apps/api/src/modules/lead/lead.router.ts`                                                       |
| **E2E Test**   | None                                                                                             |
| **Unit Tests** | None                                                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                  |
| **Status**     | Implemented                                                                                      |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                    |
| **Components** | "use client", Card, Skeleton, ChurnRiskCard, NextBestActionCard, EntityActionSheet, ActivityFeed |

---

## Section 5: CRM Core — Contacts (3 routes)

### Contacts List (`/contacts`)

| Field          | Value                                                                                   |
| -------------- | --------------------------------------------------------------------------------------- |
| **Task ID**    | PG-064, PG-133, IFC-184                                                                 |
| **File Path**  | `apps/web/src/app/contacts/(list)/page.tsx`                                             |
| **Layout**     | `apps/web/src/app/contacts/(list)/layout.tsx`                                           |
| **API Router** | `apps/api/src/modules/contact/contact.router.ts`                                        |
| **E2E Test**   | None                                                                                    |
| **Unit Tests** | None                                                                                    |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                              |
| **Status**     | Implemented                                                                             |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                           |
| **Components** | Server shell, ContactsPageClient (client island), fetchContactsFirstPage (cached query) |

### New Contact (`/contacts/new`)

| Field          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| **Task ID**    | PG-064, IFC-184                                              |
| **File Path**  | `apps/web/src/app/contacts/(list)/new/page.tsx`              |
| **Layout**     | `apps/web/src/app/contacts/(list)/layout.tsx`                |
| **API Router** | `apps/api/src/modules/contact/contact.router.ts`             |
| **E2E Test**   | `tests/e2e/forms.spec.ts`                                    |
| **Unit Tests** | None                                                         |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms           |
| **Status**     | Implemented                                                  |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                |
| **Components** | "use client", multi-step form (3 steps), Card, ToastProvider |

### Contact Detail (`/contacts/[id]`)

| Field          | Value                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Task ID**    | PG-065, PG-133, IFC-184                                                                          |
| **File Path**  | `apps/web/src/app/contacts/[id]/page.tsx`                                                        |
| **Layout**     | `apps/web/src/app/contacts/layout.tsx`                                                           |
| **API Router** | `apps/api/src/modules/contact/contact.router.ts`                                                 |
| **E2E Test**   | None                                                                                             |
| **Unit Tests** | None                                                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                  |
| **Status**     | Implemented                                                                                      |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                    |
| **Components** | "use client", Card, Skeleton, ChurnRiskCard, NextBestActionCard, EntityActionSheet, ActivityFeed |

---

## Section 6: CRM Core — Accounts (2 routes)

### Accounts List (`/accounts`)

| Field          | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| **Task ID**    | PG-069, PG-134, IFC-185                                                            |
| **File Path**  | `apps/web/src/app/accounts/(list)/page.tsx`                                        |
| **Layout**     | `apps/web/src/app/accounts/(list)/layout.tsx`                                      |
| **API Router** | `apps/api/src/modules/account/account.router.ts`                                   |
| **E2E Test**   | None                                                                               |
| **Unit Tests** | `apps/web/src/app/accounts/__tests__/page.test.tsx`                                |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                         |
| **Status**     | Implemented                                                                        |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                      |
| **Components** | Server shell, AccountsPageClient (client island), fetchAccountStats (cached query) |

### Account Detail (`/accounts/[id]`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-070, PG-134, IFC-185                                     |
| **File Path**  | `apps/web/src/app/accounts/[id]/page.tsx`                   |
| **Layout**     | `apps/web/src/app/accounts/layout.tsx`                      |
| **API Router** | `apps/api/src/modules/account/account.router.ts`            |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/accounts/[id]/__tests__/page.test.tsx`    |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms             |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA               |
| **Components** | "use client", AccountDetail, Card, Skeleton, useRequireAuth |

---

## Section 7: CRM Core — Deals (4 routes)

### Deals List (`/deals`)

| Field          | Value                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-073, PG-135, IFC-186                                                                                        |
| **File Path**  | `apps/web/src/app/deals/(list)/page.tsx`                                                                       |
| **Layout**     | `apps/web/src/app/deals/(list)/layout.tsx`                                                                     |
| **API Router** | `apps/api/src/modules/opportunity/opportunity.router.ts`                                                       |
| **E2E Test**   | None                                                                                                           |
| **Unit Tests** | `apps/web/src/app/deals/(list)/__tests__/page.test.tsx`                                                        |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                                                     |
| **Status**     | Implemented                                                                                                    |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                                  |
| **Components** | "use client", PipelineBoard, ValueSummary, DealFilters, DealListView, DealsCharts (dynamic import), PageHeader |

### Deal Detail (`/deals/[id]`)

| Field          | Value                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Task ID**    | PG-074, IFC-186                                                                                  |
| **File Path**  | `apps/web/src/app/deals/[id]/page.tsx`                                                           |
| **Layout**     | `apps/web/src/app/deals/[id]/layout.tsx`                                                         |
| **API Router** | `apps/api/src/modules/opportunity/opportunity.router.ts`                                         |
| **E2E Test**   | None                                                                                             |
| **Unit Tests** | None                                                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                  |
| **Status**     | Partial                                                                                          |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                    |
| **Components** | "use client", Card, Button, EntityHeader, EntityActionSheet, MoreActionsButton, RelatedTasksCard |

### Deal Forecast (`/deals/[id]/forecast`)

| Field          | Value                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-131, IFC-025                                                                                                           |
| **File Path**  | `apps/web/src/app/deals/[id]/forecast/page.tsx`                                                                           |
| **Layout**     | `apps/web/src/app/deals/[id]/layout.tsx`                                                                                  |
| **API Router** | `apps/api/src/modules/opportunity/opportunity.router.ts`                                                                  |
| **E2E Test**   | None                                                                                                                      |
| **Unit Tests** | `apps/web/src/app/deals/[id]/forecast/__tests__/page.test.tsx`                                                            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                                           |
| **Status**     | Implemented                                                                                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                                             |
| **Components** | "use client", ForecastHeader, ProbabilityGauge, RiskFactorsCard, RecommendedActions, ForecastHistory, ConfidenceIndicator |

### Pipeline Forecast (`/deals/forecast`)

| Field          | Value                                                                                     |
| -------------- | ----------------------------------------------------------------------------------------- |
| **Task ID**    | PG-079, PG-131, IFC-025                                                                   |
| **File Path**  | `apps/web/src/app/deals/forecast/page.tsx`                                                |
| **Layout**     | `apps/web/src/app/deals/forecast/layout.tsx`                                              |
| **API Router** | `apps/api/src/modules/opportunity/opportunity.router.ts`                                  |
| **E2E Test**   | None                                                                                      |
| **Unit Tests** | `apps/web/src/app/deals/forecast/__tests__/page.test.tsx`                                 |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                           |
| **Status**     | Partial                                                                                   |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                             |
| **Components** | "use client", ForecastRevenueChart (dynamic import), Card, Button, Skeleton, EntityHeader |

---

## Section 8: CRM Core — Tickets (3 routes)

### Tickets List (`/tickets`)

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| **Task ID**    | PG-137, IFC-188, IFC-189                                      |
| **File Path**  | `apps/web/src/app/tickets/(list)/page.tsx`                    |
| **Layout**     | `apps/web/src/app/tickets/(list)/layout.tsx`                  |
| **API Router** | `apps/api/src/modules/ticket/ticket.router.ts`                |
| **E2E Test**   | None                                                          |
| **Unit Tests** | None                                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB    |
| **Status**     | Implemented                                                   |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                 |
| **Components** | "use client", TicketList, PageHeader, useTicketFilters, toast |

### New Ticket (`/tickets/new`)

| Field          | Value                                              |
| -------------- | -------------------------------------------------- |
| **Task ID**    | PG-137, IFC-188, IFC-189                           |
| **File Path**  | `apps/web/src/app/tickets/new/page.tsx`            |
| **Layout**     | `apps/web/src/app/tickets/layout.tsx`              |
| **API Router** | `apps/api/src/modules/ticket/ticket.router.ts`     |
| **E2E Test**   | None                                               |
| **Unit Tests** | None                                               |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms |
| **Status**     | Implemented                                        |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA      |
| **Components** | "use client", TicketForm, PageHeader, toast        |

### Ticket Detail (`/tickets/[id]`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-137, IFC-189                                                        |
| **File Path**  | `apps/web/src/app/tickets/[id]/page.tsx`                               |
| **Layout**     | `apps/web/src/app/tickets/layout.tsx`                                  |
| **API Router** | `apps/api/src/modules/ticket/ticket.router.ts`                         |
| **E2E Test**   | None                                                                   |
| **Unit Tests** | None                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                        |
| **Status**     | Implemented                                                            |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                          |
| **Components** | "use client", TicketDetail, PageHeader, Card, Skeleton, toast, useAuth |

---

## Section 9: CRM Core — Documents (3 routes)

### Documents List (`/documents`)

| Field          | Value                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-140, IFC-199                                                                                                            |
| **File Path**  | `apps/web/src/app/documents/(list)/page.tsx`                                                                               |
| **Layout**     | `apps/web/src/app/documents/(list)/layout.tsx`                                                                             |
| **API Router** | `apps/api/src/modules/legal/documents.router.ts`                                                                           |
| **E2E Test**   | None                                                                                                                       |
| **Unit Tests** | None                                                                                                                       |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                                                                 |
| **Status**     | Implemented                                                                                                                |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                                              |
| **Components** | "use client", DataTable, TableRowActions, BulkAction, ConfirmationDialog, PageHeader, SearchFilterBar, DocumentStatusBadge |

### New Document (`/documents/new`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-140, IFC-199                                             |
| **File Path**  | `apps/web/src/app/documents/(list)/new/page.tsx`            |
| **Layout**     | `apps/web/src/app/documents/(list)/layout.tsx`              |
| **API Router** | `apps/api/src/modules/documents/upload.router.ts`           |
| **E2E Test**   | None                                                        |
| **Unit Tests** | None                                                        |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms          |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA               |
| **Components** | "use client", Card, toast, useRequireAuth, file upload form |

### Document Detail (`/documents/[id]`)

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| **Task ID**    | PG-140, IFC-199                                                           |
| **File Path**  | `apps/web/src/app/documents/[id]/page.tsx`                                |
| **Layout**     | `apps/web/src/app/documents/layout.tsx`                                   |
| **API Router** | `apps/api/src/modules/legal/documents.router.ts`                          |
| **E2E Test**   | None                                                                      |
| **Unit Tests** | None                                                                      |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                           |
| **Status**     | Implemented                                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                             |
| **Components** | "use client", Card, AppAvatar, ACLManager, VersionHistory, useRequireAuth |

---

## Section 10: CRM Core — Cases (4 routes)

### Cases List (`/cases`)

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Task ID**    | PG-138, IFC-136, IFC-147                                                     |
| **File Path**  | `apps/web/src/app/cases/(list)/page.tsx`                                     |
| **Layout**     | `apps/web/src/app/cases/(list)/layout.tsx`                                   |
| **API Router** | `apps/api/src/modules/legal/cases.router.ts`                                 |
| **E2E Test**   | None                                                                         |
| **Unit Tests** | None                                                                         |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                   |
| **Status**     | Implemented                                                                  |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                |
| **Components** | "use client", CaseList, PageHeader, Skeleton, useCaseFilters, useRequireAuth |

### New Case (`/cases/new`)

| Field          | Value                                                     |
| -------------- | --------------------------------------------------------- |
| **Task ID**    | PG-138, IFC-136                                           |
| **File Path**  | `apps/web/src/app/cases/(list)/new/page.tsx`              |
| **Layout**     | `apps/web/src/app/cases/(list)/layout.tsx`                |
| **API Router** | `apps/api/src/modules/legal/cases.router.ts`              |
| **E2E Test**   | None                                                      |
| **Unit Tests** | None                                                      |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms        |
| **Status**     | Implemented                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA             |
| **Components** | "use client", CaseForm, PageHeader, toast, useRequireAuth |

### Case Detail (`/cases/[id]`)

| Field          | Value                                                    |
| -------------- | -------------------------------------------------------- |
| **Task ID**    | PG-138, IFC-136, IFC-147                                 |
| **File Path**  | `apps/web/src/app/cases/[id]/page.tsx`                   |
| **Layout**     | `apps/web/src/app/cases/layout.tsx`                      |
| **API Router** | `apps/api/src/modules/legal/cases.router.ts`             |
| **E2E Test**   | None                                                     |
| **Unit Tests** | None                                                     |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms          |
| **Status**     | Implemented                                              |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA            |
| **Components** | "use client", CaseDetail, Card, Skeleton, useRequireAuth |

### Case Timeline (`/cases/timeline`)

| Field          | Value                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-138, IFC-147                                                                                          |
| **File Path**  | `apps/web/src/app/cases/timeline/page.tsx`                                                               |
| **Layout**     | `apps/web/src/app/cases/layout.tsx`                                                                      |
| **API Router** | `apps/api/src/modules/legal/cases.router.ts`, `apps/api/src/modules/misc/timeline.router.ts`             |
| **E2E Test**   | `tests/e2e/case-timeline.spec.ts`                                                                        |
| **Unit Tests** | None                                                                                                     |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                          |
| **Status**     | Implemented                                                                                              |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                            |
| **Components** | "use client", Card, CardHeader, CardTitle, CardDescription, CardContent, useRequireAuth, useSearchParams |

---

## Section 11: Tasks (2 routes)

### Tasks List (`/tasks`)

| Field          | Value                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-081, PG-136, IFC-187                                                                     |
| **File Path**  | `apps/web/src/app/tasks/(list)/page.tsx`                                                    |
| **Layout**     | `apps/web/src/app/tasks/(list)/layout.tsx`                                                  |
| **API Router** | `apps/api/src/modules/task/task.router.ts`                                                  |
| **E2E Test**   | None                                                                                        |
| **Unit Tests** | None                                                                                        |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms; JS <300KB                                  |
| **Status**     | Implemented                                                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                               |
| **Components** | "use client", TaskList, TaskCalendar, TaskForm, ReminderConfig, PageHeader, SearchFilterBar |

### Task Detail (`/tasks/[id]`)

| Field          | Value                                                                 |
| -------------- | --------------------------------------------------------------------- |
| **Task ID**    | PG-082, IFC-187                                                       |
| **File Path**  | `apps/web/src/app/tasks/[id]/page.tsx`                                |
| **Layout**     | `apps/web/src/app/tasks/layout.tsx`                                   |
| **API Router** | `apps/api/src/modules/task/task.router.ts`                            |
| **E2E Test**   | None                                                                  |
| **Unit Tests** | None                                                                  |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                       |
| **Status**     | Implemented                                                           |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                         |
| **Components** | "use client", TaskDetail, TaskForm, PageHeader, toast, useRequireAuth |

---

## Section 12: Calendar (3 routes)

### Calendar (`/calendar`)

| Field          | Value                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-083, PG-139, IFC-137, IFC-138                                                                |
| **File Path**  | `apps/web/src/app/calendar/(list)/page.tsx`                                                     |
| **Layout**     | `apps/web/src/app/calendar/layout.tsx`                                                          |
| **API Router** | `apps/api/src/modules/legal/appointments.router.ts`                                             |
| **E2E Test**   | None                                                                                            |
| **Unit Tests** | `apps/web/src/app/calendar/(list)/__tests__/page.test.tsx`                                      |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                 |
| **Status**     | Implemented                                                                                     |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                   |
| **Components** | "use client", AppointmentList, AppointmentCalendar, PageHeader, Skeleton, useAppointmentFilters |

### New Appointment (`/calendar/new`)

| Field          | Value                                                               |
| -------------- | ------------------------------------------------------------------- |
| **Task ID**    | PG-139, IFC-137                                                     |
| **File Path**  | `apps/web/src/app/calendar/new/page.tsx`                            |
| **Layout**     | `apps/web/src/app/calendar/layout.tsx`                              |
| **API Router** | `apps/api/src/modules/legal/appointments.router.ts`                 |
| **E2E Test**   | None                                                                |
| **Unit Tests** | None                                                                |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                  |
| **Status**     | Implemented                                                         |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                       |
| **Components** | "use client", AppointmentForm, PageHeader, Skeleton, useRequireAuth |

### Appointment Detail (`/calendar/[id]`)

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| **Task ID**    | PG-139, IFC-137                                                             |
| **File Path**  | `apps/web/src/app/calendar/[id]/page.tsx`                                   |
| **Layout**     | `apps/web/src/app/calendar/layout.tsx`                                      |
| **API Router** | `apps/api/src/modules/legal/appointments.router.ts`                         |
| **E2E Test**   | None                                                                        |
| **Unit Tests** | None                                                                        |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                             |
| **Status**     | Implemented                                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                               |
| **Components** | "use client", AppointmentDetail, PageHeader, Card, Skeleton, useRequireAuth |

---

## Section 13: Email (2 routes)

### Email Inbox (`/email`)

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Task ID**    | PG-084, PG-141, IFC-144                         |
| **File Path**  | `apps/web/src/app/email/page.tsx`               |
| **Layout**     | `apps/web/src/app/email/layout.tsx`             |
| **API Router** | `apps/api/src/modules/email/inbound.router.ts`  |
| **E2E Test**   | `tests/e2e/email/inbound-webhook.spec.ts`       |
| **Unit Tests** | None                                            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms |
| **Status**     | Implemented                                     |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA   |
| **Components** | Server component, EmailPage (client island)     |

### Email Detail (`/email/[id]`)

| Field          | Value                                                |
| -------------- | ---------------------------------------------------- |
| **Task ID**    | PG-084, PG-141, IFC-144                              |
| **File Path**  | `apps/web/src/app/email/[id]/page.tsx`               |
| **Layout**     | `apps/web/src/app/email/layout.tsx`                  |
| **API Router** | `apps/api/src/modules/email/inbound.router.ts`       |
| **E2E Test**   | `tests/e2e/email/inbound-webhook.spec.ts`            |
| **Unit Tests** | None                                                 |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms      |
| **Status**     | Implemented                                          |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA        |
| **Components** | Server component, EmailPage with initialEmailId prop |

---

## Section 14: AI & Automation (14 routes)

### Agent Approvals Hub (`/agent-approvals`)

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Task ID**    | IFC-029, IFC-149                                                             |
| **File Path**  | `apps/web/src/app/agent-approvals/page.tsx`                                  |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                                |
| **API Router** | `apps/api/src/modules/autoresponse/autoresponse.router.ts`                   |
| **E2E Test**   | `tests/e2e/agent-approvals.spec.ts`                                          |
| **Unit Tests** | None                                                                         |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                              |
| **Status**     | Implemented                                                                  |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                                |
| **Components** | "use client", Card, Button, ApprovalMetrics, useRequireAuth, useSearchParams |

### Active Agents (`/agent-approvals/agents`)

| Field          | Value                                                                   |
| -------------- | ----------------------------------------------------------------------- |
| **Task ID**    | PG-151, IFC-197                                                         |
| **File Path**  | `apps/web/src/app/agent-approvals/agents/page.tsx`                      |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                           |
| **API Router** | `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`            |
| **E2E Test**   | None                                                                    |
| **Unit Tests** | None                                                                    |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                         |
| **Status**     | Implemented                                                             |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                           |
| **Components** | "use client", ActiveAgentsDashboard, Skeleton, Suspense, useRequireAuth |

### AI Review Queue (`/agent-approvals/ai-review`)

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| **Task ID**    | IFC-181                                                       |
| **File Path**  | `apps/web/src/app/agent-approvals/ai-review/page.tsx`         |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                 |
| **API Router** | `apps/api/src/modules/ai-review/ai-review.router.ts`          |
| **E2E Test**   | `tests/e2e/ai-features/ai-approvals.spec.ts`                  |
| **Unit Tests** | None                                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms               |
| **Status**     | Implemented                                                   |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                 |
| **Components** | "use client", ReviewQueue, Skeleton, Suspense, useRequireAuth |

### AI Review Detail (`/agent-approvals/ai-review/[id]`)

| Field          | Value                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **Task ID**    | IFC-181                                                                                          |
| **File Path**  | `apps/web/src/app/agent-approvals/ai-review/[id]/page.tsx`                                       |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                                                    |
| **API Router** | `apps/api/src/modules/ai-review/ai-review.router.ts`                                             |
| **E2E Test**   | `tests/e2e/ai-features/ai-approvals.spec.ts`                                                     |
| **Unit Tests** | None                                                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                  |
| **Status**     | Implemented                                                                                      |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                                                    |
| **Components** | "use client", Card, Badge, Textarea, Skeleton, StatusBadge, ConfidenceIndicator, useReviewDetail |

### AI Search (`/agent-approvals/ai-search`)

| Field          | Value                                                          |
| -------------- | -------------------------------------------------------------- |
| **Task ID**    | PG-144, IFC-039                                                |
| **File Path**  | `apps/web/src/app/agent-approvals/ai-search/page.tsx`          |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                  |
| **API Router** | `apps/api/src/modules/intelligence/intelligence.router.ts`     |
| **E2E Test**   | None                                                           |
| **Unit Tests** | None                                                           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                |
| **Status**     | Implemented                                                    |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                  |
| **Components** | "use client", AISearchPage, Skeleton, Suspense, useRequireAuth |

### Churn Risk (`/agent-approvals/churn-risk`)

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Task ID**    | PG-143, IFC-039                                                  |
| **File Path**  | `apps/web/src/app/agent-approvals/churn-risk/page.tsx`           |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                    |
| **API Router** | `apps/api/src/modules/intelligence/intelligence.router.ts`       |
| **E2E Test**   | `tests/e2e/ai-features/ai-predictions.spec.ts`                   |
| **Unit Tests** | None                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                  |
| **Status**     | Implemented                                                      |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                    |
| **Components** | "use client", ChurnDashboard, Skeleton, Suspense, useRequireAuth |

### Model Drift (`/agent-approvals/drift`)

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Task ID**    | PG-146, IFC-117, IFC-197                                         |
| **File Path**  | `apps/web/src/app/agent-approvals/drift/page.tsx`                |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                    |
| **API Router** | `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`     |
| **E2E Test**   | None                                                             |
| **Unit Tests** | None                                                             |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                  |
| **Status**     | Implemented                                                      |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                    |
| **Components** | "use client", DriftDashboard, Skeleton, Suspense, useRequireAuth |

### Experiments (`/agent-approvals/experiments`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-149, IFC-025                                                        |
| **File Path**  | `apps/web/src/app/agent-approvals/experiments/page.tsx`                |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                          |
| **API Router** | `apps/api/src/modules/experiment/experiment.router.ts`                 |
| **E2E Test**   | None                                                                   |
| **Unit Tests** | `apps/web/src/app/agent-approvals/experiments/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                        |
| **Status**     | Implemented                                                            |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                          |
| **Components** | "use client", ExperimentsDashboard, Skeleton, Suspense, useRequireAuth |

### AI History (`/agent-approvals/history`)

| Field          | Value                                                           |
| -------------- | --------------------------------------------------------------- |
| **Task ID**    | PG-150, IFC-181                                                 |
| **File Path**  | `apps/web/src/app/agent-approvals/history/page.tsx`             |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                   |
| **API Router** | `apps/api/src/modules/ai-review/ai-review.router.ts`            |
| **E2E Test**   | None                                                            |
| **Unit Tests** | None                                                            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                 |
| **Status**     | Implemented                                                     |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                   |
| **Components** | "use client", ReviewHistory, Skeleton, Suspense, useRequireAuth |

### Latency Monitor (`/agent-approvals/latency`)

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| **Task ID**    | PG-153, IFC-197                                                           |
| **File Path**  | `apps/web/src/app/agent-approvals/latency/page.tsx`                       |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                             |
| **API Router** | `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`              |
| **E2E Test**   | None                                                                      |
| **Unit Tests** | None                                                                      |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                           |
| **Status**     | Implemented                                                               |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                             |
| **Components** | "use client", LatencyMonitorDashboard, Skeleton, Suspense, useRequireAuth |

### Lead Scoring (`/agent-approvals/lead-scoring`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-148, IFC-005, IFC-039                                               |
| **File Path**  | `apps/web/src/app/agent-approvals/lead-scoring/page.tsx`               |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                          |
| **API Router** | `apps/api/src/modules/intelligence/intelligence.router.ts`             |
| **E2E Test**   | `tests/e2e/ai-features/ai-scoring.spec.ts`                             |
| **Unit Tests** | None                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                        |
| **Status**     | Implemented                                                            |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                          |
| **Components** | "use client", LeadScoringDashboard, Skeleton, Suspense, useRequireAuth |

### Agent Logs (`/agent-approvals/logs`)

| Field          | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| **Task ID**    | PG-152, IFC-197                                                                    |
| **File Path**  | `apps/web/src/app/agent-approvals/logs/page.tsx`                                   |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                                      |
| **API Router** | `apps/api/src/modules/ai-monitoring/ai-monitoring.router.ts`                       |
| **E2E Test**   | None                                                                               |
| **Unit Tests** | None                                                                               |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                    |
| **Status**     | Implemented                                                                        |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                                      |
| **Components** | "use client", AgentLogsViewer, Skeleton, Suspense, useRequireAuth, useSearchParams |

### AI Preview (`/agent-approvals/preview`)

| Field          | Value                                                                                  |
| -------------- | -------------------------------------------------------------------------------------- |
| **Task ID**    | IFC-149                                                                                |
| **File Path**  | `apps/web/src/app/agent-approvals/preview/page.tsx`                                    |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                                          |
| **API Router** | `apps/api/src/modules/autoresponse/autoresponse.router.ts`                             |
| **E2E Test**   | None                                                                                   |
| **Unit Tests** | None                                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                                    |
| **Status**     | Hardcoded                                                                              |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                                          |
| **Components** | "use client", Card, Button, ApprovalMetrics, useSearchParams — uses MOCK_ACTIONS array |

### Sentiment Analysis (`/agent-approvals/sentiment`)

| Field          | Value                                                                |
| -------------- | -------------------------------------------------------------------- |
| **Task ID**    | PG-142, IFC-039                                                      |
| **File Path**  | `apps/web/src/app/agent-approvals/sentiment/page.tsx`                |
| **Layout**     | `apps/web/src/app/agent-approvals/layout.tsx`                        |
| **API Router** | `apps/api/src/modules/intelligence/intelligence.router.ts`           |
| **E2E Test**   | None                                                                 |
| **Unit Tests** | None                                                                 |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                      |
| **Status**     | Implemented                                                          |
| **RACI**       | R: AI Team / A: Product / C: Frontend / I: QA                        |
| **Components** | "use client", SentimentDashboard, Skeleton, Suspense, useRequireAuth |

---

## Section 15: Analytics (2 routes)

### Analytics Dashboard (`/analytics`)

| Field          | Value                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | ANALYTICS-001, IFC-037, IFC-038, IFC-190                                                                       |
| **File Path**  | `apps/web/src/app/analytics/(list)/page.tsx`                                                                   |
| **Layout**     | `apps/web/src/app/analytics/(list)/layout.tsx`                                                                 |
| **API Router** | `apps/api/src/modules/analytics/analytics.router.ts`                                                           |
| **E2E Test**   | None                                                                                                           |
| **Unit Tests** | None                                                                                                           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                                |
| **Status**     | Hardcoded                                                                                                      |
| **RACI**       | R: Frontend / A: Product / C: AI Team / I: QA                                                                  |
| **Components** | "use client", Card, exportAnalyticsToCSV, exportPipelineToCSV, exportAnalyticsToPDF — hardcoded metrics arrays |

### Feedback Analytics (`/analytics/feedback`)

| Field          | Value                                                                                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| **Task ID**    | IFC-068                                                                                                     |
| **File Path**  | `apps/web/src/app/analytics/(list)/feedback/page.tsx`                                                       |
| **Layout**     | `apps/web/src/app/analytics/(list)/layout.tsx`                                                              |
| **API Router** | `apps/api/src/modules/feedback/feedbackSurvey.router.ts`                                                    |
| **E2E Test**   | None                                                                                                        |
| **Unit Tests** | `apps/web/src/app/analytics/__tests__/feedback-page.test.tsx`                                               |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                             |
| **Status**     | Implemented                                                                                                 |
| **RACI**       | R: Frontend / A: Product / C: AI Team / I: QA                                                               |
| **Components** | "use client", NpsGauge, NpsTrendChart, SentimentDistributionChart (lazy loaded), useFeedbackSurveyDashboard |

---

## Section 16: Settings (9 routes)

### Settings Overview (`/settings`)

| Field          | Value                                                                              |
| -------------- | ---------------------------------------------------------------------------------- |
| **Task ID**    | PG-104                                                                             |
| **File Path**  | `apps/web/src/app/settings/page.tsx`                                               |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                                             |
| **API Router** | N/A                                                                                |
| **E2E Test**   | None                                                                               |
| **Unit Tests** | `apps/web/src/app/settings/__tests__/page.test.tsx`                                |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                                |
| **Status**     | Implemented                                                                        |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                      |
| **Components** | "use client", SearchInput, PageHeader, SettingsNav, SETTINGS_ITEMS, filterSettings |

### Account Settings (`/settings/account`)

| Field          | Value                                         |
| -------------- | --------------------------------------------- |
| **Task ID**    | PG-106                                        |
| **File Path**  | `apps/web/src/app/settings/account/page.tsx`  |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`        |
| **API Router** | N/A                                           |
| **E2E Test**   | None                                          |
| **Unit Tests** | None                                          |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s           |
| **Status**     | Hardcoded                                     |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA |
| **Components** | "use client", Card, Link — stub page          |

### Team Settings (`/settings/team`)

| Field          | Value                                               |
| -------------- | --------------------------------------------------- |
| **Task ID**    | PG-108                                              |
| **File Path**  | `apps/web/src/app/settings/team/page.tsx`           |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`              |
| **API Router** | N/A                                                 |
| **E2E Test**   | None                                                |
| **Unit Tests** | None                                                |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                 |
| **Status**     | Hardcoded                                           |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA       |
| **Components** | "use client", Card, Link — static teamMembers array |

### AI Settings (`/settings/ai`)

| Field          | Value                                                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-128, IFC-086                                                                                                                   |
| **File Path**  | `apps/web/src/app/settings/ai/page.tsx`                                                                                           |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                                                                                            |
| **API Router** | `apps/api/src/modules/chain-version/chain-version.router.ts`                                                                      |
| **E2E Test**   | None                                                                                                                              |
| **Unit Tests** | `apps/web/src/app/settings/ai/__tests__/AISettingsContent.test.tsx`, `apps/web/src/app/settings/ai/__tests__/components.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                                                   |
| **Status**     | Implemented                                                                                                                       |
| **RACI**       | R: Frontend / A: Product / C: AI Team / I: QA                                                                                     |
| **Components** | "use client", AISettingsContent (dynamic import), Skeleton, Card                                                                  |

### Integrations (`/settings/integrations`)

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| **Task ID**    | PG-115                                                     |
| **File Path**  | `apps/web/src/app/settings/integrations/page.tsx`          |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                     |
| **API Router** | `apps/api/src/modules/integrations/integrations.router.ts` |
| **E2E Test**   | None                                                       |
| **Unit Tests** | None                                                       |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                        |
| **Status**     | Hardcoded                                                  |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA              |
| **Components** | "use client", Card, Link — static integrations list        |

### Notification Settings (`/settings/notifications`)

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| **Task ID**    | PG-116                                                     |
| **File Path**  | `apps/web/src/app/settings/notifications/page.tsx`         |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                     |
| **API Router** | N/A                                                        |
| **E2E Test**   | None                                                       |
| **Unit Tests** | None                                                       |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                        |
| **Status**     | Hardcoded                                                  |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA              |
| **Components** | "use client", Card, Link — static notification preferences |

### Pipeline Settings (`/settings/pipeline`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-077, IFC-063                                                        |
| **File Path**  | `apps/web/src/app/settings/pipeline/page.tsx`                          |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                                 |
| **API Router** | `apps/api/src/modules/opportunity/pipeline-config.router.ts`           |
| **E2E Test**   | `tests/e2e/pipeline-settings.spec.ts`                                  |
| **Unit Tests** | `apps/web/src/app/settings/pipeline/__tests__/page.test.tsx`           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                        |
| **Status**     | Implemented                                                            |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                          |
| **Components** | "use client", PipelineSettingsContent (dynamic import), Skeleton, Card |

### Routing Rules (`/settings/routing`)

| Field          | Value                                                         |
| -------------- | ------------------------------------------------------------- |
| **Task ID**    | PG-132, IFC-030                                               |
| **File Path**  | `apps/web/src/app/settings/routing/page.tsx`                  |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                        |
| **API Router** | `apps/api/src/modules/routing/routing.router.ts`              |
| **E2E Test**   | None                                                          |
| **Unit Tests** | `apps/web/src/app/settings/routing/__tests__/page.test.tsx`   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms               |
| **Status**     | Implemented                                                   |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                 |
| **Components** | "use client", RoutingContent (dynamic import), Skeleton, Card |

### MFA Management (`/settings/security/mfa`)

| Field          | Value                                                                      |
| -------------- | -------------------------------------------------------------------------- |
| **Task ID**    | PG-125                                                                     |
| **File Path**  | `apps/web/src/app/settings/security/mfa/page.tsx`                          |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                                     |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                                 |
| **E2E Test**   | `tests/e2e/mfa.spec.ts`                                                    |
| **Unit Tests** | `apps/web/src/app/settings/security/mfa/__tests__/management.test.tsx`     |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                         |
| **Status**     | Implemented                                                                |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                             |
| **Components** | "use client", Card, Badge, AlertDialog, Alert, useMfaStatus, useDisableMfa |

### MFA Setup Wizard (`/settings/security/mfa/setup`)

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| **Task ID**    | PG-021, IFC-120                                                             |
| **File Path**  | `apps/web/src/app/settings/security/mfa/setup/page.tsx`                     |
| **Layout**     | `apps/web/src/app/settings/layout.tsx`                                      |
| **API Router** | `apps/api/src/modules/auth/auth.router.ts`                                  |
| **E2E Test**   | None                                                                        |
| **Unit Tests** | `apps/web/src/app/settings/security/mfa/__tests__/page.test.tsx`            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                          |
| **Status**     | Implemented                                                                 |
| **RACI**       | R: Frontend / A: Security / C: Backend / I: QA                              |
| **Components** | "use client", Card, PageHeader, MfaQrGenerator, BackupCodesDisplay, useAuth |

---

## Section 17: Billing (7 routes)

### Billing Overview (`/billing`)

| Field          | Value                                              |
| -------------- | -------------------------------------------------- |
| **Task ID**    | PG-025, IFC-198                                    |
| **File Path**  | `apps/web/src/app/billing/page.tsx`                |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`              |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`   |
| **E2E Test**   | None                                               |
| **Unit Tests** | None                                               |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms |
| **Status**     | Implemented                                        |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA      |
| **Components** | "use client", BillingPortal, PageHeader            |

### Checkout (`/billing/checkout`)

| Field          | Value                                                                               |
| -------------- | ----------------------------------------------------------------------------------- |
| **Task ID**    | PG-026, IFC-198                                                                     |
| **File Path**  | `apps/web/src/app/billing/checkout/page.tsx`                                        |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                                               |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`                                    |
| **E2E Test**   | None                                                                                |
| **Unit Tests** | `apps/web/src/app/billing/checkout/__tests__/page.test.tsx`                         |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                                  |
| **Status**     | Partial                                                                             |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                       |
| **Components** | "use client", CheckoutForm, Elements (Stripe), stripePromise, getPlanById, Suspense |

### Subscriptions (`/billing/subscriptions`)

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| **Task ID**    | PG-030, IFC-198                                            |
| **File Path**  | `apps/web/src/app/billing/subscriptions/page.tsx`          |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                      |
| **API Router** | `apps/api/src/modules/subscription/subscription.router.ts` |
| **E2E Test**   | None                                                       |
| **Unit Tests** | None                                                       |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms         |
| **Status**     | Implemented                                                |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA              |
| **Components** | "use client", SubscriptionManager                          |

### Payment Methods (`/billing/payment-methods`)

| Field          | Value                                                              |
| -------------- | ------------------------------------------------------------------ |
| **Task ID**    | PG-029, IFC-198                                                    |
| **File Path**  | `apps/web/src/app/billing/payment-methods/page.tsx`                |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                              |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`                   |
| **E2E Test**   | None                                                               |
| **Unit Tests** | `apps/web/src/app/billing/payment-methods/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms                 |
| **Status**     | Implemented                                                        |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                      |
| **Components** | "use client", PaymentMethods, PageHeader                           |

### Invoices (`/billing/invoices`)

| Field          | Value                                                       |
| -------------- | ----------------------------------------------------------- |
| **Task ID**    | PG-027, IFC-198                                             |
| **File Path**  | `apps/web/src/app/billing/invoices/page.tsx`                |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                       |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`            |
| **E2E Test**   | None                                                        |
| **Unit Tests** | `apps/web/src/app/billing/invoices/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms          |
| **Status**     | Implemented                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA               |
| **Components** | "use client", InvoiceList, trpc.billing.listInvoices        |

### Invoice Detail (`/billing/invoices/[id]`)

| Field          | Value                                                            |
| -------------- | ---------------------------------------------------------------- |
| **Task ID**    | PG-028, IFC-198                                                  |
| **File Path**  | `apps/web/src/app/billing/invoices/[id]/page.tsx`                |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                            |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`                 |
| **E2E Test**   | None                                                             |
| **Unit Tests** | `apps/web/src/app/billing/invoices/[id]/__tests__/page.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; Server <200ms               |
| **Status**     | Implemented                                                      |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                    |
| **Components** | "use client", InvoiceDetail, trpc.billing.getInvoice             |

### Receipts (`/billing/receipts`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | PG-031, IFC-198                                                        |
| **File Path**  | `apps/web/src/app/billing/receipts/page.tsx`                           |
| **Layout**     | `apps/web/src/app/billing/layout.tsx`                                  |
| **API Router** | `apps/api/src/modules/billing/billing.router.ts`                       |
| **E2E Test**   | None                                                                   |
| **Unit Tests** | None                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                    |
| **Status**     | Hardcoded                                                              |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                          |
| **Components** | "use client", ReceiptList, sendReceiptEmail — uses MOCK_RECEIPTS array |

---

## Section 18: Governance (6 routes)

### Governance Dashboard (`/governance`)

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Task ID**    | IFC-044                                         |
| **File Path**  | `apps/web/src/app/governance/page.tsx`          |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`        |
| **API Router** | N/A (uses REST: `/api/adr?action=stats`)        |
| **E2E Test**   | None                                            |
| **Unit Tests** | None                                            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms |
| **Status**     | Implemented                                     |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA |
| **Components** | "use client", Card, fetch('/api/adr')           |

### ADR Registry (`/governance/adr`)

| Field          | Value                                                                  |
| -------------- | ---------------------------------------------------------------------- |
| **Task ID**    | IFC-135                                                                |
| **File Path**  | `apps/web/src/app/governance/adr/page.tsx`                             |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`                               |
| **API Router** | N/A (uses REST: `/api/adr`, `/api/adr/index`, `/api/adr?action=graph`) |
| **E2E Test**   | None                                                                   |
| **Unit Tests** | None                                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                        |
| **Status**     | Implemented                                                            |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                        |
| **Components** | "use client", Card, fetch('/api/adr/\*')                               |

### Compliance Dashboard (`/governance/compliance`)

| Field          | Value                                                                                          |
| -------------- | ---------------------------------------------------------------------------------------------- |
| **Task ID**    | IFC-008, IFC-124                                                                               |
| **File Path**  | `apps/web/src/app/governance/compliance/page.tsx`                                              |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`                                                       |
| **API Router** | N/A                                                                                            |
| **E2E Test**   | None                                                                                           |
| **Unit Tests** | `apps/web/src/app/governance/compliance/__tests__/page.test.tsx`                               |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                                |
| **Status**     | Hardcoded                                                                                      |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                                                |
| **Components** | "use client", Card, RiskHeatMap, ComplianceTimeline, ComplianceDetailPanel, ExportReportButton |

### Policies (`/governance/policies`)

| Field          | Value                                           |
| -------------- | ----------------------------------------------- |
| **Task ID**    | IFC-140                                         |
| **File Path**  | `apps/web/src/app/governance/policies/page.tsx` |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`        |
| **API Router** | N/A                                             |
| **E2E Test**   | None                                            |
| **Unit Tests** | None                                            |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s             |
| **Status**     | Hardcoded                                       |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA |
| **Components** | "use client", Card — static policies array      |

### Quality Reports (`/governance/quality-reports`)

| Field          | Value                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **Task ID**    | IFC-045, IFC-129                                                             |
| **File Path**  | `apps/web/src/app/governance/quality-reports/page.tsx`                       |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`                                     |
| **API Router** | N/A (uses REST: `/api/quality-reports`)                                      |
| **E2E Test**   | None                                                                         |
| **Unit Tests** | `apps/web/src/app/governance/quality-reports/__tests__/integration.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                              |
| **Status**     | Implemented                                                                  |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                              |
| **Components** | "use client", Card, Button, Progress, PageHeader, TestRunnerModal            |

### Quality Report Detail (`/governance/quality-reports/[reportId]`)

| Field          | Value                                                             |
| -------------- | ----------------------------------------------------------------- |
| **Task ID**    | IFC-045, IFC-129                                                  |
| **File Path**  | `apps/web/src/app/governance/quality-reports/[reportId]/page.tsx` |
| **Layout**     | `apps/web/src/app/governance/layout.tsx`                          |
| **API Router** | N/A (uses REST: `/api/quality-reports`)                           |
| **E2E Test**   | None                                                              |
| **Unit Tests** | None                                                              |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                   |
| **Status**     | Implemented                                                       |
| **RACI**       | R: DevRel / A: Engineering / C: Product / I: QA                   |
| **Components** | Server shell, QualityReportDetailClient (client island), Suspense |

---

## Section 19: Notifications (2 routes)

### Notifications (`/notifications`)

| Field          | Value                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------- |
| **Task ID**    | PG-130, IFC-157, IFC-183                                                                     |
| **File Path**  | `apps/web/src/app/notifications/page.tsx`                                                    |
| **Layout**     | `apps/web/src/app/notifications/layout.tsx`                                                  |
| **API Router** | `apps/api/src/modules/notifications/notifications.router.ts`                                 |
| **E2E Test**   | None                                                                                         |
| **Unit Tests** | `apps/web/src/app/notifications/__tests__/page.test.tsx`                                     |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s; TBT <300ms                                              |
| **Status**     | Implemented                                                                                  |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                |
| **Components** | "use client", PageHeader, NotificationList, NotificationFilters, useRequireAuth, useDebounce |

### Notification Settings Hub (`/notifications/settings`)

| Field          | Value                                                                       |
| -------------- | --------------------------------------------------------------------------- |
| **Task ID**    | PG-174                                                                      |
| **File Path**  | `apps/web/src/app/notifications/settings/page.tsx`                          |
| **Layout**     | `apps/web/src/app/notifications/layout.tsx`                                 |
| **API Router** | `apps/api/src/modules/notifications/notifications.router.ts`                |
| **E2E Test**   | None                                                                        |
| **Unit Tests** | `apps/web/src/app/notifications/settings/__tests__/page.test.tsx`           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                         |
| **Status**     | Implemented                                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                               |
| **Components** | "use client", PageHeader, Card, StatusBadge, Skeleton, trpc, useRequireAuth |

### Notification Channels (`/notifications/channels`)

| Field          | Value                                                                     |
| -------------- | ------------------------------------------------------------------------- |
| **Task ID**    | PG-174                                                                    |
| **File Path**  | `apps/web/src/app/notifications/channels/page.tsx`                        |
| **Layout**     | `apps/web/src/app/notifications/layout.tsx`                               |
| **API Router** | `apps/api/src/modules/notifications/notifications.router.ts`              |
| **E2E Test**   | None                                                                      |
| **Unit Tests** | `apps/web/src/components/notifications/__tests__/ChannelManager.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                       |
| **Status**     | Implemented                                                               |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                             |
| **Components** | "use client", PageHeader, ChannelManager, useRequireAuth                  |

### Quiet Hours (`/notifications/quiet-hours`)

| Field          | Value                                                                          |
| -------------- | ------------------------------------------------------------------------------ |
| **Task ID**    | PG-174                                                                         |
| **File Path**  | `apps/web/src/app/notifications/quiet-hours/page.tsx`                          |
| **Layout**     | `apps/web/src/app/notifications/layout.tsx`                                    |
| **API Router** | `apps/api/src/modules/notifications/notifications.router.ts`                   |
| **E2E Test**   | None                                                                           |
| **Unit Tests** | `apps/web/src/components/notifications/__tests__/QuietHoursScheduler.test.tsx` |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                            |
| **Status**     | Implemented                                                                    |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                  |
| **Components** | "use client", PageHeader, QuietHoursScheduler, useRequireAuth                  |

---

## Section 20: Profile (1 route)

### User Profile (`/profile`)

| Field          | Value                                                  |
| -------------- | ------------------------------------------------------ |
| **Task ID**    | PG-105                                                 |
| **File Path**  | `apps/web/src/app/profile/page.tsx`                    |
| **Layout**     | `apps/web/src/app/profile/layout.tsx`                  |
| **API Router** | N/A                                                    |
| **E2E Test**   | None                                                   |
| **Unit Tests** | None                                                   |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                    |
| **Status**     | Hardcoded                                              |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA          |
| **Components** | "use client", Card, Link — hardcoded profile data stub |

---

## Section 21: Support Portal (1 route)

### `/support/tickets` — Support Tickets Queue

| Field          | Value                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Route**      | `/support/tickets`                                                                                                                          |
| **Task ID**    | PG-046                                                                                                                                      |
| **Sprint**     | 16                                                                                                                                          |
| **File**       | `apps/web/src/app/support/tickets/(list)/page.tsx`                                                                                          |
| **Layout**     | `apps/web/src/app/support/tickets/(list)/layout.tsx`                                                                                        |
| **API Router** | `ticket` (reuses existing)                                                                                                                  |
| **Procedures** | `ticket.list`, `ticket.stats`, `ticket.filterOptions`, `ticket.bulkAssign`, `ticket.bulkUpdateStatus`, `ticket.bulkResolve`, `auth.session` |
| **E2E Test**   | None                                                                                                                                        |
| **Unit Tests** | `src/app/support/tickets/__tests__/page.test.tsx` (12 tests)                                                                                |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                                                                                         |
| **Status**     | Implemented                                                                                                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                                                                               |
| **Components** | SupportTicketList, PageHeader, useTicketFilters, mapTicketListItems                                                                         |

---

### `/support/tickets/[id]` — Support Ticket Detail

| Field          | Value                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------- |
| **Route**      | `/support/tickets/[id]`                                                                     |
| **Task ID**    | PG-048                                                                                      |
| **Sprint**     | 16                                                                                          |
| **File**       | `apps/web/src/app/support/tickets/[id]/page.tsx`                                            |
| **Layout**     | `apps/web/src/app/support/tickets/[id]/layout.tsx`                                          |
| **API Router** | `ticket` (reuses existing)                                                                  |
| **Procedures** | `ticket.getById`, `ticket.update`, `ticket.addResponse`, `ticket.assignees`, `auth.session` |
| **E2E Test**   | None                                                                                        |
| **Unit Tests** | `src/app/support/tickets/[id]/__tests__/page.test.tsx` (16 tests)                           |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                                                         |
| **Status**     | Implemented                                                                                 |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA                                               |
| **Components** | TicketDetail, TicketThread, StatusUpdater, mapTicketToDetailData                            |

---

## Section 22: Support / Help Center (1 route)

### `/help-center/[article]` — Help Article

| Field          | Value                                                 |
| -------------- | ----------------------------------------------------- |
| **Route**      | `/help-center/[article]`                              |
| **Task ID**    | PG-045                                                |
| **Sprint**     | 15                                                    |
| **File**       | `apps/web/src/app/help-center/[article]/page.tsx`     |
| **Layout**     | `apps/web/src/app/help-center/[article]/layout.tsx`   |
| **API Router** | N/A                                                   |
| **Procedures** | N/A                                                   |
| **E2E Test**   | None                                                  |
| **Unit Tests** | None                                                  |
| **KPI**        | Lighthouse >=90; FCP <1s; LCP <2.5s                   |
| **Status**     | Implemented                                           |
| **RACI**       | R: Frontend / A: Product / C: Backend / I: QA         |
| **Components** | HelpArticleDetail, ArticleBreadcrumb, RelatedArticles |

---

## Summary Tables

### Page Count Summary

| Section             | Routes  | Implemented | Hardcoded | Partial |
| ------------------- | ------- | ----------- | --------- | ------- |
| 1. Public Pages     | 27      | 27          | 0         | 0       |
| 2. Developer Portal | 8       | 8           | 0         | 0       |
| 3. Dashboard        | 3       | 1           | 2         | 0       |
| 4. Leads            | 3       | 3           | 0         | 0       |
| 5. Contacts         | 3       | 3           | 0         | 0       |
| 6. Accounts         | 2       | 2           | 0         | 0       |
| 7. Deals            | 4       | 2           | 0         | 2       |
| 8. Tickets          | 3       | 3           | 0         | 0       |
| 9. Documents        | 3       | 3           | 0         | 0       |
| 10. Cases           | 4       | 4           | 0         | 0       |
| 11. Tasks           | 2       | 2           | 0         | 0       |
| 12. Calendar        | 3       | 3           | 0         | 0       |
| 13. Email           | 2       | 2           | 0         | 0       |
| 14. AI & Automation | 14      | 13          | 1         | 0       |
| 15. Analytics       | 2       | 1           | 1         | 0       |
| 16. Settings        | 9       | 4           | 5         | 0       |
| 17. Billing         | 7       | 5           | 1         | 1       |
| 18. Governance      | 6       | 4           | 2         | 0       |
| 19. Notifications   | 2       | 1           | 1         | 0       |
| 20. Profile         | 1       | 0           | 1         | 0       |
| 21. Support Portal  | 1       | 1           | 0         | 0       |
| **Total**           | **105** | **88**      | **14**    | **3**   |

### Backend Integration Status

| Status                           | Count | Sections                                                                                                                                               |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Implemented** (live tRPC/REST) | 86    | All CRM core, AI, billing, notifications, email, calendar, tasks                                                                                       |
| **Hardcoded** (static/mock data) | 14    | Dashboard customize/new, AI preview, analytics main, settings stubs, billing receipts, governance compliance/policies, notifications settings, profile |
| **Partial** (mixed live/static)  | 3     | Deal detail, pipeline forecast, billing checkout                                                                                                       |

### Test Coverage Matrix

| Section             | E2E Specs                                     | Unit Tests        | Coverage Gap                 |
| ------------------- | --------------------------------------------- | ----------------- | ---------------------------- |
| 1. Public Pages     | 4 (auth-flow, signup, forms, smoke)           | 17                | Low — 8 routes with no tests |
| 2. Developer Portal | 0                                             | 6                 | No E2E coverage              |
| 3. Dashboard        | 1 (smoke)                                     | 0                 | No unit tests                |
| 4. Leads            | 1 (forms)                                     | 0                 | No dedicated E2E or unit     |
| 5. Contacts         | 1 (forms)                                     | 0                 | No dedicated E2E or unit     |
| 6. Accounts         | 0                                             | 2                 | No E2E coverage              |
| 7. Deals            | 0                                             | 3                 | No E2E coverage              |
| 8. Tickets          | 0                                             | 0                 | No coverage                  |
| 9. Documents        | 0                                             | 0                 | No coverage                  |
| 10. Cases           | 1 (case-timeline)                             | 0                 | Only timeline has E2E        |
| 11. Tasks           | 0                                             | 0                 | No coverage                  |
| 12. Calendar        | 0                                             | 1                 | No E2E coverage              |
| 13. Email           | 1 (inbound-webhook)                           | 0                 | E2E covers webhook only      |
| 14. AI & Automation | 3 (agent-approvals, ai-approvals, ai-scoring) | 1                 | Good E2E, low unit           |
| 15. Analytics       | 0                                             | 1                 | No E2E coverage              |
| 16. Settings        | 1 (pipeline-settings)                         | 5                 | Only pipeline has E2E        |
| 17. Billing         | 0                                             | 4                 | No E2E coverage              |
| 18. Governance      | 0                                             | 2                 | No E2E coverage              |
| 19. Notifications   | 0                                             | 1                 | No E2E coverage              |
| 20. Profile         | 0                                             | 0                 | No coverage                  |
| **Total**           | **14 spec files**                             | **41 test files** |                              |

### Navigation Architecture

| Section                | Header Nav                 | Sidebar                        | In-Page Links                  | User Menu              |
| ---------------------- | -------------------------- | ------------------------------ | ------------------------------ | ---------------------- |
| Public Pages           | PublicHeader               | N/A                            | Footer links                   | N/A                    |
| Developer Portal       | --                         | settings sidebar (SUPER_ADMIN) | Docs index links               | --                     |
| Dashboard              | CORE_CRM module            | --                             | Quick actions, widget cards    | Logo link              |
| CRM Core (Leads-Cases) | CORE_CRM / LEGAL / SUPPORT | Section sidebars (17 configs)  | List row → detail, breadcrumbs | --                     |
| Tasks                  | CORE_CRM                   | tasks sidebar                  | List row → detail              | --                     |
| Calendar               | CORE_CRM                   | calendar sidebar               | List row → detail              | --                     |
| Email                  | CORE_CRM                   | email sidebar                  | List row → detail              | --                     |
| AI & Automation        | AI_INTELLIGENCE module     | agent-approvals sidebar        | Sub-page links                 | --                     |
| Analytics              | ANALYTICS module           | analytics sidebar              | --                             | --                     |
| Settings               | --                         | settings sidebar               | Settings search, section links | User menu → Settings   |
| Billing                | --                         | settings sidebar "More"        | Billing portal tabs            | --                     |
| Governance             | --                         | --                             | Dashboard links to sub-pages   | User menu → Governance |
| Notifications          | --                         | --                             | Bell icon → "View All"         | --                     |
| Profile                | --                         | --                             | --                             | User menu → Profile    |

---

## Planned Pages (Sprint 16)

The following 28 pages are referenced as ghost links in navigation components
but do not yet have `page.tsx` files. Tracked in
`docs/design/navigation-reachability-audit.md` Section 7.

| Planned Route                | Section       | Target Sprint | Task ID           |
| ---------------------------- | ------------- | ------------- | ----------------- |
| `/billing/usage`             | Billing       | 16            | PG-172 (proposed) |
| `/billing/credits`           | Billing       | 16            | PG-172 (proposed) |
| `/billing/tax-settings`      | Billing       | 16            | PG-172 (proposed) |
| `/billing/payment-history`   | Billing       | 16            | PG-172 (proposed) |
| `/tickets/sla`               | Tickets       | 16            | PG-173 (proposed) |
| `/tickets/macros`            | Tickets       | 16            | PG-173 (proposed) |
| `/tickets/satisfaction`      | Tickets       | 16            | PG-173 (proposed) |
| `/tickets/reports`           | Tickets       | 16            | PG-173 (proposed) |
| `/notifications/templates`   | Notifications | 16            | PG-174 (proposed) |
| `/notifications/channels`    | Notifications | 16            | PG-174 (proposed) |
| `/notifications/rules`       | Notifications | 16            | PG-174 (proposed) |
| `/deals/compare`             | Deals         | 16            | PG-175 (proposed) |
| `/deals/import`              | Deals         | 16            | PG-175 (proposed) |
| `/deals/reports`             | Deals         | 16            | PG-175 (proposed) |
| `/governance/audit-log`      | Governance    | 16            | PG-176 (proposed) |
| `/governance/data-retention` | Governance    | 16            | PG-176 (proposed) |
| `/governance/access-control` | Governance    | 16            | PG-176 (proposed) |
| `/governance/risk-register`  | Governance    | 16            | PG-176 (proposed) |
| `/analytics/custom`          | Analytics     | 16            | PG-177 (proposed) |
| `/analytics/reports`         | Analytics     | 16            | PG-177 (proposed) |
| `/analytics/export`          | Analytics     | 16            | PG-177 (proposed) |
| `/analytics/scheduled`       | Analytics     | 16            | PG-177 (proposed) |
| `/settings/webhooks`         | Settings      | 16            | PG-178 (proposed) |
| `/settings/api-keys`         | Settings      | 16            | PG-178 (proposed) |
| `/settings/audit-log`        | Settings      | 16            | PG-178 (proposed) |
| `/settings/roles`            | Settings      | 16            | PG-178 (proposed) |
| `/settings/branding`         | Settings      | 16            | PG-178 (proposed) |
| `/settings/import-export`    | Settings      | 16            | PG-178 (proposed) |
