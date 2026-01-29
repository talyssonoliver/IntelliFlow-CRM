# IntelliFlow CRM - Sitemap

> **Location**: `docs/design/sitemap.md`
> **Last Updated**: 2025-12-27
> **Total Pages**: 65+
> **Total Flows**: 38 (linked)

---

## Design System References

| Resource | Location | Purpose |
|----------|----------|---------|
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog |
| **Style Guide** | `docs/company/brand/style-guide.md` | Component patterns |
| **Visual Identity** | `docs/company/brand/visual-identity.md` | Design tokens |
| **Accessibility** | `docs/company/brand/accessibility-patterns.md` | ARIA patterns |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md` | Best practices |

---

## Visual Sitemap

```
intelliflow.com
│
├── PUBLIC PAGES (unauthenticated)
│   │
│   ├── / (Home)                          [PG-001] Sprint 11
│   ├── /features                         [PG-002] Sprint 11
│   ├── /pricing                          [PG-003] Sprint 11
│   ├── /about                            [PG-004] Sprint 11
│   ├── /contact                          [PG-005] Sprint 11
│   ├── /partners                         [PG-006] Sprint 11
│   ├── /press                            [PG-007] Sprint 11
│   ├── /security                         [PG-008] Sprint 11
│   ├── /status                           [PG-014] Sprint 12
│   │
│   ├── /blog                             [PG-009] Sprint 12
│   │   └── /blog/[slug]                  [PG-010] Sprint 12
│   │
│   ├── /careers                          [PG-011] Sprint 12
│   │   └── /careers/[id]                 [PG-012] Sprint 12
│   │
│   ├── /lp/[slug]                        [PG-013] Sprint 12
│   │   (Landing pages for campaigns)
│   │
│   └── /legal
│       ├── /legal/privacy
│       ├── /legal/terms
│       └── /legal/cookies
│
├── AUTH PAGES                            [FLOW-001, FLOW-003]
│   │
│   ├── /login                            [PG-015] Sprint 13 → FLOW-001
│   ├── /signup                           [PG-016] Sprint 13 → FLOW-001 (registration)
│   ├── /signup/success                   [PG-017] Sprint 13 → FLOW-001
│   ├── /forgot-password                  [PG-018] Sprint 13 → FLOW-003
│   ├── /reset-password                   [PG-019] Sprint 13 → FLOW-003
│   ├── /verify-email                     [PG-020] Sprint 13 → FLOW-001 (email verification)
│   └── /sso/callback                     (OAuth callback) → FLOW-001
│
├── DASHBOARD (authenticated)             [FLOW-025, FLOW-021]
│   │
│   └── /dashboard                        [ENV-009-AI] Sprint 6 → FLOW-025
│       ├── Stats cards (Leads, Qualified, Avg Score, Converted)
│       ├── Recent Leads list → FLOW-005
│       ├── AI Insights panel → FLOW-025
│       └── Activity Overview timeline → FLOW-020
│
├── CORE CRM                              [FLOW-005 to FLOW-016]
│   │
│   ├── /leads                            [IFC-014] Sprint 7 → FLOW-005
│   │   ├── Lead list with filters → FLOW-005
│   │   ├── /leads/new                    [IFC-004] Sprint 5 → FLOW-005
│   │   └── /leads/[id] → FLOW-006
│   │       ├── /leads/[id]/edit → FLOW-006
│   │       └── /leads/[id]/score         (AI scoring)
│   │
│   ├── /contacts                         [IFC-089] Sprint 5 → FLOW-016
│   │   ├── Contact list with search → FLOW-016
│   │   ├── /contacts/new → FLOW-016
│   │   ├── /contacts/import              (Bulk import)
│   │   └── /contacts/[id]                [IFC-090] Sprint 6 ★ MOCKUP → FLOW-020
│   │       ├── Overview tab → FLOW-016
│   │       ├── Activity Timeline tab → FLOW-020
│   │       ├── Deals tab → FLOW-008
│   │       ├── Tickets tab → FLOW-011
│   │       ├── Documents tab
│   │       ├── AI Insights tab
│   │       └── /contacts/[id]/edit → FLOW-016
│   │
│   ├── /deals                            [IFC-091] Sprint 6 ★ MOCKUP → FLOW-008
│   │   ├── Pipeline Kanban board → FLOW-008
│   │   ├── Deals by Stage chart → FLOW-008
│   │   ├── Revenue chart → FLOW-008
│   │   ├── /deals/new → FLOW-007
│   │   └── /deals/[id] → FLOW-008
│   │       ├── Deal details → FLOW-008
│   │       ├── /deals/[id]/edit → FLOW-008
│   │       └── /deals/[id]/forecast      [IFC-092] Sprint 7 → FLOW-024
│   │
│   ├── /cases                               → FLOW-020
│   │   └── /cases/timeline                  [IFC-147] Sprint 6 → FLOW-020
│   │       └── Case/Deal timeline with deadline engine
│   │
│   ├── /accounts → FLOW-016
│   │   ├── Account list → FLOW-016
│   │   ├── /accounts/new → FLOW-016
│   │   └── /accounts/[id] → FLOW-016, FLOW-010
│   │       └── /accounts/[id]/edit → FLOW-016
│   │
│   ├── /tickets                          [IFC-093] Sprint 7 → FLOW-011
│   │   ├── Ticket list with SLA badges → FLOW-011
│   │   ├── /tickets/new → FLOW-011
│   │   └── /tickets/[id] → FLOW-012
│   │       ├── Ticket details → FLOW-012
│   │       ├── SLA countdown → FLOW-012
│   │       └── /tickets/[id]/edit → FLOW-012
│   │
│   ├── /tasks → FLOW-019 (meetings/scheduling)
│   │   ├── Task list → FLOW-019
│   │   ├── /tasks/new → FLOW-019
│   │   └── /tasks/[id] → FLOW-019
│   │
│   └── /documents                        [IFC-094] Sprint 8
│       ├── Document list
│       ├── /documents/upload
│       ├── /documents/[id]
│       │   └── Inline preview
│       └── /documents/sign               (E-signature)
│
├── ANALYTICS & REPORTING                 [FLOW-023]
│   │
│   ├── /analytics                        [IFC-096] Sprint 9 → FLOW-023
│   │   ├── Dashboard widgets → FLOW-023
│   │   ├── /analytics/kpi/[id] → FLOW-023
│   │   └── /analytics/custom             (Custom reports) → FLOW-023
│   │
│   └── /reports → FLOW-023
│       ├── /reports/custom               [IFC-096] Sprint 9 → FLOW-023
│       │   └── Drag-and-drop builder → FLOW-023
│       ├── /reports/export → FLOW-023
│       │   └── CSV/PDF export → FLOW-023
│       └── /reports/scheduled → FLOW-023
│           └── Scheduled report config → FLOW-023
│
├── AI & AUTOMATION                       [FLOW-024 to FLOW-028, FLOW-005]
│   │
│   ├── /ai → FLOW-024, FLOW-025, FLOW-026
│   │   ├── /ai/insights                  [IFC-095] Sprint 8 → FLOW-025
│   │   │   ├── Churn Risk predictions → FLOW-024
│   │   │   └── Next Best Action → FLOW-025
│   │   ├── /ai/explainability            [IFC-023] → FLOW-024
│   │   │   └── Model explanations → FLOW-024
│   │   └── /ai/feedback                  [IFC-025] → FLOW-026
│   │       └── Feedback collection → FLOW-026
│   │
│   └── /automation → FLOW-005
│       ├── /automation/workflows         [IFC-031] → FLOW-005
│       │   ├── Workflow list → FLOW-005
│       │   ├── /automation/workflows/new → FLOW-005
│       │   ├── /automation/workflows/templates → FLOW-005
│       │   └── /automation/workflows/[id] → FLOW-005
│       │       └── Visual workflow editor → FLOW-005
│       └── /automation/rules → FLOW-005
│           └── Business rules config → FLOW-005
│
├── SUPPORT & KNOWLEDGE BASE              [FLOW-011 to FLOW-015, FLOW-017]
│   │
│   ├── /support → FLOW-011, FLOW-014
│   │   ├── /support/kb                   [IFC-046] → FLOW-014
│   │   │   ├── Article list → FLOW-014
│   │   │   └── /support/kb/[id] → FLOW-014
│   │   ├── /support/chat                 [IFC-047] → FLOW-017
│   │   │   └── Live chat widget → FLOW-017
│   │   ├── /support/faq → FLOW-014
│   │   └── /support/status               [IFC-093] → FLOW-012
│   │       └── SLA dashboard → FLOW-012
│   │
│   └── /help → FLOW-034
│       ├── /help/getting-started → FLOW-034
│       ├── /help/guides → FLOW-034
│       └── /help/api-docs → FLOW-034
│
├── ADMIN & SETTINGS                      [FLOW-029 to FLOW-035, FLOW-037]
│   │
│   ├── /admin → FLOW-029, FLOW-031
│   │   ├── /admin/billing                [IFC-054] → FLOW-010
│   │   │   ├── Subscription management → FLOW-010
│   │   │   ├── Payment history → FLOW-010
│   │   │   └── Invoices → FLOW-010
│   │   │
│   │   ├── /admin/users                  [IFC-098] → FLOW-029
│   │   │   ├── User list → FLOW-029
│   │   │   ├── /admin/users/new → FLOW-029
│   │   │   └── /admin/users/[id] → FLOW-029
│   │   │
│   │   ├── /admin/roles                  [IFC-098] → FLOW-029
│   │   │   ├── Role list → FLOW-029
│   │   │   └── Permission matrix → FLOW-029
│   │   │
│   │   ├── /admin/audit                  [IFC-098] → FLOW-031
│   │   │   └── Audit log viewer → FLOW-031
│   │   │
│   │   ├── /admin/security               [IFC-098] → FLOW-004, FLOW-033
│   │   │   ├── Security settings → FLOW-033
│   │   │   ├── MFA config → FLOW-001
│   │   │   └── Session management → FLOW-004
│   │   │
│   │   ├── /admin/integrations           [IFC-055] → FLOW-036
│   │   │   ├── Integration marketplace → FLOW-036
│   │   │   └── /admin/integrations/[id] → FLOW-036
│   │   │
│   │   ├── /admin/api-keys               [IFC-081] → FLOW-029
│   │   │   └── API key management → FLOW-029
│   │   │
│   │   ├── /admin/webhooks               [IFC-055] → FLOW-036
│   │   │   └── Webhook configuration → FLOW-036
│   │   │
│   │   ├── /admin/compliance → FLOW-032
│   │   │   ├── /admin/compliance/gdpr    [IFC-056] → FLOW-032
│   │   │   └── /admin/compliance/accessibility [IFC-076] → FLOW-032
│   │   │
│   │   ├── /admin/features               → FLOW-037
│   │   │   └── Feature flags management → FLOW-037
│   │   │
│   │   └── /admin/system                 [AUTOMATION-002] → FLOW-030
│   │       └── System health dashboard → FLOW-030
│   │
│   └── /settings → FLOW-035
│       ├── /settings/profile → FLOW-035
│       ├── /settings/preferences → FLOW-035
│       ├── /settings/notifications → FLOW-021
│       ├── /settings/devices → FLOW-004
│       └── /settings/activity → FLOW-020
│
└── OPS & OBSERVABILITY (internal)        [FLOW-030, FLOW-033, FLOW-038]
    │
    └── /ops → FLOW-030, FLOW-038
        ├── /ops/monitoring               [IFC-097] Sprint 9 → FLOW-038
        │   └── Grafana embed → FLOW-038
        ├── /ops/traces → FLOW-038
        │   └── Distributed tracing → FLOW-038
        ├── /ops/logs → FLOW-031
        │   └── Log explorer → FLOW-031
        └── /ops/alerts → FLOW-033
            └── Alert configuration → FLOW-033
```

---

## Page Count by Section

| Section | Pages | Sprint Range |
|---------|-------|--------------|
| Public Pages | 14 | 11-12 |
| Auth Pages | 7 | 13 |
| Dashboard | 1 | 6 |
| Core CRM | 25 | 5-8 |
| Analytics & Reporting | 6 | 9 |
| AI & Automation | 8 | 8+ |
| Support & KB | 7 | Various |
| Admin & Settings | 18 | 5-10 |
| Ops & Observability | 4 | 9 |
| **Total** | **~90** | |

---

## Mockup Priority Matrix

### Must Have (Sprint 6-7)

| Route | Task | Mockup Needed |
|-------|------|---------------|
| /contacts/[id] | IFC-090 | `contact-360-view.png` ✅ EXISTS |
| /deals | IFC-091 | `dashboard-overview.png` ✅ EXISTS |
| /leads | IFC-014 | `lead-management.png` ❌ NEEDED |
| /deals/[id]/forecast | IFC-092 | `deal-forecast.png` ❌ NEEDED |
| /tickets | IFC-093 | `tickets-sla.png` ❌ NEEDED |

### Should Have (Sprint 8-9)

| Route | Task | Mockup Needed |
|-------|------|---------------|
| /documents | IFC-094 | `documents.png` |
| /ai/insights | IFC-095 | `ai-insights.png` |
| /reports/custom | IFC-096 | `report-builder.png` |
| /ops/monitoring | IFC-097 | `ops-dashboard.png` |

### Nice to Have (Sprint 11+)

| Route | Task | Mockup Needed |
|-------|------|---------------|
| / (Home) | PG-001 | `home-page.png` |
| /pricing | PG-003 | `pricing-page.png` |
| /login | PG-015 | `auth-flow.png` |

---

## Navigation Structure

### Primary Navigation (Sidebar)

```
┌─────────────────────────┐
│  IntelliFlow CRM        │
├─────────────────────────┤
│  📊 Dashboard           │
│  👥 Contacts            │
│  💼 Deals               │
│  🎫 Tickets             │
│  📄 Documents           │
│  📈 Reports             │
├─────────────────────────┤
│  🤖 AI Insights         │
│  ⚡ Automation          │
├─────────────────────────┤
│  ⚙️ Settings            │
│  👤 Admin               │
└─────────────────────────┘
```

### Top Navigation (Header)

```
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  [Search...]           [🔔] [❓] [Avatar ▼]          │
└──────────────────────────────────────────────────────────────┘
```

---

## URL Conventions

| Pattern | Example | Purpose |
|---------|---------|---------|
| `/[entity]` | `/contacts` | List view |
| `/[entity]/new` | `/contacts/new` | Create form |
| `/[entity]/[id]` | `/contacts/123` | Detail view |
| `/[entity]/[id]/edit` | `/contacts/123/edit` | Edit form |
| `/[entity]/[id]/[action]` | `/deals/123/forecast` | Sub-action |
| `/admin/[section]` | `/admin/users` | Admin pages |
| `/settings/[section]` | `/settings/profile` | User settings |

---

## File Path Mapping

All pages follow Next.js 16 App Router convention:

```
apps/web/src/app/
├── (public)/           # Public marketing pages
│   ├── page.tsx        # Home
│   ├── features/
│   ├── pricing/
│   └── ...
├── (auth)/             # Auth pages
│   ├── login/
│   ├── signup/
│   └── ...
├── (app)/              # Authenticated app
│   ├── dashboard/
│   ├── contacts/
│   │   ├── (list)/             # Route group for sidebar pages
│   │   │   ├── layout.tsx      # Module sidebar layout
│   │   │   ├── page.tsx        # /contacts (list)
│   │   │   └── new/
│   │   │       └── page.tsx    # /contacts/new (create)
│   │   └── [id]/
│   │       └── page.tsx        # /contacts/[id] (detail, NO sidebar)
│   ├── leads/
│   │   ├── (list)/             # Route group for sidebar pages
│   │   │   ├── layout.tsx      # Module sidebar layout
│   │   │   ├── page.tsx        # /leads (list)
│   │   │   └── new/
│   │   │       └── page.tsx    # /leads/new (create)
│   │   └── [id]/
│   │       └── page.tsx        # /leads/[id] (detail, NO sidebar)
│   ├── deals/
│   ├── tickets/
│   ├── documents/
│   ├── analytics/
│   ├── ai/
│   ├── automation/
│   ├── admin/
│   ├── settings/
│   └── ops/
└── api/                # API routes
```

### Route Group Convention

We use Next.js route groups `(list)/` to control layout inheritance:

- **List & Create pages**: Use `(list)/layout.tsx` with module sidebar
- **Detail pages `[id]/`**: Render full-width without module sidebar

This pattern ensures:
1. DRY sidebar code (one layout per module)
2. Consistent navigation when switching between list/create views
3. Full-width detail views for better content display

---

## Routes → Flows Quick Reference

| Route Pattern | Primary Flow | Category |
|---------------|--------------|----------|
| `/login`, `/forgot-password`, `/reset-password` | FLOW-001, FLOW-003 | Acesso e Identidade |
| `/admin/users`, `/admin/roles` | FLOW-002 | Acesso e Identidade |
| `/workspaces`, `/settings/devices` | FLOW-004 | Acesso e Identidade |
| `/dashboard` | FLOW-025 | Analytics e Insights |
| `/leads/*` | FLOW-005, FLOW-006, FLOW-007 | Comercial Core |
| `/deals/*` | FLOW-007, FLOW-008, FLOW-009 | Comercial Core |
| `/accounts/[id]` (renewals) | FLOW-010 | Comercial Core |
| `/tickets/*` | FLOW-011, FLOW-012, FLOW-013, FLOW-014 | Relacionamento e Suporte |
| `/survey/*`, NPS dashboard | FLOW-015 | Relacionamento e Suporte |
| `/contacts/*` (email) | FLOW-016 | Comunicação |
| `/support/chat` | FLOW-017 | Comunicação |
| `/contacts/[id]` (calls) | FLOW-018 | Comunicação |
| `/tasks/*` (meetings) | FLOW-019 | Comunicação |
| `/contacts/[id]` (timeline) | FLOW-020 | Comunicação |
| `/analytics/*`, `/reports/*` | FLOW-023 | Analytics e Insights |
| `/ops/monitoring` (backup) | FLOW-030 | Segurança e Compliance |
| `/admin/*` | FLOW-029 to FLOW-033 | Segurança e Compliance |
| `/settings/*` | FLOW-035 | Qualidade e Testes |
| `/ops/*` (performance) | FLOW-038 | Qualidade e Testes |

---

## Related Documents

- **Flow Index**: `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` - Master flow catalog
- **Page Registry**: `docs/design/page-registry.md` - Detailed page specs with KPIs
- **Design Mockups**: `docs/design/mockups/` - Visual designs
- **Sprint Plan**: `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`
- **Style Guide**: `docs/company/brand/style-guide.md` - Component patterns
- **Visual Identity**: `docs/company/brand/visual-identity.md` - Design tokens
- **Accessibility**: `docs/company/brand/accessibility-patterns.md` - ARIA patterns

