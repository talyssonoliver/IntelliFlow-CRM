# IntelliFlow CRM - Information Architecture

> **Location**: `docs/design/information-architecture.md` **Last Updated**:
> 2026-05-02 **Total Pages**: 208 | **Total Flows**: 48 | **API Routers**: 60
> (366 procedures) | **Ghost Links**: 0

> **Canonical counts**: "Total Pages" reflects the filesystem total emitted by
> `tools/scripts/content-audit.ts` (each `page.tsx` under `apps/web/src/app/**`
> counts once; route groups stripped; `[id]` collapses; `app/api/` excluded).
> The Section 8 summary table below uses the same canonical denominator. See
> `docs/design/content-audit.md` for the full counting rule. Verified:
> 2026-04-26.

---

## 1. Introduction & Scope

### 1.1 What This Document Is

A single unified reference for all routes, flows, navigation layers, API
routers, and layout patterns in the IntelliFlow CRM web application. It
consolidates data from 4 source documents into a module-by-module route
inventory with cross-references.

### 1.2 What This Document Is Not

- **NOT** a replacement for the source documents — each retains its
  domain-specific detail
- **NOT** containing KPIs, RACI assignments, E2E test paths, or unit test paths
  — see `page-registry.md`
- **NOT** containing flow YAML specs or Mermaid diagrams — see `flows/FLOW-*.md`
- **NOT** containing style guide tokens or component patterns — see
  `style-guide.md`

### 1.3 Document Ecosystem

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     INFORMATION ARCHITECTURE ECOSYSTEM                    │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ┌──────────────────────────┐    ┌──────────────────────────┐          │
│   │  navigation-reachability │    │  ui-flow-mapping.md      │          │
│   │  -audit.md               │    │  Route→Flow→Component    │          │
│   │  Nav layers, ghost links │    │  →API matrix             │          │
│   └───────────┬──────────────┘    └───────────┬──────────────┘          │
│               │                               │                          │
│               └──────────┐    ┌───────────────┘                          │
│                          ▼    ▼                                          │
│              ┌───────────────────────────────┐                           │
│              │  THIS DOCUMENT                │                           │
│              │  information-architecture.md  │                           │
│              │  Unified IA Reference         │                           │
│              └───────────┬───────────────────┘                           │
│                          ▲    ▲                                          │
│               ┌──────────┘    └───────────────┐                          │
│               │                               │                          │
│   ┌───────────┴──────────────┐    ┌───────────┴──────────────┐          │
│   │  PAGE_MAP_AND_FLOWS.md   │    │  page-registry.md        │          │
│   │  Visual sitemap,         │    │  Per-page specs: Task ID,│          │
│   │  20-category page map    │    │  KPI, RACI, file paths   │          │
│   └──────────────────────────┘    └──────────────────────────┘          │
│                                                                          │
│   ┌──────────────────────────┐                                          │
│   │  sitemap.md              │                                          │
│   │  Hierarchical route tree │                                          │
│   └──────────────────────────┘                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**Quick Links**

| Document                      | Path                                           | Key Data                                     |
| ----------------------------- | ---------------------------------------------- | -------------------------------------------- |
| Navigation Reachability Audit | `docs/design/navigation-reachability-audit.md` | Nav layers, ghost links, reachability matrix |
| UI Flow Mapping               | `docs/design/ui-flow-mapping.md`               | Route→Flow→Component→API matrix              |
| Page Map & Flows              | `docs/design/PAGE_MAP_AND_FLOWS.md`            | Visual sitemap, 20-category page map         |
| Page Registry                 | `docs/design/page-registry.md`                 | Per-page specs: Task ID, KPI, RACI           |
| Sitemap                       | `docs/design/sitemap.md`                       | Hierarchical route tree                      |

### 1.4 Conflict Resolution Log

| #     | Topic                        | Resolution                                                                                                                    | Canonical Source                            | Stale Source                                                         |
| ----- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | -------------------------------------------------------------------- |
| CR-01 | Developer Portal route count | **5 routes** (not 4). `/developers/apps` exists on disk at `(developer)/developers/apps/page.tsx`.                            | `page-registry.md`, `PAGE_MAP_AND_FLOWS.md` | `navigation-reachability-audit.md` (listed 4 under "Developer Docs") |
| CR-02 | `/calendar` primary flow     | **FLOW-019** ("Agendamento de Reunioes"). FLOW-020 in ui-flow-mapping.md is an error — FLOW-020 is the unified activity feed. | `FLOW-019.md` semantics                     | `ui-flow-mapping.md` (incorrectly lists FLOW-020)                    |
| CR-03 | `/cases` flow count          | **Dual flows**: FLOW-011 (case creation) primary + FLOW-041 (RAG retrieval) secondary. Both valid per flow specs.             | Both `FLOW-011.md` and `FLOW-041.md`        | N/A (not a conflict per se, but multiple docs only list one)         |
| CR-04 | API router count             | **39 routers / 366 procedures** per `router.ts` and `ui-flow-mapping.md` v3.0.                                                | `router.ts`, `ui-flow-mapping.md`           | `sitemap.md` (stale at 25/232)                                       |
| CR-05 | Flow count                   | **48 flows** on disk (`FLOW-*.md` files).                                                                                     | Filesystem count                            | `ui-flow-mapping.md` (42), `flow-index.md` (47)                      |

---

## 2. Navigation Architecture

### 2.1 Four Navigation Layers

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

**Source Files**

| Component          | File                                                       | Role                                       |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------ |
| Navigation         | `apps/web/src/components/navigation.tsx`                   | Active header — uses `useEnabledModules()` |
| Module Hook        | `apps/web/src/hooks/useEnabledModules.ts`                  | Queries backend for enabled modules        |
| Domain Routes      | `packages/domain/src/platform/modules/ModuleRoutes.ts`     | Module-gated nav route definitions         |
| Main Nav           | `apps/web/src/components/header/main-nav.tsx`              | Renders header links from routes prop      |
| User Menu          | `apps/web/src/components/header/user-menu.tsx`             | Profile, Settings, Governance, Sign out    |
| Notifications Bell | `apps/web/src/components/header/notifications.tsx`         | Bell icon → popover                        |
| Sidebar            | `apps/web/src/components/sidebar/AppSidebar.tsx`           | Collapsible left sidebar                   |
| Sidebar Context    | `apps/web/src/components/sidebar/SidebarContext.tsx`       | Pin/hover state                            |
| Sidebar Types      | `apps/web/src/components/sidebar/sidebar-types.ts`         | SidebarConfig, SidebarItem, SidebarSection |
| Sidebar Portal     | `apps/web/src/components/sidebar/SidebarPortalContext.tsx` | Dynamic sidebar injection                  |
| Icon Reference     | `apps/web/src/components/sidebar/icon-reference.ts`        | MODULE_COLORS, MODULE_ICONS, VIEW_ICONS    |
| Sidebar Configs    | `apps/web/src/components/sidebar/configs/*.ts`             | 17 config files (see table below)          |
| Root Layout        | `apps/web/src/app/layout.tsx`                              | Renders `<Navigation />`                   |

**Sidebar Config Files (17)**

| Module          | Config File                  |
| --------------- | ---------------------------- |
| Leads           | `configs/leads.ts`           |
| Contacts        | `configs/contacts.ts`        |
| Accounts        | `configs/accounts.ts`        |
| Documents       | `configs/documents.ts`       |
| Deals           | `configs/deals.ts`           |
| Tasks           | `configs/tasks.ts`           |
| Appointments    | `configs/appointments.ts`    |
| Email           | `configs/email.ts`           |
| Cases           | `configs/cases.ts`           |
| Tickets         | `configs/tickets.ts`         |
| Analytics       | `configs/analytics.ts`       |
| Agent Approvals | `configs/agent-approvals.ts` |
| Notifications   | `configs/notifications.ts`   |
| Governance      | `configs/governance.ts`      |
| Settings        | `configs/settings.ts`        |
| Billing         | `configs/billing.ts`         |
| Developer       | `configs/developer.ts`       |

### 2.2 Navigation Layer Legend

| Symbol | Meaning                                           |
| ------ | ------------------------------------------------- |
| **H**  | Header nav link (via ModuleRoutes.ts)             |
| **UM** | User menu dropdown                                |
| **SB** | Sidebar config entry                              |
| **IP** | In-page link (breadcrumb, button, data table row) |
| **--** | No entry (unreachable from that layer)            |

**Status Symbols**

| Status      | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| Implemented | Page uses live tRPC/REST data from backend             |
| Hardcoded   | Page displays static/mock data (backend not yet wired) |
| Partial     | Some data live, some hardcoded constants               |
| Placeholder | Stub page with minimal content                         |

---

## 3. Implemented Routes — Module-Centric Tables

Each module section contains a Markdown table with 8 columns:

| Column     | Source                           | Notes                                        |
| ---------- | -------------------------------- | -------------------------------------------- |
| Route      | All docs                         | URL path                                     |
| File Path  | page-registry.md                 | Relative to `apps/web/src/app/`              |
| Task ID    | Sprint_plan.csv                  | Primary task first. `—` if none.             |
| Flow ID    | ui-flow-mapping.md               | Pointer only. `—` if none.                   |
| API Router | ui-flow-mapping.md               | Dot-notation. `N/A` for static pages.        |
| Nav Layers | navigation-reachability-audit.md | Space-separated: `H SB IP`                   |
| Status     | page-registry.md                 | Implemented, Hardcoded, Partial, Placeholder |
| Ghost?     | navigation-reachability-audit.md | `YES` or `--`                                |

### 3.1 Public / Marketing (25 routes)

All public routes use `PublicHeader` + `PublicFooter`. No sidebar, no user menu.
Located in `(public)` route group.

| Route                      | File Path                                   | Task ID | Flow ID  | API Router | Nav Layers | Status      | Ghost? |
| -------------------------- | ------------------------------------------- | ------- | -------- | ---------- | ---------- | ----------- | ------ |
| `/`                        | `(public)/page.tsx`                         | PG-001  | —        | N/A        | H          | Implemented | --     |
| `/about`                   | `(public)/about/page.tsx`                   | PG-004  | —        | N/A        | IP         | Implemented | --     |
| `/blog`                    | `(public)/blog/page.tsx`                    | —       | —        | N/A        | H IP       | Implemented | --     |
| `/blog/[slug]`             | `(public)/blog/[slug]/page.tsx`             | —       | —        | N/A        | IP         | Implemented | --     |
| `/careers`                 | `(public)/careers/page.tsx`                 | —       | —        | N/A        | IP         | Implemented | --     |
| `/careers/[id]`            | `(public)/careers/[id]/page.tsx`            | —       | —        | N/A        | IP         | Implemented | --     |
| `/contact`                 | `(public)/contact/page.tsx`                 | —       | —        | N/A        | H IP       | Implemented | --     |
| `/features`                | `(public)/features/page.tsx`                | PG-002  | —        | N/A        | H          | Implemented | --     |
| `/login`                   | `(public)/login/page.tsx`                   | PG-015  | FLOW-001 | `auth.*`   | H          | Implemented | --     |
| `/signup`                  | `(public)/signup/page.tsx`                  | PG-016  | FLOW-001 | `auth.*`   | H          | Implemented | --     |
| `/signup/success`          | `(public)/signup/success/page.tsx`          | PG-017  | FLOW-001 | N/A        | IP         | Implemented | --     |
| `/forgot-password`         | `(public)/forgot-password/page.tsx`         | PG-018  | FLOW-003 | `auth.*`   | IP         | Implemented | --     |
| `/reset-password/[token]`  | `(public)/reset-password/[token]/page.tsx`  | PG-019  | FLOW-003 | `auth.*`   | IP         | Implemented | --     |
| `/reset-password/callback` | `(public)/reset-password/callback/page.tsx` | —       | FLOW-003 | `auth.*`   | IP         | Implemented | --     |
| `/logout`                  | `(public)/logout/page.tsx`                  | —       | —        | `auth.*`   | UM         | Implemented | --     |
| `/auth/callback`           | `(public)/auth/callback/page.tsx`           | —       | FLOW-001 | `auth.*`   | IP         | Implemented | --     |
| `/mfa/verify`              | `(public)/mfa/verify/page.tsx`              | PG-020  | FLOW-001 | `auth.*`   | IP         | Implemented | --     |
| `/verify-email/[token]`    | `(public)/verify-email/[token]/page.tsx`    | —       | FLOW-001 | `auth.*`   | IP         | Implemented | --     |
| `/verify-email/callback`   | `(public)/verify-email/callback/page.tsx`   | —       | FLOW-001 | `auth.*`   | IP         | Implemented | --     |
| `/lp/[slug]`               | `(public)/lp/[slug]/page.tsx`               | —       | —        | N/A        | IP         | Implemented | --     |
| `/partners`                | `(public)/partners/page.tsx`                | —       | —        | N/A        | IP         | Implemented | --     |
| `/press`                   | `(public)/press/page.tsx`                   | —       | —        | N/A        | IP         | Implemented | --     |
| `/pricing`                 | `(public)/pricing/page.tsx`                 | —       | FLOW-010 | N/A        | H IP       | Implemented | --     |
| `/security`                | `(public)/security/page.tsx`                | —       | —        | N/A        | IP         | Implemented | --     |
| `/status`                  | `(public)/status/page.tsx`                  | —       | —        | N/A        | IP         | Implemented | --     |

### 3.2 Developer Portal (14 routes)

Located in `(developer)` route group. Sidebar-gated via `roles: ['SUPER_ADMIN']`
in `settings.ts:85`. Uses `developerSidebarConfig` from `configs/developer.ts`.
**CR-01 resolved: 5 routes, not 4.**

| Route                        | File Path                                        | Task ID | Flow ID | API Router   | Nav Layers | Status      | Ghost? |
| ---------------------------- | ------------------------------------------------ | ------- | ------- | ------------ | ---------- | ----------- | ------ |
| `/developers/apps`           | `(developer)/developers/apps/page.tsx`           | —       | —       | N/A          | SB         | Implemented | --     |
| `/developers/apps/new`       | `(developer)/developers/apps/new/page.tsx`       | —       | —       | N/A          | IP         | Implemented | --     |
| `/developers/apps/[id]`      | `(developer)/developers/apps/[id]/page.tsx`      | —       | —       | N/A          | IP         | Implemented | --     |
| `/developers/apps/[id]/edit` | `(developer)/developers/apps/[id]/edit/page.tsx` | —       | —       | N/A          | IP         | Implemented | --     |
| `/docs`                      | `(developer)/docs/page.tsx`                      | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/api`                  | `(developer)/docs/api/page.tsx`                  | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/architecture`         | `(developer)/docs/architecture/page.tsx`         | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/auth`                 | `(developer)/docs/auth/page.tsx`                 | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/changelog`            | `(developer)/docs/changelog/page.tsx`            | PG-035  | —       | N/A          | SB         | Implemented | --     |
| `/docs/cli`                  | `(developer)/docs/cli/page.tsx`                  | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/guides`               | `(developer)/docs/guides/page.tsx`               | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/integrations`         | `(developer)/docs/integrations/page.tsx`         | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/sdk`                  | `(developer)/docs/sdk/page.tsx`                  | —       | —       | N/A          | SB         | Implemented | --     |
| `/docs/webhooks`             | `(developer)/docs/webhooks/page.tsx`             | —       | —       | `webhooks.*` | SB         | Implemented | --     |

### 3.3 Dashboard (3 routes)

| Route                  | File Path                      | Task ID    | Flow ID  | API Router    | Nav Layers | Status  | Ghost? |
| ---------------------- | ------------------------------ | ---------- | -------- | ------------- | ---------- | ------- | ------ |
| `/dashboard`           | `dashboard/page.tsx`           | ENV-009-AI | FLOW-025 | `analytics.*` | H IP       | Partial | --     |
| `/dashboard/new`       | `dashboard/new/page.tsx`       | —          | FLOW-024 | `analytics.*` | IP         | Partial | --     |
| `/dashboard/customize` | `dashboard/customize/page.tsx` | —          | FLOW-024 | `analytics.*` | IP         | Partial | --     |

### 3.4 Leads (4 routes)

| Route              | File Path                   | Task ID | Flow ID  | API Router | Nav Layers | Status      | Ghost? |
| ------------------ | --------------------------- | ------- | -------- | ---------- | ---------- | ----------- | ------ |
| `/leads`           | `leads/(list)/page.tsx`     | IFC-014 | FLOW-005 | `lead.*`   | H SB       | Implemented | --     |
| `/leads/new`       | `leads/(list)/new/page.tsx` | IFC-004 | FLOW-005 | `lead.*`   | IP         | Implemented | --     |
| `/leads/[id]`      | `leads/[id]/page.tsx`       | —       | FLOW-006 | `lead.*`   | IP         | Implemented | --     |
| `/leads/[id]/edit` | `leads/[id]/edit/page.tsx`  | —       | FLOW-006 | `lead.*`   | IP         | Implemented | --     |

### 3.5 Contacts (4 routes)

| Route                 | File Path                      | Task ID | Flow ID  | API Router  | Nav Layers | Status      | Ghost? |
| --------------------- | ------------------------------ | ------- | -------- | ----------- | ---------- | ----------- | ------ |
| `/contacts`           | `contacts/(list)/page.tsx`     | IFC-089 | FLOW-016 | `contact.*` | H SB       | Implemented | --     |
| `/contacts/new`       | `contacts/(list)/new/page.tsx` | —       | FLOW-016 | `contact.*` | IP         | Implemented | --     |
| `/contacts/[id]`      | `contacts/[id]/page.tsx`       | IFC-090 | FLOW-020 | `contact.*` | IP         | Implemented | --     |
| `/contacts/[id]/edit` | `contacts/[id]/edit/page.tsx`  | —       | FLOW-020 | `contact.*` | IP         | Implemented | --     |

### 3.6 Accounts (2 routes)

| Route            | File Path                  | Task ID | Flow ID  | API Router  | Nav Layers | Status      | Ghost? |
| ---------------- | -------------------------- | ------- | -------- | ----------- | ---------- | ----------- | ------ |
| `/accounts`      | `accounts/(list)/page.tsx` | —       | FLOW-016 | `account.*` | H SB       | Implemented | --     |
| `/accounts/[id]` | `accounts/[id]/page.tsx`   | —       | FLOW-016 | `account.*` | IP         | Hardcoded   | --     |

### 3.7 Deals (4 routes)

| Route                  | File Path                      | Task ID | Flow ID  | API Router       | Nav Layers | Status      | Ghost? |
| ---------------------- | ------------------------------ | ------- | -------- | ---------------- | ---------- | ----------- | ------ |
| `/deals`               | `deals/(list)/page.tsx`        | IFC-091 | FLOW-008 | `opportunity.*`  | H SB       | Implemented | --     |
| `/deals/[id]`          | `deals/[id]/page.tsx`          | —       | FLOW-008 | `opportunity.*`  | IP         | Implemented | --     |
| `/deals/[id]/forecast` | `deals/[id]/forecast/page.tsx` | IFC-092 | FLOW-024 | `intelligence.*` | IP         | Hardcoded   | --     |
| `/deals/forecast`      | `deals/forecast/page.tsx`      | —       | FLOW-025 | `intelligence.*` | SB         | Partial     | --     |

### 3.8 Tasks (2 routes)

| Route         | File Path               | Task ID | Flow ID  | API Router | Nav Layers | Status      | Ghost? |
| ------------- | ----------------------- | ------- | -------- | ---------- | ---------- | ----------- | ------ |
| `/tasks`      | `tasks/(list)/page.tsx` | —       | FLOW-020 | `task.*`   | H SB       | Implemented | --     |
| `/tasks/[id]` | `tasks/[id]/page.tsx`   | —       | FLOW-020 | `task.*`   | IP         | Implemented | --     |

### 3.9 Calendar (3 routes)

**CR-02 resolved**: Primary flow is FLOW-019 ("Agendamento de Reunioes"), not
FLOW-020.

| Route            | File Path                | Task ID | Flow ID  | API Router       | Nav Layers | Status      | Ghost? |
| ---------------- | ------------------------ | ------- | -------- | ---------------- | ---------- | ----------- | ------ |
| `/calendar`      | `calendar/page.tsx`      | —       | FLOW-019 | `appointments.*` | H SB       | Implemented | --     |
| `/calendar/new`  | `calendar/new/page.tsx`  | —       | FLOW-019 | `appointments.*` | IP         | Implemented | --     |
| `/calendar/[id]` | `calendar/[id]/page.tsx` | —       | FLOW-019 | `appointments.*` | IP         | Implemented | --     |

### 3.10 Email (2 routes)

| Route         | File Path             | Task ID | Flow ID  | API Router | Nav Layers | Status    | Ghost? |
| ------------- | --------------------- | ------- | -------- | ---------- | ---------- | --------- | ------ |
| `/email`      | `email/page.tsx`      | —       | FLOW-016 | `email.*`  | H SB       | Hardcoded | --     |
| `/email/[id]` | `email/[id]/page.tsx` | —       | FLOW-016 | `email.*`  | IP         | Hardcoded | --     |

### 3.11 Cases (4 routes)

**CR-03 resolved**: Dual flows — FLOW-011 (case creation) primary + FLOW-041
(RAG retrieval) secondary.

| Route             | File Path                   | Task ID | Flow ID             | API Router   | Nav Layers | Status      | Ghost? |
| ----------------- | --------------------------- | ------- | ------------------- | ------------ | ---------- | ----------- | ------ |
| `/cases`          | `cases/(list)/page.tsx`     | —       | FLOW-011 (FLOW-041) | `cases.*`    | H SB IP    | Implemented | --     |
| `/cases/new`      | `cases/(list)/new/page.tsx` | —       | FLOW-011            | `cases.*`    | IP         | Implemented | --     |
| `/cases/[id]`     | `cases/[id]/page.tsx`       | —       | FLOW-012            | `cases.*`    | IP         | Implemented | --     |
| `/cases/timeline` | `cases/timeline/page.tsx`   | IFC-147 | FLOW-020            | `timeline.*` | SB         | Implemented | --     |

### 3.12 Tickets (3 routes)

| Route           | File Path                     | Task ID | Flow ID  | API Router | Nav Layers | Status      | Ghost? |
| --------------- | ----------------------------- | ------- | -------- | ---------- | ---------- | ----------- | ------ |
| `/tickets`      | `tickets/(list)/page.tsx`     | IFC-093 | FLOW-011 | `ticket.*` | H SB       | Implemented | --     |
| `/tickets/new`  | `tickets/(list)/new/page.tsx` | —       | FLOW-011 | `ticket.*` | IP         | Implemented | --     |
| `/tickets/[id]` | `tickets/[id]/page.tsx`       | —       | FLOW-012 | `ticket.*` | IP         | Implemented | --     |

### 3.13 Documents (3 routes)

| Route             | File Path                       | Task ID | Flow ID  | API Router                | Nav Layers | Status      | Ghost? |
| ----------------- | ------------------------------- | ------- | -------- | ------------------------- | ---------- | ----------- | ------ |
| `/documents`      | `documents/(list)/page.tsx`     | IFC-094 | FLOW-039 | `documents.*`             | H SB IP    | Implemented | --     |
| `/documents/new`  | `documents/(list)/new/page.tsx` | —       | —        | `documents.*`, `upload.*` | IP         | Implemented | --     |
| `/documents/[id]` | `documents/[id]/page.tsx`       | —       | —        | `documents.*`             | IP         | Implemented | --     |

### 3.14 Analytics (2 routes)

| Route                 | File Path                     | Task ID | Flow ID  | API Router         | Nav Layers | Status    | Ghost? |
| --------------------- | ----------------------------- | ------- | -------- | ------------------ | ---------- | --------- | ------ |
| `/analytics`          | `analytics/(list)/page.tsx`   | IFC-096 | FLOW-023 | `analytics.*`      | H SB       | Partial   | --     |
| `/analytics/feedback` | `analytics/feedback/page.tsx` | —       | FLOW-015 | `feedbackSurvey.*` | SB         | Hardcoded | --     |

### 3.15 AI & Agent Approvals (14 routes)

| Route                             | File Path                                 | Task ID | Flow ID | API Router       | Nav Layers | Status      | Ghost? |
| --------------------------------- | ----------------------------------------- | ------- | ------- | ---------------- | ---------- | ----------- | ------ |
| `/agent-approvals`                | `agent-approvals/page.tsx`                | IFC-149 | —       | `agent.*`        | H SB       | Implemented | --     |
| `/agent-approvals/agents`         | `agent-approvals/agents/page.tsx`         | PG-151  | —       | `agent.*`        | SB         | Hardcoded   | --     |
| `/agent-approvals/ai-review`      | `agent-approvals/ai-review/page.tsx`      | IFC-181 | —       | `aiReview.*`     | SB         | Implemented | --     |
| `/agent-approvals/ai-review/[id]` | `agent-approvals/ai-review/[id]/page.tsx` | IFC-181 | —       | `aiReview.*`     | IP         | Implemented | --     |
| `/agent-approvals/ai-search`      | `agent-approvals/ai-search/page.tsx`      | PG-144  | —       | `intelligence.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/churn-risk`     | `agent-approvals/churn-risk/page.tsx`     | PG-143  | —       | `intelligence.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/drift`          | `agent-approvals/drift/page.tsx`          | PG-146  | —       | `aiMonitoring.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/experiments`    | `agent-approvals/experiments/page.tsx`    | PG-149  | —       | `experiment.*`   | SB         | Hardcoded   | --     |
| `/agent-approvals/history`        | `agent-approvals/history/page.tsx`        | PG-150  | —       | `agent.*`        | SB         | Hardcoded   | --     |
| `/agent-approvals/latency`        | `agent-approvals/latency/page.tsx`        | PG-153  | —       | `aiMonitoring.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/lead-scoring`   | `agent-approvals/lead-scoring/page.tsx`   | PG-148  | —       | `intelligence.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/logs`           | `agent-approvals/logs/page.tsx`           | PG-152  | —       | `aiMonitoring.*` | SB         | Hardcoded   | --     |
| `/agent-approvals/preview`        | `agent-approvals/preview/page.tsx`        | —       | —       | `aiReview.*`     | IP         | Hardcoded   | --     |
| `/agent-approvals/sentiment`      | `agent-approvals/sentiment/page.tsx`      | PG-142  | —       | `intelligence.*` | SB         | Hardcoded   | --     |

### 3.16 Billing (7 routes)

| Route                      | File Path                          | Task ID | Flow ID  | API Router  | Nav Layers | Status    | Ghost? |
| -------------------------- | ---------------------------------- | ------- | -------- | ----------- | ---------- | --------- | ------ |
| `/billing`                 | `billing/page.tsx`                 | —       | FLOW-010 | `billing.*` | SB         | Hardcoded | --     |
| `/billing/checkout`        | `billing/checkout/page.tsx`        | —       | FLOW-010 | `billing.*` | IP         | Hardcoded | --     |
| `/billing/invoices`        | `billing/invoices/page.tsx`        | —       | FLOW-010 | `billing.*` | SB IP      | Hardcoded | --     |
| `/billing/invoices/[id]`   | `billing/invoices/[id]/page.tsx`   | —       | FLOW-010 | `billing.*` | IP         | Hardcoded | --     |
| `/billing/payment-methods` | `billing/payment-methods/page.tsx` | —       | FLOW-010 | `billing.*` | SB IP      | Hardcoded | --     |
| `/billing/receipts`        | `billing/receipts/page.tsx`        | —       | FLOW-010 | `billing.*` | SB         | Hardcoded | --     |
| `/billing/subscriptions`   | `billing/subscriptions/page.tsx`   | —       | FLOW-010 | `billing.*` | SB         | Hardcoded | --     |

### 3.17 Settings (9 routes)

| Route                     | File Path                         | Task ID | Flow ID  | API Router         | Nav Layers | Status      | Ghost? |
| ------------------------- | --------------------------------- | ------- | -------- | ------------------ | ---------- | ----------- | ------ |
| `/settings`               | `settings/page.tsx`               | —       | —        | N/A                | UM         | Implemented | --     |
| `/settings/account`       | `settings/account/page.tsx`       | —       | FLOW-035 | `auth.*`           | SB         | Implemented | --     |
| `/settings/ai`            | `settings/ai/page.tsx`            | —       | FLOW-045 | `chainVersion.*`   | SB         | Implemented | --     |
| `/settings/integrations`  | `settings/integrations/page.tsx`  | —       | FLOW-036 | `integrations.*`   | SB         | Partial     | --     |
| `/settings/notifications` | `settings/notifications/page.tsx` | —       | FLOW-021 | N/A                | SB         | Hardcoded   | --     |
| `/settings/pipeline`      | `settings/pipeline/page.tsx`      | —       | FLOW-007 | `pipelineConfig.*` | SB         | Implemented | --     |
| `/settings/routing`       | `settings/routing/page.tsx`       | —       | —        | `routing.*`        | SB         | Hardcoded   | --     |
| `/settings/security/mfa`  | `settings/security/mfa/page.tsx`  | —       | FLOW-001 | `auth.*`           | SB         | Implemented | --     |
| `/settings/team`          | `settings/team/page.tsx`          | —       | FLOW-002 | `auth.*`           | SB         | Implemented | --     |

### 3.18 Governance (6 routes)

| Route                                    | File Path                                        | Task ID | Flow ID  | API Router               | Nav Layers | Status      | Ghost? |
| ---------------------------------------- | ------------------------------------------------ | ------- | -------- | ------------------------ | ---------- | ----------- | ------ |
| `/governance`                            | `governance/page.tsx`                            | —       | FLOW-032 | Local API                | UM SB      | Implemented | --     |
| `/governance/adr`                        | `governance/adr/page.tsx`                        | —       | FLOW-029 | `/api/adr/*`             | SB         | Implemented | --     |
| `/governance/compliance`                 | `governance/compliance/page.tsx`                 | —       | FLOW-032 | `/api/compliance/*`      | SB         | Implemented | --     |
| `/governance/policies`                   | `governance/policies/page.tsx`                   | —       | FLOW-032 | Local API                | SB         | Implemented | --     |
| `/governance/quality-reports`            | `governance/quality-reports/page.tsx`            | —       | FLOW-038 | `/api/quality-reports/*` | SB         | Implemented | --     |
| `/governance/quality-reports/[reportId]` | `governance/quality-reports/[reportId]/page.tsx` | —       | FLOW-038 | `/api/quality-reports/*` | IP         | Implemented | --     |

### 3.19 Notifications (2 routes)

| Route                     | File Path                         | Task ID | Flow ID  | API Router        | Nav Layers | Status      | Ghost? |
| ------------------------- | --------------------------------- | ------- | -------- | ----------------- | ---------- | ----------- | ------ |
| `/notifications`          | `notifications/page.tsx`          | —       | FLOW-022 | `notifications.*` | SB IP      | Implemented | --     |
| `/notifications/settings` | `notifications/settings/page.tsx` | —       | FLOW-021 | `notifications.*` | SB         | Implemented | --     |

### 3.20 Profile (1 route)

| Route      | File Path          | Task ID | Flow ID  | API Router | Nav Layers | Status      | Ghost? |
| ---------- | ------------------ | ------- | -------- | ---------- | ---------- | ----------- | ------ |
| `/profile` | `profile/page.tsx` | —       | FLOW-035 | `auth.*`   | UM         | Implemented | --     |

---

## 4. Ghost Links Register

Sidebar or in-page links pointing to routes that have no `page.tsx`. All 28
previously-tracked ghosts (G-01 through G-28) were resolved in sprints 16–17.
The register is currently empty. If a new ghost link is introduced, add a row
below with the columns
`# | Source Config | Link Label | Target URL | Issue Type | Resolution` (see git
history for prior examples).

| #   | Source Config | Link Label | Target URL | Issue Type | Resolution |
| --- | ------------- | ---------- | ---------- | ---------- | ---------- |

---

## 5. Cross-Module Navigation Patterns

Links in one module's sidebar/page that navigate to a different module's
existing route. These are intentional design patterns, not bugs.

| Source Module   | Link Location                | Target Route                 | Target Module    | Consequence                                                 |
| --------------- | ---------------------------- | ---------------------------- | ---------------- | ----------------------------------------------------------- |
| Governance      | `governance.ts` sidebar      | `/agent-approvals/ai-review` | Agent Approvals  | Sidebar context switches from governance to agent-approvals |
| Agent Approvals | `agent-approvals.ts` sidebar | `/settings/ai`               | Settings         | Sidebar context switches from AI to settings                |
| Settings        | `settings.ts` sidebar "More" | `/billing`                   | Billing          | Sidebar context switches from settings to billing           |
| Settings        | `settings.ts` sidebar "More" | `/governance`                | Governance       | Sidebar context switches from settings to governance        |
| Settings        | `settings.ts` sidebar "More" | `/docs`                      | Developer Portal | Sidebar context switches; SUPER_ADMIN only                  |

**Note**: The `/developers/apps` route in the developer portal does not have a
SUPER_ADMIN role restriction at the page level — only the sidebar link is gated.
Direct URL access is unrestricted.

---

## 6. Layout Patterns

Four distinct layout patterns used across modules.

| Pattern                                    | Description                                                                         | Modules                                                                        | Example File                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| **A: Server layout + `_layout-shell.tsx`** | RSC layout delegates to a Client Component shell for sidebar + state                | billing, agent-approvals, notifications, settings, email, calendar, governance | `apps/web/src/app/billing/_layout-shell.tsx` |
| **B: Direct Client Component layout**      | `'use client'` directly in `layout.tsx`, no shell separation                        | developer                                                                      | `apps/web/src/app/(developer)/layout.tsx`    |
| **C: `(list)` route group sidebar**        | Sidebar at `module/(list)/layout.tsx` for list views; detail pages are sidebar-free | accounts, analytics, cases, contacts, deals, documents, leads, tasks, tickets  | `apps/web/src/app/leads/(list)/layout.tsx`   |
| **D: Metadata-only**                       | No sidebar, passthrough layout with just `<title>` and `<meta>`                     | dashboard, profile                                                             | `apps/web/src/app/dashboard/layout.tsx`      |

---

## 7. Internal API Routes

19 endpoints across 5 groups. These are Next.js API routes (not tRPC).

### 7.1 tRPC Passthrough (1)

| Route              | Method | Description      |
| ------------------ | ------ | ---------------- |
| `/api/trpc/[trpc]` | ALL    | tRPC API handler |

### 7.2 ADR API (5)

| Route               | Method   | Description           |
| ------------------- | -------- | --------------------- |
| `/api/adr`          | GET      | List ADRs             |
| `/api/adr/create`   | POST     | Create new ADR        |
| `/api/adr/status`   | GET/POST | ADR status management |
| `/api/adr/validate` | POST     | Validate ADR          |
| `/api/adr/index`    | GET      | ADR index             |

### 7.3 Quality Reports API (7)

| Route                                   | Method | Description           |
| --------------------------------------- | ------ | --------------------- |
| `/api/quality-reports`                  | GET    | Quality reports list  |
| `/api/quality-reports/generate`         | POST   | Generate report       |
| `/api/quality-reports/status`           | GET    | Report status         |
| `/api/quality-reports/view`             | GET    | View report           |
| `/api/quality-reports/test-run`         | POST   | Trigger test run      |
| `/api/quality-reports/test-run/[runId]` | GET    | Test run status       |
| `/api/quality-reports/test-run/events`  | GET    | **SSE** events stream |

### 7.4 Compliance API (3)

| Route                          | Method | Description                 |
| ------------------------------ | ------ | --------------------------- |
| `/api/compliance/[standardId]` | GET    | Compliance standard details |
| `/api/compliance/risks`        | GET    | Compliance risks            |
| `/api/compliance/timeline`     | GET    | Compliance timeline         |

### 7.5 Utilities (3)

| Route                         | Method | Description                         |
| ----------------------------- | ------ | ----------------------------------- |
| `/api/avatar-proxy`           | GET    | Avatar image proxy with CORS bypass |
| `/api/openapi`                | GET    | OpenAPI JSON spec endpoint          |
| `/api/developer/webhook-test` | POST   | Webhook delivery test tool          |

---

## 8. Summary Statistics

### Page Counts

| Category        | Count |
| --------------- | ----- |
| **Total Pages** | 208   |
| Public Pages    | 32    |
| Developer Pages | 14    |
| Protected Pages | 162   |

### Flow Coverage

| Metric                           | Value                          |
| -------------------------------- | ------------------------------ |
| **Total Flows**                  | 48 (on disk)                   |
| Flows referenced in route tables | 23 distinct                    |
| Routes with no flow              | 42                             |
| Routes with dual flows           | 2 (`/cases`, `/contacts/[id]`) |

### API Coverage (CR-04 canonical)

| Metric                   | Value |
| ------------------------ | ----- |
| **API Routers**          | 40    |
| **Total Procedures**     | 366   |
| Routes with tRPC router  | 66    |
| Routes with N/A (static) | 30    |
| Routes with Local API    | 7     |

### Nav Layer Coverage

| Layer              | Routes Reached |
| ------------------ | -------------- |
| **H** (Header)     | 13 modules     |
| **UM** (User Menu) | 4 routes       |
| **SB** (Sidebar)   | ~70 routes     |
| **IP** (In-Page)   | remainder      |

---

## 9. Planned Routes (Appendix)

Routes defined in source documents but not yet implemented (no `page.tsx` on
disk). Listed for reference only — no components, flows, or API bindings are
documented here because they do not yet exist.

| Route                             | Planned Sprint |
| --------------------------------- | -------------- |
| `/leads/[id]/score`               | 7              |
| `/contacts/import`                | 5              |
| `/deals/new`                      | 6              |
| `/deals/[id]/edit`                | 6              |
| `/tickets/[id]/edit`              | 7              |
| `/accounts/new`                   | 5              |
| `/accounts/[id]/edit`             | 5              |
| `/documents/upload`               | 8              |
| `/documents/sign`                 | 8              |
| `/analytics/kpi/[id]`             | 9              |
| `/analytics/custom`               | 9              |
| `/reports/custom`                 | 9              |
| `/reports/export`                 | 9              |
| `/reports/scheduled`              | 9              |
| `/ai/insights`                    | 8              |
| `/ai/explainability`              | —              |
| `/ai/feedback`                    | —              |
| `/automation/workflows`           | —              |
| `/automation/workflows/new`       | —              |
| `/automation/workflows/templates` | —              |
| `/automation/workflows/[id]`      | —              |
| `/automation/rules`               | —              |
| `/support/kb`                     | —              |
| `/support/kb/[id]`                | —              |
| `/support/chat`                   | —              |
| `/support/faq`                    | —              |
| `/support/status`                 | —              |
| `/admin/billing`                  | —              |
| `/admin/users`                    | —              |
| `/admin/users/new`                | —              |
| `/admin/users/[id]`               | —              |
| `/admin/roles`                    | —              |
| `/admin/audit`                    | —              |
| `/admin/security`                 | —              |
| `/admin/integrations`             | —              |
| `/admin/api-keys`                 | —              |
| `/admin/webhooks`                 | —              |
| `/admin/compliance/gdpr`          | —              |
| `/admin/features`                 | —              |
| `/admin/system`                   | —              |
| `/ops/monitoring`                 | 9              |
| `/ops/traces`                     | 9              |
| `/ops/logs`                       | 9              |
| `/ops/alerts`                     | 9              |
| `/settings/profile`               | —              |
| `/settings/preferences`           | —              |
| `/settings/devices`               | —              |
| `/settings/activity`              | —              |

---

## 10. Maintenance Protocol

### When to Update

This document MUST be updated when any of the following changes occur:

- A new `page.tsx` is added or removed
- A sidebar config file is modified (new link, removed link)
- A new flow (`FLOW-*.md`) is created
- A new tRPC router is registered in `router.ts`
- A ghost link is resolved (page created for a previously dead link)

### Update Procedure

1. Identify which section(s) are affected by the change
2. Update the relevant module table in §3 (add/remove/modify route row)
3. Update §4 Ghost Links Register if a ghost link was resolved
4. Update the header statistics line (`Total Pages`, `Total Flows`, etc.)
5. Update §8 Summary Statistics to match
6. Run reconciliation tests to verify:
   `npx vitest run apps/web/src/app/__tests__/ia-reconciliation.test.ts`

### Automated Guards

The following reconciliation tests catch drift between this document and
reality:

| Test     | File                        | Catches                                                  |
| -------- | --------------------------- | -------------------------------------------------------- |
| TC-IA-01 | `ia-reconciliation.test.ts` | Total Pages count mismatch vs filesystem                 |
| TC-IA-03 | `ia-reconciliation.test.ts` | API Router count mismatch vs `router.ts`                 |
| TC-IA-04 | `ia-reconciliation.test.ts` | Cross-doc inconsistency (5 docs disagree on Total Pages) |
| TC-IA-05 | `ia-reconciliation.test.ts` | Ghost link regression (ghost route now has `page.tsx`)   |

### Ownership

| Area                  | Owner         |
| --------------------- | ------------- |
| Route tables (§3)     | Frontend team |
| Ghost links (§4)      | Product team  |
| API coverage (§7, §8) | Backend team  |

---

## 11. Data Sources

| Document                      | Path                                           | Last Updated | Key Data                                     |
| ----------------------------- | ---------------------------------------------- | ------------ | -------------------------------------------- |
| Navigation Reachability Audit | `docs/design/navigation-reachability-audit.md` | 2026-02-23   | Nav layers, ghost links, reachability matrix |
| UI Flow Mapping               | `docs/design/ui-flow-mapping.md`               | 2026-02-24   | Route→Flow→Component→API matrix              |
| Page Map & Flows              | `docs/design/PAGE_MAP_AND_FLOWS.md`            | 2026-02-24   | Visual sitemap, 20-category page map         |
| Page Registry                 | `docs/design/page-registry.md`                 | 2026-02-24   | Per-page specs: Task ID, KPI, RACI           |
| Sitemap                       | `docs/design/sitemap.md`                       | 2026-02-23   | Hierarchical route tree                      |

**Task Reference**: This document was created by DOC-006 (Sprint 14).
**Specification**: `.specify/sprints/sprint-14/specifications/DOC-006-spec.md`
