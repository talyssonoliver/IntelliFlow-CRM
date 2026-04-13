# IntelliFlow CRM - UI Flow Mapping

> **Location**: `docs/design/ui-flow-mapping.md` **Last Updated**: 2026-04-13
> **Purpose**: Cross-reference document linking Flows, Sitemap Routes, Style
> Guide Components **Total Pages**: 201 implemented **Total Flows**: 42 **API
> Routers**: 48 (366 procedures)

This document provides a comprehensive mapping between user flows, UI routes,
and design system components to ensure consistent implementation across the
application.

---

## Document Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DESIGN SYSTEM DOCUMENTATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────┐     ┌──────────────────────┐                     │
│   │  FLOWS (42 total)    │────▶│   SITEMAP            │                     │
│   │  flows/FLOW-*.md     │     │   sitemap.md         │                     │
│   │  FLOW-001 to 045     │     │   103 routes         │                     │
│   └──────────┬───────────┘     └──────────┬───────────┘                     │
│              │                            │                                  │
│              │         ┌──────────────────┘                                  │
│              │         │                                                     │
│              ▼         ▼                                                     │
│   ┌──────────────────────────────┐     ┌──────────────────────┐            │
│   │  THIS DOCUMENT               │     │  PAGE MAP & FLOWS    │            │
│   │  ui-flow-mapping.md          │◄───▶│  PAGE_MAP_AND_FLOWS  │            │
│   │  Cross-Reference Master      │     │  Visual Diagrams     │            │
│   └──────────┬───────────────────┘     └──────────────────────┘            │
│              │                                                               │
│              ▼                                                               │
│   ┌──────────────────────┐     ┌──────────────────────┐                     │
│   │  STYLE GUIDE         │     │  VISUAL IDENTITY     │                     │
│   │  style-guide.md      │◀───│  visual-identity.md  │                     │
│   │  Components          │     │  Tokens              │                     │
│   └──────────┬───────────┘     └──────────────────────┘                     │
│              │                                                               │
│              ▼                                                               │
│   ┌──────────────────────┐     ┌──────────────────────┐                     │
│   │  ACCESSIBILITY       │     │  DO's and DON'Ts     │                     │
│   │  accessibility-      │     │  dos-and-donts.md    │                     │
│   │  patterns.md         │     │                      │                     │
│   └──────────────────────┘     └──────────────────────┘                     │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────┐              │
│   │  tRPC API ROUTES                                         │              │
│   │  trpc-routes.md - 39 routers, 366 procedures             │              │
│   └──────────────────────────────────────────────────────────┘              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Links

| Document                | Location                                                        | Purpose                                      |
| ----------------------- | --------------------------------------------------------------- | -------------------------------------------- |
| Flow Index              | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog (42 flows)               |
| Individual Flows        | `apps/project-tracker/docs/metrics/_global/flows/FLOW-*.md`     | Detailed flow specs                          |
| Sitemap                 | `docs/design/sitemap.md`                                        | Route structure (103 pages)                  |
| Page Map & Flows        | `docs/design/PAGE_MAP_AND_FLOWS.md`                             | Visual flow diagrams                         |
| **Integration Backlog** | `docs/design/integration-backlog.md`                            | **Page specs + API requirements (23 tasks)** |
| tRPC API Routes         | `docs/api/trpc-routes.md`                                       | API inventory (366 procedures)               |
| Style Guide             | `docs/company/brand/style-guide.md`                             | Component patterns                           |
| Visual Identity         | `docs/company/brand/visual-identity.md`                         | Design tokens                                |
| Accessibility           | `docs/company/brand/accessibility-patterns.md`                  | ARIA patterns                                |
| Do's and Don'ts         | `docs/company/brand/dos-and-donts.md`                           | Best practices                               |
| Page Registry           | `docs/design/page-registry.md`                                  | Detailed page specs                          |
| Sprint Plan             | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`     | Task tracking (316 tasks)                    |

---

## Status Legend

| Symbol | Meaning                                      |
| ------ | -------------------------------------------- |
| ✅     | Implemented                                  |
| ⏳     | Planned / To Implement                       |
| ★      | Mockup Required (see `docs/design/mockups/`) |

---

## Complete Route → Flow → Component Matrix

### Authentication Section

| Route                      | Task ID | Sprint | Status | Primary Flow | Components Required                     | API Router |
| -------------------------- | ------- | ------ | ------ | ------------ | --------------------------------------- | ---------- |
| `/login`                   | PG-015  | 13     | ✅     | FLOW-001     | card, input, btn-primary, input-error   | `auth.*`   |
| `/signup`                  | PG-016  | 13     | ✅     | FLOW-001     | card, input, btn-primary, badge-success | `auth.*`   |
| `/signup/success`          | PG-017  | 13     | ✅     | FLOW-001     | card, empty-state                       | -          |
| `/forgot-password`         | PG-018  | 13     | ✅     | FLOW-003     | card, input, btn-primary                | `auth.*`   |
| `/reset-password/[token]`  | PG-019  | 13     | ✅     | FLOW-003     | card, input, btn-primary                | `auth.*`   |
| `/reset-password/callback` | -       | 14     | ✅     | FLOW-003     | card, loading-spinner                   | `auth.*`   |
| `/logout`                  | -       | -      | ✅     | -            | loading-spinner                         | `auth.*`   |
| `/auth/callback`           | -       | 13     | ✅     | FLOW-001     | loading-spinner                         | `auth.*`   |
| `/mfa/verify`              | PG-020  | 13     | ✅     | FLOW-001     | card, input, btn-primary                | `auth.*`   |
| `/verify-email/[token]`    | -       | 13     | ✅     | FLOW-001     | card, loading-spinner                   | `auth.*`   |
| `/verify-email/callback`   | -       | 14     | ✅     | FLOW-001     | card, loading-spinner                   | `auth.*`   |

**Note**: FLOW-002 is "Gestão de Usuários e Permissões" (User Management), used
in `/admin/users` and `/admin/roles`.

**Auth Router Procedures** (18 total):

- Queries: `getSession`, `getUser`
- Mutations: `login`, `logout`, `register`, `forgotPassword`, `resetPassword`,
  `verifyEmail`, `setupMfa`, `verifyMfa`, `revokeMfa`, `revokeSession`,
  `updateProfile`, `changePassword`, `deleteAccount`, `refreshToken`,
  `resendVerification`, `updateSettings`

**ARIA Requirements**: Form validation, error announcements, loading states
**Reference**: `accessibility-patterns.md` → Forms section

---

### Public / Marketing Section

| Route           | Task ID | Sprint | Status | Primary Flow | Components Required                        | API Router |
| --------------- | ------- | ------ | ------ | ------------ | ------------------------------------------ | ---------- |
| `/`             | -       | 14     | ✅     | -            | hero, card-grid, btn-primary, testimonials | -          |
| `/about`        | -       | 14     | ✅     | -            | card, team-grid                            | -          |
| `/blog`         | -       | 14     | ✅     | -            | card-grid, search-input                    | -          |
| `/blog/[slug]`  | -       | 14     | ✅     | -            | article-content, breadcrumb                | -          |
| `/careers`      | -       | 14     | ✅     | -            | card-grid, badge                           | -          |
| `/careers/[id]` | -       | 14     | ✅     | -            | card, btn-primary                          | -          |
| `/contact`      | -       | 14     | ✅     | -            | input, textarea, btn-primary               | -          |
| `/features`     | -       | 14     | ✅     | -            | card-grid, hero                            | -          |
| `/lp/[slug]`    | -       | 14     | ✅     | -            | hero, card, btn-primary                    | -          |
| `/partners`     | -       | 14     | ✅     | -            | card-grid, logo-grid                       | -          |
| `/press`        | -       | 14     | ✅     | -            | card-grid, date-badge                      | -          |
| `/pricing`      | -       | 14     | ✅     | FLOW-010     | pricing-card, toggle-switch, btn-primary   | -          |
| `/security`     | -       | 14     | ✅     | -            | card, badge                                | -          |
| `/status`       | -       | 14     | ✅     | -            | metric-card, badge                         | -          |

**Note**: All public marketing pages are static content. No tRPC backend
required.

---

### Dashboard Section

| Route                  | Task ID    | Sprint | Status | Primary Flow | Components Required                          | API Router    |
| ---------------------- | ---------- | ------ | ------ | ------------ | -------------------------------------------- | ------------- |
| `/dashboard`           | ENV-009-AI | 6      | ✅     | FLOW-025     | metric-card, card, data-table, chart-widgets | `analytics.*` |
| `/dashboard/new`       | -          | -      | ✅     | FLOW-024     | modal, input, btn-primary                    | `analytics.*` |
| `/dashboard/customize` | -          | -      | ✅     | FLOW-024     | drag-drop-builder, card-grid                 | `analytics.*` |

**Key Widgets**:

- Stats cards → FLOW-005 (lead metrics)
- AI Insights panel → FLOW-025 (recommendations)
- Activity Overview → FLOW-020 (timeline)

**Analytics Router Procedures** (13 total):

- Queries: `getDashboardMetrics`, `getRevenueByPeriod`, `getLeadsBySource`,
  `getConversionFunnel`, `getTeamPerformance`, `getCustomReport`,
  `getScheduledReports`, `getReportHistory`, `getWidgetData`,
  `getDateRangeMetrics`, `getExportFormats`, `getKpiDetails`,
  `getSalesFunnelData`

---

### Leads Section

| Route               | Task ID | Sprint | Status | Primary Flow | Components Required                          | API Router       |
| ------------------- | ------- | ------ | ------ | ------------ | -------------------------------------------- | ---------------- |
| `/leads`            | IFC-014 | 7      | ✅     | FLOW-005     | data-table, badge, btn-primary, search-input | `lead.*`         |
| `/leads/new`        | IFC-004 | 5      | ✅     | FLOW-005     | modal, input, select, btn-primary            | `lead.*`         |
| `/leads/[id]`       | -       | 7      | ✅ ★   | FLOW-006     | card, tab-nav, badge, metric-card            | `lead.*`         |
| `/leads/[id]/edit`  | -       | 7      | ⏳     | FLOW-006     | input, select, btn-primary, btn-secondary    | `lead.*`         |
| `/leads/[id]/score` | -       | 7      | ⏳     | -            | metric-card, chart-widgets, badge            | `intelligence.*` |

**Query Parameters** (implemented):

- `/leads?view=my` - My assigned leads
- `/leads?view=starred` - Bookmarked leads
- `/leads?view=recent` - Recently viewed
- `/leads?segment=new-week` - New this week
- `/leads?segment=hot` - Score >80
- `/leads?segment=followup` - Needs follow-up

**Lead Router Procedures** (18 total):

- Queries: `list`, `getById`, `search`, `getByStatus`, `getScoreHistory`,
  `getActivities`
- Mutations: `create`, `update`, `delete`, `updateStatus`, `assignOwner`,
  `addNote`, `star`, `convertToContact`, `bulkUpdate`, `bulkAssign`,
  `importCsv`, `exportCsv`

**Style Requirements**:

- Lead score colors: Red (<30), Amber (30-70), Green (>70)
- Use `badge` with appropriate status colors
- Note: FLOW-023 is "Construtor de Relatórios" (Report Builder), not AI scoring

---

### Contacts Section

| Route                 | Task ID   | Sprint | Status | Primary Flow | Components Required                           | API Router  |
| --------------------- | --------- | ------ | ------ | ------------ | --------------------------------------------- | ----------- |
| `/contacts`           | IFC-089   | 5      | ✅     | FLOW-016     | data-table, avatar, search-input, btn-primary | `contact.*` |
| `/contacts/new`       | -         | 5      | ✅     | FLOW-016     | modal, input, btn-primary                     | `contact.*` |
| `/contacts/import`    | -         | 5      | ⏳     | -            | file-upload, data-table, progress-bar         | `contact.*` |
| `/contacts/[id]`      | IFC-090 ★ | 6      | ✅     | FLOW-020     | card, tab-nav, avatar, timeline, badge        | `contact.*` |
| `/contacts/[id]/edit` | -         | 6      | ⏳     | FLOW-016     | input, select, btn-primary                    | `contact.*` |

**Contact Router Procedures** (17 total):

- Queries: `list`, `getById`, `search`, `getByAccount`, `getActivities`,
  `getDeals`, `getTickets`
- Mutations: `create`, `update`, `delete`, `merge`, `addToAccount`,
  `removeFromAccount`, `addTag`, `removeTag`, `bulkUpdate`, `importCsv`

**Tab Components for Contact 360**:

- Overview → FLOW-016 (Envio de Email com Tracking)
- Activity Timeline → FLOW-020 (Feed de Atividade Unificado)
- Deals → FLOW-008 (Criação e Atualização de Deal)
- Tickets → FLOW-011 (Abertura de Ticket de Suporte)
- Documents → (file list)
- AI Insights → (metric-card, chart-widgets)

**Note**: FLOW-009 is "Fechamento de Deal Won/Lost", not document management

---

### Deals Section

| Route                  | Task ID   | Sprint | Status | Primary Flow | Components Required                            | API Router       |
| ---------------------- | --------- | ------ | ------ | ------------ | ---------------------------------------------- | ---------------- |
| `/deals`               | IFC-091 ★ | 6      | ✅     | FLOW-008     | pipeline-kanban, card, badge (pipeline stages) | `opportunity.*`  |
| `/deals/new`           | -         | 6      | ⏳     | FLOW-007     | modal, input, select, btn-primary              | `opportunity.*`  |
| `/deals/[id]`          | -         | 6      | ✅     | FLOW-008     | card, tab-nav, metric-card, badge              | `opportunity.*`  |
| `/deals/[id]/edit`     | -         | 6      | ⏳     | FLOW-008     | input, select, btn-primary                     | `opportunity.*`  |
| `/deals/[id]/forecast` | IFC-092   | 7      | ✅     | FLOW-024     | chart-widgets, metric-card                     | `intelligence.*` |
| `/deals/forecast`      | -         | -      | ✅     | FLOW-025     | chart-widgets, data-table                      | `intelligence.*` |

**Opportunity Router Procedures** (12 total):

- Queries: `list`, `getById`, `getByStage`, `getPipelineMetrics`,
  `getActivities`, `getForecast`, `getHistory`, `search`
- Mutations: `create`, `update`, `updateStage`, `delete`

**Pipeline Config Router Procedures** (5 total):

- Queries: `getStages`, `getConfig`
- Mutations: `createStage`, `updateStage`, `reorderStages`

**Pipeline Stage Badges** (from `visual-identity.md`):

- Qualification: `#137fec` (primary)
- Proposal: `#6366f1` (indigo)
- Negotiation: `#f59e0b` (amber)
- Closed Won: `#22c55e` (green)
- Closed Lost: `#ef4444` (red)

---

### Tasks Section

| Route         | Task ID | Sprint | Status | Primary Flow | Components Required                          | API Router |
| ------------- | ------- | ------ | ------ | ------------ | -------------------------------------------- | ---------- |
| `/tasks`      | -       | 14     | ✅     | FLOW-020     | data-table, badge, btn-primary, search-input | `task.*`   |
| `/tasks/[id]` | -       | 14     | ✅     | FLOW-020     | card, tab-nav, badge, timeline               | `task.*`   |

**Task Router Procedures** (12 total):

- Queries: `list`, `getById`, `getByAssignee`, `getByStatus`, `search`
- Mutations: `create`, `update`, `delete`, `updateStatus`, `assign`,
  `addComment`, `bulkUpdate`

---

### Cases Section

| Route             | Task ID | Sprint | Status | Primary Flow | Components Required                               | API Router   |
| ----------------- | ------- | ------ | ------ | ------------ | ------------------------------------------------- | ------------ |
| `/cases`          | -       | 14     | ✅     | FLOW-011     | data-table, badge, btn-primary, search-input      | `cases.*`    |
| `/cases/new`      | -       | 14     | ✅     | FLOW-011     | modal, input, select, btn-primary                 | `cases.*`    |
| `/cases/[id]`     | -       | 14     | ✅     | FLOW-012     | card, tab-nav, badge, timeline, sla-countdown     | `cases.*`    |
| `/cases/timeline` | IFC-147 | 6      | ✅     | FLOW-020     | timeline, card, badge, metric-card, sla-countdown | `timeline.*` |

**Cases Router Procedures** (12 total):

- Queries: `list`, `getById`, `getByStatus`, `search`, `getActivities`
- Mutations: `create`, `update`, `delete`, `updateStatus`, `assign`,
  `addComment`, `addAttachment`

**Timeline Router Procedures** (8 total):

- Queries: `getByEntity`, `getRecent`, `search`, `getTypes`
- Mutations: `addEntry`, `updateEntry`, `deleteEntry`, `addComment`

**Timeline Components**:

- Activity timeline with deadline tracking → FLOW-020
- Reminders service integration
- Deadline engine alerts
- Deal/Case navigation

**Related Services**:

- `apps/web/lib/cases/reminders-service.ts` - Reminder management
- `apps/web/lib/timeline/types.ts` - Timeline type definitions
- `packages/domain/src/legal/deadlines/deadline-engine.ts` - Deadline
  calculations

---

### Calendar Section

| Route            | Task ID | Sprint | Status | Primary Flow | Components Required                     | API Router       |
| ---------------- | ------- | ------ | ------ | ------------ | --------------------------------------- | ---------------- |
| `/calendar`      | -       | 14     | ✅     | FLOW-020     | calendar-view, card, badge, btn-primary | `appointments.*` |
| `/calendar/new`  | -       | 14     | ✅     | FLOW-020     | modal, input, select, datetime-picker   | `appointments.*` |
| `/calendar/[id]` | -       | 14     | ✅     | FLOW-020     | card, tab-nav, badge, datetime-picker   | `appointments.*` |

**Appointments Router Procedures** (19 total):

- Queries: `list`, `getById`, `getByDate`, `getByContact`, `getByCase`,
  `getAvailability`, `getRecurring`
- Mutations: `create`, `update`, `delete`, `cancel`, `reschedule`, `confirm`,
  `addAttendee`, `removeAttendee`, `addNote`, `setReminder`, `createRecurring`,
  `updateRecurring`

---

### Tickets Section

| Route                | Task ID | Sprint | Status | Primary Flow | Components Required                         | API Router |
| -------------------- | ------- | ------ | ------ | ------------ | ------------------------------------------- | ---------- |
| `/tickets`           | IFC-093 | 7      | ✅     | FLOW-011     | data-table, badge (priority), sla-countdown | `ticket.*` |
| `/tickets/new`       | -       | 7      | ✅     | FLOW-011     | modal, input, select, btn-primary           | `ticket.*` |
| `/tickets/[id]`      | -       | 7      | ✅     | FLOW-012     | card, badge, timeline, sla-countdown        | `ticket.*` |
| `/tickets/[id]/edit` | -       | 7      | ⏳     | FLOW-012     | input, select, btn-primary                  | `ticket.*` |

**Ticket Router Procedures** (15 total):

- Queries: `list`, `getById`, `getByStatus`, `getByPriority`, `getSlaStatus`
- Mutations: `create`, `update`, `updateStatus`, `assign`, `addComment`,
  `escalate`, `merge`, `addAttachment`, `bulkUpdate`, `close`

**Ticket Routing Router Procedures** (2 total):

- Queries: `getRoutingRules`
- Mutations: `updateRoutingRules`

**Priority Badge Colors**:

- High: `bg-red-100 text-red-700`
- Medium: `bg-amber-100 text-amber-700`
- Low: `bg-green-100 text-green-700`

**SLA Countdown Component**: Custom component showing time remaining

---

### Accounts Section

| Route                 | Task ID | Sprint | Status | Primary Flow       | Components Required              | API Router  |
| --------------------- | ------- | ------ | ------ | ------------------ | -------------------------------- | ----------- |
| `/accounts`           | -       | 5      | ✅     | FLOW-016           | data-table, avatar, search-input | `account.*` |
| `/accounts/new`       | -       | 5      | ⏳     | FLOW-016           | modal, input, btn-primary        | `account.*` |
| `/accounts/[id]`      | -       | 5      | ✅     | FLOW-016, FLOW-010 | card, tab-nav, metric-card       | `account.*` |
| `/accounts/[id]/edit` | -       | 5      | ⏳     | FLOW-016           | input, btn-primary               | `account.*` |

**Account Router Procedures** (12 total):

- Queries: `list`, `getById`, `search`, `getContacts`, `getDeals`,
  `getActivities`, `getMetrics`, `getHierarchy`
- Mutations: `create`, `update`, `delete`, `merge`

---

### Documents Section

| Route               | Task ID | Sprint | Status | Primary Flow | Components Required        | API Router                |
| ------------------- | ------- | ------ | ------ | ------------ | -------------------------- | ------------------------- |
| `/documents`        | IFC-094 | 8      | ✅     | FLOW-039     | data-table, file-preview   | `documents.*`             |
| `/documents/new`    | -       | 8      | ✅     | -            | file-upload, progress-bar  | `documents.*`, `upload.*` |
| `/documents/[id]`   | -       | 8      | ✅     | -            | file-preview, card         | `documents.*`             |
| `/documents/upload` | -       | 8      | ⏳     | -            | file-upload, progress-bar  | `upload.*`                |
| `/documents/sign`   | -       | 8      | ⏳     | -            | signature-pad, btn-primary | `documents.*`             |

**Documents Router Procedures** (18 total):

- Queries: `list`, `getById`, `search`, `getByCase`
- Mutations: `create`, `update`, `delete`, `upload`, `addVersion`, `share`,
  `unshare`, `updateMetadata`, `sign`, `updatePermissions`, `addComment`,
  `moveToFolder`, `createFolder`, `archive`

**Upload Router Procedures** (2 total):

- Queries: `getUploadUrl`
- Mutations: `completeUpload`

**Note**: FLOW-009 is "Fechamento de Deal Won/Lost", not document management

---

### Email Section

| Route         | Task ID | Sprint | Status | Primary Flow | Components Required                          | API Router |
| ------------- | ------- | ------ | ------ | ------------ | -------------------------------------------- | ---------- |
| `/email`      | -       | 14     | ✅     | FLOW-016     | data-table, badge, search-input, btn-primary | `email.*`  |
| `/email/[id]` | -       | 14     | ✅     | FLOW-016     | card, email-viewer, timeline                 | `email.*`  |

**Email (Inbound) Router Procedures** (12 total):

- Queries: `list`, `getById`, `getByContact`, `getByThread`, `search`,
  `getAttachments`, `getLabels`
- Mutations: `markRead`, `archive`, `label`, `forward`, `reply`

---

### Analytics Section

| Route                 | Task ID | Sprint | Status | Primary Flow | Components Required              | API Router         |
| --------------------- | ------- | ------ | ------ | ------------ | -------------------------------- | ------------------ |
| `/analytics`          | IFC-096 | 9      | ✅     | FLOW-023     | chart-widgets, metric-card, card | `analytics.*`      |
| `/analytics/feedback` | -       | 14     | ✅     | FLOW-015     | chart-widgets, data-table, card  | `feedbackSurvey.*` |
| `/analytics/kpi/[id]` | -       | 9      | ⏳     | FLOW-023     | chart-widgets, data-table        | `analytics.*`      |
| `/analytics/custom`   | -       | 9      | ⏳     | FLOW-023     | drag-drop-builder                | `analytics.*`      |
| `/reports/custom`     | IFC-096 | 9      | ⏳     | FLOW-023     | drag-drop-builder                | `analytics.*`      |
| `/reports/export`     | -       | 9      | ⏳     | FLOW-023     | btn-primary, select              | `analytics.*`      |
| `/reports/scheduled`  | -       | 9      | ⏳     | FLOW-023     | data-table, modal                | `analytics.*`      |

**Feedback Survey Router Procedures** (4 total):

- Queries: `list`, `getById`, `getResults`, `getAnalytics`

**Note**: FLOW-023 is "Construtor de Relatórios" (Report Builder). FLOW-015 is
"Coleta e Análise de Feedback (NPS/CSAT)"

---

### AI / Agent Approvals Section

| Route                             | Task ID | Sprint | Status | Primary Flow | Components Required                           | API Router       |
| --------------------------------- | ------- | ------ | ------ | ------------ | --------------------------------------------- | ---------------- |
| `/agent-approvals`                | IFC-149 | -      | ✅     | -            | card, data-table, btn-primary, badge          | `agent.*`        |
| `/agent-approvals/agents`         | -       | 14     | ✅     | -            | data-table, badge, card                       | `agent.*`        |
| `/agent-approvals/ai-review`      | -       | 14     | ✅     | -            | data-table, badge, card                       | `aiReview.*`     |
| `/agent-approvals/ai-review/[id]` | -       | 14     | ✅     | -            | card, diff-viewer, btn-primary, badge         | `aiReview.*`     |
| `/agent-approvals/ai-search`      | -       | 14     | ✅     | -            | search-input, card, data-table                | `intelligence.*` |
| `/agent-approvals/churn-risk`     | -       | 14     | ✅     | -            | metric-card, chart-widgets, data-table        | `intelligence.*` |
| `/agent-approvals/drift`          | -       | 14     | ✅     | -            | chart-widgets, metric-card, badge             | `aiMonitoring.*` |
| `/agent-approvals/experiments`    | -       | 14     | ✅     | -            | data-table, badge, chart-widgets, btn-primary | `experiment.*`   |
| `/agent-approvals/history`        | -       | 14     | ✅     | -            | data-table, timeline, badge                   | `agent.*`        |
| `/agent-approvals/latency`        | -       | 14     | ✅     | -            | chart-widgets, metric-card                    | `aiMonitoring.*` |
| `/agent-approvals/lead-scoring`   | -       | 14     | ✅     | -            | metric-card, chart-widgets, data-table        | `intelligence.*` |
| `/agent-approvals/logs`           | -       | 14     | ✅     | -            | log-viewer, filter-controls, data-table       | `aiMonitoring.*` |
| `/agent-approvals/preview`        | -       | 14     | ✅     | -            | card, diff-viewer, btn-primary                | `aiReview.*`     |
| `/agent-approvals/sentiment`      | -       | 14     | ✅     | -            | chart-widgets, metric-card, badge             | `intelligence.*` |
| `/ai/insights`                    | IFC-095 | 8      | ⏳     | FLOW-025     | metric-card, card, chart-widgets              | `intelligence.*` |
| `/ai/explainability`              | IFC-023 | -      | ⏳     | FLOW-024     | card, progress-bar, badge                     | `intelligence.*` |
| `/ai/feedback`                    | IFC-025 | -      | ⏳     | FLOW-026     | rating-component, textarea, btn-primary       | `feedback.*`     |

**Agent Router Procedures** (8 total):

- Queries: `getPendingActions`, `getActionHistory`, `getToolDefinitions`,
  `getAgentStatus`, `getAgentMetrics`
- Mutations: `approveAction`, `rejectAction`, `cancelAction`

**AI Monitoring Router Procedures** (8 total):

- Queries: `getDriftMetrics`, `getLatencyMetrics`, `getModelHealth`,
  `getAlerts`, `getLogs`, `getMetricHistory`, `getAnomalies`, `getDashboard`

**AI Review Router Procedures** (7 total):

- Queries: `list`, `getById`, `getPending`
- Mutations: `approve`, `reject`, `requestChanges`, `addComment`

**Experiment Router Procedures** (15 total):

- Queries: `list`, `getById`, `getResults`, `getMetrics`, `getActive`
- Mutations: `create`, `update`, `start`, `stop`, `archive`, `setTrafficSplit`,
  `addVariant`, `removeVariant`, `updateVariant`, `analyzeResults`

**Chain Version Router Procedures** (14 total):

- Queries: `list`, `getById`, `getActive`, `getExperiments`, `getMetrics`,
  `compareVersions`, `getHistory`, `getConfig`
- Mutations: `create`, `activate`, `deactivate`, `rollback`, `createExperiment`,
  `updateConfig`

**Intelligence Router Procedures** (10 total):

- Queries: `getLeadScore`, `getChurnRisk`, `getDealForecast`,
  `getSentimentAnalysis`, `getSearchResults`, `getInsights`,
  `getRecommendations`
- Mutations: `refreshScore`, `provideFeedback`, `runAnalysis`

**Note**: FLOW-023 is "Construtor de Relatórios", not AI explainability

---

### Developer Portal Section

| Route                | Task ID | Sprint | Status | Primary Flow | Components Required                      | API Router   |
| -------------------- | ------- | ------ | ------ | ------------ | ---------------------------------------- | ------------ |
| `/developers/apps`   | -       | 14     | ✅     | -            | data-table, card, btn-primary, badge     | -            |
| `/docs`              | -       | 14     | ✅     | -            | sidebar-nav, article-content, breadcrumb | -            |
| `/docs/api`          | -       | 14     | ✅     | -            | api-reference, code-block, tab-nav       | -            |
| `/docs/changelog`    | PG-035  | 15     | ✅     | -            | article-content, badge, timeline         | -            |
| `/docs/integrations` | -       | 14     | ✅     | -            | card-grid, article-content, code-block   | -            |
| `/docs/webhooks`     | -       | 14     | ✅     | -            | article-content, code-block, data-table  | `webhooks.*` |

**Webhooks Router Procedures** (9 total):

- Queries: `list`, `getById`, `getDeliveries`
- Mutations: `create`, `update`, `delete`, `test`, `retry`, `toggleActive`

---

### Automation Section

| Route                             | Task ID | Sprint | Status | Primary Flow | Components Required | API Router |
| --------------------------------- | ------- | ------ | ------ | ------------ | ------------------- | ---------- |
| `/automation/workflows`           | IFC-031 | -      | ⏳     | FLOW-005     | data-table, badge   | -          |
| `/automation/workflows/new`       | -       | -      | ⏳     | FLOW-005     | workflow-editor     | -          |
| `/automation/workflows/templates` | -       | -      | ⏳     | FLOW-005     | card-grid           | -          |
| `/automation/workflows/[id]`      | -       | -      | ⏳     | FLOW-005     | workflow-editor     | -          |
| `/automation/rules`               | -       | -      | ⏳     | FLOW-005     | data-table, modal   | -          |

---

### Support Section

| Route              | Task ID | Sprint | Status | Primary Flow | Components Required         | API Router |
| ------------------ | ------- | ------ | ------ | ------------ | --------------------------- | ---------- |
| `/support/kb`      | IFC-046 | -      | ⏳     | FLOW-014     | search-input, card-grid     | -          |
| `/support/kb/[id]` | -       | -      | ⏳     | FLOW-014     | article-content, breadcrumb | -          |
| `/support/chat`    | IFC-047 | -      | ⏳     | FLOW-017     | chat-widget, avatar         | -          |
| `/support/faq`     | -       | -      | ⏳     | FLOW-014     | accordion                   | -          |
| `/support/status`  | IFC-093 | -      | ⏳     | FLOW-012     | metric-card, sla-dashboard  | -          |

**Note**: FLOW-017 is "Integração de Chat Bidirecional"

---

### Admin Section

| Route                    | Task ID        | Sprint | Status | Primary Flow | Components Required           | API Router             |
| ------------------------ | -------------- | ------ | ------ | ------------ | ----------------------------- | ---------------------- |
| `/admin/billing`         | IFC-054        | -      | ⏳     | FLOW-010     | card, data-table, btn-primary | `billing.*`            |
| `/admin/users`           | IFC-098        | -      | ⏳     | FLOW-029     | data-table, avatar, modal     | `auth.*`               |
| `/admin/users/new`       | -              | -      | ⏳     | FLOW-029     | modal, input, select          | `auth.*`               |
| `/admin/users/[id]`      | -              | -      | ⏳     | FLOW-029     | card, tab-nav                 | `auth.*`               |
| `/admin/roles`           | IFC-098        | -      | ⏳     | FLOW-029     | data-table, permission-matrix | `auth.*`               |
| `/admin/audit`           | IFC-098        | -      | ⏳     | FLOW-031     | data-table, filter-controls   | `audit.*`              |
| `/admin/security`        | IFC-098        | -      | ⏳     | FLOW-033     | card, toggle-switch           | `auth.*`               |
| `/admin/integrations`    | IFC-055        | -      | ⏳     | FLOW-036     | card-grid, badge              | `integrations.*`       |
| `/admin/api-keys`        | IFC-081        | -      | ⏳     | FLOW-029     | data-table, code-block        | -                      |
| `/admin/webhooks`        | IFC-055        | -      | ⏳     | FLOW-036     | data-table, modal             | -                      |
| `/admin/compliance/gdpr` | IFC-056        | -      | ⏳     | FLOW-032     | data-table, btn-secondary     | -                      |
| `/admin/features`        | -              | -      | ⏳     | FLOW-037     | toggle-switch, data-table     | -                      |
| `/admin/system`          | AUTOMATION-002 | -      | ⏳     | FLOW-030     | metric-card, chart-widgets    | `health.*`, `system.*` |

---

### Settings Section

| Route                     | Task ID | Sprint | Status | Primary Flow | Components Required              | API Router         |
| ------------------------- | ------- | ------ | ------ | ------------ | -------------------------------- | ------------------ |
| `/settings`               | -       | -      | ✅     | -            | card, nav-list                   | -                  |
| `/settings/account`       | -       | -      | ✅     | FLOW-035     | input, avatar, btn-primary       | `auth.*`           |
| `/settings/team`          | -       | -      | ✅     | FLOW-002     | data-table, avatar, modal        | `auth.*`           |
| `/settings/ai`            | -       | -      | ✅     | FLOW-045     | data-table, badge, toggle-switch | `chainVersion.*`   |
| `/settings/integrations`  | -       | -      | ✅     | FLOW-036     | card-grid, badge                 | `integrations.*`   |
| `/settings/notifications` | -       | -      | ✅     | FLOW-021     | toggle-switch, select            | -                  |
| `/settings/pipeline`      | -       | -      | ✅     | FLOW-007     | data-table, drag-drop            | `pipelineConfig.*` |
| `/settings/routing`       | -       | 14     | ✅     | -            | data-table, card, btn-primary    | `routing.*`        |
| `/settings/security/mfa`  | -       | -      | ✅     | FLOW-001     | card, input, btn-primary         | `auth.*`           |
| `/settings/profile`       | -       | -      | ⏳     | FLOW-035     | input, avatar, btn-primary       | `auth.*`           |
| `/settings/preferences`   | -       | -      | ⏳     | FLOW-035     | toggle-switch, select            | -                  |
| `/settings/devices`       | -       | -      | ⏳     | FLOW-004     | data-table, badge                | `auth.*`           |
| `/settings/activity`      | -       | -      | ⏳     | FLOW-020     | timeline                         | `timeline.*`       |

**Routing Router Procedures** (11 total):

- Queries: `getRoutingConfig`, `getQueues`, `getAgents`, `getSkills`,
  `getMetrics`
- Mutations: `updateConfig`, `createQueue`, `updateQueue`, `deleteQueue`,
  `assignAgent`, `updateSkills`

**Integrations Router Procedures** (6 total):

- Queries: `list`, `getById`, `getAvailable`, `getStatus`
- Mutations: `connect`, `disconnect`

---

### Billing Section

| Route                      | Task ID | Sprint | Status | Primary Flow | Components Required      | API Router  |
| -------------------------- | ------- | ------ | ------ | ------------ | ------------------------ | ----------- |
| `/billing`                 | -       | -      | ✅     | FLOW-010     | card, metric-card        | `billing.*` |
| `/billing/checkout`        | -       | -      | ✅     | FLOW-010     | card, input, btn-primary | `billing.*` |
| `/billing/subscriptions`   | -       | -      | ✅     | FLOW-010     | card, badge, data-table  | `billing.*` |
| `/billing/payment-methods` | -       | -      | ✅     | FLOW-010     | card, data-table         | `billing.*` |
| `/billing/invoices`        | -       | -      | ✅     | FLOW-010     | data-table               | `billing.*` |
| `/billing/invoices/[id]`   | -       | -      | ✅     | FLOW-010     | card, data-table         | `billing.*` |
| `/billing/receipts`        | -       | -      | ✅     | FLOW-010     | data-table               | `billing.*` |

**Billing Router Procedures** (16 total):

- Queries: `getSubscription`, `getInvoices`, `getPaymentMethods`, `getUsage`,
  `getPricingPlans`, `getReceipts`, `getBillingHistory`
- Mutations: `createCheckoutSession`, `updateSubscription`,
  `cancelSubscription`, `addPaymentMethod`, `removePaymentMethod`,
  `setDefaultPaymentMethod`, `downloadInvoice`, `retryPayment`, `applyPromoCode`

**Integration Note**: Stripe integration pending - currently using hardcoded
data

---

### Governance Section

| Route                                    | Task ID | Sprint | Status | Primary Flow | Components Required      | API Router               |
| ---------------------------------------- | ------- | ------ | ------ | ------------ | ------------------------ | ------------------------ |
| `/governance`                            | -       | -      | ✅     | FLOW-032     | card, metric-card        | Local API                |
| `/governance/adr`                        | -       | -      | ✅     | FLOW-029     | data-table, badge        | `/api/adr/*`             |
| `/governance/compliance`                 | -       | -      | ✅     | FLOW-032     | data-table, progress-bar | `/api/compliance/*`      |
| `/governance/policies`                   | -       | -      | ✅     | FLOW-032     | data-table, card         | Local API                |
| `/governance/quality-reports`            | -       | -      | ✅     | FLOW-038     | data-table, card         | `/api/quality-reports/*` |
| `/governance/quality-reports/[reportId]` | -       | -      | ✅     | FLOW-038     | card, chart-widgets      | `/api/quality-reports/*` |

---

### Notifications Section

| Route                     | Task ID | Sprint | Status | Primary Flow | Components Required   | API Router        |
| ------------------------- | ------- | ------ | ------ | ------------ | --------------------- | ----------------- |
| `/notifications`          | -       | -      | ✅     | FLOW-022     | data-table, badge     | `notifications.*` |
| `/notifications/settings` | -       | -      | ✅     | FLOW-021     | toggle-switch, select | `notifications.*` |

**Notifications Router Procedures** (8 total):

- Queries: `list`, `getUnreadCount`, `getPreferences`
- Mutations: `markRead`, `markAllRead`, `updatePreferences`, `dismiss`,
  `subscribe`

---

### Profile Section

| Route      | Task ID | Sprint | Status | Primary Flow | Components Required | API Router |
| ---------- | ------- | ------ | ------ | ------------ | ------------------- | ---------- |
| `/profile` | -       | -      | ✅     | FLOW-035     | card, avatar, input | `auth.*`   |

---

### Ops Section (Internal)

| Route             | Task ID | Sprint | Status | Primary Flow | Components Required         | API Router |
| ----------------- | ------- | ------ | ------ | ------------ | --------------------------- | ---------- |
| `/ops/monitoring` | IFC-097 | 9      | ⏳     | FLOW-038     | grafana-embed, metric-card  | `health.*` |
| `/ops/traces`     | -       | 9      | ⏳     | FLOW-038     | data-table, timeline        | -          |
| `/ops/logs`       | -       | 9      | ⏳     | FLOW-031     | log-viewer, filter-controls | -          |
| `/ops/alerts`     | -       | 9      | ⏳     | FLOW-033     | data-table, badge           | -          |

---

## Flow Category Summary

| Category                 | Flow Range                   | Route Patterns                                  | Key Components                     | API Routers                                                                                                  |
| ------------------------ | ---------------------------- | ----------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Acesso e Identidade      | FLOW-001 to FLOW-004         | `/login`, `/admin/users`, `/settings/devices`   | card, input, btn-primary           | `auth` (18)                                                                                                  |
| Comercial Core           | FLOW-005 to FLOW-010         | `/leads/*`, `/deals/*`, `/tasks/*`              | pipeline-kanban, data-table, badge | `lead` (18), `opportunity` (12), `billing` (16), `task` (12)                                                 |
| Relacionamento e Suporte | FLOW-011 to FLOW-015         | `/tickets/*`, `/cases/*`, `/analytics/feedback` | sla-countdown, timeline            | `ticket` (15), `contact` (17), `cases` (12), `feedbackSurvey` (4)                                            |
| Comunicação              | FLOW-016 to FLOW-022         | `/contacts/[id]/*`, `/email/*`, `/calendar/*`   | email-composer, timeline           | `email` (12), `timeline` (8), `appointments` (19), `notifications` (8)                                       |
| Analytics e Insights     | FLOW-023 to FLOW-028         | `/analytics/*`, `/reports/*`                    | metric-card, chart-widgets         | `analytics` (13)                                                                                             |
| Segurança e Compliance   | FLOW-029 to FLOW-033         | `/admin/*`, `/governance/*`                     | permission-matrix, audit-log       | `audit` (5)                                                                                                  |
| Qualidade e Testes       | FLOW-034 to FLOW-038         | `/settings/*`, `/ops/*`                         | onboarding-wizard, monitoring      | Local APIs                                                                                                   |
| Search & AI              | FLOW-039, FLOW-041, FLOW-045 | `/settings/ai`, `/agent-approvals/*`            | data-table, badge                  | `agent` (8), `chainVersion` (14), `intelligence` (10), `aiMonitoring` (8), `aiReview` (7), `experiment` (15) |
| Developer                | -                            | `/developers/*`, `/docs/*`                      | api-reference, code-block          | `webhooks` (9)                                                                                               |

---

## API Router Summary

| Router           | Procedures | Primary Routes                                        | Status            |
| ---------------- | ---------- | ----------------------------------------------------- | ----------------- |
| `auth`           | 18         | `/login`, `/signup`, `/auth/*`, `/settings/account`   | ✅ Active         |
| `lead`           | 18         | `/leads`, `/leads/new`, `/leads/[id]`                 | ✅ Active         |
| `contact`        | 17         | `/contacts`, `/contacts/new`, `/contacts/[id]`        | ✅ Active         |
| `account`        | 12         | `/accounts`, `/accounts/[id]`                         | ✅ Active         |
| `opportunity`    | 12         | `/deals`, `/deals/[id]`                               | ✅ Active         |
| `pipelineConfig` | 5          | `/settings/pipeline`                                  | ✅ Active         |
| `task`           | 12         | `/tasks`, `/tasks/[id]`                               | ✅ Active         |
| `ticket`         | 15         | `/tickets`, `/tickets/[id]`                           | ✅ Active         |
| `ticketRouting`  | 2          | Ticket auto-routing (IFC-067)                         | ✅ Active         |
| `analytics`      | 13         | `/analytics`, `/dashboard`                            | ✅ Active         |
| `cases`          | 12         | `/cases`, `/cases/new`, `/cases/[id]`                 | ✅ Active         |
| `appointments`   | 19         | `/calendar`, `/calendar/new`, `/calendar/[id]`        | ✅ Active         |
| `documents`      | 18         | `/documents`, `/documents/[id]`                       | ✅ Active         |
| `upload`         | 2          | `/documents/new` (file upload)                        | ✅ Active         |
| `billing`        | 16         | `/billing/*`                                          | ⏳ Stripe pending |
| `agent`          | 8          | `/agent-approvals`, `/agent-approvals/agents`         | ✅ Active         |
| `chainVersion`   | 14         | `/settings/ai`                                        | ✅ Active         |
| `zepBudget`      | 3          | AI memory budget management                           | ✅ Active         |
| `intelligence`   | 10         | `/agent-approvals/churn-risk`, `/deals/[id]/forecast` | ✅ Active         |
| `autoResponse`   | 13         | Auto-response management (IFC-029)                    | ✅ Active         |
| `aiMonitoring`   | 8          | `/agent-approvals/drift`, `/agent-approvals/latency`  | ✅ Active         |
| `aiReview`       | 7          | `/agent-approvals/ai-review`                          | ✅ Active         |
| `experiment`     | 15         | `/agent-approvals/experiments`                        | ✅ Active         |
| `audit`          | 5          | `/governance/*`                                       | ✅ Active         |
| `health`         | 5          | Health checks                                         | ✅ Active         |
| `system`         | 8          | System info                                           | ✅ Active         |
| `timeline`       | 8          | `/cases/timeline`                                     | ✅ Active         |
| `subscriptions`  | 5          | Real-time WebSocket subscriptions                     | ✅ Active         |
| `integrations`   | 6          | `/settings/integrations`                              | ✅ Active         |
| `email`          | 12         | `/email`, `/email/[id]`                               | ✅ Active         |
| `webhooks`       | 9          | `/docs/webhooks`, webhook management                  | ✅ Active         |
| `home`           | 7          | Authenticated home page data (IFC-182)                | ✅ Active         |
| `notifications`  | 8          | `/notifications`, `/notifications/settings`           | ✅ Active         |
| `workflow`       | 2          | Workflow engine (IFC-028)                             | ✅ Active         |
| `queuesAdmin`    | 2          | Admin queue management                                | ✅ Active         |
| `activityFeed`   | 2          | Activity feed (IFC-069)                               | ✅ Active         |
| `moduleAccess`   | 3          | Module access control (IFC-209)                       | ✅ Active         |
| `routing`        | 11         | `/settings/routing`, lead routing (PG-132)            | ✅ Active         |
| `feedbackSurvey` | 4          | `/analytics/feedback` (IFC-068)                       | ✅ Active         |
| **Total**        | **366**    | **39 routers**                                        |                   |

---

## Implementation Status Summary

| Status            | Count | Description                            |
| ----------------- | ----- | -------------------------------------- |
| ✅ Implemented    | 112   | Pages live in codebase                 |
| ⏳ Planned        | 50    | Routes defined but not yet implemented |
| ★ Mockup Required | 3     | Need design before implementation      |

---

## Backend Integration Status

Shows which implemented pages are connected to the backend vs using
hardcoded/mock data.

| Status              | Symbol | Count | Description                              |
| ------------------- | ------ | ----- | ---------------------------------------- |
| Fully Integrated    | 🟢     | 56    | Connected to tRPC backend, real data     |
| Partial Integration | 🟡     | 8     | Some real data, some hardcoded           |
| Hardcoded/Static    | 🔴     | 39    | Using static/mock data or static content |

### Integration Status by Route

| Route                                 | Integration   | Required APIs                                                                  |
| ------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| `/` (Landing)                         | 🔴 Static     | Marketing landing page — no API required                                       |
| `/login`, `/signup`, auth routes      | 🟢 Integrated | `auth.*` (18 procedures)                                                       |
| Public marketing pages                | 🔴 Static     | Static content pages — no API required                                         |
| `/dashboard`                          | 🟡 Partial    | `dashboard.getMetrics`, `dashboard.getWidgets`                                 |
| `/dashboard/new`                      | 🟡 Partial    | `dashboard.createDashboard`                                                    |
| `/dashboard/customize`                | 🟡 Partial    | `dashboard.updateLayout`                                                       |
| `/leads/*`                            | 🟢 Integrated | `lead.*` (18 procedures)                                                       |
| `/contacts/*`                         | 🟢 Integrated | `contact.*` (17 procedures)                                                    |
| `/deals`                              | 🟢 Integrated | `opportunity.*` (12 procedures)                                                |
| `/deals/[id]`                         | 🟢 Integrated | `opportunity.getById`                                                          |
| `/deals/[id]/forecast`                | 🔴 Hardcoded  | `intelligence.getDealForecast`                                                 |
| `/deals/forecast`                     | 🟡 Partial    | `intelligence.getSalesForecast`                                                |
| `/tasks/*`                            | 🟢 Integrated | `task.*` (12 procedures)                                                       |
| `/cases`, `/cases/new`, `/cases/[id]` | 🟢 Integrated | `cases.*` (12 procedures)                                                      |
| `/cases/timeline`                     | 🟢 Integrated | `timeline.*` (8 procedures)                                                    |
| `/calendar/*`                         | 🟢 Integrated | `appointments.*` (19 procedures)                                               |
| `/tickets/*`                          | 🟢 Integrated | `ticket.*` (15 procedures)                                                     |
| `/accounts`                           | 🟢 Integrated | `account.*` (12 procedures)                                                    |
| `/accounts/[id]`                      | 🔴 Hardcoded  | `account.getById` — page exists but no direct tRPC usage                       |
| `/documents/*`                        | 🟢 Integrated | `documents.*` (18 procedures)                                                  |
| `/email/*`                            | 🔴 Hardcoded  | `email.*` — pages exist but no direct tRPC usage yet                           |
| `/analytics`                          | 🟡 Partial    | `analytics.*` (13 procedures)                                                  |
| `/analytics/feedback`                 | 🔴 Hardcoded  | `feedbackSurvey.*` — page exists but no direct tRPC usage yet                  |
| `/agent-approvals`                    | 🟢 Integrated | `agent.*` (8 procedures)                                                       |
| `/agent-approvals/ai-review/[id]`     | 🟢 Integrated | `aiReview.*` (7 procedures)                                                    |
| `/agent-approvals/*` (other 12)       | 🔴 Hardcoded  | Various AI routers — pages exist but no direct tRPC usage yet                  |
| `/developers/*`, `/docs/*`            | 🔴 Static     | Developer portal — static documentation content                                |
| `/settings/ai`                        | 🟢 Integrated | `chainVersion.*` (14 procedures)                                               |
| `/settings/account`                   | 🟢 Integrated | `auth.*`                                                                       |
| `/settings/team`                      | 🟢 Integrated | `auth.*`                                                                       |
| `/settings/integrations`              | 🟡 Partial    | `integrations.*` (6 procedures)                                                |
| `/settings/pipeline`                  | 🟢 Integrated | `pipelineConfig.*` (5 procedures)                                              |
| `/settings/routing`                   | 🔴 Hardcoded  | `routing.*` — page exists but no direct tRPC usage yet                         |
| `/settings/notifications`             | 🔴 Hardcoded  | Notification preferences API needed                                            |
| `/settings/security/mfa`              | 🟢 Integrated | `auth.*`                                                                       |
| `/billing/*`                          | 🔴 Hardcoded  | `billing.*` - Stripe integration pending                                       |
| `/governance/*`                       | 🟢 Integrated | Local API routes (`/api/adr/*`, `/api/compliance/*`, `/api/quality-reports/*`) |
| `/notifications`                      | 🟢 Integrated | `notifications.*` (8 procedures)                                               |
| `/notifications/settings`             | 🟢 Integrated | `notifications.*`                                                              |
| `/profile`                            | 🟢 Integrated | `auth.getUser`, `auth.updateProfile`                                           |

### Priority Integration Tasks

| Route                          | Current Status | Required Work                                      |
| ------------------------------ | -------------- | -------------------------------------------------- |
| `/email/*`                     | 🔴             | Wire `email.*` router to email inbox/detail pages  |
| `/accounts/[id]`               | 🔴             | Connect to `account.getById`                       |
| `/analytics/feedback`          | 🔴             | Connect to `feedbackSurvey.*` router               |
| `/settings/routing`            | 🔴             | Connect to `routing.*` router                      |
| `/agent-approvals/*` sub-pages | 🔴             | Wire AI monitoring, review, experiment routers     |
| `/billing/*`                   | 🔴             | Stripe integration + connect to `billing.*` router |
| `/deals/[id]/forecast`         | 🔴             | Connect to `intelligence.getDealForecast`          |
| `/settings/notifications`      | 🔴             | Create notification preferences API                |
| `/admin/*`                     | ⏳             | Full implementation needed                         |
| `/automation/*`                | ⏳             | Full implementation needed                         |
| `/support/*`                   | ⏳             | Full implementation needed                         |
| `/ops/*`                       | ⏳             | Full implementation needed                         |

---

## Implementation Checklist

When implementing any route, verify:

### Documentation

- [ ] **Flow Reference**: Read the corresponding FLOW-XXX.md file
- [ ] **Sitemap Entry**: Route is documented in sitemap.md
- [ ] **Page Map**: Route appears in PAGE_MAP_AND_FLOWS.md
- [ ] **Task Linkage**: Task ID from Sprint Plan is associated
- [ ] **API Routes**: Required tRPC procedures documented in trpc-routes.md

### Design System

- [ ] **Components**: All required components from style-guide.md are used
- [ ] **Design Tokens**: Colors/typography from visual-identity.md
- [ ] **Accessibility**: ARIA patterns from accessibility-patterns.md
- [ ] **Best Practices**: Follows dos-and-donts.md guidelines

### Technical Requirements

- [ ] **Dark Mode**: All components have dark: variants
- [ ] **Responsive**: Mobile-first design with breakpoints
- [ ] **Loading States**: Skeleton/spinner for async content
- [ ] **Error States**: Proper error handling and display
- [ ] **Empty States**: Meaningful empty state messages

### Backend Integration

- [ ] **API Router**: tRPC router exists and is wired up
- [ ] **Type Safety**: Types exported from `@intelliflow/validators`
- [ ] **Error Handling**: TRPCError with proper codes

---

## Version History

| Date       | Version | Changes                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2025-12-27 | 1.0.0   | Initial cross-reference document                                                                                                                                                                                                                                                                                                                                            |
| 2026-02-02 | 2.0.0   | Added Status column (✅/⏳), API Router column, procedure counts. Updated to 68 implemented pages, 42 flows, 232 API procedures. Preserved all Task IDs, Sprint numbers, and notes. Added implementation status summary and priority tasks.                                                                                                                                 |
| 2026-02-24 | 3.0.0   | Major update: 68→103 implemented pages, 25→39 API routers, 232→366 procedures. Added 5 new sections (Public/Marketing, Tasks, Calendar, Email, Developer Portal). Expanded Cases (1→4 routes), AI/Agent Approvals (2→14 routes). Updated status markers (accounts, tickets/new ⏳→✅). Added auth callback routes. Updated all procedure counts from codebase verification. |
