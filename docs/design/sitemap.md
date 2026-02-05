# IntelliFlow CRM - Sitemap

> **Location**: `docs/design/sitemap.md`
> **Last Updated**: 2026-02-02
> **Total Pages**: 68
> **Total Flows**: 42 (linked)
> **Layouts**: 15
> **API Routers**: 25 (232 procedures)

---

## Quick Links

| Document | Location | Description |
|----------|----------|-------------|
| **Page Map & Flows** | `docs/design/PAGE_MAP_AND_FLOWS.md` | Visual flow diagrams |
| **Integration Backlog** | `docs/design/integration-backlog.md` | Page specs + API requirements (23 tasks) |
| **tRPC API Routes** | `docs/api/trpc-routes.md` | Complete API inventory |
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog (42 flows) |

---

## Design System References

| Resource | Location | Purpose |
|----------|----------|---------|
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog |
| **Integration Backlog** | `docs/design/integration-backlog.md` | Page specs with API requirements |
| **UI Flow Mapping** | `docs/design/ui-flow-mapping.md` | Route → Flow → Component cross-reference |
| **Style Guide** | `docs/company/brand/style-guide.md` | Component patterns |
| **Visual Identity** | `docs/company/brand/visual-identity.md` | Design tokens |
| **Accessibility** | `docs/company/brand/accessibility-patterns.md` | ARIA patterns |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md` | Best practices |

---

## Visual Sitemap

```
intelliflow.com
│
├── PUBLIC PAGES (20 pages) ──────────────── Route Group: (public)
│   │
│   ├── / (Home)                          [PG-001] → Conditional render:
│   │                                       • Unauth: PublicHomePage
│   │                                       • Auth: AuthenticatedHomePage
│   ├── /features                         [PG-002]
│   ├── /pricing                          [PG-003]
│   ├── /about                            [PG-004]
│   ├── /contact                          [PG-005]
│   ├── /partners                         [PG-006]
│   ├── /press                            [PG-007]
│   ├── /security                         [PG-008]
│   ├── /status                           [PG-014]
│   │
│   ├── /blog                             [PG-009]
│   │   └── /blog/[slug]                  [PG-010] Dynamic blog post
│   │
│   ├── /careers                          [PG-011]
│   │   └── /careers/[id]                 [PG-012] Job posting detail
│   │
│   ├── /lp/[slug]                        [PG-013] Campaign landing pages
│   │
│   ├── /login                            → FLOW-001
│   ├── /signup                           → FLOW-001
│   │   └── /signup/success               → FLOW-001 (confirmation)
│   ├── /forgot-password                  → FLOW-003
│   ├── /reset-password/[token]           → FLOW-003
│   └── /logout                           Session termination
│
├── AUTH CALLBACKS ────────────────────────── Route: /auth/*
│   │
│   ├── /auth/callback                    → FLOW-001 (OAuth redirect)
│   ├── /auth/mfa/verify                  → FLOW-001 (2FA input)
│   └── /auth/verify-email/[token]        → FLOW-001 (email confirmation)
│
├── DASHBOARD ─────────────────────────────── Layout: Root
│   │
│   ├── /dashboard                        → FLOW-025 (main dashboard)
│   ├── /dashboard/new                    Create custom dashboard
│   └── /dashboard/customize              Edit dashboard widgets
│
├── CRM CORE: LEADS ──────────────────────── Layout: leads/(list)
│   │
│   ├── /leads                            → FLOW-005 (list + filters)
│   │   ├── ?view=my                      My assigned leads
│   │   ├── ?view=starred                 Bookmarked leads
│   │   ├── ?view=recent                  Recently viewed
│   │   ├── ?segment=new-week             New this week
│   │   ├── ?segment=hot                  Score >80
│   │   └── ?segment=followup             Needs follow-up
│   ├── /leads/new                        → FLOW-005 (create form)
│   └── /leads/[id]                       → FLOW-006 (360° view, NO sidebar)
│
├── CRM CORE: CONTACTS ───────────────────── Layout: contacts/(list)
│   │
│   ├── /contacts                         → FLOW-016 (list + search)
│   ├── /contacts/new                     → FLOW-016 (create form)
│   └── /contacts/[id]                    → FLOW-020 (profile, NO sidebar)
│
├── CRM CORE: DEALS ──────────────────────── Layout: deals/(list), deals/[id]
│   │
│   ├── /deals                            → FLOW-007, FLOW-008 (pipeline)
│   ├── /deals/forecast                   → FLOW-025 (sales forecasting)
│   └── /deals/[id]                       → FLOW-008 (deal detail)
│       └── /deals/[id]/forecast          → FLOW-024 (AI probability)
│
├── CRM CORE: TICKETS ────────────────────── Layout: tickets/(list)
│   │
│   ├── /tickets                          → FLOW-011 (queue + SLA badges)
│   └── /tickets/[id]                     → FLOW-012, FLOW-013 (detail)
│
├── CRM CORE: DOCUMENTS ──────────────────── Layout: documents/(list)
│   │
│   ├── /documents                        Document repository
│   ├── /documents/new                    Upload form
│   └── /documents/[id]                   Preview + metadata
│
├── CRM CORE: CASES ──────────────────────── Route: /cases
│   │
│   └── /cases/timeline                   → FLOW-020 (deadline engine)
│
├── AI & AUTOMATION ──────────────────────── Layout: agent-approvals
│   │
│   └── /agent-approvals          [IFC-149] AI action queue
│
├── ANALYTICS ────────────────────────────── Layout: analytics/(list)
│   │
│   └── /analytics                        → FLOW-023 (charts + KPIs)
│
├── SETTINGS ─────────────────────────────── Layout: settings
│   │
│   ├── /settings                         Settings overview
│   ├── /settings/account                 → FLOW-035 (personal settings)
│   ├── /settings/team                    → FLOW-029 (team members)
│   ├── /settings/ai                      → FLOW-045 (AI chain versioning)
│   ├── /settings/integrations            → FLOW-036 (third-party)
│   ├── /settings/notifications           → FLOW-021 (alert preferences)
│   ├── /settings/pipeline                Pipeline stage config
│   └── /settings/security/mfa            → FLOW-001 (2FA setup)
│
├── BILLING ──────────────────────────────── Layout: billing
│   │
│   ├── /billing                          → FLOW-010 (overview)
│   ├── /billing/checkout                 Payment processing
│   ├── /billing/subscriptions            Plan management
│   ├── /billing/payment-methods          Card management
│   ├── /billing/invoices                 Invoice list
│   │   └── /billing/invoices/[id]        Invoice detail
│   └── /billing/receipts                 Receipt history
│
├── GOVERNANCE ───────────────────────────── Layout: governance
│   │
│   ├── /governance                       Compliance dashboard
│   ├── /governance/adr                   ADR registry
│   ├── /governance/compliance            Standards tracking
│   ├── /governance/policies              Policy management
│   └── /governance/quality-reports       Quality assessments
│       └── /governance/quality-reports/[reportId]  Report detail
│
├── NOTIFICATIONS ────────────────────────── Layout: notifications
│   │
│   ├── /notifications                    All notifications
│   └── /notifications/settings           Notification preferences
│
└── PROFILE ──────────────────────────────── Route: /profile
    │
    └── /profile                          User account details
```

---

## Page Count by Section

| Section | Pages | Status |
|---------|-------|--------|
| Public Pages | 20 | Marketing, auth, blog, careers |
| Auth Callbacks | 3 | OAuth, MFA, email verify |
| Dashboard | 3 | Main, new, customize |
| CRM Core: Leads | 3 | List, new, detail |
| CRM Core: Contacts | 3 | List, new, detail |
| CRM Core: Deals | 4 | List, detail, forecast (2) |
| CRM Core: Tickets | 2 | List, detail |
| CRM Core: Documents | 3 | List, new, detail |
| CRM Core: Cases | 1 | Timeline |
| AI & Automation | 1 | Agent approvals |
| Analytics | 1 | Dashboard |
| Settings | 8 | Account, team, AI, integrations, etc. |
| Billing | 7 | Overview, checkout, subscriptions, etc. |
| Governance | 6 | ADR, compliance, policies, reports |
| Notifications | 2 | List, settings |
| Profile | 1 | User profile |
| **Total** | **68** | |

---

## Implementation Status

### Implemented Pages (68 total)

| Category | Route | Status | Flow |
|----------|-------|--------|------|
| Public | `/`, `/login`, `/signup`, etc. | ✅ Implemented | FLOW-001 |
| Dashboard | `/dashboard`, `/dashboard/new` | ✅ Implemented | FLOW-025 |
| Leads | `/leads`, `/leads/new`, `/leads/[id]` | ✅ Implemented | FLOW-005, FLOW-006 |
| Contacts | `/contacts`, `/contacts/new`, `/contacts/[id]` | ✅ Implemented | FLOW-016 |
| Deals | `/deals`, `/deals/[id]`, `/deals/[id]/forecast` | ✅ Implemented | FLOW-007, FLOW-008 |
| Tickets | `/tickets`, `/tickets/[id]` | ✅ Implemented | FLOW-011, FLOW-012 |
| Documents | `/documents`, `/documents/new`, `/documents/[id]` | ✅ Implemented | - |
| Settings | `/settings/*` (8 pages) | ✅ Implemented | FLOW-035, FLOW-045 |
| Billing | `/billing/*` (7 pages) | ✅ Implemented | FLOW-010 |
| Governance | `/governance/*` (6 pages) | ✅ Implemented | FLOW-032 |
| AI | `/agent-approvals` | ✅ Implemented | IFC-149 |
| Analytics | `/analytics` | ✅ Implemented | FLOW-023 |

### Mockup References

| Route | Mockup | Location |
|-------|--------|----------|
| /contacts/[id] | `contact-360-view.png` | `docs/design/mockups/` |
| /leads/[id] | `lead-360-view.png` | `docs/design/mockups/` |
| /deals | `dashboard-overview.png` | `docs/design/mockups/` |
| /deals/[id]/forecast | `deal-forecast.png` | `docs/design/mockups/` |

### Backend Integration Status

| Route | Integration | Required APIs |
|-------|-------------|---------------|
| `/` (Auth Home) | 🔴 Hardcoded | `dashboard.getWelcomeSummary`, `feed.getItems`, `ai.getDailyInsights` |
| `/dashboard` | 🟡 Partial | `dashboard.getMetrics`, `dashboard.getWidgets` |
| `/leads/*` | 🟢 Integrated | `lead.*` (16 procedures) |
| `/contacts/*` | 🟢 Integrated | `contact.*` (14 procedures) |
| `/deals/*` | 🟢 Integrated | `opportunity.*` (7 procedures) |
| `/deals/[id]/forecast` | 🔴 Hardcoded | `intelligence.getDealForecast` |
| `/tickets/*` | 🟢 Integrated | `ticket.*` (10 procedures) |
| `/analytics` | 🟡 Partial | `analytics.*` (5 procedures) |
| `/billing/*` | 🔴 Hardcoded | `billing.*` (11 procedures) - Stripe integration pending |
| `/governance/*` | 🟢 Integrated | Local API routes |

**Legend**: 🔴 Hardcoded | 🟡 Partial | 🟢 Integrated

---

## Navigation Structure

### Top Navigation (Header)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Dashboard  Leads  Contacts  Deals  Tickets  Documents  Agent  Reports  [🔍] [🔔] [👤] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Header Navigation Items

| Item | Route | Icon |
|------|-------|------|
| Dashboard | `/dashboard` | `dashboard` |
| Leads | `/leads` | `group` |
| Contacts | `/contacts` | `person` |
| Deals | `/deals` | `handshake` |
| Tickets | `/tickets` | `confirmation_number` |
| Documents | `/documents` | `description` |
| Agent Actions | `/agent-approvals` | `smart_toy` |
| Reports | `/analytics` | `bar_chart` |

### Module Sidebars

Each CRM module has a context-specific sidebar. Sidebar configs are located in:
`apps/web/src/components/sidebar/configs/`

| Module | Config File | Features |
|--------|-------------|----------|
| Leads | `leads.ts` | Views (All, My, Starred, Recent), Segments (Hot, Follow-up) |
| Contacts | `contacts.ts` | Views, Tags, Lists |
| Deals | `deals.ts` | Pipeline views, Stages, Forecasts |
| Tickets | `tickets.ts` | Queues, SLA status, Assignments |
| Documents | `documents.ts` | Folders, Tags, Recent |
| Analytics | `analytics.ts` | Dashboards, Reports |
| Agent Approvals | `agent-approvals.ts` | Pending, Approved, Rejected |
| Notifications | `notifications.ts` | All, Unread, Mentions |
| Governance | `governance.ts` | ADR, Compliance, Quality |
| Settings | `settings.ts` | Account, Team, AI, Integrations |
| Billing | `billing.ts` | Overview, Subscriptions, Invoices |

### Leads Sidebar Example

```
Lead Views
├── All Leads           /leads
├── My Leads            /leads?view=my
├── Starred             /leads?view=starred
└── Recently Viewed     /leads?view=recent

Segments
├── New This Week       /leads?segment=new-week
├── Hot Leads (>80)     /leads?segment=hot
└── Needs Follow-up     /leads?segment=followup
```

### Settings Sidebar Example

```
Settings
├── Account             /settings/account
├── Team                /settings/team
├── AI Chains           /settings/ai
├── Integrations        /settings/integrations
├── Pipeline            /settings/pipeline
├── Notifications       /settings/notifications
└── Security            /settings/security/mfa

More
└── Governance          /governance
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
├── layout.tsx                    # Root layout (Providers, Navigation)
│
├── (public)/                     # PUBLIC ROUTE GROUP (20 pages)
│   ├── layout.tsx                # Public layout (minimal)
│   ├── page.tsx                  # / (Home - conditional render)
│   ├── login/page.tsx            # /login
│   ├── signup/
│   │   ├── page.tsx              # /signup
│   │   └── success/page.tsx      # /signup/success
│   ├── forgot-password/page.tsx  # /forgot-password
│   ├── reset-password/[token]/   # /reset-password/[token]
│   ├── logout/page.tsx           # /logout
│   ├── about/page.tsx            # /about
│   ├── features/page.tsx         # /features
│   ├── pricing/page.tsx          # /pricing
│   ├── contact/page.tsx          # /contact
│   ├── partners/page.tsx         # /partners
│   ├── press/page.tsx            # /press
│   ├── security/page.tsx         # /security
│   ├── status/page.tsx           # /status
│   ├── blog/
│   │   ├── page.tsx              # /blog
│   │   └── [slug]/page.tsx       # /blog/[slug]
│   ├── careers/
│   │   ├── page.tsx              # /careers
│   │   └── [id]/page.tsx         # /careers/[id]
│   └── lp/[slug]/page.tsx        # /lp/[slug]
│
├── auth/                         # AUTH CALLBACKS (3 pages)
│   ├── callback/page.tsx         # /auth/callback (OAuth)
│   ├── mfa/verify/page.tsx       # /auth/mfa/verify
│   └── verify-email/[token]/     # /auth/verify-email/[token]
│
├── dashboard/                    # DASHBOARD (3 pages)
│   ├── page.tsx                  # /dashboard
│   ├── new/page.tsx              # /dashboard/new
│   └── customize/page.tsx        # /dashboard/customize
│
├── leads/                        # LEADS (3 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Leads sidebar layout
│   │   ├── page.tsx              # /leads
│   │   └── new/page.tsx          # /leads/new
│   └── [id]/page.tsx             # /leads/[id] (NO sidebar)
│
├── contacts/                     # CONTACTS (3 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Contacts sidebar layout
│   │   ├── page.tsx              # /contacts
│   │   └── new/page.tsx          # /contacts/new
│   └── [id]/page.tsx             # /contacts/[id] (NO sidebar)
│
├── deals/                        # DEALS (4 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Deals sidebar layout
│   │   └── page.tsx              # /deals
│   ├── [id]/
│   │   ├── layout.tsx            # Deal detail layout
│   │   ├── page.tsx              # /deals/[id]
│   │   └── forecast/page.tsx     # /deals/[id]/forecast
│   └── forecast/
│       ├── layout.tsx            # Forecast layout
│       └── page.tsx              # /deals/forecast
│
├── tickets/                      # TICKETS (2 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Tickets sidebar layout
│   │   └── page.tsx              # /tickets
│   └── [id]/page.tsx             # /tickets/[id]
│
├── documents/                    # DOCUMENTS (3 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Documents sidebar layout
│   │   ├── page.tsx              # /documents
│   │   └── new/page.tsx          # /documents/new
│   └── [id]/page.tsx             # /documents/[id]
│
├── cases/timeline/page.tsx       # /cases/timeline (1 page)
│
├── analytics/(list)/             # ANALYTICS (1 page)
│   ├── layout.tsx
│   └── page.tsx                  # /analytics
│
├── agent-approvals/              # AI AGENT (1 page)
│   ├── layout.tsx
│   └── page.tsx                  # /agent-approvals
│
├── settings/                     # SETTINGS (8 pages)
│   ├── layout.tsx                # Settings sidebar layout
│   ├── page.tsx                  # /settings
│   ├── account/page.tsx          # /settings/account
│   ├── team/page.tsx             # /settings/team
│   ├── ai/page.tsx               # /settings/ai
│   ├── integrations/page.tsx     # /settings/integrations
│   ├── notifications/page.tsx    # /settings/notifications
│   ├── pipeline/page.tsx         # /settings/pipeline
│   └── security/mfa/page.tsx     # /settings/security/mfa
│
├── billing/                      # BILLING (7 pages)
│   ├── layout.tsx                # Billing sidebar layout
│   ├── page.tsx                  # /billing
│   ├── checkout/page.tsx         # /billing/checkout
│   ├── subscriptions/page.tsx    # /billing/subscriptions
│   ├── payment-methods/page.tsx  # /billing/payment-methods
│   ├── invoices/
│   │   ├── page.tsx              # /billing/invoices
│   │   └── [id]/page.tsx         # /billing/invoices/[id]
│   └── receipts/page.tsx         # /billing/receipts
│
├── governance/                   # GOVERNANCE (6 pages)
│   ├── layout.tsx                # Governance sidebar layout
│   ├── page.tsx                  # /governance
│   ├── adr/page.tsx              # /governance/adr
│   ├── compliance/page.tsx       # /governance/compliance
│   ├── policies/page.tsx         # /governance/policies
│   └── quality-reports/
│       ├── page.tsx              # /governance/quality-reports
│       └── [reportId]/page.tsx   # /governance/quality-reports/[reportId]
│
├── notifications/                # NOTIFICATIONS (2 pages)
│   ├── layout.tsx
│   ├── page.tsx                  # /notifications
│   └── settings/page.tsx         # /notifications/settings
│
├── profile/page.tsx              # /profile (1 page)
│
└── api/                          # API ROUTES (16 routes)
    ├── trpc/[trpc]/route.ts      # tRPC handler
    ├── adr/                       # ADR management
    ├── compliance/                # Compliance APIs
    └── quality-reports/           # Quality report APIs
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

### Authentication & Identity (FLOW-001 to FLOW-004)

| Route | Flow | Description |
|-------|------|-------------|
| `/login` | FLOW-001 | Login with MFA (SSO, OAuth2, 2FA) |
| `/signup`, `/signup/success` | FLOW-001 | Registration flow |
| `/auth/callback` | FLOW-001 | OAuth callback handler |
| `/auth/mfa/verify` | FLOW-001 | MFA verification |
| `/auth/verify-email/[token]` | FLOW-001 | Email confirmation |
| `/forgot-password` | FLOW-003 | Password recovery request |
| `/reset-password/[token]` | FLOW-003 | Password reset |
| `/settings/security/mfa` | FLOW-001 | MFA setup |
| `/settings/team` | FLOW-002 | User management |

### CRM Core (FLOW-005 to FLOW-010)

| Route | Flow | Description |
|-------|------|-------------|
| `/leads` | FLOW-005 | Lead list with AI scoring |
| `/leads/new` | FLOW-005 | Create new lead |
| `/leads/[id]` | FLOW-006 | Lead 360° view, conversion |
| `/contacts/*` | FLOW-016 | Contact management |
| `/contacts/[id]` | FLOW-020 | Activity timeline |
| `/deals` | FLOW-007 | Pipeline Kanban |
| `/deals/[id]` | FLOW-008 | Deal details |
| `/deals/[id]/forecast` | FLOW-024 | AI deal probability |
| `/deals/forecast` | FLOW-025 | Sales forecasting |
| `/billing/*` | FLOW-010 | Subscription management |

### Support & Tickets (FLOW-011 to FLOW-015)

| Route | Flow | Description |
|-------|------|-------------|
| `/tickets` | FLOW-011 | Ticket creation |
| `/tickets/[id]` | FLOW-012, FLOW-013 | Routing, SLA management |
| `/tickets/[id]` (close) | FLOW-014 | Resolution and closure |

### Analytics & AI (FLOW-023 to FLOW-028, FLOW-045)

| Route | Flow | Description |
|-------|------|-------------|
| `/dashboard` | FLOW-025 | Main dashboard |
| `/analytics` | FLOW-023 | Report builder |
| `/settings/ai` | FLOW-045 | AI chain versioning |
| `/agent-approvals` | IFC-149 | AI action approvals |

### Security & Compliance (FLOW-029 to FLOW-033)

| Route | Flow | Description |
|-------|------|-------------|
| `/governance` | FLOW-032 | Compliance dashboard |
| `/governance/adr` | FLOW-029 | Architecture decisions |
| `/governance/compliance` | FLOW-032 | LGPD/GDPR tracking |
| `/governance/quality-reports` | FLOW-038 | Quality assessments |

---

## Related Documents

### Primary Documentation

| Document | Location | Description |
|----------|----------|-------------|
| **Page Map & Flows** | `docs/design/PAGE_MAP_AND_FLOWS.md` | Visual flow diagrams, integration checklist |
| **tRPC API Routes** | `docs/api/trpc-routes.md` | Complete API inventory (25 routers, 232 procedures) |
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master catalog of 42 flows |
| **Sprint Plan** | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Task tracking (316 tasks) |

### Design System

| Document | Location | Description |
|----------|----------|-------------|
| **Style Guide** | `docs/company/brand/style-guide.md` | Component patterns |
| **Visual Identity** | `docs/company/brand/visual-identity.md` | Design tokens |
| **Accessibility** | `docs/company/brand/accessibility-patterns.md` | ARIA patterns |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md` | Best practices |
| **Design Mockups** | `docs/design/mockups/` | Visual designs (PNG, HTML) |

### Technical Documentation

| Document | Location | Description |
|----------|----------|-------------|
| **ADR Registry** | `docs/planning/adr/` | Architecture Decision Records |
| **Domain Models** | `docs/domain/` | DDD documentation |
| **API Docs** | Auto-generated from tRPC | Type-safe API reference |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-12-27 | Initial sitemap |
| 2.0 | 2026-02-02 | Updated to 68 pages, 42 flows, 15 layouts. Added accurate route mapping, backend integration status, and file path structure. |

