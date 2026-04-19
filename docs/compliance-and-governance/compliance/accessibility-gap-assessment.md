# Accessibility Compliance Gap Assessment — WCAG 2.1 AA

**Document Version:** 1.0 **Date:** 2026-02-23 **Task:** DOC-007 **Status:**
Initial Assessment **Owner:** QA (STOA-Quality) **Standard:** WCAG 2.1 Level AA
**Methodology:** Static Code Review + Lighthouse CI Configuration Analysis

---

## Executive Summary

This document presents the findings of a full accessibility compliance gap
assessment of the IntelliFlow CRM web application against WCAG 2.1 Level AA. The
audit covered all 26 URLs configured in `lighthouserc.js` and evaluated all 50
Level A and Level AA success criteria.

**Overall Conformance: 56%**

| Metric                        | Value    |
| ----------------------------- | -------- |
| Routes Fully Conformant       | 0 of 26  |
| Routes Partially Conformant   | 4 of 26  |
| Routes Non-Conformant         | 22 of 26 |
| Criteria Conformant           | 28 of 50 |
| Criteria Partially Conformant | 5 of 50  |
| Criteria Non-Conformant       | 8 of 50  |
| Criteria Not Applicable       | 9 of 50  |
| Total Failures Identified     | 16       |
| P0 (Level A) Failures         | 10       |
| P1 (Level AA) Failures        | 5        |
| P2 (Best Practice) Failures   | 1        |
| Process/Infrastructure Gaps   | 5        |

**Critical Finding:** No route in the application is fully WCAG 2.1 AA
conformant. All 26 routes share at least one Level A failure (missing
skip-to-content link, F-001). The majority of authenticated routes (22/26) share
five common failures originating from shared layout and DataTable components.

**Target:** 90%+ conformance by Sprint 20 (Q2 2026), with all P0 Level A
failures resolved by Sprint 15.

---

## Audit Scope

### URLs Audited (26)

Source: `lighthouserc.js` lines 17-50

| #   | URL                                                 | Route                          | Auth Required |
| --- | --------------------------------------------------- | ------------------------------ | ------------- |
| 1   | `http://localhost:3000`                             | `/`                            | No            |
| 2   | `http://localhost:3000/login`                       | `/login`                       | No            |
| 3   | `http://localhost:3000/signup`                      | `/signup`                      | No            |
| 4   | `http://localhost:3000/pricing`                     | `/pricing`                     | No            |
| 5   | `http://localhost:3000/dashboard`                   | `/dashboard`                   | Yes           |
| 6   | `http://localhost:3000/leads`                       | `/leads`                       | Yes           |
| 7   | `http://localhost:3000/contacts`                    | `/contacts`                    | Yes           |
| 8   | `http://localhost:3000/accounts`                    | `/accounts`                    | Yes           |
| 9   | `http://localhost:3000/deals`                       | `/deals`                       | Yes           |
| 10  | `http://localhost:3000/deals/forecast`              | `/deals/forecast`              | Yes           |
| 11  | `http://localhost:3000/tasks`                       | `/tasks`                       | Yes           |
| 12  | `http://localhost:3000/tickets`                     | `/tickets`                     | Yes           |
| 13  | `http://localhost:3000/email`                       | `/email`                       | Yes           |
| 14  | `http://localhost:3000/calendar`                    | `/calendar`                    | Yes           |
| 15  | `http://localhost:3000/cases`                       | `/cases`                       | Yes           |
| 16  | `http://localhost:3000/documents`                   | `/documents`                   | Yes           |
| 17  | `http://localhost:3000/agent-approvals`             | `/agent-approvals`             | Yes           |
| 18  | `http://localhost:3000/agent-approvals/ai-review`   | `/agent-approvals/ai-review`   | Yes           |
| 19  | `http://localhost:3000/agent-approvals/experiments` | `/agent-approvals/experiments` | Yes           |
| 20  | `http://localhost:3000/analytics`                   | `/analytics`                   | Yes           |
| 21  | `http://localhost:3000/governance`                  | `/governance`                  | Yes           |
| 22  | `http://localhost:3000/notifications`               | `/notifications`               | Yes           |
| 23  | `http://localhost:3000/settings`                    | `/settings`                    | Yes           |
| 24  | `http://localhost:3000/settings/ai`                 | `/settings/ai`                 | Yes           |
| 25  | `http://localhost:3000/settings/team`               | `/settings/team`               | Yes           |
| 26  | `http://localhost:3000/billing`                     | `/billing`                     | Yes           |

### Tools Used

- **Static Code Review:** Manual inspection of React/TypeScript source code for
  ARIA attributes, semantic HTML, keyboard handling, and color contrast
  computation
- **Lighthouse CI Configuration:** Analysis of `lighthouserc.js` enforcement
  levels and `audit-matrix.yml` gate status
- **WCAG 2.1 Quick Reference:** W3C criterion-by-criterion evaluation

### Methodology

1. **Phase A (Static WCAG Code Review):** Four parallel audit agents reviewed
   shared layouts/navigation, interactive components, route pages, and
   CSS/contrast/CI tooling
2. **Phase B (Lighthouse Runtime):** Lighthouse CI was not executed at runtime
   due to no authentication strategy for 22/26 auth-gated routes (documented as
   process gap PG-A11Y-005). All routes audited via static code review only
3. **Limitation:** All `lighthouse_score` values are null. Runtime accessibility
   scores will be captured when DOC-008 implements the auth strategy

---

## Status Legend

| Symbol | Status         | Definition                                                            |
| ------ | -------------- | --------------------------------------------------------------------- |
| ✅     | Conformant     | Fully meets the success criterion across all audited routes           |
| 🟡     | Partial        | Meets the criterion on some routes but not all, or meets with caveats |
| 🔴     | Non-Conformant | Fails to meet the criterion on one or more routes                     |
| ⚪     | Not Tested     | Route or criterion could not be evaluated (auth wall, runtime-only)   |
| ➖     | Not Applicable | Criterion does not apply to this application (no media content, etc.) |

---

## WCAG 2.1 Conformance by Principle

### Principle 1: Perceivable (20 criteria — 13 Level A, 7 Level AA)

Information and user interface components must be presentable to users in ways
they can perceive.

#### Level A Criteria

| SC    | Title                                  | Status | Finding                                                                                                                                                                                                                                                                           |
| ----- | -------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1.1 | Non-text Content                       | ✅     | All images have alt text. Icon fonts use `aria-hidden="true"` consistently.                                                                                                                                                                                                       |
| 1.2.1 | Audio-only and Video-only              | ➖     | No audio/video content exists in the application.                                                                                                                                                                                                                                 |
| 1.2.2 | Captions (Prerecorded)                 | ➖     | No video content exists in the application.                                                                                                                                                                                                                                       |
| 1.2.3 | Audio Description or Media Alternative | ➖     | No video content exists in the application.                                                                                                                                                                                                                                       |
| 1.3.1 | Info and Relationships                 | 🔴     | **F-003:** Sidebar `role="menu"` overrides `<nav>` landmark semantics (`AppSidebar.tsx:233,599`). **F-010:** Nested `<main>` landmarks — root `layout.tsx:93` and section layouts both render `<main>`. Heading hierarchy issues on 3 pages. Table headers missing `scope="col"`. |
| 1.3.2 | Meaningful Sequence                    | ✅     | DOM order matches visual presentation across all routes.                                                                                                                                                                                                                          |
| 1.3.3 | Sensory Characteristics                | ✅     | Instructions do not rely solely on shape, size, or visual location.                                                                                                                                                                                                               |
| 1.4.1 | Use of Color                           | 🟡     | Pipeline stage visualization uses color-coded stages (`globals.css:125-131`). Stage names exist as text labels reducing impact, but color chips alone could be ambiguous.                                                                                                         |
| 1.4.2 | Audio Control                          | ➖     | No auto-playing audio content exists.                                                                                                                                                                                                                                             |

**Level A subtotal:** 4 conformant, 1 partial, 1 non-conformant, 3 N/A

#### Level AA Criteria

| SC     | Title                           | Status | Finding                                                                                                                                                                     |
| ------ | ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.4  | Captions (Live)                 | ➖     | No live audio/video content exists.                                                                                                                                         |
| 1.2.5  | Audio Description (Prerecorded) | ➖     | No video content exists.                                                                                                                                                    |
| 1.3.4  | Orientation                     | ✅     | No content restricted to a single orientation. Tailwind responsive classes adapt.                                                                                           |
| 1.3.5  | Identify Input Purpose          | 🔴     | **F-012:** `autocomplete` attributes absent on personal data fields across login, signup, contact, and lead forms. Only `RecipientPicker.tsx` has autocomplete.             |
| 1.4.3  | Contrast (Minimum)              | 🟡     | **F-011:** Light mode `--muted-foreground` (#64748b) against `--background` (#f6f7f8) at ~4.47:1, below 4.5:1 minimum. Dark mode compliant. 103 files use `text-slate-500`. |
| 1.4.4  | Resize Text                     | ✅     | Tailwind rem-based sizing allows 200% text resize without content loss.                                                                                                     |
| 1.4.5  | Images of Text                  | ✅     | No images of text used. All text rendered as HTML.                                                                                                                          |
| 1.4.10 | Reflow                          | ✅     | Content reflows at 320px without horizontal scrolling.                                                                                                                      |
| 1.4.11 | Non-text Contrast               | ✅     | UI component boundaries have sufficient contrast. Focus indicators use `ring-2`.                                                                                            |
| 1.4.12 | Text Spacing                    | ✅     | No fixed-height containers that clip text. Layout accommodates spacing changes.                                                                                             |
| 1.4.13 | Content on Hover or Focus       | ✅     | Radix tooltip/popover primitives provide correct hover/focus dismissal behavior.                                                                                            |

**Level AA subtotal:** 7 conformant, 1 partial, 1 non-conformant, 2 N/A

**Principle 1 Total:** 11 conformant, 2 partial, 2 non-conformant, 5 N/A (20
criteria)

---

### Principle 2: Operable (17 criteria — 13 Level A, 4 Level AA)

User interface components and navigation must be operable.

#### Level A Criteria

| SC    | Title                     | Status | Finding                                                                                                                                                                                                                          |
| ----- | ------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1.1 | Keyboard                  | 🔴     | **F-007:** DataTable clickable rows have `onClick` but no `onKeyDown`/`tabIndex` (`data-table.tsx:513-518`). **F-005, F-006:** Inline ConfirmationDialog and StatusSelectDialog lack keyboard support. Affects all 9 list pages. |
| 2.1.2 | No Keyboard Trap          | 🔴     | **F-009:** Mobile sidebar drawer and inline dialogs (`AppSidebar.tsx:559`, `VersionHistory.tsx:83`, `ACLManager.tsx:233`) render `role="dialog"` with `aria-modal` but no focus trap.                                            |
| 2.1.4 | Character Key Shortcuts   | ✅     | No single-character keyboard shortcuts implemented.                                                                                                                                                                              |
| 2.2.1 | Timing Adjustable         | ➖     | No time-limited content. Auth sessions managed by Supabase.                                                                                                                                                                      |
| 2.2.2 | Pause, Stop, Hide         | ➖     | No auto-updating or blinking content exceeding 5 seconds.                                                                                                                                                                        |
| 2.3.1 | Three Flashes             | ✅     | No content flashes more than 3 times per second.                                                                                                                                                                                 |
| 2.4.1 | Bypass Blocks             | 🔴     | **F-001:** No skip-to-content link. Keyboard users must tab through 10+ nav elements per page. Target `id="main-content"` exists but no link references it.                                                                      |
| 2.4.2 | Page Titled               | 🔴     | **F-002:** 24/26 routes missing metadata. Only `/` and `/email` have page-specific titles. Root layout template defined but child pages use `'use client'` preventing exports.                                                   |
| 2.4.3 | Focus Order               | ✅     | No `tabIndex > 0` found. DOM order matches visual layout.                                                                                                                                                                        |
| 2.4.4 | Link Purpose (In Context) | ✅     | Navigation links have descriptive text labels from sidebar configs.                                                                                                                                                              |
| 2.5.1 | Pointer Gestures          | ✅     | No multi-point or path-based gestures required.                                                                                                                                                                                  |
| 2.5.2 | Pointer Cancellation      | ✅     | Actions triggered on click (up event), not pointer down.                                                                                                                                                                         |
| 2.5.3 | Label in Name             | ✅     | Visible text labels match accessible names.                                                                                                                                                                                      |
| 2.5.4 | Motion Actuation          | ✅     | No device motion or user motion triggers.                                                                                                                                                                                        |

**Level A subtotal:** 8 conformant, 0 partial, 4 non-conformant, 2 N/A (note: 14
listed but 2.1.4 was added in WCAG 2.1)

#### Level AA Criteria

| SC    | Title               | Status | Finding                                                                                                                                                                               |
| ----- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.4.5 | Multiple Ways       | 🟡     | **F-014:** Multiple nav mechanisms exist but desktop `MainNav` `<nav>` at `main-nav.tsx:23` has no `aria-label`, making it indistinguishable from sidebar nav in landmark navigation. |
| 2.4.6 | Headings and Labels | 🟡     | **F-013:** Heading hierarchy issues on `/agent-approvals` (h1→h3), `/analytics` (h1→h3), `/governance` (h2 after h3). Table headers missing `scope="col"`.                            |
| 2.4.7 | Focus Visible       | ✅     | `focus-visible:ring-2` provides clear focus indication on interactive elements.                                                                                                       |

**Level AA subtotal:** 1 conformant, 2 partial, 0 non-conformant

**Principle 2 Total:** 9 conformant, 2 partial, 4 non-conformant, 2 N/A (17
criteria)

---

### Principle 3: Understandable (10 criteria — 5 Level A, 5 Level AA)

Information and the operation of the user interface must be understandable.

#### Level A Criteria

| SC    | Title                  | Status | Finding                                                                                      |
| ----- | ---------------------- | ------ | -------------------------------------------------------------------------------------------- |
| 3.1.1 | Language of Page       | ✅     | `layout.tsx:71` sets `<html lang="en">`.                                                     |
| 3.2.1 | On Focus               | ✅     | No components initiate context changes on focus.                                             |
| 3.2.2 | On Input               | ✅     | No form controls cause unexpected context changes on value change.                           |
| 3.3.1 | Error Identification   | ✅     | FormControl sets `aria-invalid` and links to FormMessage via `aria-describedby`.             |
| 3.3.2 | Labels or Instructions | ✅     | Form fields have programmatic labels via `FormLabel`. SearchFilterBar uses `sr-only` labels. |

**Level A subtotal:** 5 conformant

#### Level AA Criteria

| SC    | Title                               | Status | Finding                                                                                                                                    |
| ----- | ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.1.2 | Language of Parts                   | ✅     | Single-language application (English). No multilingual sections.                                                                           |
| 3.2.3 | Consistent Navigation               | ✅     | Sidebar, header, and main content layout remain in consistent order throughout.                                                            |
| 3.2.4 | Consistent Identification           | ✅     | Components with same function (PageHeader, SearchFilterBar, DataTable) identified consistently.                                            |
| 3.3.3 | Error Suggestion                    | 🟡     | **F-015:** FormMessage renders error text linked via `aria-describedby` but lacks `aria-live`. Dynamic server errors may not be announced. |
| 3.3.4 | Error Prevention (Legal, Financial) | ✅     | Destructive actions use confirmation dialogs. Data reviewable before submission.                                                           |

**Level AA subtotal:** 4 conformant, 1 partial

**Principle 3 Total:** 9 conformant, 1 partial, 0 non-conformant, 0 N/A (10
criteria)

---

### Principle 4: Robust (3 criteria — 2 Level A, 1 Level AA)

Content must be robust enough to be interpreted by assistive technologies.

#### Level A Criteria

| SC    | Title             | Status | Finding                                                                                                                                                                                                                                                                                                                                                              |
| ----- | ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.1 | Parsing           | ✅     | React JSX produces valid HTML. No duplicate IDs or malformed markup.                                                                                                                                                                                                                                                                                                 |
| 4.1.2 | Name, Role, Value | 🔴     | **F-004:** Search bar no label (`search-bar.tsx:18-24`). **F-005:** ConfirmationDialog no ARIA (`data-table.tsx:197-236`). **F-006:** StatusSelectDialog no ARIA (`data-table.tsx:274-302`). **F-008:** Notification badge count not announced (`NotificationBell.tsx:54-63`). **F-016:** Icon-only buttons use `title` not `aria-label` (`data-table.tsx:103-134`). |

**Level A subtotal:** 1 conformant, 1 non-conformant

#### Level AA Criteria

| SC    | Title           | Status | Finding                                                                  |
| ----- | --------------- | ------ | ------------------------------------------------------------------------ |
| 4.1.3 | Status Messages | ✅     | Radix toast sets `role="status"` and `aria-live="polite"` automatically. |

**Level AA subtotal:** 1 conformant

**Principle 4 Total:** 2 conformant, 0 partial, 1 non-conformant, 0 N/A (3
criteria)

---

## Per-Route Conformance Matrix

| Route                          | Auth | Lighthouse Score | Conformance       | Failure Count | Failure IDs                                                          |
| ------------------------------ | ---- | ---------------- | ----------------- | ------------- | -------------------------------------------------------------------- |
| `/`                            | No   | —                | 🟡 Partial        | 2             | F-001, F-010                                                         |
| `/login`                       | No   | —                | 🟡 Partial        | 3             | F-001, F-002, F-010                                                  |
| `/signup`                      | No   | —                | 🟡 Partial        | 3             | F-001, F-002, F-010                                                  |
| `/pricing`                     | No   | —                | 🟡 Partial        | 3             | F-001, F-002, F-010                                                  |
| `/dashboard`                   | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/leads`                       | Yes  | —                | 🔴 Non-Conformant | 10            | F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010 |
| `/contacts`                    | Yes  | —                | 🔴 Non-Conformant | 10            | F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010 |
| `/accounts`                    | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-007, F-008, F-009, F-010               |
| `/deals`                       | Yes  | —                | 🔴 Non-Conformant | 10            | F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010 |
| `/deals/forecast`              | Yes  | —                | 🔴 Non-Conformant | 9             | F-001, F-002, F-003, F-004, F-007, F-008, F-009, F-010, F-013        |
| `/tasks`                       | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-007, F-008, F-009, F-010               |
| `/tickets`                     | Yes  | —                | 🔴 Non-Conformant | 10            | F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010 |
| `/email`                       | Yes  | —                | 🔴 Non-Conformant | 6             | F-001, F-003, F-004, F-007, F-008, F-009                             |
| `/calendar`                    | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/cases`                       | Yes  | —                | 🔴 Non-Conformant | 10            | F-001, F-002, F-003, F-004, F-005, F-006, F-007, F-008, F-009, F-010 |
| `/documents`                   | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-007, F-008, F-009, F-010               |
| `/agent-approvals`             | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-008, F-009, F-010, F-013               |
| `/agent-approvals/ai-review`   | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/agent-approvals/experiments` | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/analytics`                   | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-008, F-009, F-010, F-013               |
| `/governance`                  | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-008, F-009, F-010, F-013               |
| `/notifications`               | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/settings`                    | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/settings/ai`                 | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |
| `/settings/team`               | Yes  | —                | 🔴 Non-Conformant | 8             | F-001, F-002, F-003, F-004, F-008, F-009, F-010, F-013               |
| `/billing`                     | Yes  | —                | 🔴 Non-Conformant | 7             | F-001, F-002, F-003, F-004, F-008, F-009, F-010                      |

**Note:** Lighthouse scores are `—` (not available) because no runtime
Lighthouse audit was executed due to the authentication wall limitation
(PG-A11Y-005).

---

## Failure Registry

### P0 — Level A Failures (10)

#### F-001: No skip-to-content link

| Field           | Value                                                                                                                                                                |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 2.4.1 Bypass Blocks (Level A)                                                                                                                                     |
| Affected Routes | All 26 routes                                                                                                                                                        |
| Affected Files  | `apps/web/src/app/layout.tsx:91-94`                                                                                                                                  |
| Impact          | Keyboard users must tab through 10+ navigation elements on every page load                                                                                           |
| Remediation     | Add `<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-[100]">Skip to main content</a>` as first child of `<body>` in `layout.tsx` |
| Effort          | S (Small)                                                                                                                                                            |

#### F-002: Missing page titles on 24 of 26 routes

| Field           | Value                                                                                                                                                                                                                                                                                                                                                                 |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 2.4.2 Page Titled (Level A)                                                                                                                                                                                                                                                                                                                                        |
| Affected Routes | `/login`, `/signup`, `/pricing`, `/dashboard`, `/leads`, `/contacts`, `/accounts`, `/deals`, `/deals/forecast`, `/tasks`, `/tickets`, `/calendar`, `/cases`, `/documents`, `/agent-approvals`, `/agent-approvals/ai-review`, `/agent-approvals/experiments`, `/analytics`, `/governance`, `/notifications`, `/settings`, `/settings/ai`, `/settings/team`, `/billing` |
| Affected Files  | `apps/web/src/app/layout.tsx:12-16`, all 24 route `page.tsx` files                                                                                                                                                                                                                                                                                                    |
| Impact          | Screen reader users cannot identify the current page. All pages share a generic title.                                                                                                                                                                                                                                                                                |
| Remediation     | Add `metadata` exports to all routes. For `'use client'` pages, create server component wrappers or use layout-level `generateMetadata`.                                                                                                                                                                                                                              |
| Effort          | M (Medium)                                                                                                                                                                                                                                                                                                                                                            |

#### F-003: Sidebar `role="menu"` misuse on navigation elements

| Field           | Value                                                                                                                              |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 1.3.1 Info and Relationships (Level A)                                                                                          |
| Affected Routes | All 22 authenticated routes                                                                                                        |
| Affected Files  | `apps/web/src/components/sidebar/AppSidebar.tsx:233`, `AppSidebar.tsx:599`                                                         |
| Impact          | Sidebar navigation invisible to screen reader landmark navigation. ARIA `menu` role is for application menus, not site navigation. |
| Remediation     | Remove `role="menu"` from `<nav>` elements and `role="menuitem"` from `<Link>` elements.                                           |
| Effort          | S (Small)                                                                                                                          |

#### F-004: Header search bar has no accessible label

| Field           | Value                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 4.1.2 Name, Role, Value (Level A)                                                                                |
| Affected Routes | All 22 authenticated routes                                                                                         |
| Affected Files  | `apps/web/src/components/header/search-bar.tsx:18-24`                                                               |
| Impact          | Screen reader users cannot identify the search input purpose.                                                       |
| Remediation     | Add `aria-label="Search"` to the input element or adopt the `useId` + `sr-only` label pattern from SearchFilterBar. |
| Effort          | S (Small)                                                                                                           |

#### F-005: ConfirmationDialog in data-table.tsx not accessible

| Field           | Value                                                                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 4.1.2 Name, Role, Value (Level A)                                                                                                                                                    |
| Affected Routes | `/leads`, `/contacts`, `/deals`, `/tickets`, `/cases`                                                                                                                                   |
| Affected Files  | `packages/ui/src/components/data-table.tsx:197-236`                                                                                                                                     |
| Impact          | Hand-rolled modal without `role="dialog"`, `aria-modal`, `aria-labelledby`, or focus trap. A proper Radix-based version exists at `packages/ui/src/components/confirmation-dialog.tsx`. |
| Remediation     | Replace inline dialog with the existing Radix-based `confirmation-dialog.tsx`.                                                                                                          |
| Effort          | M (Medium)                                                                                                                                                                              |

#### F-006: StatusSelectDialog in data-table.tsx not accessible

| Field           | Value                                                                             |
| --------------- | --------------------------------------------------------------------------------- |
| Criterion       | SC 4.1.2 Name, Role, Value (Level A)                                              |
| Affected Routes | `/leads`, `/contacts`, `/deals`, `/tickets`                                       |
| Affected Files  | `packages/ui/src/components/data-table.tsx:274-302`                               |
| Impact          | Same issues as F-005. Option buttons also lack `aria-pressed`/`aria-checked`.     |
| Remediation     | Replace with Radix-based `status-select-dialog.tsx` or add proper ARIA semantics. |
| Effort          | M (Medium)                                                                        |

#### F-007: Clickable table rows not keyboard accessible

| Field           | Value                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 2.1.1 Keyboard (Level A)                                                                               |
| Affected Routes | `/leads`, `/contacts`, `/accounts`, `/deals`, `/tasks`, `/tickets`, `/cases`, `/documents`, `/email`      |
| Affected Files  | `packages/ui/src/components/data-table.tsx:513-518`                                                       |
| Impact          | Keyboard users cannot navigate to or activate clickable table rows.                                       |
| Remediation     | Add `tabIndex={0}`, `onKeyDown` handler (Enter/Space), and `role="button"` when `onRowClick` is provided. |
| Effort          | S (Small)                                                                                                 |

#### F-008: Notification badge count not announced to screen readers

| Field           | Value                                                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 4.1.2 Name, Role, Value (Level A)                                                                                            |
| Affected Routes | All 22 authenticated routes                                                                                                     |
| Affected Files  | `apps/web/src/components/notifications/NotificationBell.tsx:54-63`                                                              |
| Impact          | Screen reader users cannot determine unread notification count.                                                                 |
| Remediation     | Update `aria-label` to include count: `aria-label={\`Notifications, ${unreadCount} unread\`}`. Add `aria-live="polite"` region. |
| Effort          | S (Small)                                                                                                                       |

#### F-009: Mobile sidebar drawer and inline dialogs lack focus trap

| Field           | Value                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 2.1.2 No Keyboard Trap (Level A)                                                                                                         |
| Affected Routes | All (mobile), `/documents`, `/cases`                                                                                                        |
| Affected Files  | `apps/web/src/components/sidebar/AppSidebar.tsx:559-561`, `VersionHistory.tsx:83-85`, `ACLManager.tsx:233-235`, `AppointmentDetail.tsx:475` |
| Impact          | Background content accessible via keyboard while modal overlay is visible.                                                                  |
| Remediation     | Implement focus trap using `focus-trap-react`. On open, move focus to first interactive element; on close, return focus to trigger.         |
| Effort          | M (Medium)                                                                                                                                  |

#### F-010: Nested `<main>` landmarks

| Field           | Value                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 1.3.1 Info and Relationships (Level A)                                                                                    |
| Affected Routes | All 26 routes                                                                                                                |
| Affected Files  | `apps/web/src/app/layout.tsx:93`, section layout files                                                                       |
| Impact          | Invalid nested `<main>` landmarks confuse screen reader landmark navigation.                                                 |
| Remediation     | Change `<main>` in `layout.tsx:93` to `<div>`. Section-level `<main id="main-content">` elements are the correct containers. |
| Effort          | S (Small)                                                                                                                    |

### P1 — Level AA Failures (5)

#### F-011: Color contrast below minimum for muted-foreground in light mode

| Field           | Value                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 1.4.3 Contrast Minimum (Level AA)                                                                                                                  |
| Affected Routes | All routes in light mode                                                                                                                              |
| Affected Files  | `apps/web/src/app/globals.css:102-108`                                                                                                                |
| Impact          | `--muted-foreground` (#64748b) against `--background` (#f6f7f8) at ~4.47:1, below 4.5:1 minimum. 103 files use `text-slate-500`. Dark mode compliant. |
| Remediation     | Darken `--muted-foreground` in light mode (e.g., `hsl(215 16% 44%)` achieves ~4.8:1) or lighten `--background` to `#ffffff`.                          |
| Effort          | S (Small)                                                                                                                                             |

#### F-012: `autocomplete` attributes missing on personal data form fields

| Field           | Value                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 1.3.5 Identify Input Purpose (Level AA)                                                                                        |
| Affected Routes | `/login`, `/signup`, `/contacts`, `/leads`, `/settings/team`                                                                      |
| Affected Files  | Login, signup, contact, and lead form pages                                                                                       |
| Impact          | Browsers/assistive technologies cannot auto-fill personal data fields.                                                            |
| Remediation     | Add `autocomplete` values (`username`, `current-password`, `email`, `name`, `tel`, `street-address`) to all personal data fields. |
| Effort          | M (Medium)                                                                                                                        |

#### F-013: Heading hierarchy issues on multiple pages

| Field           | Value                                                                                                                                                    |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criterion       | SC 2.4.6 Headings and Labels (Level AA)                                                                                                                  |
| Affected Routes | `/agent-approvals`, `/analytics`, `/governance`, `/deals/forecast`, `/settings/team`                                                                     |
| Affected Files  | `agent-approvals/page.tsx:954`, `analytics/(list)/page.tsx:89`, `governance/page.tsx:87-185`, `deals/forecast/page.tsx:327`, `settings/team/page.tsx:47` |
| Impact          | Screen reader heading navigation produces unexpected hierarchy (h1 to h3 skipping h2). Table headers lack `scope="col"`.                                 |
| Remediation     | Fix heading hierarchy to sequential order. Add `scope="col"` to all table header cells.                                                                  |
| Effort          | S (Small)                                                                                                                                                |

#### F-014: MainNav `<nav>` element missing `aria-label`

| Field           | Value                                                                               |
| --------------- | ----------------------------------------------------------------------------------- |
| Criterion       | SC 2.4.5 Multiple Ways (Level AA)                                                   |
| Affected Routes | All 22 authenticated routes                                                         |
| Affected Files  | `apps/web/src/components/navigation/main-nav.tsx:23`                                |
| Impact          | When multiple `<nav>` landmarks exist, screen reader users cannot distinguish them. |
| Remediation     | Add `aria-label="Primary navigation"` to the `<nav>` element.                       |
| Effort          | S (Small)                                                                           |

#### F-016: Icon-only buttons use `title` instead of `aria-label`

| Field           | Value                                                                         |
| --------------- | ----------------------------------------------------------------------------- |
| Criterion       | SC 4.1.2 Name, Role, Value (Level A)                                          |
| Affected Routes | `/leads`, `/contacts`, `/deals`, `/tickets`, `/cases`                         |
| Affected Files  | `packages/ui/src/components/data-table.tsx:103-110`, `data-table.tsx:129-134` |
| Impact          | `title` not reliably announced by all screen readers in browse mode.          |
| Remediation     | Replace `title={action.label}` with `aria-label={action.label}`.              |
| Effort          | S (Small)                                                                     |

### P2 — Best Practice Gaps (1)

#### F-015: FormMessage lacks `aria-live` for dynamic error announcements

| Field           | Value                                                                                                  |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| Criterion       | SC 3.3.3 Error Suggestion (Level AA)                                                                   |
| Affected Routes | All routes with forms                                                                                  |
| Affected Files  | `packages/ui/src/components/form.tsx:140-162`                                                          |
| Impact          | Dynamically injected server-side validation errors may not be announced without re-focusing the field. |
| Remediation     | Add `aria-live="polite"` to the FormMessage `<p>` element.                                             |
| Effort          | S (Small)                                                                                              |

---

## Process & Infrastructure Gaps

### PG-A11Y-001: Lighthouse accessibility assertions at `warn` not `error`

`lighthouserc.js` sets `categories:accessibility` to
`['warn', { minScore: 0.9 }]` (line 85) and individual a11y rules to `'warn'`
(lines 131-134). Accessibility failures do not block CI/CD.

**Recommendation:** Change to `['error', { minScore: 0.9 }]` and individual
rules to `'error'`. **Target Task:** DOC-008

### PG-A11Y-002: No `eslint-plugin-jsx-a11y` in any ESLint configuration

ARIA attribute correctness, label associations, and interactive element
semantics are not caught at lint time. The plugin catches ~30 common
accessibility issues at development time.

**Recommendation:** Install `eslint-plugin-jsx-a11y` and add recommended rules
to `apps/web` ESLint config. **Target Task:** DOC-008

### PG-A11Y-003: No axe-core accessibility tests in `apps/web`

`axe-core` and `vitest-axe` are only installed in `packages/ui` (7 tests).
`apps/web` has no axe-core, uses `happy-dom` (not jsdom), and one test file
comments acknowledging the gap.

**Recommendation:** Install `vitest-axe` in `apps/web`, switch to jsdom for a11y
tests, add `toHaveNoViolations` assertions. **Target Task:** DOC-008

### PG-A11Y-004: `lighthouse-ci` disabled in `audit-matrix.yml`

Classified as Tier 3 (scheduled/manual) with `enabled: false` and
`required: false` (lines 321-323). Not a PR gate. Thresholds define only
`performance_min: 90` with no `accessibility_min`.

**Recommendation:** Enable as Tier 1/2 gate with `required: true`. Add
`accessibility_min: 90` threshold. **Target Task:** DOC-008

### PG-A11Y-005: No authentication strategy for Lighthouse on authenticated routes

22 of 26 URLs require authentication. No auth cookie injection, login script, or
puppeteer script configured. Auth-gated routes receive login/redirect page
scores.

**Recommendation:** Implement Lighthouse puppeteer script or auth cookie
injection for authenticated route auditing. **Target Task:** DOC-008

---

## Remediation Priority Plan

### Sprint 15 — P0 Level A (10 items)

| ID    | Failure                                              | Owner    | Effort |
| ----- | ---------------------------------------------------- | -------- | ------ |
| F-001 | Add skip-to-content link to root layout              | Frontend | S      |
| F-002 | Add metadata exports to 24 routes                    | Frontend | M      |
| F-003 | Remove `role="menu"` from sidebar nav                | Frontend | S      |
| F-004 | Add `aria-label` to header search bar                | Frontend | S      |
| F-005 | Replace inline ConfirmationDialog with Radix version | Frontend | M      |
| F-006 | Replace inline StatusSelectDialog with Radix version | Frontend | M      |
| F-007 | Add keyboard support to clickable table rows         | Frontend | S      |
| F-008 | Add notification count to bell `aria-label`          | Frontend | S      |
| F-009 | Implement focus trap for mobile sidebar and dialogs  | Frontend | M      |
| F-010 | Fix nested `<main>` landmarks                        | Frontend | S      |

### Sprint 16 — P1 Level AA (5 items)

| ID    | Failure                                           | Owner    | Effort |
| ----- | ------------------------------------------------- | -------- | ------ |
| F-011 | Fix muted-foreground light mode contrast          | Design   | S      |
| F-012 | Add `autocomplete` to personal data fields        | Frontend | M      |
| F-013 | Fix heading hierarchy and table header scope      | Frontend | S      |
| F-014 | Add `aria-label` to MainNav `<nav>`               | Frontend | S      |
| F-016 | Replace `title` with `aria-label` on icon buttons | Frontend | S      |

### Sprint 17 — P2 Best Practices + Process (1 + 5 items)

| ID          | Item                               | Owner    | Effort |
| ----------- | ---------------------------------- | -------- | ------ |
| F-015       | Add `aria-live` to FormMessage     | Frontend | S      |
| PG-A11Y-001 | Promote Lighthouse a11y to `error` | DevOps   | S      |
| PG-A11Y-002 | Install eslint-plugin-jsx-a11y     | DevOps   | S      |
| PG-A11Y-003 | Add axe-core tests to apps/web     | QA       | M      |
| PG-A11Y-004 | Enable lighthouse-ci as PR gate    | DevOps   | S      |
| PG-A11Y-005 | Implement Lighthouse auth strategy | DevOps   | M      |

---

## Risk Assessment

| Risk                                                                                                                                                                                                                                      | Severity | Mitigation                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Auth wall limits audit scope.** 22/26 routes audited via static code review only. Runtime Lighthouse scores unavailable.                                                                                                                | Medium   | DOC-008 will implement auth strategy for Lighthouse. Static review covers ARIA/semantic issues well but cannot detect runtime rendering bugs. |
| **Contrast values are computed estimates.** Light mode contrast ratio of 4.47:1 is computed from CSS custom property values, not measured from rendered pixels. Actual contrast may vary by browser rendering.                            | Low      | Remediation targets 4.8:1+ which provides margin. Validate with browser DevTools contrast checker after fix.                                  |
| **False confidence from Radix components.** Shared Radix primitives (dialog.tsx, toast.tsx) PASS but hand-rolled equivalents in data-table.tsx FAIL. Teams may assume "we use Radix, so we're accessible" without checking all consumers. | Medium   | Remediation plan explicitly replaces hand-rolled dialogs with Radix equivalents. Linting (PG-A11Y-002) will prevent regressions.              |
| **`'use client'` prevents metadata exports.** Most CRM pages use client components, which cannot export Next.js metadata. Fixing F-002 requires architectural patterns (server wrappers or layout-level generateMetadata).                | Low      | Well-documented Next.js patterns exist. Effort classified as M (Medium) to account for 24 routes.                                             |

---

## Companion Artifact

Machine-readable audit data:
[`artifacts/reports/accessibility-audit-results.json`](../../artifacts/reports/accessibility-audit-results.json)

The JSON artifact contains the same data in structured format with all 26 route
entries, 50 criteria results, 16 failures, 5 process gaps, and 16 remediation
plan items.

---

## Document Control

| Version | Date       | Author                      | Changes                                                                              |
| ------- | ---------- | --------------------------- | ------------------------------------------------------------------------------------ |
| 1.0     | 2026-02-23 | QA (STOA-Quality) / DOC-007 | Initial assessment — static code review of 26 routes against 50 WCAG 2.1 AA criteria |
