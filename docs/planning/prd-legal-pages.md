# Product Requirements Document (PRD)

## Overview

| Field | Value |
| --- | --- |
| **Feature Name** | Legal Pages |
| **Owner** | Legal Counsel (STOA-Foundation) |
| **Status** | Draft |
| **Target Sprint** | Sprint 17 |
| **Created Date** | 2026-03-08 |
| **Last Updated** | 2026-04-10 |
| **Related Tasks** | PG-050, PG-051, PG-052, PG-053, PG-054 |

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
- A client-side acceptance tracker (`acceptance-tracker.ts`) records when a user has reviewed the current version in localStorage.
- When a user returns after a version change, a visual indicator alerts them that terms have been updated.
- The implementation reuses public-site visual patterns (hero, sticky sidebar nav, section cards).
- The route is covered by unit tests and `PAGE_MAP_AND_FLOWS.md` is updated.

## Technical Requirements

- Keep the implementation inside the existing Next.js `(public)` route group.
- Reuse existing public page styling patterns and static metadata conventions.
- Store privacy policy content in `docs/shared/privacy-content.md`.
- Store terms content in `docs/shared/terms-content.md`.
- Keep policy metadata logic in `apps/web/src/lib/legal/consent-tracker.ts` (Privacy) and `apps/web/src/lib/legal/acceptance-tracker.ts` (Terms) so later legal tasks can build on the same helpers.
- Acceptance tracking uses `localStorage` only (no backend dependency for MVP).

## Status

This PRD was created during `PG-050` specification and updated during `PG-051` to include terms-specific acceptance criteria. Covers legal page delivery for PG-050 through PG-054.
