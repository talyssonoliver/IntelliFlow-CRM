# IntelliFlow CRM - Page Map & User Flows

This document provides a comprehensive overview of all pages, routes, navigation
structure, and user flows in the IntelliFlow CRM web application.

> **Note**: For detailed user flow specifications with YAML definitions, Mermaid
> diagrams, and technical artifacts, see the **Flow Documentation** at:
> `apps/project-tracker/docs/metrics/_global/flows/`
>
> The flow index is at:
> `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
>
> **For integration tasks and page specs**: See
> `docs/design/integration-backlog.md` (23 tasks with API requirements)

---

## Table of Contents

1. [Route Overview](#route-overview)
2. [Page Map by Category](#page-map-by-category)
3. [Authentication & Authorization](#authentication--authorization)
4. [Navigation Structure](#navigation-structure)
5. [User Flows Summary](#user-flows-summary)
6. [Route Groups & Layouts](#route-groups--layouts)
7. [API Routes](#api-routes)
8. [Integration Checklist](#integration-checklist)
9. [Flow Documentation Reference](#flow-documentation-reference)

---

## Route Overview

### Summary Statistics

| Category        | Count |
| --------------- | ----- |
| Total Pages     | 137   |
| Public Pages    | 29    |
| Developer Pages | 14    |
| Protected Pages | 89    |
| API Routes      | 19    |
| Layouts         | 36    |

> Total Pages counts distinct `page.tsx` files. Query-parameter variants (e.g.,
> `/leads?view=my`) are views within the same page and are excluded from the
> total.

---

## Page Map by Category

### 1. Public Pages (29 — No Authentication Required)

Located in `(public)` route group. Accessible without login.

| Route                      | Page                    | Description                                                                                                                                          |
| -------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                        | Home                    | Landing page (shows PublicHomePage or AuthenticatedHomePage based on auth). Lighthouse audit: PG-166 (Performance >=90, Accessibility >=90, TTI <1s) |
| `/login`                   | Login                   | Email/password + OAuth login                                                                                                                         |
| `/signup`                  | Sign Up                 | New account registration                                                                                                                             |
| `/signup/success`          | Sign Up Success         | Registration confirmation                                                                                                                            |
| `/forgot-password`         | Forgot Password         | Password reset request                                                                                                                               |
| `/reset-password/[token]`  | Reset Password          | Password reset with token                                                                                                                            |
| `/reset-password/callback` | Reset Password Callback | Supabase password reset redirect handler                                                                                                             |
| `/logout`                  | Logout                  | Session termination                                                                                                                                  |
| `/auth/callback`           | OAuth Callback          | Handles OAuth provider redirects (Google, etc.)                                                                                                      |
| `/sso`                     | Enterprise SSO          | SSO email lookup form for enterprise SAML/OAuth providers (PG-124)                                                                                   |
| `/mfa/verify`              | MFA Verification        | Two-factor authentication input                                                                                                                      |
| `/verify-email/[token]`    | Email Verification      | Email confirmation with token                                                                                                                        |
| `/verify-email/callback`   | Email Verify Callback   | Supabase email verification redirect handler                                                                                                         |
| `/about`                   | About                   | Company information                                                                                                                                  |
| `/features`                | Features                | Product features showcase                                                                                                                            |
| `/pricing`                 | Pricing                 | Subscription plans                                                                                                                                   |
| `/security`                | Security                | Security practices                                                                                                                                   |
| `/contact`                 | Contact                 | Contact form                                                                                                                                         |
| `/partners`                | Partners                | Partner program                                                                                                                                      |
| `/press`                   | Press                   | Press releases                                                                                                                                       |
| `/press/[id]`              | Press Release Detail    | Individual press release with full body, quotes, boilerplate                                                                                         |
| `/status`                  | Status                  | System status page                                                                                                                                   |
| `/404`                     | 404 Not Found           | Direct system-page route for missing URLs; excluded from sitemap indexing                                                                            |
| `/privacy`                 | Privacy Policy          | Public privacy policy and data handling commitments                                                                                                  |
| `/blog`                    | Blog                    | Blog listing                                                                                                                                         |
| `/blog/[slug]`             | Blog Post               | Individual blog article                                                                                                                              |
| `/careers`                 | Careers                 | Job listings                                                                                                                                         |
| `/careers/[id]`            | Job Detail              | Individual job posting                                                                                                                               |
| `/lp/[slug]`               | Landing Page            | Dynamic marketing landing pages                                                                                                                      |

---

### 2. Developer Portal (14 pages)

Located in `(developer)` route group. Sidebar-gated via `roles: ['SUPER_ADMIN']`
in `settings.ts:85`. Uses `developerSidebarConfig` from `configs/developer.ts`.

The `(developer)` route group has its own `layout.tsx` that renders the
developer sidebar. These pages are accessible through the Settings sidebar
"More" section (SUPER_ADMIN only).

| Route                        | Page               | Description                                      |
| ---------------------------- | ------------------ | ------------------------------------------------ |
| `/developers/apps`           | App Registry       | Developer app management, API keys, webhooks     |
| `/developers/apps/new`       | Create New App     | Developer app creation with OAuth credentials    |
| `/developers/apps/[id]`      | App Detail         | Individual app dashboard, metrics, logs          |
| `/developers/apps/[id]/edit` | App Edit           | Edit app settings, scopes, webhook configuration |
| `/docs`                      | Dev Docs Home      | Documentation overview with category cards       |
| `/docs/api`                  | API Reference      | Interactive OpenAPI/tRPC reference               |
| `/docs/changelog`            | Changelog          | Release history, version notes, feature updates  |
| `/docs/integrations`         | Integration Guides | Third-party integration documentation            |
| `/docs/webhooks`             | Webhook Docs       | Webhook configuration, events, and tester        |
| `/docs/sdk`                  | SDK Guides         | Client libraries, install guides, quickstart     |
| `/docs/cli`                  | CLI Reference      | Monorepo CLI commands for development            |
| `/docs/auth`                 | Auth Guides        | OAuth 2.0, JWT, MFA, sessions, and API keys      |
| `/docs/architecture`         | Architecture Docs  | ADR list, DDD context map, search and filter     |
| `/docs/guides`               | Developer Guides   | Guide categories linking to Docusaurus docs      |

---

### 3. Dashboard (4 pages)

| Route                  | Page                | Description                             |
| ---------------------- | ------------------- | --------------------------------------- |
| `/dashboard`           | Dashboard           | Main dashboard with widgets and metrics |
| `/dashboard/new`       | New Dashboard       | Create custom dashboard                 |
| `/dashboard/customize` | Customize Dashboard | Edit dashboard layout and widgets       |
| `/activity`            | Activity Log        | Unified activity feed with filtering    |

---

### 4. CRM Core — Leads (4 pages)

| Route                     | Page            | Description                       | Sidebar Section |
| ------------------------- | --------------- | --------------------------------- | --------------- |
| `/leads`                  | Leads List      | All leads with filters and search | Lead Views      |
| `/leads?view=my`          | My Leads        | Leads assigned to current user    | Lead Views      |
| `/leads?view=starred`     | Starred Leads   | Bookmarked leads                  | Lead Views      |
| `/leads?view=recent`      | Recent Leads    | Recently viewed leads             | Lead Views      |
| `/leads?segment=new-week` | New This Week   | Leads created this week           | Segments        |
| `/leads?segment=hot`      | Hot Leads       | Leads with score >80              | Segments        |
| `/leads?segment=followup` | Needs Follow-up | Leads requiring action            | Segments        |
| `/leads/new`              | New Lead        | Create lead form                  | -               |
| `/leads/[id]`             | Lead Detail     | Lead 360° view with activities    | -               |
| `/leads/[id]/edit`        | Edit Lead       | Edit lead fields and metadata     | -               |

---

### 5. CRM Core — Contacts (4 pages)

| Route                 | Page           | Description                 |
| --------------------- | -------------- | --------------------------- |
| `/contacts`           | Contacts List  | All contacts with filters   |
| `/contacts/new`       | New Contact    | Create contact form         |
| `/contacts/[id]`      | Contact Detail | Contact profile and history |
| `/contacts/[id]/edit` | Edit Contact   | Edit contact fields         |

---

### 6. CRM Core — Accounts (2 pages)

| Route            | Page           | Description                                 |
| ---------------- | -------------- | ------------------------------------------- |
| `/accounts`      | Accounts List  | Company/account list with filters and stats |
| `/accounts/[id]` | Account Detail | Account 360° view                           |

---

### 7. CRM Core — Deals (5 pages)

| Route                  | Page              | Description                 |
| ---------------------- | ----------------- | --------------------------- |
| `/deals`               | Deals List        | Pipeline view and deal list |
| `/deals/[id]`          | Deal Detail       | Deal overview with stages   |
| `/deals/[id]/forecast` | Deal Forecast     | AI-powered deal probability |
| `/deals/forecast`      | Forecast Overview | Sales forecasting dashboard |
| `/deals/all/forecast`  | Legacy Forecast   | Redirects legacy forecast route to `/deals/forecast` |

---

### 8. CRM Core — Tasks (2 pages)

| Route         | Page        | Description                                             |
| ------------- | ----------- | ------------------------------------------------------- |
| `/tasks`      | Task List   | Task queue with list/calendar toggle, filters, priority |
| `/tasks/[id]` | Task Detail | Task view with assignee and status                      |

---

### 9. CRM Core — Calendar/Appointments (3 pages)

| Route            | Page               | Description                                 |
| ---------------- | ------------------ | ------------------------------------------- |
| `/calendar`      | Calendar View      | Appointment calendar (month/week/day views) |
| `/calendar/new`  | New Appointment    | Create appointment form                     |
| `/calendar/[id]` | Appointment Detail | Appointment detail and edit                 |

---

### 10. CRM Core — Email (2 pages)

| Route         | Page         | Description            |
| ------------- | ------------ | ---------------------- |
| `/email`      | Email Inbox  | Email list and compose |
| `/email/[id]` | Email Detail | Email thread view      |

---

### 11. CRM Core — Tickets (3 pages)

| Route           | Page          | Description                   |
| --------------- | ------------- | ----------------------------- |
| `/tickets`      | Tickets List  | Support tickets queue         |
| `/tickets/new`  | New Ticket    | Create ticket form            |
| `/tickets/[id]` | Ticket Detail | Ticket view with conversation |

---

### 12. Documents (3 pages)

| Route             | Page            | Description                   |
| ----------------- | --------------- | ----------------------------- |
| `/documents`      | Documents List  | Document repository           |
| `/documents/new`  | Upload Document | Document upload form          |
| `/documents/[id]` | Document Detail | Document preview and metadata |

---

### 13. Cases (4 pages)

| Route             | Page          | Description                                     |
| ----------------- | ------------- | ----------------------------------------------- |
| `/cases`          | Cases List    | Legal/service case queue with stats and filters |
| `/cases/new`      | New Case      | Case creation form                              |
| `/cases/[id]`     | Case Detail   | Case detail with documents                      |
| `/cases/timeline` | Case Timeline | Case history and deadline engine                |

---

### 14. AI & Agent Actions (17 pages)

| Route                             | Page               | Task            |
| --------------------------------- | ------------------ | --------------- |
| `/agent-approvals`                | Approval Queue     | IFC-029/IFC-149 |
| `/agent-approvals/agents`         | Active Agents      | PG-151          |
| `/agent-approvals/ai-review`      | AI Review Queue    | IFC-181         |
| `/agent-approvals/ai-review/[id]` | Review Detail      | IFC-181         |
| `/agent-approvals/ai-search`      | AI Search (RAG)    | PG-144          |
| `/agent-approvals/churn-risk`     | Churn Risk         | PG-143          |
| `/agent-approvals/drift`          | Drift Detection    | PG-146          |
| `/agent-approvals/experiments`    | Experiments        | PG-149          |
| `/agent-approvals/history`        | Review History     | PG-150          |
| `/agent-approvals/insights`      | AI Insights Hub    | PG-160          |
| `/insights`                       | AI Insights        | PG-160          |
| `/agent-approvals/latency`        | Latency Monitor    | PG-153          |
| `/agent-approvals/lead-scoring`   | Lead Scoring       | PG-148          |
| `/agent-approvals/logs`           | Agent Logs         | PG-152          |
| `/agent-approvals/logs/[id]`      | Agent Log Detail   | PG-152          |
| `/agent-approvals/preview`        | Preview Mode       | —               |
| `/agent-approvals/sentiment`      | Sentiment Analysis | PG-142          |
| `/agent-approvals/tools`          | Agent Tools        | IFC-191         |

**Sidebar groupings** (from `agent-approvals.ts`):

- **Intelligence**: Sentiment, Churn Risk, Lead Scoring
- **AI Tools**: AI Search, Experiments
- **AI Review**: AI Review Queue
- **Monitoring**: Active Agents, Drift, Latency, Logs
- **History**: Review History

---

### 15. Analytics & Reports (2 pages)

| Route                 | Page                | Description                        |
| --------------------- | ------------------- | ---------------------------------- |
| `/analytics`          | Analytics Dashboard | Charts, metrics, and KPIs          |
| `/analytics/feedback` | Feedback Analytics  | NPS/CSAT/CES metrics, trend charts |

---

### 16. Notifications (2 pages)

| Route                     | Page                  | Description              |
| ------------------------- | --------------------- | ------------------------ |
| `/notifications`          | Notifications         | All notifications list   |
| `/notifications/settings` | Notification Settings | Notification preferences |

---

### 17. User Profile (1 page)

| Route      | Page         | Description          |
| ---------- | ------------ | -------------------- |
| `/profile` | User Profile | User account details |

---

### 18. Settings (9 pages)

| Route                     | Page                  | Description                     |
| ------------------------- | --------------------- | ------------------------------- |
| `/settings`               | Settings Overview     | Settings navigation             |
| `/settings/account`       | Account Settings      | Personal account settings       |
| `/settings/team`          | Team Settings         | Team members and roles          |
| `/settings/ai`            | AI Chains             | AI configuration and chains     |
| `/settings/integrations`  | Integrations          | Third-party integrations        |
| `/settings/notifications` | Notification Settings | Alert preferences               |
| `/settings/pipeline`      | Pipeline Settings     | Sales pipeline stages           |
| `/settings/routing`       | Routing Settings      | Smart lead routing rules        |
| `/settings/security/mfa`  | MFA Settings          | MFA management dashboard        |
| `/settings/security/mfa/setup` | MFA Setup Wizard | Two-factor authentication setup wizard |

---

### 19. Billing (13 pages)

| Route                      | Page             | Description                      |
| -------------------------- | ---------------- | -------------------------------- |
| `/billing`                 | Billing Overview | Subscription summary             |
| `/billing/checkout`        | Checkout         | Payment processing               |
| `/billing/subscriptions`   | Subscriptions    | Manage subscription plans        |
| `/billing/payment-methods` | Payment Methods  | Credit cards and payment options |
| `/billing/invoices`        | Invoices         | Invoice history                  |
| `/billing/invoices/[id]`   | Invoice Detail   | Individual invoice view          |
| `/billing/receipts`        | Receipts         | Payment receipts                 |
| `/billing/usage`           | Usage            | Usage metrics with progress bars |
| `/billing/plans`           | Compare Plans    | Side-by-side plan comparison     |
| `/billing/upgrade`         | Change Plan      | Proration preview and plan change|
| `/billing/cancel`          | Cancel           | Multi-step cancellation flow     |
| `/billing/settings`        | Billing Settings | Manage billing information       |
| `/upgrade`                 | Plan Upgrade     | Upgrade flow for module-gated features |

---

### 20. Governance (6 pages)

| Route                                    | Page                | Description                   |
| ---------------------------------------- | ------------------- | ----------------------------- |
| `/governance`                            | Governance Overview | Compliance dashboard          |
| `/governance/adr`                        | ADR Registry        | Architecture Decision Records |
| `/governance/compliance`                 | Compliance          | Compliance standards tracking |
| `/governance/policies`                   | Policies            | Policy management             |
| `/governance/quality-reports`            | Quality Reports     | Quality assessment reports    |
| `/governance/quality-reports/[reportId]` | Report Detail       | Individual quality report     |

### 21. Support Portal (2 pages)

| Route                  | Page                  | Description                                              |
| ---------------------- | --------------------- | -------------------------------------------------------- |
| `/support/tickets`      | Support Tickets Queue  | SLA-first agent ticket queue (excludes ARCHIVED, 3 bulk)      |
| `/support/tickets/new`  | New Support Ticket     | Ticket creation form with file attachments (PG-047)           |
| `/support/tickets/[id]` | Support Ticket Detail  | Ticket detail with thread, status updater, no delete (PG-048) |

### 22. Support / Help Center (2 pages)

| Route          | Page              | Description                                       |
| -------------- | ----------------- | ------------------------------------------------- |
| `/help-center` | Help Center Index | Searchable category grid for self-service support |
| `/help-center/search` | Help Search | URL-driven search with scoring, filters, and category results |
| `/help-center/[article]` | Help Article | Individual help article detail page (PG-045) |

---

## Authentication & Authorization

### Route Protection Levels

```
┌─────────────────────────────────────────────────────────────────┐
│                        ROUTE PROTECTION                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PUBLIC (No Auth)          PROTECTED (Auth Required)            │
│  ─────────────────         ─────────────────────────            │
│  /                         /dashboard     [USER+]               │
│  /login                    /leads         [USER+]               │
│  /signup                   /contacts      [USER+]               │
│  /forgot-password          /accounts      [USER+]               │
│  /reset-password/*         /deals         [USER+]               │
│  /about                    /tasks         [USER+]               │
│  /features                 /calendar      [USER+]               │
│  /pricing                  /email         [USER+]               │
│  /blog/*                   /tickets       [USER+]               │
│  /careers/*                /documents     [USER+]               │
│  /auth/callback            /cases         [USER+]               │
│  /mfa/verify               /analytics     [MANAGER+]            │
│  /verify-email/*           /agent-approvals [USER+]             │
│  /lp/*                     /settings      [USER+]               │
│  /partners                 /billing       [USER+]               │
│  /press                    /governance    [USER+]               │
│  /security                 /notifications [USER+]               │
│  /status                   /profile       [USER+]               │
│  /contact                  /developers    [SUPER_ADMIN]         │
│  /logout                   /docs          [SUPER_ADMIN]         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Role Hierarchy

| Role          | Access Level | Description                      |
| ------------- | ------------ | -------------------------------- |
| `USER`        | Basic        | Standard CRM access              |
| `MANAGER`     | Elevated     | Team analytics + user management |
| `ADMIN`       | Full         | System administration            |
| `SUPER_ADMIN` | Root         | Developer portal + all admin     |

### Authentication Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATION FLOW                              │
└──────────────────────────────────────────────────────────────────────────┘

    ┌─────────┐
    │  User   │
    └────┬────┘
         │
         ▼
    ┌─────────────┐     No      ┌──────────────┐
    │ Has Session?│────────────►│   /login     │
    └──────┬──────┘             └──────┬───────┘
           │ Yes                       │
           │                           ▼
           │                  ┌────────────────┐
           │                  │ Email/Password │
           │                  │      OR        │
           │                  │ Google OAuth   │
           │                  └────────┬───────┘
           │                           │
           │                           ▼
           │                  ┌────────────────┐
           │                  │ /auth/callback │
           │                  │ (OAuth only)   │
           │                  └────────┬───────┘
           │                           │
           │                           ▼
           │                  ┌────────────────┐     Yes    ┌──────────────┐
           │                  │  MFA Enabled?  │───────────►│ /mfa/verify  │
           │                  └────────┬───────┘            └──────┬───────┘
           │                           │ No                        │
           │                           │                           │
           │                           ▼                           │
           │              ┌─────────────────────┐                  │
           └─────────────►│  Set Cookies:       │◄─────────────────┘
                          │  - accessToken      │
                          │  - session          │
                          └──────────┬──────────┘
                                     │
                                     ▼
                          ┌─────────────────────┐
                          │    / (Home)         │
                          │ AuthenticatedHome   │
                          └─────────────────────┘
```

---

## Navigation Structure

### Main Navigation Bar (Header) — Dynamic Module-Gated

Visible to authenticated users only. Header items are dynamically rendered via
`useEnabledModules()` + `ModuleRoutes.ts`.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [Logo]  Dashboard  Leads  Contacts  Accounts  Deals  Tasks  Calendar  Email  Cases  ...  │
│                                                         Tickets  AI&Agents  Reports       │
│                                                                    [Search] [🔔] [User]  │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

| Module          | Nav Items                                                                     |
| --------------- | ----------------------------------------------------------------------------- |
| CORE_CRM        | Dashboard, Leads, Contacts, Accounts, Deals, Tasks, Calendar, Email (8 items) |
| LEGAL           | Cases (1 item)                                                                |
| SUPPORT         | Tickets (1 item)                                                              |
| AI_INTELLIGENCE | AI & Agents, AI Insights (2 items)                                            |
| ANALYTICS       | Reports (1 item)                                                              |

> Header items dynamically rendered via `useEnabledModules()` +
> `ModuleRoutes.ts`. Each module is enabled/disabled per tenant.

### Context Sidebars

Each module has a dedicated sidebar with views and segments.

#### Leads Sidebar

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

#### Settings Sidebar

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
├── Governance          /governance
├── Billing             /billing
└── Developer Docs      /docs (SUPER_ADMIN only)
```

### Available Sidebar Configs (17)

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

---

## User Flows Summary

> **Detailed Flow Documentation**: All user flows are documented with full YAML
> specifications, Mermaid sequence diagrams, and technical artifacts in:
> `apps/project-tracker/docs/metrics/_global/flows/`

### Flow Categories Overview

| Category                     | Flows                          | Description                                           |
| ---------------------------- | ------------------------------ | ----------------------------------------------------- |
| **Acesso e Identidade**      | FLOW-001 to FLOW-004           | Authentication, MFA, permissions, workspace switching |
| **Comercial Core**           | FLOW-005 to FLOW-010           | Leads, deals, pipeline, conversions, renewals         |
| **Relacionamento e Suporte** | FLOW-011 to FLOW-015           | Tickets, SLA, escalation, feedback                    |
| **Comunicação**              | FLOW-016 to FLOW-022           | Email, chat, calls, meetings, activity feed           |
| **Analytics e Insights**     | FLOW-023 to FLOW-028           | Reports, dashboards, forecasting                      |
| **Segurança e Compliance**   | FLOW-029 to FLOW-033, FLOW-040 | Backup, DR, GDPR, DSAR                                |
| **Qualidade e Testes**       | FLOW-034 to FLOW-038           | Testing, performance, quality gates                   |
| **Search & AI**              | FLOW-039, FLOW-041             | Document search, RAG retrieval                        |
| **AI Configuration**         | FLOW-045                       | AI chain versioning, experiments                      |

### Quick Flow Reference

| Route                   | Primary Flow           | Description                       |
| ----------------------- | ---------------------- | --------------------------------- |
| `/login`                | **FLOW-001**           | Login with MFA (SSO, OAuth2, 2FA) |
| `/forgot-password`      | **FLOW-003**           | Password recovery                 |
| `/admin/users`          | **FLOW-002**           | User and permission management    |
| `/leads/new`            | **FLOW-005**           | Lead creation with AI scoring     |
| `/leads/[id]` (convert) | **FLOW-006**           | Lead to contact/deal conversion   |
| `/deals` (Kanban)       | **FLOW-007**           | Pipeline management               |
| `/deals/[id]`           | **FLOW-008**           | Deal creation and updates         |
| `/deals/[id]` (close)   | **FLOW-009**           | Deal won/lost closure             |
| `/tickets/new`          | **FLOW-011**           | Support ticket creation           |
| `/tickets/[id]`         | **FLOW-012, 013, 014** | Routing, SLA, resolution          |
| `/contacts/[id]`        | **FLOW-020**           | Activity timeline                 |
| `/analytics`            | **FLOW-023**           | Report builder                    |
| `/calendar`             | **FLOW-019**           | Appointment scheduling            |
| `/email`                | **FLOW-016**           | Email with tracking               |
| `/cases`                | **FLOW-041**           | Case RAG retrieval                |
| `/search`               | **FLOW-039**           | Document search (FTS + semantic)  |
| `/settings/ai`          | **FLOW-045**           | AI chain versioning admin         |
| `/agent-approvals`      | IFC-149                | AI agent action approvals         |

---

## Visual Flow Diagrams

### Flow 1: New User Onboarding (FLOW-001, FLOW-003)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        NEW USER ONBOARDING FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

    Landing Page (/)
         │
         ▼
    ┌──────────┐
    │ /signup  │ ◄── Enter: Name, Email, Password
    └────┬─────┘
         │
         ▼
    ┌────────────────────┐
    │ /signup/success    │ ◄── "Check your email"
    └─────────┬──────────┘
              │
              ▼ (Email Link)
    ┌─────────────────────────┐
    │ /verify-email/[token]   │ ◄── Verify email token
    └─────────┬───────────────┘
              │
              ▼
    ┌──────────┐
    │ /login   │ ◄── Login with verified account
    └────┬─────┘
         │
         ▼
    ┌───────────────────┐
    │ / (Authenticated  │
    │   Home Page)      │
    └─────────┬─────────┘
              │
              ▼
    ┌──────────────┐
    │ /dashboard   │ ◄── Start using the CRM
    └──────────────┘
```

---

### Flow 2: OAuth Login - Google (FLOW-001)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           GOOGLE OAUTH FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    /login
      │
      │ Click "Continue with Google"
      ▼
    ┌──────────────────────┐
    │ Google OAuth Consent │ ◄── External (accounts.google.com)
    └──────────┬───────────┘
               │
               │ Redirect with auth code
               ▼
    ┌──────────────────────┐
    │   /auth/callback     │ ◄── Exchange code for tokens
    └──────────┬───────────┘
               │
               │ Set cookies (accessToken, session)
               ▼
    ┌──────────────────────┐
    │ / (Home Page)        │ ◄── Shows AuthenticatedHomePage
    └──────────────────────┘
```

---

### Flow 3: Lead Management (FLOW-005, FLOW-006)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LEAD MANAGEMENT FLOW                                │
└─────────────────────────────────────────────────────────────────────────────┘

    /leads (List View)
         │
         ├──────────────────────┐
         │                      │
         ▼                      ▼
    ┌──────────┐          ┌─────────────┐
    │ /leads/  │          │ /leads/new  │ ◄── Create new lead
    │   [id]   │          └──────┬──────┘
    │ (Detail) │                 │
    └────┬─────┘                 │
         │                       │
         │  ┌────────────────────┘
         │  │
         ▼  ▼
    ┌────────────────────────────────────────┐
    │           Lead Detail Page             │
    │  ┌─────────────────────────────────┐  │
    │  │ Lead Info    │ Activity Feed    │  │
    │  │ - Score      │ - Calls          │  │
    │  │ - Status     │ - Emails         │  │
    │  │ - Source     │ - Meetings       │  │
    │  │ - Owner      │ - Notes          │  │
    │  └─────────────────────────────────┘  │
    │                                        │
    │  Actions:                              │
    │  [Convert to Contact] [Qualify] [Edit] │
    └────────────────────────────────────────┘
         │
         │ Convert (FLOW-006)
         ▼
    ┌────────────────┐
    │ /contacts/[id] │ ◄── New contact created
    └────────────────┘
```

---

### Flow 4: Deal Pipeline (FLOW-007, FLOW-008, FLOW-009)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          DEAL PIPELINE FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

                          /deals (Pipeline View)
                                   │
         ┌─────────────────────────┼─────────────────────────┐
         │                         │                         │
         ▼                         ▼                         ▼
    ┌──────────┐            ┌──────────┐            ┌──────────┐
    │ Stage 1  │────────────│ Stage 2  │────────────│ Stage 3  │
    │ Qualify  │  drag/drop │ Propose  │  drag/drop │  Close   │
    └──────────┘            └──────────┘            └──────────┘
         │                         │                         │
         └─────────────────────────┼─────────────────────────┘
                                   │
                                   ▼
                          /deals/[id] (Detail)
                                   │
                      ┌────────────┴────────────┐
                      │                         │
                      ▼                         ▼
              /deals/[id]/forecast      Update Stage/Amount
              (AI Probability)          (Inline Edit)
                      │
                      ▼
              ┌───────────────┐
              │  FLOW-009     │
              │  Won / Lost   │
              └───────────────┘
```

---

### Flow 5: Password Reset (FLOW-003)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PASSWORD RESET FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    /login
      │
      │ Click "Forgot Password?"
      ▼
    ┌───────────────────┐
    │ /forgot-password  │ ◄── Enter email
    └─────────┬─────────┘
              │
              │ Email sent with reset link
              ▼
    ┌─────────────────────────────┐
    │ /reset-password/[token]     │ ◄── Enter new password
    └─────────────┬───────────────┘
                  │
                  │ Supabase redirect
                  ▼
    ┌───────────────────────────────┐
    │ /reset-password/callback      │ ◄── Handle Supabase callback
    └───────────────┬───────────────┘
                    │
                    │ Password updated
                    ▼
    ┌─────────────┐
    │   /login    │ ◄── Login with new password
    └─────────────┘
```

---

### Flow 6: Ticket Support (FLOW-011 to FLOW-014)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         TICKET SUPPORT FLOW                                 │
└─────────────────────────────────────────────────────────────────────────────┘

    Customer Request
         │
         ▼
    ┌─────────────┐
    │ /tickets/   │ ◄── Create ticket (FLOW-011)
    │    new      │
    └──────┬──────┘
           │
           │ AI Categorization
           ▼
    ┌─────────────────────────────────────────┐
    │         Auto-Routing (FLOW-012)         │
    │  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
    │  │ Queue A │  │ Queue B │  │ Queue C │ │
    │  │ (Sales) │  │(Support)│  │(Billing)│ │
    │  └────┬────┘  └────┬────┘  └────┬────┘ │
    └───────┼────────────┼────────────┼──────┘
            │            │            │
            └────────────┼────────────┘
                         │
                         ▼
    ┌─────────────────────────────────────────┐
    │        /tickets/[id] (Detail)           │
    │  ┌───────────────────────────────────┐ │
    │  │ SLA Timer (FLOW-013)              │ │
    │  │ ████████░░░░░░░░░░ 4h remaining   │ │
    │  └───────────────────────────────────┘ │
    │                                         │
    │  [Reply] [Escalate] [Transfer] [Close] │
    └────────────────┬────────────────────────┘
                     │
                     │ FLOW-014
                     ▼
    ┌─────────────────────────────────────────┐
    │           Resolution                    │
    │  ┌─────────┐        ┌─────────────────┐│
    │  │ Resolved│───────►│ Feedback Survey ││
    │  └─────────┘        │   (FLOW-015)    ││
    │                     └─────────────────┘│
    └─────────────────────────────────────────┘
```

---

### Flow 7: AI Agent Approval (IFC-149)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      AI AGENT APPROVAL FLOW (IFC-149)                       │
└─────────────────────────────────────────────────────────────────────────────┘

    AI Agent generates action
         │
         ▼
    ┌───────────────────────────┐
    │ /agent-approvals          │ ◄── Review queue
    │                           │
    │  ┌─────────────────────┐  │
    │  │ Pending Actions     │  │
    │  │ ───────────────     │  │
    │  │ □ Send email to X   │  │
    │  │ □ Update lead score │  │
    │  │ □ Create task       │  │
    │  └─────────────────────┘  │
    │                           │
    │  [Approve] [Reject] [Edit]│
    └───────────────────────────┘
         │
         ├─── Approve ───► Action executed
         │
         └─── Reject ────► Action discarded + feedback
```

---

## Route Groups & Layouts

### Layout Hierarchy (35 layouts)

```
app/
├── layout.tsx                       # Root layout (Navigation, Theme, Providers)
│
├── (public)/                        # Public route group
│   ├── layout.tsx                   # Public layout (minimal, no auth nav)
│   ├── login/layout.tsx             # Login layout
│   ├── pricing/layout.tsx           # Pricing layout
│   └── signup/layout.tsx            # Signup layout
│
├── (developer)/                     # Developer portal route group
│   └── layout.tsx                   # Developer sidebar layout (developerSidebarConfig)
│
├── dashboard/
│   └── layout.tsx                   # Dashboard layout
│
├── leads/
│   └── (list)/
│       └── layout.tsx               # Leads sidebar layout
│
├── contacts/
│   └── layout.tsx                   # Contacts layout
│
├── accounts/
│   └── layout.tsx                   # Accounts layout
│
├── deals/
│   ├── (list)/
│   │   └── layout.tsx               # Deals sidebar layout
│   ├── [id]/
│   │   └── layout.tsx               # Deal detail layout
│   └── forecast/
│       └── layout.tsx               # Forecast layout
│
├── tasks/
│   └── layout.tsx                   # Tasks layout
│
├── tickets/
│   └── layout.tsx                   # Tickets layout
│
├── documents/
│   └── layout.tsx                   # Documents layout
│
├── cases/
│   └── layout.tsx                   # Cases layout
│
├── calendar/
│   └── layout.tsx                   # Calendar layout
│
├── email/
│   └── layout.tsx                   # Email layout
│
├── agent-approvals/
│   └── layout.tsx                   # Agent approvals layout
│
├── analytics/
│   └── (list)/
│       └── layout.tsx               # Analytics sidebar layout
│
├── notifications/
│   └── layout.tsx                   # Notifications layout
│
├── profile/
│   └── layout.tsx                   # Profile layout
│
├── settings/
│   └── layout.tsx                   # Settings sidebar layout
│
├── billing/
│   └── layout.tsx                   # Billing sidebar layout
│
└── governance/
    └── layout.tsx                   # Governance sidebar layout
```

### `_layout-shell.tsx` Pattern

Seven modules use an RSC + Client component split pattern where `layout.tsx`
exports metadata (React Server Component) and delegates sidebar/provider logic
to a `_layout-shell.tsx` (`'use client'`):

| Module          | Shell File                          |
| --------------- | ----------------------------------- |
| Agent Approvals | `agent-approvals/_layout-shell.tsx` |
| Billing         | `billing/_layout-shell.tsx`         |
| Calendar        | `calendar/_layout-shell.tsx`        |
| Email           | `email/_layout-shell.tsx`           |
| Governance      | `governance/_layout-shell.tsx`      |
| Notifications   | `notifications/_layout-shell.tsx`   |
| Settings        | `settings/_layout-shell.tsx`        |

### Route Group Purposes

| Group         | Purpose                                           |
| ------------- | ------------------------------------------------- |
| `(public)`    | Marketing pages, no auth required                 |
| `(developer)` | Developer portal pages, SUPER_ADMIN sidebar-gated |
| `(list)`      | List views with sidebar navigation                |
| `[id]`        | Dynamic detail pages                              |
| `[slug]`      | Dynamic content pages (blog, careers)             |
| `[token]`     | Token-based verification pages                    |

---

## API Routes (19)

### Internal API Endpoints

| Route                                   | Method   | Description                         |
| --------------------------------------- | -------- | ----------------------------------- |
| `/api/trpc/[trpc]`                      | ALL      | tRPC API handler                    |
| `/api/adr`                              | GET      | List ADRs                           |
| `/api/adr/create`                       | POST     | Create new ADR                      |
| `/api/adr/status`                       | GET/POST | ADR status management               |
| `/api/adr/validate`                     | POST     | Validate ADR                        |
| `/api/adr/index`                        | GET      | ADR index                           |
| `/api/compliance/[standardId]`          | GET      | Compliance standard details         |
| `/api/compliance/risks`                 | GET      | Compliance risks                    |
| `/api/compliance/timeline`              | GET      | Compliance timeline                 |
| `/api/quality-reports`                  | GET      | Quality reports list                |
| `/api/quality-reports/generate`         | POST     | Generate report                     |
| `/api/quality-reports/status`           | GET      | Report status                       |
| `/api/quality-reports/view`             | GET      | View report                         |
| `/api/quality-reports/test-run`         | POST     | Trigger test run                    |
| `/api/quality-reports/test-run/[runId]` | GET      | Test run status                     |
| `/api/quality-reports/test-run/events`  | GET      | SSE events                          |
| `/api/avatar-proxy`                     | GET      | Avatar image proxy with CORS bypass |
| `/api/openapi`                          | GET      | OpenAPI JSON spec endpoint          |
| `/api/developer/webhook-test`           | POST     | Webhook delivery test tool          |

---

## Integration Checklist

### Assessed Pages

| Page                     | Integration Status | Required APIs                                                                                               |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| `/` (Authenticated Home) | Hardcoded          | `dashboard.getWelcomeSummary`, `feed.getItems`, `ai.getDailyInsights`, `goals.getTodayFocus`, `pins.getAll` |
| `/dashboard`             | Partial            | `dashboard.getMetrics`, `dashboard.getWidgets`                                                              |
| `/leads`                 | Integrated         | `leads.list`, `leads.getById`                                                                               |
| `/leads/[id]`            | Partial            | `leads.getById`, `activities.getByLead`                                                                     |
| `/contacts`              | Integrated         | `contacts.list`, `contacts.getById`                                                                         |
| `/deals`                 | Integrated         | `deals.list`, `deals.getById`                                                                               |
| `/deals/[id]/forecast`   | Hardcoded          | `ai.getDealForecast`                                                                                        |
| `/tickets`               | Integrated         | `tickets.list`, `tickets.getById`                                                                           |
| `/analytics`             | Partial            | `analytics.getMetrics`                                                                                      |
| `/agent-approvals`       | Partial            | `agentActions.getPending`                                                                                   |
| `/billing`               | Hardcoded          | Stripe integration                                                                                          |
| `/governance/*`          | Integrated         | Local file system APIs                                                                                      |

### Unassessed Pages (Pending Assessment)

| Page                  | Status             | Notes                                |
| --------------------- | ------------------ | ------------------------------------ |
| `/accounts`           | Pending Assessment | Account list/detail — API TBD        |
| `/tasks`              | Pending Assessment | Task list/detail — API TBD           |
| `/calendar`           | Pending Assessment | Calendar/appointment — API TBD       |
| `/email`              | Pending Assessment | Email inbox/thread — API TBD         |
| `/cases`              | Pending Assessment | Cases list/detail/timeline — API TBD |
| `/developers/apps`    | Pending Assessment | Developer app registry — API TBD     |
| `/docs/webhooks`      | Pending Assessment | Webhook docs/tester — API TBD        |
| `/analytics/feedback` | Pending Assessment | Feedback metrics — API TBD           |
| `/settings/routing`   | Pending Assessment | Lead routing rules — API TBD         |

### Legend

- **Hardcoded** — Uses static/mock data
- **Partial** — Some integration, some hardcoded
- **Integrated** — Fully connected to backend
- **Pending Assessment** — Not yet evaluated (deferred to DOC-005/DOC-006)

---

## Flow Documentation Reference

### All 42 Documented Flows

| Flow ID  | Name                                    | Category                 | Sprint | Priority |
| -------- | --------------------------------------- | ------------------------ | ------ | -------- |
| FLOW-001 | Login com Autenticação Multifator       | Acesso e Identidade      | 1      | Critical |
| FLOW-002 | Gestão de Usuários e Permissões         | Acesso e Identidade      | 1      | High     |
| FLOW-003 | Recuperação de Senha                    | Acesso e Identidade      | 1      | High     |
| FLOW-004 | Troca de Tenant/Workspace               | Acesso e Identidade      | 2      | Medium   |
| FLOW-005 | Criação de Novo Lead                    | Comercial Core           | 1      | Critical |
| FLOW-006 | Conversão Lead para Contato e Deal      | Comercial Core           | 4      | Critical |
| FLOW-007 | Gestão de Pipeline Kanban               | Comercial Core           | 4      | Critical |
| FLOW-008 | Criação e Atualização de Deal           | Comercial Core           | 4      | Critical |
| FLOW-009 | Fechamento de Deal Won/Lost             | Comercial Core           | 5      | Critical |
| FLOW-010 | Renovação de Contrato                   | Comercial Core           | 5      | High     |
| FLOW-011 | Abertura de Ticket de Suporte           | Relacionamento e Suporte | 2      | High     |
| FLOW-012 | Roteamento Automático de Tickets        | Relacionamento e Suporte | 5      | High     |
| FLOW-013 | Gestão de SLA e Escalation              | Relacionamento e Suporte | 5      | High     |
| FLOW-014 | Resolução e Fechamento de Ticket        | Relacionamento e Suporte | 4      | High     |
| FLOW-015 | Coleta e Análise de Feedback (NPS/CSAT) | Relacionamento e Suporte | 6      | Medium   |
| FLOW-016 | Envio de Email com Tracking             | Comunicação              | 5      | High     |
| FLOW-017 | Integração de Chat Bidirecional         | Comunicação              | 5      | Medium   |
| FLOW-018 | Registro de Chamadas Telefônicas        | Comunicação              | 5      | Medium   |
| FLOW-019 | Agendamento de Reuniões                 | Comunicação              | 5      | Medium   |
| FLOW-020 | Feed de Atividade Unificado             | Comunicação              | 5      | High     |
| FLOW-021 | Campanha de Email Marketing             | Comunicação              | 6      | Medium   |
| FLOW-022 | Notificações Push/In-App                | Comunicação              | 7      | Medium   |
| FLOW-023 | Construtor de Relatórios                | Analytics e Insights     | 5      | High     |
| FLOW-024 | Dashboard Customizável                  | Analytics e Insights     | 6      | High     |
| FLOW-025 | Previsão de Vendas (AI)                 | Analytics e Insights     | 7      | High     |
| FLOW-026 | Análise de Sentimento                   | Analytics e Insights     | 8      | Medium   |
| FLOW-027 | Métricas de Performance                 | Analytics e Insights     | 8      | High     |
| FLOW-028 | Exportação de Dados                     | Analytics e Insights     | 9      | Medium   |
| FLOW-029 | Gestão de Audit Log                     | Segurança e Compliance   | 2      | Critical |
| FLOW-030 | Backup e Disaster Recovery              | Segurança e Compliance   | 0      | Critical |
| FLOW-031 | Criptografia de Dados                   | Segurança e Compliance   | 1      | Critical |
| FLOW-032 | Conformidade LGPD/GDPR                  | Segurança e Compliance   | 3      | Critical |
| FLOW-033 | Gestão de API Keys                      | Segurança e Compliance   | 3      | High     |
| FLOW-034 | Testes Unitários Automatizados          | Qualidade e Testes       | 2      | High     |
| FLOW-035 | Testes de Integração                    | Qualidade e Testes       | 2      | High     |
| FLOW-036 | Testes E2E (Playwright)                 | Qualidade e Testes       | 3      | High     |
| FLOW-037 | Code Review Automatizado                | Qualidade e Testes       | 3      | High     |
| FLOW-038 | Testes de Performance e Load            | Qualidade e Testes       | 2      | High     |
| FLOW-039 | Document Search (FTS + Semantic)        | Search & AI              | 12     | Critical |
| FLOW-040 | DSAR Data Erasure (GDPR Article 17)     | Segurança e Compliance   | 11-12  | Critical |
| FLOW-041 | Case RAG Retrieval (Agent Tool)         | Search & AI              | 12-13  | Critical |
| FLOW-045 | AI Chain Versioning Admin UI            | AI & Configuration       | 14     | High     |

### Route-to-Flow Mappings (New Modules)

| Route       | Flow     | Description            |
| ----------- | -------- | ---------------------- |
| `/calendar` | FLOW-019 | Appointment scheduling |
| `/email`    | FLOW-016 | Email with tracking    |
| `/cases`    | FLOW-041 | Case RAG retrieval     |
| `/tasks`    | —        | No flow defined yet    |
| `/accounts` | —        | No flow defined yet    |

### File Locations

```
apps/project-tracker/docs/metrics/_global/flows/
├── flow-index.md          # Master index with route mappings
├── FLOW-001.md            # Login + MFA
├── FLOW-002.md            # User management
├── FLOW-003.md            # Password recovery
├── ...
├── FLOW-041.md            # Case RAG retrieval
└── FLOW-045.md            # AI chain versioning
```

### Related Documentation

| Document      | Location                                                    | Description                          |
| ------------- | ----------------------------------------------------------- | ------------------------------------ |
| Flow Index    | `flows/flow-index.md`                                       | Master index linking flows to routes |
| Sitemap       | `docs/design/sitemap.md`                                    | All application routes               |
| Style Guide   | `docs/company/brand/style-guide.md`                         | Component patterns                   |
| Page Registry | `docs/design/page-registry.md`                              | Detailed page specs                  |
| Sprint Plan   | `apps/project-tracker/docs/metrics/_global/Sprint_plan.csv` | Task tracking                        |

---

## Document History

| Version | Date       | Author      | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1.0     | 2026-02-02 | Claude Code | Initial documentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.1     | 2026-02-02 | Claude Code | Added reference to existing flow documentation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2.0     | 2026-02-24 | Claude Code | DOC-003: Updated 68→103 pages; added Developer Portal (5), Accounts (2), Tasks (2), Calendar (3), Email (2) sections; expanded Agent Approvals (1→14), Cases (1→4); corrected auth paths (`/mfa/verify`, `/verify-email/[token]`); added `/reset-password/callback`, `/verify-email/callback`; updated nav structure (static→dynamic module-gated); added `_layout-shell.tsx` pattern (7 modules); updated sidebar configs (11→17); updated API routes (16→19); expanded integration checklist with assessed/unassessed split; added route-to-flow mappings for calendar/email/cases |
