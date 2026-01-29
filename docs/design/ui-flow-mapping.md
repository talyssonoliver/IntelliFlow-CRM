# IntelliFlow CRM - UI Flow Mapping

> **Location**: `docs/design/ui-flow-mapping.md`
> **Last Updated**: 2025-12-27
> **Purpose**: Cross-reference document linking Flows, Sitemap Routes, Style Guide Components

This document provides a comprehensive mapping between user flows, UI routes, and
design system components to ensure consistent implementation across the application.

---

## Document Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DESIGN SYSTEM DOCUMENTATION                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   ┌──────────────────────┐     ┌──────────────────────┐                     │
│   │  FLOWS (38 total)    │────▶│   SITEMAP            │                     │
│   │  flows/FLOW-*.md     │     │   sitemap.md         │                     │
│   │                      │     │   Routes + Tasks     │                     │
│   └──────────┬───────────┘     └──────────┬───────────┘                     │
│              │                            │                                  │
│              │         ┌──────────────────┘                                  │
│              │         │                                                     │
│              ▼         ▼                                                     │
│   ┌──────────────────────────────┐                                          │
│   │  THIS DOCUMENT               │                                          │
│   │  ui-flow-mapping.md          │                                          │
│   │  Cross-Reference Master      │                                          │
│   └──────────┬───────────────────┘                                          │
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
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Quick Links

| Document | Location | Purpose |
|----------|----------|---------|
| Flow Index | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog |
| Individual Flows | `apps/project-tracker/docs/metrics/_global/flows/FLOW-*.md` | Detailed flow specs |
| Sitemap | `docs/design/sitemap.md` | Route structure with flow links |
| Style Guide | `docs/company/brand/style-guide.md` | Component patterns |
| Visual Identity | `docs/company/brand/visual-identity.md` | Design tokens |
| Accessibility | `docs/company/brand/accessibility-patterns.md` | ARIA patterns |
| Do's and Don'ts | `docs/company/brand/dos-and-donts.md` | Best practices |
| Page Registry | `docs/design/page-registry.md` | Detailed page specs |
| Sprint Plan | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Task tracking |

---

## Complete Route → Flow → Component Matrix

### Authentication Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/login` | PG-015 | 13 | FLOW-001 | card, input, btn-primary, input-error |
| `/signup` | PG-016 | 13 | FLOW-001 | card, input, btn-primary, badge-success |
| `/signup/success` | PG-017 | 13 | FLOW-001 | card, empty-state |
| `/forgot-password` | PG-018 | 13 | FLOW-003 | card, input, btn-primary |
| `/reset-password` | PG-019 | 13 | FLOW-003 | card, input, btn-primary |
| `/verify-email` | PG-020 | 13 | FLOW-001 | card, loading-spinner |
| `/sso/callback` | - | 13 | FLOW-001 | loading-spinner |

**Note**: FLOW-002 is "Gestão de Usuários e Permissões" (User Management), used in `/admin/users` and `/admin/roles`.

**ARIA Requirements**: Form validation, error announcements, loading states
**Reference**: `accessibility-patterns.md` → Forms section

---

### Dashboard Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/dashboard` | ENV-009-AI | 6 | FLOW-025 | metric-card, card, data-table, chart-widgets |

**Key Widgets**:
- Stats cards → FLOW-005 (lead metrics)
- AI Insights panel → FLOW-025 (recommendations)
- Activity Overview → FLOW-020 (timeline)

---

### Leads Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/leads` | IFC-014 | 7 | FLOW-005 | data-table, badge, btn-primary, search-input |
| `/leads/new` | IFC-004 | 5 | FLOW-005 | modal, input, select, btn-primary |
| `/leads/[id]` | - | 7 | FLOW-006 | card, tab-nav, badge, metric-card |
| `/leads/[id]/edit` | - | 7 | FLOW-006 | input, select, btn-primary, btn-secondary |
| `/leads/[id]/score` | - | 7 | - | metric-card, chart-widgets, badge |

**Style Requirements**:
- Lead score colors: Red (<30), Amber (30-70), Green (>70)
- Use `badge` with appropriate status colors
- Note: FLOW-023 is "Construtor de Relatórios" (Report Builder), not AI scoring

---

### Contacts Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/contacts` | IFC-089 | 5 | FLOW-016 | data-table, avatar, search-input, btn-primary |
| `/contacts/new` | - | 5 | FLOW-016 | modal, input, btn-primary |
| `/contacts/import` | - | 5 | - | file-upload, data-table, progress-bar |
| `/contacts/[id]` | IFC-090 ★ | 6 | FLOW-020 | card, tab-nav, avatar, timeline, badge |
| `/contacts/[id]/edit` | - | 6 | FLOW-016 | input, select, btn-primary |

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

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/deals` | IFC-091 ★ | 6 | FLOW-008 | pipeline-kanban, card, badge (pipeline stages) |
| `/deals/new` | - | 6 | FLOW-007 | modal, input, select, btn-primary |
| `/deals/[id]` | - | 6 | FLOW-008 | card, tab-nav, metric-card, badge |
| `/deals/[id]/edit` | - | 6 | FLOW-008 | input, select, btn-primary |
| `/deals/[id]/forecast` | IFC-092 | 7 | FLOW-024 | chart-widgets, metric-card |

**Pipeline Stage Badges** (from `visual-identity.md`):
- Qualification: `#137fec` (primary)
- Proposal: `#6366f1` (indigo)
- Negotiation: `#f59e0b` (amber)
- Closed Won: `#22c55e` (green)
- Closed Lost: `#ef4444` (red)

---

### Cases Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/cases/timeline` | IFC-147 | 6 | FLOW-020 | timeline, card, badge, metric-card, sla-countdown |

**Timeline Components**:
- Activity timeline with deadline tracking → FLOW-020
- Reminders service integration
- Deadline engine alerts
- Deal/Case navigation

**Related Services**:
- `apps/web/lib/cases/reminders-service.ts` - Reminder management
- `apps/web/lib/timeline/types.ts` - Timeline type definitions
- `packages/domain/src/legal/deadlines/deadline-engine.ts` - Deadline calculations

---

### Tickets Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/tickets` | IFC-093 | 7 | FLOW-011 | data-table, badge (priority), sla-countdown |
| `/tickets/new` | - | 7 | FLOW-011 | modal, input, select, btn-primary |
| `/tickets/[id]` | - | 7 | FLOW-012 | card, badge, timeline, sla-countdown |
| `/tickets/[id]/edit` | - | 7 | FLOW-012 | input, select, btn-primary |

**Priority Badge Colors**:
- High: `bg-red-100 text-red-700`
- Medium: `bg-amber-100 text-amber-700`
- Low: `bg-green-100 text-green-700`

**SLA Countdown Component**: Custom component showing time remaining

---

### Accounts Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/accounts` | - | 5 | FLOW-016 | data-table, avatar, search-input |
| `/accounts/new` | - | 5 | FLOW-016 | modal, input, btn-primary |
| `/accounts/[id]` | - | 5 | FLOW-016, FLOW-010 | card, tab-nav, metric-card |
| `/accounts/[id]/edit` | - | 5 | FLOW-016 | input, btn-primary |

---

### Documents Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/documents` | IFC-094 | 8 | - | data-table, file-preview |
| `/documents/upload` | - | 8 | - | file-upload, progress-bar |
| `/documents/[id]` | - | 8 | - | file-preview, card |
| `/documents/sign` | - | 8 | - | signature-pad, btn-primary |

**Note**: FLOW-009 is "Fechamento de Deal Won/Lost", not document management

---

### Analytics Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/analytics` | IFC-096 | 9 | FLOW-023 | chart-widgets, metric-card, card |
| `/analytics/kpi/[id]` | - | 9 | FLOW-023 | chart-widgets, data-table |
| `/analytics/custom` | - | 9 | FLOW-023 | drag-drop-builder |
| `/reports/custom` | IFC-096 | 9 | FLOW-023 | drag-drop-builder |
| `/reports/export` | - | 9 | FLOW-023 | btn-primary, select |
| `/reports/scheduled` | - | 9 | FLOW-023 | data-table, modal |

**Note**: FLOW-023 is "Construtor de Relatórios" (Report Builder). FLOW-015 is "Coleta e Análise de Feedback (NPS/CSAT)"

---

### AI Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/ai/insights` | IFC-095 | 8 | FLOW-025 | metric-card, card, chart-widgets |
| `/ai/explainability` | IFC-023 | - | FLOW-024 | card, progress-bar, badge |
| `/ai/feedback` | IFC-025 | - | FLOW-026 | rating-component, textarea, btn-primary |

**Note**: FLOW-023 is "Construtor de Relatórios", not AI explainability

---

### Automation Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/automation/workflows` | IFC-031 | - | FLOW-005 | data-table, badge |
| `/automation/workflows/new` | - | - | FLOW-005 | workflow-editor |
| `/automation/workflows/templates` | - | - | FLOW-005 | card-grid |
| `/automation/workflows/[id]` | - | - | FLOW-005 | workflow-editor |
| `/automation/rules` | - | - | FLOW-005 | data-table, modal |

---

### Support Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/support/kb` | IFC-046 | - | FLOW-014 | search-input, card-grid |
| `/support/kb/[id]` | - | - | FLOW-014 | article-content, breadcrumb |
| `/support/chat` | IFC-047 | - | FLOW-017 | chat-widget, avatar |
| `/support/faq` | - | - | FLOW-014 | accordion |
| `/support/status` | IFC-093 | - | FLOW-012 | metric-card, sla-dashboard |

**Note**: FLOW-017 is "Integração de Chat Bidirecional"

---

### Admin Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/admin/billing` | IFC-054 | - | FLOW-010 | card, data-table, btn-primary |
| `/admin/users` | IFC-098 | - | FLOW-029 | data-table, avatar, modal |
| `/admin/users/new` | - | - | FLOW-029 | modal, input, select |
| `/admin/users/[id]` | - | - | FLOW-029 | card, tab-nav |
| `/admin/roles` | IFC-098 | - | FLOW-029 | data-table, permission-matrix |
| `/admin/audit` | IFC-098 | - | FLOW-031 | data-table, filter-controls |
| `/admin/security` | IFC-098 | - | FLOW-033 | card, toggle-switch |
| `/admin/integrations` | IFC-055 | - | FLOW-036 | card-grid, badge |
| `/admin/api-keys` | IFC-081 | - | FLOW-029 | data-table, code-block |
| `/admin/webhooks` | IFC-055 | - | FLOW-036 | data-table, modal |
| `/admin/compliance/gdpr` | IFC-056 | - | FLOW-032 | data-table, btn-secondary |
| `/admin/features` | - | - | FLOW-037 | toggle-switch, data-table |
| `/admin/system` | AUTOMATION-002 | - | FLOW-030 | metric-card, chart-widgets |

---

### Settings Section

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/settings/profile` | - | - | FLOW-035 | input, avatar, btn-primary |
| `/settings/preferences` | - | - | FLOW-035 | toggle-switch, select |
| `/settings/notifications` | - | - | FLOW-021 | toggle-switch, select |
| `/settings/devices` | - | - | FLOW-004 | data-table, badge |
| `/settings/activity` | - | - | FLOW-020 | timeline |

---

### Ops Section (Internal)

| Route | Task ID | Sprint | Primary Flow | Components Required |
|-------|---------|--------|--------------|---------------------|
| `/ops/monitoring` | IFC-097 | 9 | FLOW-038 | grafana-embed, metric-card |
| `/ops/traces` | - | 9 | FLOW-038 | data-table, timeline |
| `/ops/logs` | - | 9 | FLOW-031 | log-viewer, filter-controls |
| `/ops/alerts` | - | 9 | FLOW-033 | data-table, badge |

---

## Flow Category Summary

| Category | Flow Range | Route Patterns | Key Components |
|----------|------------|----------------|----------------|
| Acesso e Identidade | FLOW-001 to FLOW-004 | `/login`, `/admin/users`, `/settings/devices` | card, input, btn-primary |
| Comercial Core | FLOW-005 to FLOW-010 | `/leads/*`, `/deals/*` | pipeline-kanban, data-table, badge |
| Relacionamento e Suporte | FLOW-011 to FLOW-015 | `/tickets/*`, `/survey/*` | sla-countdown, timeline |
| Comunicação | FLOW-016 to FLOW-022 | `/contacts/[id]/*`, `/support/chat` | email-composer, timeline |
| Analytics e Insights | FLOW-023 to FLOW-028 | `/analytics/*`, `/reports/*` | metric-card, chart-widgets |
| Segurança e Compliance | FLOW-029 to FLOW-033 | `/admin/*` | permission-matrix, audit-log |
| Qualidade e Testes | FLOW-034 to FLOW-038 | `/settings/*`, `/ops/*` | onboarding-wizard, monitoring |

---

## Implementation Checklist

When implementing any route, verify:

- [ ] **Flow Reference**: Read the corresponding FLOW-XXX.md file
- [ ] **Sitemap Entry**: Route is documented in sitemap.md
- [ ] **Task Linkage**: Task ID from Sprint Plan is associated
- [ ] **Components**: All required components from style-guide.md are used
- [ ] **Design Tokens**: Colors/typography from visual-identity.md
- [ ] **Accessibility**: ARIA patterns from accessibility-patterns.md
- [ ] **Best Practices**: Follows dos-and-donts.md guidelines
- [ ] **Dark Mode**: All components have dark: variants
- [ ] **Responsive**: Mobile-first design with breakpoints
- [ ] **Loading States**: Skeleton/spinner for async content
- [ ] **Error States**: Proper error handling and display
- [ ] **Empty States**: Meaningful empty state messages

---

## Version History

| Date | Version | Changes |
|------|---------|---------|
| 2025-12-27 | 1.0.0 | Initial cross-reference document |
