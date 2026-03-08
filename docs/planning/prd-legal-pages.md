# Product Requirements Document (PRD)

## Overview

| Field | Value |
| --- | --- |
| **Feature Name** | Legal Pages |
| **Owner** | Legal Counsel (STOA-Foundation) |
| **Status** | Draft |
| **Target Sprint** | Sprint 17 |
| **Created Date** | 2026-03-08 |
| **Last Updated** | 2026-03-08 |
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

- A public `/privacy` route exists and is reachable from existing public navigation surfaces.
- The page renders policy sections derived from a tracked source document rather than hard-coded inline copy only.
- The page displays policy version metadata, effective date, and privacy contact details.
- The implementation preserves public-site visual consistency and responsive behavior.
- The route is covered by page tests and public-site documentation updates.

## Technical Requirements

- Keep the implementation inside the existing Next.js `(public)` route group.
- Reuse existing public page styling patterns and static metadata conventions.
- Store policy content in `docs/shared/privacy-content.md`.
- Keep policy metadata logic in `apps/web/src/lib/legal/consent-tracker.ts` so later legal tasks can build on the same helper.

## Status

This PRD is created during `PG-050` specification to support legal page delivery and downstream tasks for terms, cookies, DPA, and AUP.
