# Product Requirements Document (PRD)

## Overview

| Field | Value |
| --- | --- |
| **Feature Name** | Legal Pages |
| **Owner** | Legal Counsel (STOA-Foundation) |
| **Status** | Draft |
| **Target Sprint** | Sprint 17 |
| **Created Date** | 2026-03-08 |
| **Last Updated** | 2026-04-13 |
| **Related Tasks** | PG-050, PG-051, PG-052, PG-053, PG-054, IFC-309 |

## Problem Statement

IntelliFlow CRM exposes privacy, terms, and cookie-policy links from public routes and global UI chrome, but the linked legal pages are still missing. This leaves compliance-critical entry points unresolved for prospects, customers, and auditors who expect transparent policy access before sign-up and while reviewing consent prompts.

## User Stories

### User Story 1

**As a** prospective customer  
**I want to** open the Privacy Policy from the public site footer, sign-up flow, and consent banner  
**So that** I can review how IntelliFlow handles personal data before creating an account.

### User Story 2

**As a** compliance stakeholder  
**I want to** publish a versioned privacy policy with clear effective dates and contact channels  
**So that** consent and disclosure records can reference a stable policy version.

### User Story 3

**As a** product team member  
**I want to** centralize legal page content in tracked source files  
**So that** page copy updates stay auditable and reusable across the legal-pages task chain.

## Acceptance Criteria

### PG-050 — Privacy Policy
- A public `/privacy` route exists and is reachable from existing public navigation surfaces.
- The page renders policy sections derived from a tracked source document rather than hard-coded inline copy only.
- The page displays policy version metadata, effective date, and privacy contact details.
- The implementation preserves public-site visual consistency and responsive behavior.
- The route is covered by page tests and public-site documentation updates.

### PG-051 — Terms of Service
- A public `/terms` route exists and is reachable from the public footer and sign-up flow (links already present).
- The page renders terms sections from `docs/shared/terms-content.md` using frontmatter + markdown format (same pattern as privacy).
- The page displays terms version metadata, effective date, and legal contact.
- ~~A client-side acceptance tracker (`acceptance-tracker.ts`) records when a user has reviewed the current version in localStorage.~~ **Amended 2026-04-13**: client-only localStorage acceptance was removed as a misleading legal-compliance signal (not verifiable server-side, user-clearable, single-browser-scoped). Server-side acceptance persistence moves to **IFC-309**.
- ~~When a user returns after a version change, a visual indicator alerts them that terms have been updated.~~ **Amended 2026-04-13**: version-drift UX re-scoped under IFC-309 (authenticated-user Confirm UI that calls `trpc.legal.acceptTerms` and hides when stored acceptance matches current version).

### IFC-309 — Server-Side Terms Acceptance
- A tenant-scoped `TermsAcceptance` audit record persists per `(userId, termsVersion, acceptedAt, ipAddress, userAgent, route)` with no UPDATE/DELETE paths.
- `trpc.legal.acceptTerms` mutation is idempotent per `(userId, termsVersion)`.
- `trpc.legal.getAcceptance` query returns the latest record per user.
- Supabase RLS scopes reads/writes by `tenantId`.
- The `/terms` Confirm UI calls the mutation for authenticated users only and hides once the stored acceptance matches the current version; anonymous visitors see the terms copy without a Confirm affordance.
- The implementation reuses public-site visual patterns (hero, sticky sidebar nav, section cards).
- The route is covered by unit tests and `PAGE_MAP_AND_FLOWS.md` is updated.

## Technical Requirements

- Keep the implementation inside the existing Next.js `(public)` route group.
- Reuse existing public page styling patterns and static metadata conventions.
- Store privacy policy content in `docs/shared/privacy-content.md`.
- Store terms content in `docs/shared/terms-content.md`.
- Keep policy metadata logic in `apps/web/src/lib/legal/consent-tracker.ts` (Privacy) and `apps/web/src/lib/legal/acceptance-tracker.ts` (Terms) so later legal tasks can build on the same helpers.
- Acceptance tracking uses `localStorage` only (no backend dependency for MVP).

### PG-053 — Data Processing Addendum

- A public `/dpa` route exists under the `(public)` route group and is reachable from the `PublicFooter` Legal section.
- The page renders DPA sections derived from `docs/shared/dpa-content.md` (YAML frontmatter + markdown, same pattern as privacy/terms/cookies/aup).
- The page displays DPA version metadata, effective date, and legal contact details.
- A server-only `signature-handler.ts` in `apps/web/src/lib/legal/` delegates parsing to `loadLegalContent()` from `legal-content-parser.ts` and exports `getDpa()`, `formatDpaDate()`, and the `DpaSignatureRecord` type.
- A client-only `signature-handler.client.ts` in `apps/web/src/lib/legal/` persists controller acknowledgements to `localStorage` under key `intelliflow_dpa_signature` and exports `hasSigned`, `recordDpaSignature`, `getStoredDpaSignature`.
- A `DpaSignaturePanel` (`apps/web/src/components/legal/dpa-signature-panel.tsx`) renders a sticky acknowledgement bar on `/dpa` with `pending`/`signed`/`updated` states, SSR-safe (returns `null` during `loading` and `signed`).
- A downloadable template at `apps/web/public/legal/dpa-template.pdf` is served from `/legal/dpa-template.pdf`; `artifacts/reports/dpa-template.pdf` holds the governance mirror.
- `apps/web/src/app/sitemap.ts` includes a `/dpa` entry (priority 0.5, changeFrequency `monthly`) between `/cookies` and `/status`.
- `PublicFooter.tsx` Legal list contains a "Data Processing Addendum" link to `/dpa`.
- The route is covered by unit tests (`__tests__/page.test.tsx`, `signature-handler.test.ts`, `signature-handler.client.test.ts`, `dpa-signature-panel.test.tsx`) and the `sitemap-reconciliation.test.ts` TC-25 count is bumped to 199.
- DPA signature is controller-facing only (browser-local); enterprise customers are directed to `legal@intelliflow-crm.com` for a countersigned DPA. Server-side signature persistence is explicitly out of scope (would require a future ADR).

### Delivered Routes

| Route | Task | Version | Effective Date |
| --- | --- | --- | --- |
| `/privacy` | PG-050 | see `docs/shared/privacy-content.md` | see `docs/shared/privacy-content.md` |
| `/terms` | PG-051 | see `docs/shared/terms-content.md` | see `docs/shared/terms-content.md` |
| `/cookies` | PG-052 | see `docs/shared/cookie-content.md` | see `docs/shared/cookie-content.md` |
| `/dpa` | PG-053 | v2026.08 | 2026-08-13 |

### PG-054 — Acceptable Use Policy

- A public `/aup` route exists and is reachable from the public footer Legal section and bottom bar.
- The page renders AUP sections derived from `docs/shared/aup-content.md` (YAML frontmatter + markdown, same pattern as privacy/terms).
- The page displays policy version metadata, effective date, and legal contact details.
- A `violation-tracker.ts` server-side utility is created in `apps/web/src/lib/legal/` following the pattern of `acceptance-tracker.ts` and `consent-tracker.ts`.
- The violation tracker exports: typed `AupViolationRecord`, `AupAcknowledgmentRecord`, `getAcceptableUsePolicy()`, `buildAupAcknowledgmentRecord()`, `buildViolationRecord()`.
- The implementation reuses `loadLegalContent()` and `parseLegalSections()` from `legal-content-parser.ts`.
- The route is covered by unit tests (`__tests__/page.test.tsx` and `__tests__/violation-tracker.test.ts`).
- `PublicFooter.tsx` Legal section is updated to include an "Acceptable Use Policy" link to `/aup`.
- `PAGE_MAP_AND_FLOWS.md` and `sitemap-reconciliation.test.ts` TC-25 count are updated.
- `lighthouserc.js` URL list includes `/aup` for Lighthouse ≥ 90 gate.

## Status

This PRD was created during `PG-050` specification and updated during `PG-051` to include terms-specific acceptance criteria, and updated during `PG-054` to add AUP acceptance criteria. Covers legal page delivery for PG-050 through PG-054.
