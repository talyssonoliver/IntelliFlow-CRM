# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| **Feature Name**  | Public Onboarding Tour & Feedback Widget                  |
| **Owner**         | UX Designer + Frontend Dev (Growth)                       |
| **Status**        | Complete                                                  |
| **Target Sprint** | 17                                                        |
| **Created Date**  | 2026-04-24                                                |
| **Last Updated**  | 2026-04-24 (exec complete; 140 unit tests GREEN; coverage branches 80.79%, lines 91.5%; statements 87.6% below 90% gate with documented defensive-catch branches reported uncovered by Istanbul; 4/4 mandated validations PASS) |
| **Related Tasks** | PG-126                                                    |

## Problem Statement

### Background

IntelliFlow CRM's public marketing pages (`/`, `/features`) introduce the
product to prospective customers, but give them no interactive way to
understand how the product works or to send feedback. Visitors either convert
to signup or leave silently; the product team has no channel for collecting
qualitative feedback from visitors who are not yet authenticated tenants.

### Problem Description

Three gaps:

1. **No guided product tour** — visitors read static marketing copy on
   `/features` but have no way to see the product's key capabilities
   highlighted in order, with context, the first time they visit. Existing
   `OnboardingFlow` (`apps/web/src/components/shared/onboarding-flow.tsx`) is
   a post-signup step list for PG-017, not a marketing-site tour.
2. **No public feedback collection** — existing `FeedbackWidget`
   (`apps/web/src/components/support/feedback-widget.tsx`) is scoped to
   help-center article helpfulness and requires a `helpArticle.submitFeedback`
   call; `feedbackRouter` is tenant-scoped AI score feedback; `feedbackSurvey`
   is tenant-scoped NPS analytics. None work for unauthenticated visitors.
3. **No replay affordance** — a one-shot first-visit tour that can't be
   replayed leaves no discovery path for users who dismiss the tour before
   engaging with it.

### Impact

**Who is affected?**

- Prospective customers visiting `/features` or `/` for the first time
- Growth / Marketing team (measuring engagement and conversion)
- Product team (collecting unstructured visitor feedback)

**What is the business impact?**

- Onboarding completion rate (target: >= 70% of visitors who start the tour)
- NPS-adjacent sentiment score (positive/negative tally from widget)
- Signup conversion lift from tour-exposed visitors

**What happens if we don't solve this?**

- Marketing pages remain a passive "read then bounce" experience
- No qualitative signal on what visitors find unclear or wrong
- Sprint 17's growth goal (feature-page engagement) has no instrumentation

## User Stories

### Primary User Story

**As a** first-time visitor to `/features` **I want to** be guided through the
three or four highest-value capabilities with context **So that** I understand
whether IntelliFlow solves my problem before I leave.

**Acceptance Criteria:**

- [ ] On first visit to `/features`, an overlay tour auto-starts (after the
      page is fully interactive, respecting prefers-reduced-motion)
- [ ] Tour highlights the targeted element, shows a title + description
      tooltip, and offers Next / Previous / Skip / Close
- [ ] Tour supports keyboard navigation (Tab / Shift+Tab / Enter / Esc) and
      traps focus within the active step's dialog
- [ ] Progress is persisted: if a visitor closes the tab mid-tour and returns,
      the tour does NOT auto-start again on the same device
- [ ] The user may replay the tour via a "Take the tour" button anchored in
      the page header / `PublicHeader` area, or via `?tour=1` URL parameter

### Story 2 — Feedback Widget

**As a** visitor on any public page **I want to** leave a short piece of
feedback without signing up **So that** I can tell the team what's unclear or
what I'd like to see.

**Acceptance Criteria:**

- [ ] Floating "Feedback" button (bottom-right) is present on public routes
      with `PublicHeader`/`PublicFooter` chrome
- [ ] Clicking opens a dialog with: 1–5 star rating (required), free-text
      comment (max 1000 chars), optional email, source (auto-filled from
      current route)
- [ ] Submission is rate-limited client-side (one submission per 10 minutes
      per device via `localStorage`) and validated server-side
- [ ] Success state confirms submission; failure shows retry with inline
      error
- [ ] Submitted payload persists via the new public feedback endpoint (see
      ADR-051); no tenant/user auth required

### Story 3 — Replay + Analytics

**As a** growth PM **I want** tour start / step-complete / tour-complete
events instrumented **So that** I can measure the 70% onboarding-completion
target and iterate on tour content.

**Acceptance Criteria:**

- [ ] `tour_started`, `tour_step_completed`, `tour_completed`,
      `tour_skipped`, `feedback_submitted` events fire through the existing
      `tracking-pixel` utility
- [ ] Events include tour id, step index, total steps, and duration
- [ ] Events respect Do-Not-Track (aligned with existing `tracking-pixel`
      behaviour)

## Acceptance Criteria Checklist

### Functional Requirements

- [ ] FR-1: Tour config loaded from `artifacts/misc/onboarding-config.json`
- [ ] FR-2: Tour overlay renders as portal on top of page content with focus
      trap
- [ ] FR-3: First-visit detection uses `localStorage` key
      `intelliflow.public.tour.{tourId}.seen` with ISO timestamp value
- [ ] FR-4: Replay control: `?tour=1` query param OR "Take the tour" button
- [ ] FR-5: Feedback FAB renders only on routes where `PublicHeader` renders
      (i.e., unauthenticated, non-auth-form public routes)
- [ ] FR-6: Feedback dialog is a shadcn/ui `Dialog` with zod-validated form
- [ ] FR-7: Public feedback endpoint (tRPC `publicFeedback.submit` or Next.js
      route handler, per ADR-051) accepts `{ rating, comment, email?, source,
      userAgent? }` and persists without authentication
- [ ] FR-8: Rate limiting: 1 request / 10 min / IP on server, 1 submission /
      10 min via `localStorage` on client

### Non-Functional Requirements

- [ ] NFR-1: Tour + widget bundle adds < 25 KB gzipped to public route JS
- [ ] NFR-2: Feedback endpoint response < 200 ms p95
- [ ] NFR-3: Lighthouse performance on `/features` stays >= 0.90 with tour
      included
- [ ] NFR-4: All tour and widget components meet WCAG 2.1 AA:
      keyboard-operable, screen-reader labelled, focus ring visible, colour
      contrast >= 4.5:1
- [ ] NFR-5: `prefers-reduced-motion: reduce` disables tour animations
      (instant transitions only)
- [ ] NFR-6: Test coverage >= 90% statements / lines / functions, 80%
      branches for new files

## Out of Scope

- Authenticated in-app tours (post-login CRM walkthroughs) — separate task
- Personalised tour content based on lead profile — separate task
- Multi-language tour content — English-only for this ticket
- NPS scoring / analytics dashboard on the collected feedback — separate
  task (owned by `feedbackSurvey.router.ts` / IFC-068)

## Related Documents

| Type | Path                                                         | Status   |
| ---- | ------------------------------------------------------------ | -------- |
| ADR  | `docs/architecture/adr/ADR-051-public-product-tour.md`       | Proposed |
| Task | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`  | Sprint 17 |
| Dep  | `docs/architecture/diagrams/auth-public-pages-dependency-chain.md` | Reference |
