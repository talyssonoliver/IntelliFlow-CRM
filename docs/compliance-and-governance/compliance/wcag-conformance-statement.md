# WCAG 2.1 Conformance Statement — IntelliFlow CRM

**Product:** IntelliFlow CRM Web Application **Version:** 0.1.0 (Sprint 17)
**Date:** 2026-04-10 **Review Period:** Quarterly review cadence (every 4
sprints) per
`docs/compliance-and-governance/compliance/quarterly-a11y-review-template.md`;
next review Sprint 20

---

## 1. Conformance Status

**IntelliFlow CRM partially conforms to WCAG 2.1 Level AA.**

"Partially conforms" means that some aspects of the content do not fully meet
the standard. Specifically, one success criterion (SC 1.4.1 Use of Color) is
partially supported on the `/deals` pipeline view.

---

## 2. Scope

This statement covers the IntelliFlow CRM web application across all 181
user-facing routes. Dynamic segment routes (e.g., `/contacts/[id]`,
`/settings/help-center/articles/[id]/edit`) inherit conformance status from
their parent static route and are not listed separately.

- **Public & marketing (18):** `/`, `/about`, `/aup`, `/blog`, `/careers`,
  `/contact`, `/cookies`, `/dpa`, `/features`, `/partners`, `/press`,
  `/pricing`, `/privacy`, `/security`, `/signup`, `/status`, `/terms`,
  `/upgrade`
- **Auth flows (9):** `/auth/callback`, `/forgot-password`, `/login`, `/logout`,
  `/mfa/verify`, `/reset-password/callback`, `/signup/success`, `/sso`,
  `/verify-email/callback`
- **Dashboard (3):** `/dashboard`, `/dashboard/customize`, `/dashboard/new`
- **Activity (1):** `/activity`
- **CRM — Leads, Contacts & Accounts (15):** `/accounts`,
  `/accounts/account-settings`, `/accounts/account-tiers`,
  `/accounts/territory-mapping`, `/contacts`, `/contacts/contact-settings`,
  `/contacts/contact-types`, `/contacts/import-export`, `/contacts/new`,
  `/leads`, `/leads/import`, `/leads/lead-settings`, `/leads/new`,
  `/leads/pipeline`, `/leads/routing`
- **CRM — Deals (8):** `/deals`, `/deals/all/forecast`,
  `/deals/deal-automation`, `/deals/deal-settings`, `/deals/deal-stages`,
  `/deals/forecast`, `/deals/new`, `/deals/trash`
- **CRM — Cases & Documents (12):** `/cases`, `/cases/case-settings`,
  `/cases/case-types`, `/cases/case-workflows`, `/cases/case-workflows/new`,
  `/cases/new`, `/cases/timeline`, `/documents`, `/documents/document-settings`,
  `/documents/document-types`, `/documents/new`, `/documents/storage-policies`
- **CRM — Calendar & Email (11):** `/appointments`, `/appointments/new`,
  `/calendar`, `/calendar/availability`, `/calendar/calendar-settings`,
  `/calendar/event-types`, `/email`, `/email/compose`, `/email/email-settings`,
  `/email/signatures`, `/email/templates`
- **CRM — Tasks & Tickets (11):** `/tasks`, `/tasks/automation`,
  `/tasks/task-settings`, `/tasks/task-types`, `/tickets`,
  `/tickets/automations`, `/tickets/new`, `/tickets/sla-policies`,
  `/tickets/types`, `/support/tickets`, `/support/tickets/new`
- **Agent Approvals & AI (18):** `/agent-approvals`, `/agent-approvals/agents`,
  `/agent-approvals/ai-review`, `/agent-approvals/ai-search`,
  `/agent-approvals/ai-settings`, `/agent-approvals/approval-policies`,
  `/agent-approvals/churn-risk`, `/agent-approvals/drift`,
  `/agent-approvals/experiments`, `/agent-approvals/history`,
  `/agent-approvals/insights`, `/agent-approvals/latency`,
  `/agent-approvals/lead-scoring`, `/agent-approvals/logs`,
  `/agent-approvals/model-config`, `/agent-approvals/preview`,
  `/agent-approvals/sentiment`, `/agent-approvals/tools`
- **Analytics & Insights (9):** `/analytics`, `/analytics/feedback`,
  `/analytics/report-settings`, `/analytics/report-templates`,
  `/analytics/saved/monthly`, `/analytics/saved/quarterly`,
  `/analytics/saved/weekly`, `/analytics/scheduled-reports`, `/insights`
- **Governance (9):** `/governance`, `/governance/adr`,
  `/governance/compliance`, `/governance/policies`,
  `/governance/quality-reports`, `/governance/quality-reports/coverage`,
  `/governance/quality-reports/lighthouse`,
  `/governance/quality-reports/performance`,
  `/governance/quality-reports/trpc-benchmark`
- **Billing (11):** `/billing`, `/billing/cancel`, `/billing/checkout`,
  `/billing/invoices`, `/billing/payment-methods`, `/billing/plans`,
  `/billing/receipts`, `/billing/settings`, `/billing/subscriptions`,
  `/billing/upgrade`, `/billing/usage`
- **Notifications, Help & Profile (7):** `/help-center`, `/help-center/search`,
  `/notifications`, `/notifications/channels`, `/notifications/quiet-hours`,
  `/notifications/settings`, `/profile`
- **Settings (25):** `/settings`, `/settings/account`, `/settings/accounts`,
  `/settings/appointments`, `/settings/automation`,
  `/settings/automation/custom-actions`,
  `/settings/automation/custom-node-types`, `/settings/billing`,
  `/settings/cases`, `/settings/contacts`, `/settings/deals`,
  `/settings/documents`, `/settings/help-center/articles`,
  `/settings/help-center/articles/new`, `/settings/integrations`,
  `/settings/leads`, `/settings/notifications`, `/settings/pipeline`,
  `/settings/reports`, `/settings/routing`, `/settings/security/mfa`,
  `/settings/security/mfa/setup`, `/settings/tasks`, `/settings/team`,
  `/settings/tickets`
- **Developer portal (2):** `/developers/apps`, `/developers/apps/new`
- **Docs portal (9):** `/docs`, `/docs/architecture`, `/docs/auth`,
  `/docs/changelog`, `/docs/cli`, `/docs/guides`, `/docs/integrations`,
  `/docs/sdk`, `/docs/webhooks`
- **System pages (3):** `/404`, `/500`, `/maintenance`

---

## 3. Conformance Details

| Metric                           | Value               |
| -------------------------------- | ------------------- |
| Total WCAG 2.1 Level A criteria  | 30                  |
| Total WCAG 2.1 Level AA criteria | 20                  |
| Level A: Supports                | 25                  |
| Level A: Partially Supports      | 1 (SC 1.4.1)        |
| Level A: Not Applicable          | 4                   |
| Level AA: Supports               | 16                  |
| Level AA: Not Applicable         | 4                   |
| Routes fully conformant          | 180 of 181          |
| Routes partially conformant      | 1 of 181 (`/deals`) |

---

## 4. Technologies Relied Upon

The following technologies are relied upon for conformance:

- HTML5 (semantic elements, landmarks, ARIA attributes)
- CSS3 (Tailwind CSS utility framework, CSS custom properties)
- JavaScript/TypeScript (React 19, Next.js 16 App Router)
- WAI-ARIA 1.2 (roles, states, properties)
- Radix UI primitives (accessible dialog, tooltip, popover, toast components)
- shadcn/ui component library (built on Radix UI)

---

## 5. Known Limitations

### SC 1.4.1 Use of Color — `/deals` Pipeline View

**Description:** Pipeline stage visualization uses color-coded chips to
represent deal stages (e.g., green for "Won", red for "Lost"). While text labels
accompany the color chips, the color coding alone could be ambiguous for users
with color vision deficiencies.

**Impact:** Users who cannot distinguish colors may have difficulty quickly
parsing pipeline stage information from visual cues alone.

**Workaround:** Stage names are displayed as text labels adjacent to color
chips. Screen reader users receive stage names via accessible text.

**Remediation Plan:** Add pattern fills or icons alongside color chips. Tracked
for Sprint 16.

---

## 6. Evaluation Approach

This conformance assessment was conducted using the following methods:

### 6.1 Static Code Review

Manual inspection of React/TypeScript source code across all 82 routes for:

- ARIA attributes and landmark structure
- Semantic HTML usage
- Keyboard interaction handlers
- Form labels and error messaging
- Color contrast (CSS custom property analysis)

### 6.2 Lighthouse CI Runtime Audit

Automated Lighthouse accessibility audit on 4 public routes with a minimum score
threshold of 90/100. Accessibility category assertions set to `error` level
(blocking).

### 6.3 axe-core Automated Testing

8 component-level accessibility tests using axe-core via vitest-axe in a jsdom
environment:

- **Tier 1 (Shell):** NotificationBell, MainNav, SearchBar
- **Tier 2 (Pages):** Login form, Notification list, Data table
- **Tier 3 (Interactive):** Button with icon, Form with error message

**Known automated testing limitations:**

- Color contrast cannot be detected in jsdom (Lighthouse CI covers this)
- Focus trap correctness requires Playwright E2E testing
- Skip link presence is not in axe-core's scope
- Component-level rendering cannot detect missing page titles
- axe-core checks invalid autocomplete values, not absence

---

## 7. Feedback Mechanism

Users who encounter accessibility barriers can report issues via:

- **Email:** accessibility@intelliflow.com
- **Response time:** Within 5 business days
- **Alternative formats:** Available upon request

---

## 8. Screen Reader Testing Plan

### 8.1 Assistive Technology Combinations

| #   | Screen Reader | Browser     | Platform     |
| --- | ------------- | ----------- | ------------ |
| 1   | NVDA 2024.4+  | Chrome 120+ | Windows 11   |
| 2   | VoiceOver     | Safari 17+  | macOS Sonoma |
| 3   | VoiceOver     | Safari      | iOS 17+      |
| 4   | JAWS 2024+    | Chrome 120+ | Windows 11   |

### 8.2 Test Routes (8 Priority Routes)

| Priority | Route            | Rationale                                          |
| -------- | ---------------- | -------------------------------------------------- |
| P0       | `/`              | Public landing — first impression                  |
| P0       | `/login`         | Authentication entry point                         |
| P0       | `/dashboard`     | Primary authenticated view                         |
| P0       | `/leads`         | Core CRM workflow with DataTable                   |
| P1       | `/notifications` | Live region updates, bell interaction              |
| P1       | `/settings`      | Form-heavy configuration page                      |
| P1       | `/deals`         | Pipeline visualization (SC 1.4.1 known limitation) |
| P1       | `/documents`     | File management with version history               |

### 8.3 Test Scenarios per Route (6 Scenarios)

| #   | Scenario            | What to Verify                                                                |
| --- | ------------------- | ----------------------------------------------------------------------------- |
| 1   | Heading navigation  | All headings announced in correct order; no skipped levels                    |
| 2   | Landmark navigation | All landmarks discoverable; `<nav>` elements have distinguishing `aria-label` |
| 3   | Form completion     | Labels announced; errors announced via `aria-live`; autocomplete functional   |
| 4   | Table navigation    | Column headers announced; row navigation possible; action buttons labeled     |
| 5   | Dialog/modal focus  | Focus moves to dialog on open; trapped within dialog; returns on close        |
| 6   | Live regions        | Toast notifications announced; notification count updates announced           |

### 8.4 Execution Schedule

| Sprint     | Scope                 | AT Combinations                     |
| ---------- | --------------------- | ----------------------------------- |
| Sprint 15  | P0 routes (4 routes)  | NVDA+Chrome, VoiceOver+Safari macOS |
| Sprint 16  | P1 routes (4 routes)  | All 4 combinations                  |
| Sprint 18+ | Regression automation | Playwright + axe-core integration   |

### 8.5 Pass/Fail Criteria

- **Pass:** All 6 scenarios complete without blocking issues on the given AT
  combination
- **Fail:** Any scenario where a user cannot complete the intended task or
  information is inaccessible
- **Results:** Documented per route/AT combination in
  `artifacts/reports/screen-reader-test-results.json`

---

## Document Control

| Version | Date       | Author                        | Changes                                                                                                                                                                                        |
| ------- | ---------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0.0   | 2026-02-24 | Engineering (DOC-008)         | Initial conformance statement with screen reader testing plan                                                                                                                                  |
| 1.1.0   | 2026-03-01 | Engineering (DOC-011)         | Expanded scope from 26 to 82 routes; added dynamic segment parent-inherits policy                                                                                                              |
| 1.2.0   | 2026-03-10 | Engineering (PG-173)          | Added 3 ticket config routes (sla-policies, types, automations) — scope now 85 routes                                                                                                          |
| 1.3.0   | 2026-03-11 | Engineering (PG-174)          | Added 2 notification config routes (channels, quiet-hours) — scope now 87 routes                                                                                                               |
| 1.4.0   | 2026-04-10 | Engineering (PG-051, IFC-031) | Added `/terms` (PG-051) and `/cases/case-workflows` (IFC-031) — scope now 89 routes                                                                                                            |
| 1.5.0   | 2026-04-12 | Engineering (PG-056)          | Added `/500` system error page — scope now 90 routes; `h1` heading, keyboard-accessible recovery actions, semantic error badge                                                                 |
| 1.6.0   | 2026-04-16 | Engineering (PG-186)          | Added `/documents/document-settings` module-settings page — scope now 91 routes; bento grid with `<section>` landmarks, semantic Card headings, keyboard-accessible TagsTab forwardRef pattern |
