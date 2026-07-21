# Navigation & Reachability Audit

> **Generated**: 2026-02-22 | **Updated**: 2026-07-21 | **Sprint**: 6 (MVP
> Phase) **Trigger**: PG-030 shipped a complete subscription manager at
> `/billing/subscriptions` with zero navigation entries — only discoverable by
> typing the URL directly.

> **Canonical counts**: All "page.tsx" file-count references in this document
> reflect the filesystem total (Total Pages: 211) emitted by
> `tools/scripts/content-audit.ts` — each `page.tsx` under `apps/web/src/app/**`
> counts once; route groups stripped; `[id]` collapses; `app/api/` excluded. See
> `docs/design/content-audit.md` for the full counting rule. Verified:
> 2026-07-21.

## Table of Contents

- [1. Navigation Architecture](#1-navigation-architecture)
- [2. Header Navigation (Dynamic)](#2-header-navigation-dynamic)
- [3. Complete Route Cross-Reference](#3-complete-route-cross-reference)
- [4. Issues: Ghost Links](#4-issues-ghost-links)
- [5. Issues: Broken In-Page Links](#5-issues-broken-in-page-links)
- [6. Module Reachability Matrix](#6-module-reachability-matrix)
- [7. Planned Work (Sprint 16)](#7-planned-work-sprint-16)

---

## 1. Navigation Architecture

IntelliFlow CRM has four navigation layers:

```
Layer 1: Header (Navigation component — dynamic, module-gated)
├── Main nav bar — dynamic from ModuleRoutes.ts via useEnabledModules()
│   Renders: Dashboard, Leads, Contacts, Accounts, Deals, Tasks,
│            Calendar, Email, Cases, Tickets, AI & Agents, Reports
├── Bell icon → notification popover (+ "View All" → /notifications)
├── User menu → /profile, /settings, /governance, Sign out
└── Logo → /dashboard

Layer 2: Left Sidebar (AppSidebar.tsx)
├── 17 config files in apps/web/src/components/sidebar/configs/
├── Hover-to-expand (56px collapsed → 240px expanded)
├── Active-item detection matches pathname + query params
├── Module settings footer link (settingsHref)
└── SidebarPortalProvider (dynamic injection in cases, calendar, tickets)

Layer 3: In-Page Links
├── PageHeader breadcrumbs (back navigation)
├── PageHeader action buttons (create new, related pages)
├── Data table row links (detail pages)
├── Component cross-links (e.g., CaseForm → /contacts/new)
└── Home page quick actions (PinnedItemsSheet)

Layer 4: Public Navigation
├── PublicHeader + PublicFooter (public pages only)
└── No sidebar, no user menu
```

### Source Files

| Component          | File                                                       | Role                                                                                     |
| ------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Navigation**     | `apps/web/src/components/navigation.tsx`                   | **Active header** — uses `useEnabledModules()` for dynamic module-gated routes           |
| Module Hook        | `apps/web/src/hooks/useEnabledModules.ts`                  | Queries backend for enabled modules, returns `enabledRoutes` via `getRoutesForModules()` |
| Domain Routes      | `packages/domain/src/platform/modules/ModuleRoutes.ts`     | Module-gated nav route definitions (CORE_CRM, LEGAL, SUPPORT, AI, ANALYTICS)             |
| Main Nav           | `apps/web/src/components/header/main-nav.tsx`              | Renders header links from routes prop                                                    |
| User Menu          | `apps/web/src/components/header/user-menu.tsx`             | Profile, Settings, Governance, Sign out                                                  |
| Notifications Bell | `apps/web/src/components/header/notifications.tsx`         | Bell icon → popover (re-exports NotificationBell)                                        |
| Sidebar            | `apps/web/src/components/sidebar/AppSidebar.tsx`           | Collapsible left sidebar                                                                 |
| Sidebar Context    | `apps/web/src/components/sidebar/SidebarContext.tsx`       | Pin/hover state                                                                          |
| Sidebar Types      | `apps/web/src/components/sidebar/sidebar-types.ts`         | SidebarConfig, SidebarItem (with `roles?: string[]`), SidebarSection                     |
| Sidebar Portal     | `apps/web/src/components/sidebar/SidebarPortalContext.tsx` | Dynamic sidebar injection                                                                |
| Icon Reference     | `apps/web/src/components/sidebar/icon-reference.ts`        | MODULE_COLORS, MODULE_ICONS, VIEW_ICONS                                                  |
| Sidebar Configs    | `apps/web/src/components/sidebar/configs/*.ts`             | 17 config files                                                                          |
| Root Layout        | `apps/web/src/app/layout.tsx`                              | Renders `<Navigation />`                                                                 |

---

## 2. Header Navigation (Dynamic)

The root layout (`apps/web/src/app/layout.tsx`) renders `<Navigation />` from
`navigation.tsx`. This component calls `useEnabledModules()` which queries the
backend for the tenant's enabled modules and calls `getRoutesForModules()` from
`ModuleRoutes.ts`.

### Module → Header Routes

| Module          | Routes Rendered                                                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CORE_CRM        | Dashboard `/dashboard`, Leads `/leads`, Contacts `/contacts`, Accounts `/accounts`, Deals `/deals`, Tasks `/tasks`, Calendar `/calendar`, Email `/email` |
| LEGAL           | Cases `/cases`                                                                                                                                           |
| SUPPORT         | Tickets `/tickets`                                                                                                                                       |
| AI_INTELLIGENCE | AI & Agents `/agent-approvals`                                                                                                                           |
| ANALYTICS       | Reports `/analytics`                                                                                                                                     |
| COMMERCE        | (no routes — not yet built)                                                                                                                              |

### User Menu Dropdown

| Label          | Route            |                       Accessible?                        |
| -------------- | ---------------- | :------------------------------------------------------: |
| Profile        | `/profile`       |                           YES                            |
| Settings       | `/settings`      |                           YES                            |
| Governance     | `/governance`    |                           YES                            |
| Sign out       | (action)         |                           YES                            |
| Billing        | `/billing`       |          YES — settings sidebar "More" section           |
| Notifications  | `/notifications` |       YES (bell popover "View All" link + sidebar)       |
| Developer Docs | `/docs`          | YES — settings sidebar "More" section (SUPER_ADMIN only) |

---

## 3. Complete Route Cross-Reference

Legend:

- **H** = Header nav link (via ModuleRoutes.ts)
- **UM** = User menu dropdown
- **SB** = Sidebar config entry
- **IP** = In-page link (breadcrumb, button, data table row)
- **--** = No entry (unreachable from that layer)

### Public Pages (32 routes) — All reachable via PublicHeader/PublicFooter

| Route                                                     | Status | Notes                                       |
| --------------------------------------------------------- | ------ | ------------------------------------------- |
| `/` (public)                                              | OK     | Public home                                 |
| `/about`                                                  | OK     | Footer link                                 |
| `/aup`                                                    | OK     | Footer link (Acceptable Use Policy)         |
| `/blog`, `/blog/[slug]`                                   | OK     | Header/footer links                         |
| `/careers`, `/careers/[id]`                               | OK     | Footer link                                 |
| `/contact`                                                | OK     | Header/footer link                          |
| `/features`                                               | OK     | Header link                                 |
| `/privacy`                                                | OK     | Footer, signup, home, cookie banner         |
| `/terms`                                                  | OK     | Footer, signup, registration, welcome email |
| `/cookies`                                                | OK     | Footer (2x), cookie banner                  |
| `/dpa`                                                    | OK     | Footer (legal list)                         |
| `/login`, `/signup`, `/signup/success`                    | OK     | Header CTA                                  |
| `/forgot-password`, `/reset-password/*`                   | OK     | Login page link                             |
| `/mfa/verify`                                             | OK     | Login flow                                  |
| `/verify-email/*`                                         | OK     | Signup flow                                 |
| `/logout`                                                 | OK     | Auth flow                                   |
| `/lp/[slug]`                                              | OK     | Marketing campaign links                    |
| `/partners`, `/press`, `/pricing`, `/security`, `/status` | OK     | Footer links                                |

### Dashboard (3 routes)

| Route                  |  H  | UM  | SB  | IP  | Reachable? | Notes                        |
| ---------------------- | :-: | :-: | :-: | :-: | :--------: | ---------------------------- |
| `/dashboard`           | YES | --  | --  | IP  |    YES     | Logo + header nav            |
| `/dashboard/customize` | --  | --  | --  | IP? |   VERIFY   | Likely linked from dashboard |
| `/dashboard/new`       | --  | --  | --  | IP? |   VERIFY   | Likely linked from dashboard |

### Accounts (5 routes)

| Route                         |  H  | UM  | SB  | IP  | Reachable? | Notes                 |
| ----------------------------- | :-: | :-: | :-: | :-: | :--------: | --------------------- |
| `/accounts`                   | YES | --  | SB  | --  |    YES     | Header nav (CORE_CRM) |
| `/accounts/[id]`              | --  | --  | --  | IP  |     OK     | From list rows        |
| `/accounts/account-settings`  | --  | --  | SB  | --  |    YES     | Accounts sidebar      |
| `/accounts/account-tiers`     | --  | --  | SB  | --  |    YES     | Accounts sidebar      |
| `/accounts/territory-mapping` | --  | --  | SB  | --  |    YES     | Accounts sidebar      |

### Agent Approvals (17 routes)

| Route                                |  H  | UM  |   SB   | IP  | Reachable?  | Notes                                       |
| ------------------------------------ | :-: | :-: | :----: | :-: | :---------: | ------------------------------------------- |
| `/agent-approvals`                   | YES | --  |   SB   | --  |     YES     |                                             |
| `/agent-approvals/agents`            | --  | --  |   SB   | --  |     YES     | Sidebar: Monitoring                         |
| `/agent-approvals/ai-review`         | --  | --  |   SB   | --  |     YES     | Sidebar: AI Review                          |
| `/agent-approvals/ai-review/[id]`    | --  | --  |   --   | IP  |     OK      | From review list                            |
| `/agent-approvals/ai-search`         | --  | --  |   SB   | --  |     YES     | Sidebar: AI Tools                           |
| `/agent-approvals/ai-settings`       | --  | --  |   SB   | --  |     YES     | Sidebar: Configuration                      |
| `/agent-approvals/approval-policies` | --  | --  |   SB   | --  |     YES     | Sidebar: Configuration                      |
| `/agent-approvals/churn-risk`        | --  | --  |   SB   | --  |     YES     | Sidebar: Intelligence                       |
| `/agent-approvals/drift`             | --  | --  |   SB   | --  |     YES     | Sidebar: Monitoring                         |
| `/agent-approvals/experiments`       | --  | --  |   SB   | --  |     YES     | Sidebar: AI Tools                           |
| `/agent-approvals/history`           | --  | --  |   SB   | --  |     YES     | Sidebar: History                            |
| `/agent-approvals/insights`          | --  | --  |   SB   | --  |     YES     | Sidebar: Intelligence                       |
| `/agent-approvals/latency`           | --  | --  |   SB   | --  |     YES     | Sidebar: Monitoring                         |
| `/agent-approvals/lead-scoring`      | --  | --  |   SB   | --  |     YES     | Sidebar: Intelligence                       |
| `/agent-approvals/logs`              | --  | --  |   SB   | --  |     YES     | Sidebar: Monitoring                         |
| `/agent-approvals/logs/[id]`         | --  | --  |   --   | IP  |     OK      | From logs list rows                         |
| `/agent-approvals/model-config`      | --  | --  |   SB   | --  |     YES     | Sidebar: Configuration                      |
| `/agent-approvals/preview`           | --  | --  | **NO** | IP  | **PARTIAL** | Only via "Preview Mode" button on main page |
| `/agent-approvals/sentiment`         | --  | --  |   SB   | --  |     YES     | Sidebar: Intelligence                       |
| `/agent-approvals/tools`             | --  | --  |   SB   | --  |     YES     | Sidebar: AI Tools (IFC-191)                 |

### Analytics (8 routes)

| Route                          |  H  | UM  | SB  | IP  | Reachable? | Notes                      |
| ------------------------------ | :-: | :-: | :-: | :-: | :--------: | -------------------------- |
| `/analytics`                   | YES | --  | SB  | --  |    YES     | Header: Reports            |
| `/analytics/feedback`          | --  | --  | SB  | --  |    YES     | Sidebar: Report Views      |
| `/analytics/saved/weekly`      | --  | --  | SB  | --  |    YES     | Sidebar: Saved Reports     |
| `/analytics/saved/monthly`     | --  | --  | SB  | --  |    YES     | Sidebar: Saved Reports     |
| `/analytics/saved/quarterly`   | --  | --  | SB  | --  |    YES     | Sidebar: Saved Reports     |
| `/analytics/report-templates`  | --  | --  | SB  | --  |    YES     | Sidebar: Report Management |
| `/analytics/scheduled-reports` | --  | --  | SB  | --  |    YES     | Sidebar: Report Management |
| `/analytics/report-settings`   | --  | --  | SB  | --  |    YES     | Sidebar: settingsHref      |

### Appointments (3 routes)

| Route                |  H  | UM  | SB  | IP  | Reachable? | Notes                                            |
| -------------------- | :-: | :-: | :-: | :-: | :--------: | ------------------------------------------------ |
| `/appointments`      | --  | --  | SB  | IP  |    YES     | Appointments sidebar (Calendar View link → here) |
| `/appointments/new`  | --  | --  | --  | IP  |     OK     | PageHeader action from appointments list         |
| `/appointments/[id]` | --  | --  | --  | IP  |     OK     | From appointments list rows                      |

### Billing (12 routes)

| Route                      |  H  | UM  | SB  | IP  | Reachable? | Notes                            |
| -------------------------- | :-: | :-: | :-: | :-: | :--------: | -------------------------------- |
| `/billing`                 | --  | --  | SB  | --  |    YES     | Settings sidebar "More" section  |
| `/billing/cancel`          | --  | --  | SB  | IP  |    YES     | Billing sidebar + portal CTA     |
| `/billing/checkout`        | --  | --  | --  | IP  |   VERIFY   | Likely CTA from billing overview |
| `/billing/invoices`        | --  | --  | SB  | IP  |    YES     | Billing sidebar                  |
| `/billing/invoices/[id]`   | --  | --  | --  | IP  |     OK     | From invoice list rows           |
| `/billing/payment-methods` | --  | --  | SB  | IP  |    YES     | Billing sidebar                  |
| `/billing/plans`           | --  | --  | SB  | IP  |    YES     | Billing sidebar + portal CTA     |
| `/billing/receipts`        | --  | --  | SB  | --  |    YES     | Billing sidebar                  |
| `/billing/settings`        | --  | --  | SB  | IP  |    YES     | Billing sidebar + portal CTA     |
| `/billing/subscriptions`   | --  | --  | SB  | --  |    YES     | Billing sidebar                  |
| `/billing/upgrade`         | --  | --  | SB  | --  |    YES     | Billing sidebar                  |
| `/billing/usage`           | --  | --  | SB  | --  |    YES     | Billing sidebar                  |

### Calendar (4 routes)

| Route                         |  H  | UM  | SB  | IP  | Reachable? | Notes                                             |
| ----------------------------- | :-: | :-: | :-: | :-: | :--------: | ------------------------------------------------- |
| `/calendar`                   | YES | --  | SB  | --  |    YES     | Header nav (CORE_CRM) + appointments sidebar link |
| `/calendar/availability`      | --  | --  | SB  | --  |    YES     | Calendar sidebar                                  |
| `/calendar/event-types`       | --  | --  | SB  | --  |    YES     | Calendar sidebar                                  |
| `/calendar/calendar-settings` | --  | --  | SB  | --  |    YES     | Calendar sidebar                                  |

### Cases (9 routes)

| Route                        |  H  | UM  | SB  | IP  | Reachable? | Notes                            |
| ---------------------------- | :-: | :-: | :-: | :-: | :--------: | -------------------------------- |
| `/cases`                     | YES | --  | SB  | IP  |    YES     | Header nav (LEGAL)               |
| `/cases/new`                 | --  | --  | --  | IP  |     OK     | PageHeader action from `/cases`  |
| `/cases/[id]`                | --  | --  | --  | IP  |     OK     | From list rows                   |
| `/cases/timeline`            | --  | --  | SB  | --  |    YES     | Cases sidebar                    |
| `/cases/case-workflows`      | --  | --  | SB  | --  |    YES     | Cases sidebar                    |
| `/cases/case-workflows/[id]` | --  | --  | --  | IP  |     OK     | From workflow list rows          |
| `/cases/case-workflows/new`  | --  | --  | --  | IP  |     OK     | PageHeader action from workflows |
| `/cases/case-types`          | --  | --  | SB  | --  |    YES     | Cases sidebar                    |
| `/cases/case-settings`       | --  | --  | SB  | --  |    YES     | Cases sidebar                    |

### Contacts (7 routes)

| Route                        |  H  | UM  | SB  | IP  | Reachable? | Notes                            |
| ---------------------------- | :-: | :-: | :-: | :-: | :--------: | -------------------------------- |
| `/contacts`                  | YES | --  | SB  | --  |    YES     |                                  |
| `/contacts/new`              | --  | --  | --  | IP  |     OK     | CaseForm cross-link, list action |
| `/contacts/[id]`             | --  | --  | --  | IP  |     OK     | From list rows                   |
| `/contacts/[id]/edit`        | --  | --  | --  | IP  |     OK     | From contact detail              |
| `/contacts/contact-types`    | --  | --  | SB  | --  |    YES     | Contacts sidebar                 |
| `/contacts/contact-settings` | --  | --  | SB  | --  |    YES     | Contacts sidebar                 |
| `/contacts/import-export`    | --  | --  | SB  | --  |    YES     | Contacts sidebar                 |

### Deals (10 routes)

| Route                    |  H  | UM  |   SB   | IP  | Reachable? | Notes                               |
| ------------------------ | :-: | :-: | :----: | :-: | :--------: | ----------------------------------- |
| `/deals`                 | YES | --  |   SB   | --  |    YES     |                                     |
| `/deals/new`             | --  | --  |   --   | IP  |     OK     | List action button                  |
| `/deals/trash`           | --  | --  |   SB   | --  |    YES     | Deals sidebar: Trash folder         |
| `/deals/forecast`        | --  | --  |   SB   | --  |    YES     | Sidebar: Deal Views                 |
| `/deals/all/forecast`    | --  | --  |   --   | IP  |     OK     | Legacy redirect → `/deals/forecast` |
| `/deals/[id]`            | --  | --  |   --   | IP  |     OK     | From list/pipeline                  |
| `/deals/[id]/forecast`   | --  | --  | **NO** | IP  |   VERIFY   | Nested under deal detail            |
| `/deals/deal-stages`     | --  | --  |   SB   | --  |    YES     | Deals sidebar: Configuration        |
| `/deals/deal-settings`   | --  | --  |   SB   | --  |    YES     | Deals sidebar: Configuration        |
| `/deals/deal-automation` | --  | --  |   SB   | --  |    YES     | Deals sidebar: Configuration        |

### Documents (6 routes)

| Route                          |  H  | UM  | SB  | IP  | Reachable? | Notes                            |
| ------------------------------ | :-: | :-: | :-: | :-: | :--------: | -------------------------------- |
| `/documents`                   | YES | --  | SB  | IP  |    YES     | Header nav + home quick actions  |
| `/documents/new`               | --  | --  | --  | IP  |     OK     | Home quick actions + list action |
| `/documents/[id]`              | --  | --  | --  | IP  |     OK     | From list rows                   |
| `/documents/document-types`    | --  | --  | SB  | --  |    YES     | Documents sidebar                |
| `/documents/storage-policies`  | --  | --  | SB  | --  |    YES     | Documents sidebar                |
| `/documents/document-settings` | --  | --  | SB  | --  |    YES     | Documents sidebar                |

### Email (6 routes)

| Route                   |  H  | UM  | SB  | IP  | Reachable? | Notes                       |
| ----------------------- | :-: | :-: | :-: | :-: | :--------: | --------------------------- |
| `/email`                | YES | --  | SB  | --  |    YES     | Header nav + sidebar wired  |
| `/email/[id]`           | --  | --  | --  | IP  |     OK     | From inbox rows             |
| `/email/compose`        | --  | --  | --  | IP  |     OK     | Compose button in email app |
| `/email/templates`      | --  | --  | SB  | --  |    YES     | Email sidebar               |
| `/email/signatures`     | --  | --  | SB  | --  |    YES     | Email sidebar               |
| `/email/email-settings` | --  | --  | SB  | --  |    YES     | Email sidebar               |

### Governance (10 routes)

| Route                                        |  H  | UM  | SB  | IP  | Reachable? | Notes                                   |
| -------------------------------------------- | :-: | :-: | :-: | :-: | :--------: | --------------------------------------- |
| `/governance`                                | --  | YES | SB  | --  |    YES     | User menu + settings sidebar cross-link |
| `/governance/adr`                            | --  | --  | SB  | --  |    YES     |                                         |
| `/governance/compliance`                     | --  | --  | SB  | --  |    YES     |                                         |
| `/governance/policies`                       | --  | --  | SB  | --  |    YES     |                                         |
| `/governance/quality-reports`                | --  | --  | SB  | --  |    YES     |                                         |
| `/governance/quality-reports/[reportId]`     | --  | --  | --  | IP  |     OK     | From quality reports list               |
| `/governance/quality-reports/lighthouse`     | --  | --  | SB  | --  |    YES     | Governance sidebar                      |
| `/governance/quality-reports/coverage`       | --  | --  | SB  | --  |    YES     | Governance sidebar                      |
| `/governance/quality-reports/performance`    | --  | --  | SB  | --  |    YES     | Governance sidebar                      |
| `/governance/quality-reports/trpc-benchmark` | --  | --  | SB  | --  |    YES     | Governance sidebar                      |

### Leads (7 routes)

| Route                  |  H  | UM  | SB  | IP  | Reachable? | Notes                        |
| ---------------------- | :-: | :-: | :-: | :-: | :--------: | ---------------------------- |
| `/leads`               | YES | --  | SB  | --  |    YES     |                              |
| `/leads/new`           | --  | --  | --  | IP  |     OK     | List action                  |
| `/leads/[id]`          | --  | --  | --  | IP  |     OK     | From list rows               |
| `/leads/[id]/edit`     | --  | --  | --  | IP  |     OK     | From lead detail             |
| `/leads/pipeline`      | --  | --  | SB  | --  |    YES     | Leads sidebar: Views         |
| `/leads/routing`       | --  | --  | SB  | --  |    YES     | Leads sidebar: Configuration |
| `/leads/lead-settings` | --  | --  | SB  | --  |    YES     | Leads sidebar: settingsHref  |

### Notifications (4 routes)

| Route                        |  H  | UM  | SB  | IP  | Reachable? | Notes                          |
| ---------------------------- | :-: | :-: | :-: | :-: | :--------: | ------------------------------ |
| `/notifications`             | --  | --  | SB  | IP  |    YES     | Bell icon in header            |
| `/notifications/settings`    | --  | --  | SB  | --  |    YES     | Sidebar settingsHref           |
| `/notifications/channels`    | --  | --  | SB  | --  |    YES     | Notifications sidebar (PG-174) |
| `/notifications/quiet-hours` | --  | --  | SB  | --  |    YES     | Notifications sidebar (PG-174) |

### Profile (1 route)

| Route      |  H  | UM  | SB  | IP  | Reachable? | Notes     |
| ---------- | :-: | :-: | :-: | :-: | :--------: | --------- |
| `/profile` | --  | YES | --  | --  |    YES     | User menu |

### Settings (10 routes + 3 cross-links)

| Route                     |  H  | UM  | SB  | IP  | Reachable? | Notes                                                                               |
| ------------------------- | :-: | :-: | :-: | :-: | :--------: | ----------------------------------------------------------------------------------- |
| `/settings`               | --  | YES | --  | --  |    YES     | User menu                                                                           |
| `/settings/account`       | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/ai`            | --  | --  | SB  | --  |    YES     | Also cross-linked from AI sidebar                                                   |
| `/settings/integrations`  | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/notifications` | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/pipeline`      | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/routing`       | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/security/mfa`  | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/team`          | --  | --  | SB  | --  |    YES     |                                                                                     |
| `/settings/automation`    | --  | --  | SB  | --  |    YES     | Settings sidebar "Automation" item — unified bento page for IFC-031 FU-011 + FU-012 |
| → `/billing`              | --  | --  | SB  | --  |    YES     | Settings sidebar "More" section — cross-link                                        |
| → `/governance`           | --  | --  | SB  | --  |    YES     | Settings sidebar "More" section — cross-link                                        |
| → `/docs`                 | --  | --  | SB  | --  |    YES     | Settings sidebar "More" section — SUPER_ADMIN only                                  |

### Tasks (5 routes)

| Route                  |  H  | UM  | SB  | IP  | Reachable? | Notes                      |
| ---------------------- | :-: | :-: | :-: | :-: | :--------: | -------------------------- |
| `/tasks`               | YES | --  | SB  | --  |    YES     | Header nav (CORE_CRM)      |
| `/tasks/[id]`          | --  | --  | --  | IP  |     OK     | From list rows             |
| `/tasks/task-types`    | --  | --  | SB  | --  |    YES     | Tasks sidebar              |
| `/tasks/task-settings` | --  | --  | SB  | --  |    YES     | Tasks sidebar settingsHref |
| `/tasks/automation`    | --  | --  | SB  | --  |    YES     | Tasks sidebar              |

### Tickets (6 routes)

| Route                   |  H  | UM  | SB  | IP  | Reachable? | Notes           |
| ----------------------- | :-: | :-: | :-: | :-: | :--------: | --------------- |
| `/tickets`              | YES | --  | SB  | --  |    YES     |                 |
| `/tickets/[id]`         | --  | --  | --  | IP  |     OK     | From list rows  |
| `/tickets/new`          | --  | --  | --  | IP  |     OK     | List action     |
| `/tickets/sla-policies` | --  | --  | SB  | --  |    YES     | Tickets sidebar |
| `/tickets/types`        | --  | --  | SB  | --  |    YES     | Tickets sidebar |
| `/tickets/automations`  | --  | --  | SB  | --  |    YES     | Tickets sidebar |

### Developer Docs (4 routes)

| Route                |  H  | UM  | SB  | IP  | Reachable? | Notes                                             |
| -------------------- | :-: | :-: | :-: | :-: | :--------: | ------------------------------------------------- |
| `/docs`              | --  | --  | SB  | --  |    YES     | Settings sidebar "More" section, SUPER_ADMIN only |
| `/docs/api`          | --  | --  | SB  | --  |    YES     | Developer sidebar                                 |
| `/docs/integrations` | --  | --  | SB  | --  |    YES     | Developer sidebar                                 |
| `/docs/webhooks`     | --  | --  | SB  | --  |    YES     | Developer sidebar                                 |

### Developer Portal (5 routes)

| Route                        |  H  | UM  | SB  | IP  | Reachable? | Notes                                |
| ---------------------------- | :-: | :-: | :-: | :-: | :--------: | ------------------------------------ |
| `/developers`                | --  | --  | SB  | --  |    YES     | Developer sidebar                    |
| `/developers/apps`           | --  | --  | SB  | --  |    YES     | Developer sidebar                    |
| `/developers/apps/new`       | --  | --  | --  | IP  |    YES     | List page action button              |
| `/developers/apps/[id]`      | --  | --  | --  | IP  |    YES     | List table row link                  |
| `/developers/apps/[id]/edit` | --  | --  | --  | IP  |    YES     | Detail page breadcrumb + edit action |

---

## 4. Issues: Ghost Links

> **All 28 previously identified ghost links have been resolved** — page.tsx
> files now exist for all routes. The table below is preserved for historical
> reference with updated status.

| #    | Route                                     | Source                                  | Severity   | Status      | Resolved By |
| ---- | ----------------------------------------- | --------------------------------------- | ---------- | ----------- | ----------- |
| G-01 | `/billing/usage`                          | billing.ts sidebar                      | **HIGH**   | ✅ RESOLVED | PG-172      |
| G-02 | `/billing/plans`                          | billing.ts sidebar + billing-portal.tsx | **HIGH**   | ✅ RESOLVED | PG-172      |
| G-03 | `/billing/upgrade`                        | billing.ts sidebar                      | **HIGH**   | ✅ RESOLVED | PG-172      |
| G-04 | `/billing/cancel`                         | billing-portal.tsx                      | **MEDIUM** | ✅ RESOLVED | PG-172      |
| G-05 | `/billing/settings`                       | billing-portal.tsx                      | **MEDIUM** | ✅ RESOLVED | PG-172      |
| G-06 | `/tickets/sla-policies`                   | tickets.ts sidebar                      | **MEDIUM** | ✅ RESOLVED | PG-173      |
| G-07 | `/tickets/types`                          | tickets.ts sidebar                      | **MEDIUM** | ✅ RESOLVED | PG-173      |
| G-08 | `/tickets/automations`                    | tickets.ts sidebar                      | **MEDIUM** | ✅ RESOLVED | PG-173      |
| G-09 | `/notifications/channels`                 | notifications.ts sidebar                | **MEDIUM** | ✅ RESOLVED | PG-174      |
| G-10 | `/notifications/quiet-hours`              | notifications.ts sidebar                | **MEDIUM** | ✅ RESOLVED | PG-174      |
| G-11 | `/deals/trash`                            | deals.ts sidebar                        | **LOW**    | ✅ RESOLVED | PG-175      |
| G-12 | `/governance/quality-reports/lighthouse`  | governance.ts sidebar                   | **LOW**    | ✅ RESOLVED | PG-176      |
| G-13 | `/governance/quality-reports/coverage`    | governance.ts sidebar                   | **LOW**    | ✅ RESOLVED | PG-176      |
| G-14 | `/governance/quality-reports/performance` | governance.ts sidebar                   | **LOW**    | ✅ RESOLVED | PG-176      |
| G-15 | `/analytics/saved/weekly`                 | analytics.ts sidebar                    | **LOW**    | ✅ RESOLVED | PG-177      |
| G-16 | `/analytics/saved/monthly`                | analytics.ts sidebar                    | **LOW**    | ✅ RESOLVED | PG-177      |
| G-17 | `/analytics/saved/quarterly`              | analytics.ts sidebar                    | **LOW**    | ✅ RESOLVED | PG-177      |
| G-18 | `/settings/appointments`                  | appointments.ts settingsHref            | **LOW**    | ✅ RESOLVED | PG-178      |
| G-19 | `/settings/cases`                         | cases.ts settingsHref                   | **LOW**    | ✅ RESOLVED | PG-178      |
| G-20 | `/settings/tasks`                         | tasks.ts settingsHref                   | **LOW**    | ✅ RESOLVED | PG-178      |
| G-21 | `/settings/leads`                         | leads.ts settingsHref                   | **LOW**    | ✅ RESOLVED | PG-178      |
| G-22 | `/settings/contacts`                      | contacts.ts settingsHref                | **LOW**    | ✅ RESOLVED | PG-178      |
| G-23 | `/settings/accounts`                      | accounts.ts settingsHref                | **LOW**    | ✅ RESOLVED | PG-178      |
| G-24 | `/settings/deals`                         | deals.ts settingsHref                   | **LOW**    | ✅ RESOLVED | PG-178      |
| G-25 | `/settings/tickets`                       | tickets.ts settingsHref                 | **LOW**    | ✅ RESOLVED | PG-178      |
| G-26 | `/settings/documents`                     | documents.ts settingsHref               | **LOW**    | ✅ RESOLVED | PG-178      |
| G-27 | `/settings/reports`                       | analytics.ts settingsHref               | **LOW**    | ✅ RESOLVED | PG-178      |
| G-28 | `/settings/billing`                       | ModulePaywall.tsx                       | **LOW**    | ✅ RESOLVED | PG-178      |

**Current open ghost links**: None.

### New route introduced by PG-180 (sprint-18, 2026-04-20)

| Route                            | Reachability                                                                                                                                                                                                                                                                                                                                                                  | Notes                                                                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/settings/help-center/articles` | **Settings sidebar** — `apps/web/src/components/sidebar/configs/settings.ts` item id `help-center-articles` (label "Help Articles", icon `menu_book`, `roles: ['ADMIN', 'MANAGER']`). Server-side role gate in `apps/web/src/app/settings/help-center/articles/page.tsx` provides defence-in-depth (renders `ForbiddenSurface` if the server session role is not privileged). | USER role sees neither the sidebar item (filtered by `AppSidebar.tsx:110`) nor any content (server shell short-circuits). No ghost-link risk. Spec §2 "sidebar deferred" exemption reversed in this correction commit. |

## 5. Issues: Broken In-Page Links

Links in components that point to non-functional targets.

| #    | Source                             | Target                | Issue                                                        | Severity   | Status      |
| ---- | ---------------------------------- | --------------------- | ------------------------------------------------------------ | ---------- | ----------- |
| B-01 | `agent-approvals/preview/page.tsx` | "View History" button | `<Button>` with no `href` or `onClick` — non-functional      | **LOW**    | Open        |
| B-02 | `billing-portal.tsx`               | `/billing/cancel`     | Previously linked to non-existent page (= G-04) — now exists | **MEDIUM** | ✅ RESOLVED |
| B-03 | `billing-portal.tsx`               | `/billing/settings`   | Previously linked to non-existent page (= G-05) — now exists | **MEDIUM** | ✅ RESOLVED |
| B-04 | `billing-portal.tsx`               | `/billing/plans`      | Previously linked to non-existent page (= G-02) — now exists | **MEDIUM** | ✅ RESOLVED |

---

## 6. Module Reachability Matrix

How each module section can be initially reached by a user.

| Module         | Header Nav | User Menu | Bell Icon |                Cross-Link From                |    Overall    |
| -------------- | :--------: | :-------: | :-------: | :-------------------------------------------: | :-----------: |
| Dashboard      |    YES     |    --     |    --     |                     Logo                      | **REACHABLE** |
| Leads          |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Contacts       |    YES     |    --     |    --     |              CaseForm cross-link              | **REACHABLE** |
| Accounts       |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Deals          |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Tasks          |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Calendar       |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Email          |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Cases          |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Tickets        |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| AI & Agents    |    YES     |    --     |    --     |         Governance sidebar cross-link         | **REACHABLE** |
| Analytics      |    YES     |    --     |    --     |                      --                       | **REACHABLE** |
| Documents      |    YES     |    --     |    --     |              Home quick actions               | **REACHABLE** |
| Profile        |     --     |    YES    |    --     |                      --                       | **REACHABLE** |
| Settings       |     --     |    YES    |    --     |                      --                       | **REACHABLE** |
| Governance     |     --     |    YES    |    --     |          Settings sidebar cross-link          | **REACHABLE** |
| Notifications  |     --     |    --     |    YES    |                      --                       | **REACHABLE** |
| Billing        |     --     |    --     |    --     |        Settings sidebar "More" section        | **REACHABLE** |
| Developer Docs |     --     |    --     |    --     | Settings sidebar "More" section (SUPER_ADMIN) | **REACHABLE** |
| Appointments   |     --     |    --     |    --     |    Appointments sidebar (dedicated table)     | **REACHABLE** |

### Role-Based Sidebar Filtering

`SidebarItem` supports a `roles?: string[]` field. Both `AppSidebar` and
`MobileSidebar` filter items based on the current user's role from `useAuth()`.
Items with `roles` set are only shown if the user's role matches. Currently used
for Developer Docs (SUPER_ADMIN only).

---

## 7. Completed Work (Sprint 16)

All 28 ghost links tracked in Sprint 16 have been **implemented**. The
corresponding `page.tsx` files now exist for all routes:

| Task       | Pages                            | Routes                                                                                                                                       | Status  |
| ---------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **PG-172** | Billing ghost pages (5)          | `/billing/usage`, `/billing/plans`, `/billing/upgrade`, `/billing/cancel`, `/billing/settings`                                               | ✅ DONE |
| **PG-173** | Ticket config pages (3)          | `/tickets/sla-policies`, `/tickets/types`, `/tickets/automations`                                                                            | ✅ DONE |
| **PG-174** | Notification config pages (2)    | `/notifications/channels`, `/notifications/quiet-hours`                                                                                      | ✅ DONE |
| **PG-175** | Deals trash page (1)             | `/deals/trash`                                                                                                                               | ✅ DONE |
| **PG-176** | Governance quality sub-pages (3) | `/governance/quality-reports/lighthouse`, `/coverage`, `/performance`                                                                        | ✅ DONE |
| **PG-177** | Analytics saved reports (3)      | `/analytics/saved/weekly`, `/monthly`, `/quarterly`                                                                                          | ✅ DONE |
| **PG-178** | Module settings pages (11)       | `/settings/leads`, `/contacts`, `/accounts`, `/deals`, `/tickets`, `/documents`, `/reports`, `/billing`, `/appointments`, `/cases`, `/tasks` | ✅ DONE |

Additionally, the following pages were built without a Sprint 16 task (docs not
updated at ship time):

- Accounts: `account-settings`, `account-tiers`, `territory-mapping`
- AI: `ai-settings`, `approval-policies`, `model-config` (under
  `/agent-approvals`)
- Analytics: `report-templates`, `scheduled-reports`, `report-settings`
- Appointments: dedicated `/appointments` section (separate from `/calendar`)
- AUP: `/aup` public page
- Calendar: `availability`, `event-types`, `calendar-settings`
- Cases: `case-types`, `case-settings`, `case-workflows/[id]`,
  `case-workflows/new`
- Contacts: `contact-types`, `contact-settings`, `import-export`
- Deals: `deal-stages`, `deal-settings`, `deal-automation`
- Documents: `document-types`, `storage-policies`, `document-settings`
- Email: `compose`, `templates`, `signatures`, `email-settings`
- Governance: `quality-reports/trpc-benchmark`
- Leads: `pipeline`, `routing`, `lead-settings`
- Tasks: `task-types`, `task-settings`, `automation`

### Process Safeguards (implemented)

To prevent unreachable pages from shipping again:

- **Phase 0.92** added to spec-session: UI Reachability Verification (mandatory
  for UI tasks)
- **Plan-session** dependency check extended: navigation entry must exist or be
  planned
- **Plan-reviewer Category Y** (items 81-85): UI Reachability review
- **Round 3 CHALLENGE**: UI Reachability sub-check for integration issues

---

## Data Sources

| Source             | Path                                                          | Used For                                                   |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------------------------- |
| Page routes        | `apps/web/src/app/**/page.tsx` (209 files)                    | All existing pages                                         |
| Sidebar configs    | `apps/web/src/components/sidebar/configs/*.ts` (17 files)     | Sidebar nav entries                                        |
| Navigation         | `apps/web/src/components/navigation.tsx`                      | Active header — uses useEnabledModules()                   |
| Module routes      | `packages/domain/src/platform/modules/ModuleRoutes.ts`        | Dynamic header route source                                |
| Module hook        | `apps/web/src/hooks/useEnabledModules.ts`                     | Queries backend for enabled modules                        |
| Auth context       | `apps/web/src/lib/auth/AuthContext.tsx`                       | `useAuth()` → `user.role` for role-based sidebar filtering |
| User menu          | `apps/web/src/components/header/user-menu.tsx`                | Dropdown menu links                                        |
| Notifications      | `apps/web/src/components/header/notifications.tsx`            | Bell icon link                                             |
| Layout files       | `apps/web/src/app/**/layout.tsx`                              | Which sidebar config is wired                              |
| Page registry      | `docs/design/page-registry.md`                                | Planned pages with KPIs                                    |
| Sitemap            | `docs/design/sitemap.md`                                      | Visual route map (257 pages)                               |
| Page map & flows   | `docs/design/PAGE_MAP_AND_FLOWS.md`                           | Complete page map + 42 user flows                          |
| UI flow mapping    | `docs/design/ui-flow-mapping.md`                              | Route → Flow → Component → API matrix                      |
| Sprint plan        | `apps/project-tracker/docs/metrics/_global/Sprint_plan_*.csv` | PG-\* task status                                          |
| Dependency chains  | `docs/architecture/diagrams/complete-dependency-chains.md`    | UI → API dependencies                                      |
| Billing components | `apps/web/src/components/billing/*.tsx`                       | In-page billing links                                      |
| Case components    | `apps/web/src/components/cases/*.tsx`                         | In-page case links                                         |
| Home components    | `apps/web/src/components/home/*.tsx`                          | Quick action links                                         |
