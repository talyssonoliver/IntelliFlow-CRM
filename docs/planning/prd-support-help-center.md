# Product Requirements Document (PRD)

## Overview

| Field             | Value                                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Feature Name**  | Support Help Center & Support Tickets                                                                                         |
| **Owner**         | Support Engineering                                                                                                           |
| **Status**        | In Progress                                                                                                                   |
| **Target Sprint** | 16                                                                                                                            |
| **Created Date**  | 2026-02-28                                                                                                                    |
| **Last Updated**  | 2026-03-08                                                                                                                    |
| **Related Tasks** | PG-043, PG-044, PG-045, PG-046, PG-047, PG-048, IFC-298, IFC-299, IFC-300, IFC-301, IFC-302, IFC-303, IFC-304, PG-180, PG-181 |

## Problem Statement

### Background

IntelliFlow CRM users need a centralized self-service help center to find
answers to common questions, browse help articles by category, and search for
specific topics. Currently, there is no in-app help resource — users must
contact support directly for any question.

### Problem Description

Without a help center, all user questions funnel through support tickets,
increasing support load and slowing resolution times. Users have no way to
self-serve answers to common CRM workflow questions.

### Impact

**Who is affected?**

- CRM end users seeking help with features
- Support agents handling repetitive questions
- Account administrators configuring the platform

**What is the business impact?**

- Higher support ticket volume than necessary
- Slower time-to-resolution for simple questions
- Lower user satisfaction due to lack of self-service options

**What happens if we don't solve this?**

- Support team remains overloaded with repetitive inquiries
- Users churn due to friction in learning the platform

## User Stories

### Primary User Story

**As a** CRM user **I want to** browse a categorized help center index **So
that** I can quickly find articles relevant to my question without filing a
support ticket.

**Acceptance Criteria:**

- [ ] Help center index page loads at `/help-center/` with categories displayed
      in a responsive grid
- [ ] Each category shows title, description, icon, and article count
- [ ] Categories link to their respective article listing pages
- [ ] Page includes a search bar that filters categories by keyword in real-time
- [ ] Page is accessible via sidebar navigation under the SUPPORT module

### Additional User Stories

#### Story 2

**As a** CRM user **I want to** search help topics from the index page **So
that** I can find relevant categories without browsing every section.

**Acceptance Criteria:**

- [ ] Search input filters displayed categories as user types
- [ ] Search is debounced (300ms) for performance
- [ ] "No results found" message displays when search yields zero matches
- [ ] Escape key clears the search and restores all categories

#### Story 3

**As a** new user **I want to** see popular/featured categories highlighted **So
that** I can quickly access the most commonly needed help topics.

**Acceptance Criteria:**

- [ ] Popular categories are visually distinguished (e.g., badge or highlighted
      border)
- [ ] Categories are ordered with popular items first

## Acceptance Criteria Checklist

### Functional Requirements

- [ ] Help center index page renders category grid
- [ ] Client-side search filters categories in real-time
- [ ] Navigation entry exists in SUPPORT sidebar and ModuleRoutes
- [ ] Page is reachable from the app shell without typing URL directly
- [ ] Loading skeleton displays during auth check

### Non-Functional Requirements

- [ ] Response time <200ms
- [ ] Lighthouse score >=90
- [ ] WCAG 2.1 AA compliance (search has role="search", aria-live for results)
- [ ] Mobile responsive (1 column on mobile, 2 on tablet, 3 on desktop)

### Quality Gates

- [ ] Test coverage >=90% (statements, functions, lines); branches >=80%
- [ ] All unit tests passing
- [ ] Integration tests for page + real components
- [ ] No critical or high severity bugs
- [ ] Code review completed

## Technical Requirements

### UI/UX Components

**New Components:**

- `HelpCategories` (`apps/web/src/components/support/help-categories.tsx`) —
  Category grid with icon, title, description, article count
- `HelpSearch` (`apps/web/src/components/support/help-search.tsx`) — Debounced
  search input that filters categories client-side

**Pages:**

- `/help-center` (`apps/web/src/app/help-center/page.tsx`) — Index page, "use
  client", uses PageHeader + HelpCategories + HelpSearch
- Layout: `apps/web/src/app/help-center/layout.tsx` (metadata) +
  `(list)/layout.tsx` (sidebar shell with ModuleGate)

### State Management

- Server State: N/A (categories are static/hardcoded for MVP; future: tRPC
  query)
- Form State: Local state for search input (useState + debounce)
- Cache Strategy: N/A for MVP

### Performance Considerations

- Categories are static data — no API call needed for MVP
- Search is client-side filter — no network overhead
- Lazy load category icons if needed

### Security Considerations

- Authentication: Required (behind ModuleGate SUPPORT)
- Authorization: All authenticated users can access help center
- Input Validation: Search input sanitized (no XSS via category rendering)

## Dependencies

### Prerequisite Tasks

- [x] IFC-076: Component Library (shadcn/ui) — Completed

### Technical Prerequisites

- [x] shadcn/ui components available (Card, Badge, Input, Skeleton, Button,
      SearchInput)
- [x] Sidebar infrastructure established (SidebarConfig, AppSidebar,
      SidebarProvider)
- [x] PageHeader shared component available
- [x] SUPPORT module defined in ModuleRoutes.ts

## Risks and Mitigations

| Risk                                                | Likelihood | Impact | Mitigation                                                     |
| --------------------------------------------------- | ---------- | ------ | -------------------------------------------------------------- |
| Route naming inconsistency across docs              | High       | Medium | Standardize on `/help-center/` per CSV source of truth         |
| Help center content not defined                     | Medium     | Low    | Use placeholder categories for MVP; content comes later        |
| Downstream tasks (PG-044, PG-045) path expectations | Medium     | Medium | Ensure page.tsx is at the path both downstream tasks reference |

#### Story 4 — Support Tickets Queue (PG-046)

**As a** support agent **I want to** view a support-focused ticket listing at
`/support/tickets` **So that** I can work an SLA-prioritized queue without
admin/lifecycle clutter.

**Acceptance Criteria:**

- [ ] Support tickets page loads at `/support/tickets/` with tickets listed from
      `ticket.list` tRPC endpoint
- [ ] Default sort is `slaResolutionDue ASC` (most urgent SLA deadline first)
- [ ] Default filter excludes ARCHIVED tickets
- [ ] SLA display component shows dual-track SLA metrics (response + resolution)
- [ ] Filters (status, priority, SLA status, search) work with 400ms debounced
      search
- [ ] Page is reachable from sidebar navigation (support section)
- [ ] Row click navigates to `/support/tickets/[id]` (PG-048)
- [ ] Bulk actions available: Assign, Update Status, Resolve (no Delete/Archive)

#### Story 5 — Support New Ticket (PG-047)

**As a** support agent **I want to** create a new ticket from the support
section **So that** I can log customer issues without leaving the support
workflow.

**Acceptance Criteria:**

- [ ] New ticket page loads at `/support/tickets/new` with the ticket creation
      form
- [ ] Form validates required fields: subject, contact name, contact email
- [ ] Form includes priority selector, category selector, and description field
- [ ] File attachment upload component allows drag-and-drop and click-to-browse
- [ ] File upload shows preview/filename, progress indicator, and remove button
- [ ] File size limit enforced (max 10MB per file, max 5 files)
- [ ] On successful submission, user is redirected to `/support/tickets/{id}`
- [ ] Success toast notification is displayed after ticket creation
- [ ] Error handling shows validation errors inline and submission errors as
      toast
- [ ] Page is reachable from sidebar Quick Links "New Ticket" entry
- [ ] Breadcrumbs show Support > Tickets > New Ticket
- [ ] Cancel button returns to `/support/tickets`

#### Story 6 — Support Ticket Detail (PG-048)

**As a** support agent **I want to** view ticket details from the support
section **So that** I can respond to and manage individual tickets in context.

**Acceptance Criteria:**

- [ ] Ticket detail page loads at `/support/tickets/[id]` with full ticket data
      from `ticket.getById` tRPC endpoint
- [ ] Page displays ticket metadata (status, priority, category, channel, SLA,
      timestamps), customer info, and assignee
- [ ] Conversation thread shows all activities (messages, agent replies,
      internal notes, system events) in chronological order
- [ ] Reply composer allows sending public replies and internal notes
- [ ] Status updater shows current status with valid transition actions (based
      on `VALID_TICKET_TRANSITIONS` from domain)
- [ ] SLA display uses dual-track `SLADisplay` component (from PG-046) for first
      response and resolution tracking
- [ ] Quick actions available: Resolve, Close, Assign, Change Priority, Change
      Status — no Delete or Archive (support agent context)
- [ ] Breadcrumbs show Support > Tickets > {Ticket Subject}
- [ ] After close/resolve, user stays on detail page (no redirect)
- [ ] Page is reachable from ticket list row click and new ticket redirect
- [ ] Layout includes sidebar with `supportTicketsSidebarConfig`
- [ ] Loading skeleton displays while ticket data loads

## Out of Scope

**Explicitly NOT included in this release:**

- Article rendering (PG-045)
- Full-text search across articles (PG-044)
- Knowledge base CMS/editor
- AI-powered help suggestions
- Chat widget integration

## Timeline

| Milestone            | Date       | Owner       | Status   |
| -------------------- | ---------- | ----------- | -------- |
| PRD Draft            | 2026-02-28 | Support Eng | Complete |
| Spec Session         | 2026-02-28 | Support Eng | Complete |
| IFC-298 DB Models    | 2026-03-10 | Support Eng | Complete |
| Implementation Start | TBD        | Support Eng | Pending  |
| Feature Complete     | TBD        | Support Eng | Pending  |

## References

- Sprint Plan: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- Dependency Chain: `docs/design/diagrams/auth-public-pages-dependency-chain.md`
- Information Architecture: `docs/design/information-architecture.md`
- Sidebar Patterns: `apps/web/src/components/sidebar/configs/tickets.ts`
- Analogous Task: PG-032 (Developer Docs Index)

## Revision History

| Version | Date       | Author      | Changes       |
| ------- | ---------- | ----------- | ------------- |
| 1.0     | 2026-02-28 | Claude Code | Initial draft |
