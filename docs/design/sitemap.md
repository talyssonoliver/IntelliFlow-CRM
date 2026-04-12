# IntelliFlow CRM - Sitemap

> **Location**: `docs/design/sitemap.md` **Last Updated**: 2026-04-11 **Total
> Pages**: 145 **Total Flows**: 42 (linked) **Layouts**: 37 **API Routers**: 25
> (232 procedures)

---

## Quick Links

| Document                | Location                                                        | Description                              |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| **Page Map & Flows**    | `docs/design/PAGE_MAP_AND_FLOWS.md`                             | Visual flow diagrams                     |
| **Integration Backlog** | `docs/design/integration-backlog.md`                            | Page specs + API requirements (23 tasks) |
| **tRPC API Routes**     | `docs/api/trpc-routes.md`                                       | Complete API inventory                   |
| **Flow Index**          | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog (42 flows)           |

---

## Design System References

| Resource                | Location                                                        | Purpose                                  |
| ----------------------- | --------------------------------------------------------------- | ---------------------------------------- |
| **Flow Index**          | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master flow catalog                      |
| **Integration Backlog** | `docs/design/integration-backlog.md`                            | Page specs with API requirements         |
| **UI Flow Mapping**     | `docs/design/ui-flow-mapping.md`                                | Route → Flow → Component cross-reference |
| **Style Guide**         | `docs/company/brand/style-guide.md`                             | Component patterns                       |
| **Visual Identity**     | `docs/company/brand/visual-identity.md`                         | Design tokens                            |
| **Accessibility**       | `docs/company/brand/accessibility-patterns.md`                  | ARIA patterns                            |
| **Do's and Don'ts**     | `docs/company/brand/dos-and-donts.md`                           | Best practices                           |

---

## Visual Sitemap

```
intelliflow.com
│
├── PUBLIC PAGES (30 pages) ──────────────── Route Group: (public)
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
│   │   └── /press/[id]                   [PG-179] Press release detail
│   ├── /security                         [PG-008]
│   ├── /status                           [PG-014]
│   ├── /404                              [PG-055] Direct missing-page route (noindex)
│   ├── /500                              [PG-056] Direct error-page route (noindex)
│   ├── /privacy                          [PG-050] Privacy policy
│   ├── /terms                            [PG-051] Terms of service
│   ├── /cookies                          [PG-052] Cookie policy
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
│   ├── /reset-password/callback          → FLOW-003 (callback handler)
│   ├── /logout                           Session termination
│   ├── /sso                              Enterprise SSO entry form (PG-124)
│   │
│   ├── /auth/callback                    → FLOW-001 (OAuth redirect)
│   ├── /mfa/verify                       → FLOW-001 (2FA input)
│   ├── /verify-email/[token]             → FLOW-001 (email confirmation)
│   └── /verify-email/callback            → FLOW-001 (email verify callback)
│
├── DEVELOPER PORTAL (14 pages) ──────────── Route Group: (developer)
│   │
│   ├── /developers/apps                  Developer applications registry
│   ├── /developers/apps/new             Developer app creation
│   ├── /developers/apps/[id]             Developer app detail dashboard
│   ├── /developers/apps/[id]/edit       Developer app edit settings
│   ├── /docs                             Documentation home
│   ├── /docs/api                         API reference
│   ├── /docs/architecture               Architecture docs — ADR list, DDD context map (PG-169)
│   ├── /docs/auth                        Authentication guides (PG-038)
│   ├── /docs/changelog                   Changelog — release history and version notes (PG-035)
│   ├── /docs/cli                         CLI reference — monorepo CLI commands
│   ├── /docs/guides                      Developer guides (PG-169)
│   ├── /docs/integrations                Integration guides
│   ├── /docs/sdk                         SDK guides
│   └── /docs/webhooks                    Webhook documentation
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
│   ├── /leads/[id]                       → FLOW-006 (360° view, NO sidebar)
│   └── /leads/[id]/edit                  Edit lead fields and metadata
│
├── CRM CORE: CONTACTS ───────────────────── Layout: contacts/(list)
│   │
│   ├── /contacts                         → FLOW-016 (list + search)
│   ├── /contacts/new                     → FLOW-016 (create form)
│   ├── /contacts/[id]                    → FLOW-020 (profile, NO sidebar)
│   └── /contacts/[id]/edit              Edit contact fields
│
├── CRM CORE: ACCOUNTS ──────────────────── Layout: accounts/(list)
│   │
│   ├── /accounts                         Account list
│   └── /accounts/[id]                    Account detail (NO sidebar)
│
├── CRM CORE: DEALS ──────────────────────── Layout: deals/(list), deals/[id]
│   │
│   ├── /deals                            → FLOW-007, FLOW-008 (pipeline)
│   ├── /deals/trash                      → PG-175 (soft-deleted deals)
│   ├── /deals/forecast                   → FLOW-025 (sales forecasting)
│   └── /deals/[id]                       → FLOW-008 (deal detail)
│       └── /deals/[id]/forecast          → FLOW-024 (AI probability)
│
├── CRM CORE: TICKETS ────────────────────── Layout: tickets/(list)
│   │
│   ├── /tickets                          → FLOW-011 (queue + SLA badges)
│   ├── /tickets/new                      → FLOW-011 (create ticket)
│   └── /tickets/[id]                     → FLOW-012, FLOW-013 (detail)
│
├── CRM CORE: DOCUMENTS ──────────────────── Layout: documents/(list)
│   │
│   ├── /documents                        Document repository
│   ├── /documents/new                    Upload form
│   └── /documents/[id]                   Preview + metadata
│
├── CRM CORE: CASES ─────────────────────── Layout: cases/(list)
│   │
│   ├── /cases                            Case list
│   ├── /cases/new                        Create new case
│   ├── /cases/[id]                       Case detail
│   └── /cases/timeline                   → FLOW-020 (deadline engine)
│
├── TASKS ───────────────────────────────── Layout: tasks/(list)
│   │
│   ├── /tasks                            Task list
│   └── /tasks/[id]                       Task detail
│
├── CALENDAR ────────────────────────────── Layout: calendar/(list)
│   │
│   ├── /calendar                         Calendar view
│   ├── /calendar/new                     Create appointment
│   └── /calendar/[id]                    Appointment detail
│
├── EMAIL ───────────────────────────────── Layout: email
│   │
│   ├── /email                            Email inbox
│   └── /email/[id]                       Email detail
│
├── AI & AUTOMATION ──────────────────────── Layout: agent-approvals
│   │
│   ├── /agent-approvals                  [IFC-149] AI action queue
│   ├── /agent-approvals/agents           Agent registry
│   ├── /agent-approvals/ai-review        AI review queue
│   │   └── /agent-approvals/ai-review/[id]  Review detail
│   ├── /agent-approvals/ai-search        AI-powered search
│   ├── /agent-approvals/churn-risk       Churn risk analysis
│   ├── /agent-approvals/drift            Model drift monitoring
│   ├── /agent-approvals/experiments      A/B experiment hub
│   ├── /agent-approvals/history          Approval history log
│   ├── /agent-approvals/latency          Latency monitoring
│   ├── /agent-approvals/lead-scoring     Lead scoring dashboard
│   ├── /agent-approvals/logs             AI action logs
│   ├── /agent-approvals/preview          Preview AI actions
│   └── /agent-approvals/sentiment        Sentiment analysis
│
├── AI INSIGHTS ──────────────────────────── Layout: insights
│   │
│   └── /insights                          [PG-160] All AI insights (paginated, filtered)
│
├── ANALYTICS ────────────────────────────── Layout: analytics/(list)
│   │
│   ├── /analytics                        → FLOW-023 (charts + KPIs)
│   └── /analytics/feedback               Feedback analytics
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
│   ├── /settings/routing                 Ticket routing rules
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
│       ├── /governance/quality-reports/[reportId]     Report detail
│       ├── /governance/quality-reports/lighthouse     Lighthouse scores
│       ├── /governance/quality-reports/coverage       Coverage trends
│       └── /governance/quality-reports/performance    Performance benchmarks
│
├── NOTIFICATIONS ────────────────────────── Layout: notifications
│   │
│   ├── /notifications                    All notifications
│   └── /notifications/settings           Notification preferences
│
├── PROFILE ──────────────────────────────── Route: /profile
│   │
│   └── /profile                          User account details
│
├── SUPPORT PORTAL ──────────────────────── Layout: support/tickets/(list)
│   │
│   ├── /support/tickets                  → Support-agent ticket queue (SLA-first)
│   ├── /support/tickets/new              → New ticket form with file attachments
│   └── /support/tickets/[id]             → Ticket detail (no delete/archive, PG-048)
│
└── SUPPORT / HELP CENTER ───────────────── Route: /help-center
    │
    └── /help-center                      Self-service help center
```

---

## Page Count by Section

| Section               | Pages   | Status                                         |
| --------------------- | ------- | ---------------------------------------------- |
| Public Pages          | 29      | Marketing, auth, blog, careers, callbacks, SSO, legal, system |
| Developer Portal      | 14      | Docs (10), apps (3), apps/new (1)              |
| Dashboard             | 3       | Main, new, customize                           |
| CRM Core: Leads       | 4       | List, new, detail, edit                        |
| CRM Core: Contacts    | 4       | List, new, detail, edit                        |
| CRM Core: Accounts    | 2       | List, detail                                   |
| CRM Core: Deals       | 5       | List, trash, detail, forecast (2)              |
| CRM Core: Tickets     | 3       | List, new, detail                              |
| CRM Core: Documents   | 3       | List, new, detail                              |
| CRM Core: Cases       | 4       | List, new, detail, timeline                    |
| Tasks                 | 2       | List, detail                                   |
| Calendar              | 3       | List, new, detail                              |
| Email                 | 2       | Inbox, detail                                  |
| AI & Automation       | 14      | Queue + 13 sub-pages                           |
| AI Insights           | 1       | All insights (paginated, filtered)             |
| Analytics             | 5       | Dashboard, feedback, weekly, monthly, quarterly |
| Settings              | 9       | Account, team, AI, integrations, routing, etc. |
| Billing               | 7       | Overview, checkout, subscriptions, etc.        |
| Governance            | 9       | ADR, compliance, policies, reports, lighthouse, coverage, performance |
| Notifications         | 2       | List, settings                                 |
| Profile               | 1       | User profile                                   |
| Support Portal        | 1       | Support-agent ticket queue                     |
| Support / Help Center | 1       | Self-service help center                       |
| **Total**             | **128** |                                                |

---

## XML Sitemap Coverage

### `apps/web/src/app/sitemap.ts`

Next.js auto-serves this at `/sitemap.xml`. Contains **public marketing pages
only** — no authenticated routes.

**Included routes (15):**

| Route                                  | Priority | Change Frequency |
| -------------------------------------- | -------- | ---------------- |
| `/`                                    | 1.0      | weekly           |
| `/features`                            | 0.9      | monthly          |
| `/pricing`                             | 0.9      | monthly          |
| `/signup`                              | 0.8      | monthly          |
| `/about`                               | 0.8      | monthly          |
| `/contact`                             | 0.8      | monthly          |
| `/blog`                                | 0.8      | monthly          |
| `/careers`                             | 0.8      | monthly          |
| `/login`                               | 0.7      | monthly          |
| `/partners`                            | 0.6      | monthly          |
| `/press`                               | 0.6      | monthly          |
| `/security`                            | 0.6      | monthly          |
| `/status`                              | 0.4      | hourly           |
| `/privacy`                             | 0.5      | monthly          |
| `/cookies`                             | 0.5      | monthly          |
| `/blog/ai-lead-scoring-best-practices` | 0.6      | monthly          |
| `/blog/governance-ready-automation`    | 0.6      | monthly          |

**Excluded:** All 78 authenticated routes, `/404`, `/500`, auth flow pages, dynamic
`[id]`/`[token]` routes, API routes, redirect-only paths.

### `apps/web/src/app/robots.ts`

Next.js auto-serves this at `/robots.txt`. Configures crawl rules:

- **Allow**: `/` (all public marketing paths)
- **Disallow**: 16 authenticated module prefixes, auth flows, `/api/`, `/docs`
- **Sitemap**: Points to `/sitemap.xml`

---

## Planned Pages (Sprint 16+)

28 ghost links identified in `docs/design/navigation-reachability-audit.md` that
resolve to sidebar/navigation links but have no `page.tsx` yet:

| Route                                     | Section              | Sprint |
| ----------------------------------------- | -------------------- | ------ |
| `/billing/usage`                          | Billing              | 16     |
| `/billing/plans`                          | Billing              | 16     |
| `/billing/upgrade`                        | Billing              | 16     |
| `/billing/cancel`                         | Billing              | 16     |
| `/billing/settings`                       | Billing              | 16     |
| `/tickets/sla-policies`                   | Tickets Config       | 16     |
| `/tickets/types`                          | Tickets Config       | 16     |
| `/tickets/automations`                    | Tickets Config       | 16     |
| `/notifications/channels`                 | Notifications Config | 16     |
| `/notifications/quiet-hours`              | Notifications Config | 16     |
| `/deals/trash`                            | Deals                | 16     |
| `/governance/quality-reports/lighthouse`  | Governance           | 16     |
| `/governance/quality-reports/coverage`    | Governance           | 16     |
| `/governance/quality-reports/performance` | Governance           | 16     |
| `/analytics/saved/weekly`                 | Analytics            | 16     |
| `/analytics/saved/monthly`                | Analytics            | 16     |
| `/analytics/saved/quarterly`              | Analytics            | 16     |
| `/settings/leads`                         | Module Settings      | 16     |
| `/settings/contacts`                      | Module Settings      | 16     |
| `/settings/accounts`                      | Module Settings      | 16     |
| `/settings/deals`                         | Module Settings      | 16     |
| `/settings/tickets`                       | Module Settings      | 16     |
| `/settings/documents`                     | Module Settings      | 16     |
| `/settings/reports`                       | Module Settings      | 16     |
| `/settings/billing`                       | Module Settings      | 16     |
| `/settings/appointments`                  | Module Settings      | 16     |
| `/settings/cases`                         | Module Settings      | 16     |
| `/settings/tasks`                         | Module Settings      | 16     |

---

## Implementation Status

### Implemented Pages (125 total)

| Category      | Route                                                                                                                                                                                                                                                            | Status      | Flow               |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------ |
| Public        | `/`, `/login`, `/signup`, `/sso`, etc. (27 pages)                                                                                                                                                                                                                | Implemented | FLOW-001           |
| Developer     | `/docs`, `/docs/api`, `/docs/auth`, `/docs/changelog`, `/docs/guides`, `/docs/integrations`, `/docs/sdk`, `/docs/webhooks`, `/docs/architecture`, `/docs/cli`, `/developers/apps`, `/developers/apps/new`, `/developers/apps/[id]`, `/developers/apps/[id]/edit` | Implemented | -                  |
| Dashboard     | `/dashboard`, `/dashboard/new`                                                                                                                                                                                                                                   | Implemented | FLOW-025           |
| Leads         | `/leads`, `/leads/new`, `/leads/[id]`, `/leads/[id]/edit`                                                                                                                                                                                                        | Implemented | FLOW-005, FLOW-006 |
| Contacts      | `/contacts`, `/contacts/new`, `/contacts/[id]`, `/contacts/[id]/edit`                                                                                                                                                                                            | Implemented | FLOW-016           |
| Accounts      | `/accounts`, `/accounts/[id]`                                                                                                                                                                                                                                    | Implemented | -                  |
| Deals         | `/deals`, `/deals/trash`, `/deals/[id]`, `/deals/[id]/forecast`                                                                                                                                                                                                   | Implemented | FLOW-007, FLOW-008 |
| Tickets       | `/tickets`, `/tickets/new`, `/tickets/[id]`                                                                                                                                                                                                                      | Implemented | FLOW-011, FLOW-012 |
| Documents     | `/documents`, `/documents/new`, `/documents/[id]`                                                                                                                                                                                                                | Implemented | -                  |
| Cases         | `/cases`, `/cases/new`, `/cases/[id]`, `/cases/timeline`                                                                                                                                                                                                         | Implemented | FLOW-020           |
| Tasks         | `/tasks`, `/tasks/[id]`                                                                                                                                                                                                                                          | Implemented | -                  |
| Calendar      | `/calendar`, `/calendar/new`, `/calendar/[id]`                                                                                                                                                                                                                   | Implemented | -                  |
| Email         | `/email`, `/email/[id]`                                                                                                                                                                                                                                          | Implemented | -                  |
| AI            | `/agent-approvals` + 13 sub-pages                                                                                                                                                                                                                                | Implemented | IFC-149            |
| Analytics     | `/analytics`, `/analytics/feedback`                                                                                                                                                                                                                              | Implemented | FLOW-023           |
| Settings      | `/settings/*` (9 pages)                                                                                                                                                                                                                                          | Implemented | FLOW-035, FLOW-045 |
| Billing       | `/billing/*` (7 pages)                                                                                                                                                                                                                                           | Implemented | FLOW-010           |
| Governance    | `/governance/*` (6 pages)                                                                                                                                                                                                                                        | Implemented | FLOW-032           |
| Notifications | `/notifications`, `/notifications/settings`                                                                                                                                                                                                                      | Implemented | -                  |
| Profile       | `/profile`                                                                                                                                                                                                                                                       | Implemented | -                  |

### Mockup References

| Route                | Mockup                   | Location               |
| -------------------- | ------------------------ | ---------------------- |
| /contacts/[id]       | `contact-360-view.png`   | `docs/design/mockups/` |
| /leads/[id]          | `lead-360-view.png`      | `docs/design/mockups/` |
| /deals               | `dashboard-overview.png` | `docs/design/mockups/` |
| /deals/[id]/forecast | `deal-forecast.png`      | `docs/design/mockups/` |

### Backend Integration Status

| Route                  | Integration | Required APIs                                                         |
| ---------------------- | ----------- | --------------------------------------------------------------------- |
| `/` (Auth Home)        | Hardcoded   | `dashboard.getWelcomeSummary`, `feed.getItems`, `ai.getDailyInsights` |
| `/dashboard`           | Partial     | `dashboard.getMetrics`, `dashboard.getWidgets`                        |
| `/leads/*`             | Integrated  | `lead.*` (16 procedures)                                              |
| `/contacts/*`          | Integrated  | `contact.*` (14 procedures)                                           |
| `/deals/*`             | Integrated  | `opportunity.*` (7 procedures)                                        |
| `/deals/[id]/forecast` | Hardcoded   | `intelligence.getDealForecast`                                        |
| `/tickets/*`           | Integrated  | `ticket.*` (10 procedures)                                            |
| `/analytics`           | Partial     | `analytics.*` (5 procedures)                                          |
| `/billing/*`           | Hardcoded   | `billing.*` (11 procedures) - Stripe integration pending              |
| `/governance/*`        | Integrated  | Local API routes                                                      |

---

## Navigation Structure

### Top Navigation (Header)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo] Dashboard  Leads  Contacts  Deals  Tickets  Documents  Agent  Reports  [search] [bell] [avatar] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### Header Navigation Items

| Item          | Route              | Icon                  |
| ------------- | ------------------ | --------------------- |
| Dashboard     | `/dashboard`       | `dashboard`           |
| Leads         | `/leads`           | `group`               |
| Contacts      | `/contacts`        | `person`              |
| Deals         | `/deals`           | `handshake`           |
| Tickets       | `/tickets`         | `confirmation_number` |
| Documents     | `/documents`       | `description`         |
| Agent Actions | `/agent-approvals` | `smart_toy`           |
| Reports       | `/analytics`       | `bar_chart`           |

### Module Sidebars

Each CRM module has a context-specific sidebar. Sidebar configs are located in:
`apps/web/src/components/sidebar/configs/`

| Module          | Config File          | Features                                                    |
| --------------- | -------------------- | ----------------------------------------------------------- |
| Leads           | `leads.ts`           | Views (All, My, Starred, Recent), Segments (Hot, Follow-up) |
| Contacts        | `contacts.ts`        | Views, Tags, Lists                                          |
| Deals           | `deals.ts`           | Pipeline views, Stages, Forecasts                           |
| Tickets         | `tickets.ts`         | Queues, SLA status, Assignments                             |
| Documents       | `documents.ts`       | Folders, Tags, Recent                                       |
| Analytics       | `analytics.ts`       | Dashboards, Reports                                         |
| Agent Approvals | `agent-approvals.ts` | Pending, Approved, Rejected                                 |
| Notifications   | `notifications.ts`   | All, Unread, Mentions                                       |
| Governance      | `governance.ts`      | ADR, Compliance, Quality                                    |
| Settings        | `settings.ts`        | Account, Team, AI, Integrations                             |
| Billing         | `billing.ts`         | Overview, Subscriptions, Invoices                           |
| Cases           | `cases.ts`           | All, Open, Timeline                                         |

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
├── Routing             /settings/routing
└── Security            /settings/security/mfa

More
└── Governance          /governance
```

---

## URL Conventions

| Pattern                   | Example               | Purpose       |
| ------------------------- | --------------------- | ------------- |
| `/[entity]`               | `/contacts`           | List view     |
| `/[entity]/new`           | `/contacts/new`       | Create form   |
| `/[entity]/[id]`          | `/contacts/123`       | Detail view   |
| `/[entity]/[id]/edit`     | `/contacts/123/edit`  | Edit form     |
| `/[entity]/[id]/[action]` | `/deals/123/forecast` | Sub-action    |
| `/admin/[section]`        | `/admin/users`        | Admin pages   |
| `/settings/[section]`     | `/settings/profile`   | User settings |

---

## File Path Mapping

All pages follow Next.js 16 App Router convention:

```
apps/web/src/app/
├── layout.tsx                    # Root layout (Providers, Navigation)
│
├── (public)/                     # PUBLIC ROUTE GROUP (29 pages)
│   ├── layout.tsx                # Public layout (minimal)
│   ├── page.tsx                  # / (Home - conditional render)
│   ├── login/page.tsx            # /login
│   ├── signup/
│   │   ├── page.tsx              # /signup
│   │   └── success/page.tsx      # /signup/success
│   ├── forgot-password/page.tsx  # /forgot-password
│   ├── reset-password/
│   │   ├── [token]/page.tsx      # /reset-password/[token]
│   │   └── callback/page.tsx     # /reset-password/callback
│   ├── logout/page.tsx           # /logout
│   ├── sso/page.tsx              # /sso (Enterprise SSO)
│   ├── auth/callback/page.tsx    # /auth/callback (OAuth)
│   ├── mfa/verify/page.tsx       # /mfa/verify (2FA input)
│   ├── verify-email/
│   │   ├── [token]/page.tsx      # /verify-email/[token]
│   │   └── callback/page.tsx     # /verify-email/callback
│   ├── about/page.tsx            # /about
│   ├── features/page.tsx         # /features
│   ├── pricing/page.tsx          # /pricing
│   ├── contact/page.tsx          # /contact
│   ├── partners/page.tsx         # /partners
│   ├── press/
│   │   ├── page.tsx              # /press
│   │   └── [id]/page.tsx         # /press/[id]
│   ├── security/page.tsx         # /security
│   ├── status/page.tsx           # /status
│   ├── 404/page.tsx              # /404
│   ├── 500/page.tsx              # /500
│   ├── privacy/page.tsx          # /privacy
│   ├── terms/page.tsx            # /terms
│   ├── cookies/page.tsx          # /cookies
│   ├── blog/
│   │   ├── page.tsx              # /blog
│   │   └── [slug]/page.tsx       # /blog/[slug]
│   ├── careers/
│   │   ├── page.tsx              # /careers
│   │   └── [id]/page.tsx         # /careers/[id]
│   └── lp/[slug]/page.tsx        # /lp/[slug]
│
├── (developer)/                  # DEVELOPER PORTAL (14 pages)
│   ├── developers/apps/page.tsx  # /developers/apps
│   ├── developers/apps/new/page.tsx  # /developers/apps/new
│   ├── developers/apps/[id]/page.tsx  # /developers/apps/[id]
│   ├── developers/apps/[id]/edit/page.tsx  # /developers/apps/[id]/edit
│   └── docs/
│       ├── page.tsx              # /docs
│       ├── api/page.tsx          # /docs/api
│       ├── architecture/page.tsx # /docs/architecture (PG-169)
│       ├── auth/page.tsx         # /docs/auth (PG-038)
│       ├── changelog/page.tsx    # /docs/changelog (PG-035)
│       ├── cli/page.tsx          # /docs/cli
│       ├── guides/page.tsx       # /docs/guides (PG-169)
│       ├── integrations/page.tsx # /docs/integrations
│       ├── sdk/page.tsx          # /docs/sdk (PG-036)
│       └── webhooks/page.tsx     # /docs/webhooks
│
├── dashboard/                    # DASHBOARD (3 pages)
│   ├── page.tsx                  # /dashboard
│   ├── new/page.tsx              # /dashboard/new
│   └── customize/page.tsx        # /dashboard/customize
│
├── leads/                        # LEADS (4 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Leads sidebar layout
│   │   ├── page.tsx              # /leads
│   │   └── new/page.tsx          # /leads/new
│   └── [id]/
│       ├── page.tsx              # /leads/[id] (NO sidebar)
│       └── edit/page.tsx         # /leads/[id]/edit
│
├── contacts/                     # CONTACTS (4 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Contacts sidebar layout
│   │   ├── page.tsx              # /contacts
│   │   └── new/page.tsx          # /contacts/new
│   └── [id]/
│       ├── page.tsx              # /contacts/[id] (NO sidebar)
│       └── edit/page.tsx         # /contacts/[id]/edit
│
├── accounts/                     # ACCOUNTS (2 pages)
│   ├── (list)/
│   │   └── page.tsx              # /accounts
│   └── [id]/page.tsx             # /accounts/[id]
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
├── tickets/                      # TICKETS (3 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Tickets sidebar layout
│   │   └── page.tsx              # /tickets
│   ├── new/page.tsx              # /tickets/new
│   └── [id]/page.tsx             # /tickets/[id]
│
├── documents/                    # DOCUMENTS (3 pages)
│   ├── (list)/
│   │   ├── layout.tsx            # Documents sidebar layout
│   │   ├── page.tsx              # /documents
│   │   └── new/page.tsx          # /documents/new
│   └── [id]/page.tsx             # /documents/[id]
│
├── cases/                        # CASES (4 pages)
│   ├── (list)/
│   │   ├── page.tsx              # /cases
│   │   └── new/page.tsx          # /cases/new
│   ├── [id]/page.tsx             # /cases/[id]
│   └── timeline/page.tsx         # /cases/timeline
│
├── tasks/                        # TASKS (2 pages)
│   ├── (list)/
│   │   └── page.tsx              # /tasks
│   └── [id]/page.tsx             # /tasks/[id]
│
├── calendar/                     # CALENDAR (3 pages)
│   ├── (list)/
│   │   └── page.tsx              # /calendar
│   ├── new/page.tsx              # /calendar/new
│   └── [id]/page.tsx             # /calendar/[id]
│
├── email/                        # EMAIL (2 pages)
│   ├── page.tsx                  # /email
│   └── [id]/page.tsx             # /email/[id]
│
├── agent-approvals/              # AI AGENT (14 pages)
│   ├── layout.tsx
│   ├── page.tsx                  # /agent-approvals
│   ├── agents/page.tsx           # /agent-approvals/agents
│   ├── ai-review/
│   │   ├── page.tsx              # /agent-approvals/ai-review
│   │   └── [id]/page.tsx         # /agent-approvals/ai-review/[id]
│   ├── ai-search/page.tsx        # /agent-approvals/ai-search
│   ├── churn-risk/page.tsx       # /agent-approvals/churn-risk
│   ├── drift/page.tsx            # /agent-approvals/drift
│   ├── experiments/page.tsx      # /agent-approvals/experiments
│   ├── history/page.tsx          # /agent-approvals/history
│   ├── latency/page.tsx          # /agent-approvals/latency
│   ├── lead-scoring/page.tsx     # /agent-approvals/lead-scoring
│   ├── logs/page.tsx             # /agent-approvals/logs
│   ├── preview/page.tsx          # /agent-approvals/preview
│   └── sentiment/page.tsx        # /agent-approvals/sentiment
│
├── analytics/(list)/             # ANALYTICS (5 pages)
│   ├── layout.tsx
│   ├── page.tsx                  # /analytics
│   ├── feedback/page.tsx         # /analytics/feedback
│   └── saved/
│       ├── weekly/page.tsx       # /analytics/saved/weekly
│       ├── monthly/page.tsx      # /analytics/saved/monthly
│       └── quarterly/page.tsx    # /analytics/saved/quarterly
│
├── settings/                     # SETTINGS (9 pages)
│   ├── layout.tsx                # Settings sidebar layout
│   ├── page.tsx                  # /settings
│   ├── account/page.tsx          # /settings/account
│   ├── team/page.tsx             # /settings/team
│   ├── ai/page.tsx               # /settings/ai
│   ├── integrations/page.tsx     # /settings/integrations
│   ├── notifications/page.tsx    # /settings/notifications
│   ├── pipeline/page.tsx         # /settings/pipeline
│   ├── routing/page.tsx          # /settings/routing
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
├── sitemap.ts                    # XML sitemap generator → /sitemap.xml
├── robots.ts                     # Robots.txt generator → /robots.txt
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

| Route                        | Flow     | Description                       |
| ---------------------------- | -------- | --------------------------------- |
| `/login`                     | FLOW-001 | Login with MFA (SSO, OAuth2, 2FA) |
| `/signup`, `/signup/success` | FLOW-001 | Registration flow                 |
| `/auth/callback`             | FLOW-001 | OAuth callback handler            |
| `/mfa/verify`                | FLOW-001 | MFA verification                  |
| `/verify-email/[token]`      | FLOW-001 | Email confirmation                |
| `/forgot-password`           | FLOW-003 | Password recovery request         |
| `/reset-password/[token]`    | FLOW-003 | Password reset                    |
| `/settings/security/mfa`     | FLOW-001 | MFA setup                         |
| `/settings/team`             | FLOW-002 | User management                   |

### CRM Core (FLOW-005 to FLOW-010)

| Route                  | Flow     | Description                |
| ---------------------- | -------- | -------------------------- |
| `/leads`               | FLOW-005 | Lead list with AI scoring  |
| `/leads/new`           | FLOW-005 | Create new lead            |
| `/leads/[id]`          | FLOW-006 | Lead 360° view, conversion |
| `/contacts/*`          | FLOW-016 | Contact management         |
| `/contacts/[id]`       | FLOW-020 | Activity timeline          |
| `/deals`               | FLOW-007 | Pipeline Kanban            |
| `/deals/[id]`          | FLOW-008 | Deal details               |
| `/deals/[id]/forecast` | FLOW-024 | AI deal probability        |
| `/deals/forecast`      | FLOW-025 | Sales forecasting          |
| `/billing/*`           | FLOW-010 | Subscription management    |

### Support & Tickets (FLOW-011 to FLOW-015)

| Route                   | Flow               | Description             |
| ----------------------- | ------------------ | ----------------------- |
| `/tickets`              | FLOW-011           | Ticket creation         |
| `/tickets/[id]`         | FLOW-012, FLOW-013 | Routing, SLA management |
| `/tickets/[id]` (close) | FLOW-014           | Resolution and closure  |

### Analytics & AI (FLOW-023 to FLOW-028, FLOW-045)

| Route              | Flow     | Description         |
| ------------------ | -------- | ------------------- |
| `/dashboard`       | FLOW-025 | Main dashboard      |
| `/analytics`       | FLOW-023 | Report builder      |
| `/settings/ai`     | FLOW-045 | AI chain versioning |
| `/agent-approvals` | IFC-149  | AI action approvals |

### Security & Compliance (FLOW-029 to FLOW-033)

| Route                         | Flow     | Description            |
| ----------------------------- | -------- | ---------------------- |
| `/governance`                 | FLOW-032 | Compliance dashboard   |
| `/governance/adr`             | FLOW-029 | Architecture decisions |
| `/governance/compliance`      | FLOW-032 | LGPD/GDPR tracking     |
| `/governance/quality-reports` | FLOW-038 | Quality assessments    |

---

## Related Documents

### Primary Documentation

| Document               | Location                                                        | Description                                         |
| ---------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| **Page Map & Flows**   | `docs/design/PAGE_MAP_AND_FLOWS.md`                             | Visual flow diagrams, integration checklist         |
| **tRPC API Routes**    | `docs/api/trpc-routes.md`                                       | Complete API inventory (25 routers, 232 procedures) |
| **Flow Index**         | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | Master catalog of 42 flows                          |
| **Sprint Plan**        | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv`     | Task tracking (316 tasks)                           |
| **Reachability Audit** | `docs/design/navigation-reachability-audit.md`                  | Full route inventory with reachability status       |

### Design System

| Document            | Location                                       | Description                |
| ------------------- | ---------------------------------------------- | -------------------------- |
| **Style Guide**     | `docs/company/brand/style-guide.md`            | Component patterns         |
| **Visual Identity** | `docs/company/brand/visual-identity.md`        | Design tokens              |
| **Accessibility**   | `docs/company/brand/accessibility-patterns.md` | ARIA patterns              |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md`          | Best practices             |
| **Design Mockups**  | `docs/design/mockups/`                         | Visual designs (PNG, HTML) |

### Technical Documentation

| Document          | Location                 | Description                   |
| ----------------- | ------------------------ | ----------------------------- |
| **ADR Registry**  | `docs/planning/adr/`     | Architecture Decision Records |
| **Domain Models** | `docs/domain/`           | DDD documentation             |
| **API Docs**      | Auto-generated from tRPC | Type-safe API reference       |

---

## Document History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 2025-12-27 | Initial sitemap                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2.0     | 2026-02-02 | Updated to 68 pages, 42 flows, 15 layouts. Added accurate route mapping, backend integration status, and file path structure.                                                                                                                                                                                                                                                                                                                                   |
| 3.0     | 2026-02-23 | Updated to 102 pages. Added 34 missing pages across 12 sections. Path corrections for `/mfa/verify` and `/verify-email/[token]`. Added accounts, tasks, calendar, email, developer portal sections. Expanded AI & Automation from 1 to 14 pages, cases from 1 to 4. Added XML Sitemap Coverage section (sitemap.ts, robots.ts). Added Planned Pages (Sprint 16) section with 28 ghost links. Dissolved "Auth Callbacks" into Public Pages with corrected paths. |
