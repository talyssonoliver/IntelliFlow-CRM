# IntelliFlow CRM - Page Registry

> **Location**: `docs/design/page-registry.md`
> **Purpose**: Central registry of all UI pages with KPIs, artifacts, and ownership
> **Last Updated**: 2025-12-27

---

## Path Conventions

| Type | Convention | Example |
|------|------------|---------|
| **Code** | `apps/web/src/app/{route}/page.tsx` | `apps/web/src/app/contacts/(list)/page.tsx` |
| **Components** | `apps/web/src/components/{name}.tsx` | `apps/web/src/components/lead-form.tsx` |
| **Design Mockups** | `docs/design/mockups/{name}.png` | `docs/design/mockups/contact-360-view.png` |
| **E2E Tests** | `tests/e2e/{name}.spec.ts` | `tests/e2e/contacts.spec.ts` |
| **API Routers** | `apps/api/src/modules/{domain}/{name}.router.ts` | `apps/api/src/modules/contact/contact.router.ts` |

### Route Group Convention

We use Next.js route groups to control layout inheritance:

```
apps/web/src/app/
├── contacts/
│   ├── (list)/                    ← Route group (doesn't affect URL)
│   │   ├── layout.tsx             ← Sidebar layout for list/new pages
│   │   ├── page.tsx               ← /contacts (HAS sidebar)
│   │   └── new/
│   │       └── page.tsx           ← /contacts/new (HAS sidebar)
│   └── [id]/
│       └── page.tsx               ← /contacts/123 (NO sidebar, full-width)
│
├── leads/
│   ├── (list)/                    ← Route group
│   │   ├── layout.tsx             ← Sidebar layout
│   │   ├── page.tsx               ← /leads (HAS sidebar)
│   │   └── new/
│   │       └── page.tsx           ← /leads/new (HAS sidebar)
│   └── [id]/
│       └── page.tsx               ← /leads/123 (NO sidebar, full-width)
```

**Rule**: List and create pages use a shared sidebar layout via `(list)/layout.tsx`. Detail pages (`[id]/`) render full-width without the module sidebar.

---

## Core CRM

### Lead Capture (/leads/new)
- **Task**: IFC-004
- **KPIs**: Submission <1s, Lighthouse >90
- **Code**: `apps/web/src/app/leads/page.tsx`, `apps/web/src/components/lead-form.tsx`
- **API**: `apps/api/src/modules/lead/lead.router.ts`
- **Tests**: `tests/e2e/leads.spec.ts`
- **RACI**: R: Frontend Dev / A: PM / C: Sales / I: CEO

### Contact List (/contacts)
- **Task**: IFC-089
- **KPIs**: Load <200ms, Lighthouse >90
- **Code**: `apps/web/src/app/contacts/page.tsx`
- **API**: `apps/api/src/modules/contact/contact.router.ts`
- **Tests**: `tests/e2e/contacts.spec.ts`
- **RACI**: R: Frontend Dev / A: PM / C: Sales / I: CEO

### Contact 360 (/contacts/[id])
- **Task**: IFC-090
- **KPIs**: Load <200ms, SLA visible, Lighthouse >90
- **Design**: `docs/design/mockups/contact-360-view.png`
- **Code**: `apps/web/src/app/contacts/[id]/page.tsx`
- **Components**:
  - Contact header (photo, name, company, metrics)
  - Tabs (Overview, Activity Timeline, Deals, Tickets, Documents, AI Insights)
  - Tasks checklist
  - AI Insights panel (Conversion %, Lifetime Value, Churn Risk)
  - Notes section
- **RACI**: R: Frontend Dev / A: PM / C: Security Eng / I: CEO

### Edit Contact (/contacts/[id]/edit)
- **Task**: IFC-089
- **KPIs**: Save <200ms
- **Code**: `apps/web/src/app/contacts/[id]/edit/page.tsx`
- **RACI**: R: Frontend Dev / A: PM / C: Sales / I: CEO

### Bulk Import (/contacts/import)
- **Task**: IFC-089 (extension)
- **KPIs**: Upload >5000 contacts in <2m
- **Code**: `apps/web/src/app/contacts/import/page.tsx`
- **RACI**: R: Backend Dev / A: PM / C: Data Eng / I: CTO

### Deals Pipeline (/deals)
- **Task**: IFC-091
- **KPIs**: Stage update <300ms, Forecast >=85%
- **Design**: `docs/design/mockups/dashboard-overview.png`
- **Code**: `apps/web/src/app/deals/page.tsx`
- **Components**:
  - Pipeline stages (Qualification -> Needs Analysis -> Proposal -> Negotiation -> Closed)
  - Kanban board with drag-and-drop
  - Deals by Stage pie chart
  - Revenue bar chart
- **API**: `apps/api/src/modules/opportunity/opportunity.router.ts`
- **RACI**: R: Backend Dev / A: CTO / C: Sales Director / I: CFO

### Deal Detail (/deals/[id])
- **Task**: IFC-091
- **KPIs**: Load <200ms, Inline edit working
- **Code**: `apps/web/src/app/deals/[id]/page.tsx`
- **RACI**: R: Backend Dev / A: PM / C: Sales Ops / I: CTO

### Deal Forecasting (/deals/[id]/forecast)
- **Task**: IFC-092
- **KPIs**: Forecast accuracy >=85%
- **Code**: `apps/web/src/app/deals/[id]/forecast/page.tsx`
- **RACI**: R: Data Eng / A: PM / C: CFO / I: CEO

### Tickets SLA List (/tickets)
- **Task**: IFC-093
- **KPIs**: SLA alerts <1m, Uptime 99.9%
- **Code**: `apps/web/src/app/tickets/page.tsx`
- **RACI**: R: SRE / A: Head of Support / C: AI Specialist / I: COO

### Ticket Detail (/tickets/[id])
- **Task**: , 
- **KPIs**: Update <200ms
- **Code**: `apps/web/src/app/tickets/[id]/page.tsx`
- **RACI**: R: Support Eng / A: PM / C: COO / I: CEO

### Create Ticket (/tickets/new)
- **Task**: IFC-093
- **KPIs**: Form submission <2s
- **Code**: `apps/web/src/app/tickets/new/page.tsx`
- **RACI**: R: Frontend Dev / A: PM / C: Support Lead / I: COO

### Documents (/documents)
- **Task**: IFC-094
- **KPIs**: Contract signed, Inline preview
- **Code**: `apps/web/src/app/documents/page.tsx`
- **RACI**: R: Integration Eng / A: CTO / C: Legal / I: CFO

### Document Detail (/documents/[id])
- **Task**: IFC-094
- **KPIs**: Load <200ms
- **Code**: `apps/web/src/app/documents/[id]/page.tsx`
- **RACI**: R: Backend Dev / A: PM / C: Legal / I: CEO

### E-Signature Flow (/documents/sign)
- **Task**: IFC-094
- **KPIs**: Sign flow <2min, 99.9% reliability
- **Code**: `apps/web/src/app/documents/sign/page.tsx`
- **Integration**: DocuSign/Adobe Sign
- **RACI**: R: Integration Eng / A: CTO / C: Legal / I: CFO

### Case Timeline (/cases/timeline)
- **Task**: IFC-147
- **KPIs**: Load <200ms, Deadline alerts <1m, Timeline scroll smooth
- **Code**: `apps/web/src/app/cases/timeline/page.tsx`
- **Lib**: `apps/web/lib/cases/reminders-service.ts`
- **Components**:
  - Timeline view with event grouping
  - Deadline countdown indicators
  - Priority badges (urgent, high, medium, low)
  - Event type icons (task, deadline, appointment, email)
  - Overdue alerts with visual highlighting
- **API**: `apps/api/src/modules/misc/timeline.router.ts`
- **Domain**: `packages/domain/src/legal/deadlines/deadline-engine.ts`
- **RACI**: R: Frontend Dev / A: PM / C: Sales Ops / I: CEO

---

## Analytics & Reporting

### Analytics Dashboard (/analytics)
- **Task**: IFC-096
- **KPIs**: Real-time updates <1s
- **Code**: `apps/web/src/app/analytics/page.tsx`
- **RACI**: R: Data Eng / A: PM / C: UX / I: CEO

### KPI Detail (/analytics/kpi/[id])
- **Task**: IFC-096
- **KPIs**: KPI refresh <500ms
- **Code**: `apps/web/src/app/analytics/kpi/[id]/page.tsx`
- **RACI**: R: Data Eng / A: PM / C: CEO

### Custom Report Builder (/reports/custom)
- **Task**: IFC-096
- **KPIs**: Build <5min, Export CSV
- **Code**: `apps/web/src/app/reports/custom/page.tsx`

### Export Centre (/reports/export)
- **Task**: IFC-096
- **KPIs**: Exports <30s
- **Code**: `apps/web/src/app/reports/export/page.tsx`

### Scheduled Reports (/reports/scheduled)
- **Task**: IFC-096
- **KPIs**: Delivery on-time >99%
- **Code**: `apps/web/src/app/reports/scheduled/page.tsx`

---

## Automation & AI

### Workflow Builder (/automation/workflows)
- **Task**: IFC-031
- **KPIs**: Flow execution <1s
- **Code**: `apps/web/src/app/automation/workflows/page.tsx`
- **RACI**: R: Frontend Dev / A: Architect / C: UX / I: CTO

### Template Library (/automation/workflows/templates)
- **Task**: IFC-031
- **KPIs**: >10 templates available
- **Code**: `apps/web/src/app/automation/workflows/templates/page.tsx`

### Workflow Detail (/automation/workflows/[id])
- **Task**: IFC-031
- **KPIs**: Edit flow <2min
- **Code**: `apps/web/src/app/automation/workflows/[id]/page.tsx`

### AI Insights (/ai/insights)
- **Task**: IFC-095
- **KPIs**: AI accuracy >=80%
- **Code**: `apps/web/src/app/ai/insights/page.tsx`

### Explainability Dashboard (/ai/explainability)
- **Task**: IFC-023
- **KPIs**: Trust rating >4/5
- **Code**: `apps/web/src/app/ai/explainability/page.tsx`

### AI Feedback Loop (/ai/feedback)
- **Task**: IFC-025
- **KPIs**: 100% feedback captured
- **Code**: `apps/web/src/app/ai/feedback/page.tsx`

---

## Support & Knowledge Base

### Knowledge Base (/support/kb)
- **Task**: IFC-046
- **KPIs**: Deflection >=30%
- **Code**: `apps/web/src/app/support/kb/page.tsx`

### Article (/support/kb/[id])
- **Task**: IFC-046
- **KPIs**: Load <200ms
- **Code**: `apps/web/src/app/support/kb/[id]/page.tsx`

### Live Chat (/support/chat)
- **Task**: IFC-047
- **KPIs**: First response <30s
- **Code**: `apps/web/src/app/support/chat/page.tsx`

### SLA Dashboard (/support/status)
- **Task**: IFC-093
- **KPIs**: SLA visible in real-time
- **Dashboard**: `artifacts/misc/grafana-dashboard.json`

### FAQ (/support/faq)
- **Task**: IFC-046
- **KPIs**: Answer click <1s
- **Code**: `apps/web/src/app/support/faq/page.tsx`

---

## Admin & Compliance

### Billing & Subscription (/admin/billing)
- **Task**: IFC-054
- **KPIs**: Payment success >98%
- **Code**: `apps/web/src/app/admin/billing/page.tsx`

### User Management (/admin/users)
- **Task**: IFC-098
- **KPIs**: Create user <2s
- **Code**: `apps/web/src/app/admin/users/page.tsx`

### Roles & Permissions (/admin/roles)
- **Task**: IFC-098
- **KPIs**: RBAC changes tracked 100%
- **Code**: `apps/web/src/app/admin/roles/page.tsx`

### Audit Logs (/admin/audit)
- **Task**: IFC-098
- **KPIs**: 100% actions logged
- **Code**: `apps/web/src/app/admin/audit/page.tsx`

### GDPR Management (/admin/compliance/gdpr)
- **Task**: IFC-056
- **KPIs**: Requests resolved <48h
- **Code**: `apps/web/src/app/admin/compliance/gdpr/page.tsx`

### Accessibility Dashboard (/admin/compliance/accessibility)
- **Task**: IFC-076
- **KPIs**: WCAG AA >95%
- **Code**: `apps/web/src/app/admin/compliance/accessibility/page.tsx`

### Security Settings (/admin/security)
- **Task**: IFC-098
- **KPIs**: 0 critical vulnerabilities
- **Code**: `apps/web/src/app/admin/security/page.tsx`

### Integrations Marketplace (/admin/integrations)
- **Task**: IFC-055
- **KPIs**: Install integration <2min
- **Code**: `apps/web/src/app/admin/integrations/page.tsx`

### API Keys Management (/admin/api-keys)
- **Task**: IFC-081
- **KPIs**: Key creation <2s
- **Code**: `apps/web/src/app/admin/api-keys/page.tsx`

### Webhooks Management (/admin/webhooks)
- **Task**: IFC-055
- **KPIs**: Event delivery <500ms
- **Code**: `apps/web/src/app/admin/webhooks/page.tsx`

### System Health Dashboard (/admin/system)
- **Task**: AUTOMATION-002
- **KPIs**: Uptime >=99.9%
- **Dashboard**: `artifacts/misc/grafana-dashboard.json`

---

## User Settings

### Profile Settings (/settings/profile)
- **KPIs**: Update <200ms
- **Code**: `apps/web/src/app/settings/profile/page.tsx`

### Preferences (/settings/preferences)
- **KPIs**: Save <200ms
- **Code**: `apps/web/src/app/settings/preferences/page.tsx`

### Notification Settings (/settings/notifications)
- **KPIs**: Delivery success >95%
- **Code**: `apps/web/src/app/settings/notifications/page.tsx`

### Device Management (/settings/devices)
- **KPIs**: Device removal <2s
- **Code**: `apps/web/src/app/settings/devices/page.tsx`

### Activity Log (/settings/activity)
- **KPIs**: Actions visible in <2s
- **Code**: `apps/web/src/app/settings/activity/page.tsx`

---

## Ops & Observability

### Monitoring Dashboard (/ops/monitoring)
- **KPIs**: MTTD <2m
- **Dashboard**: `artifacts/misc/grafana-dashboard.json`

### Distributed Traces (/ops/traces)
- **KPIs**: Trace resolution <1m
- **Code**: `apps/web/src/app/ops/traces/page.tsx`

### Log Explorer (/ops/logs)
- **KPIs**: Query latency <1s
- **Code**: `apps/web/src/app/ops/logs/page.tsx`

### Alert Configurations (/ops/alerts)
- **KPIs**: Alert trigger <30s
- **Code**: `apps/web/src/app/ops/alerts/page.tsx`

---

## Dashboard (/dashboard)
- **Task**: ENV-009-AI (foundation), IFC-090/IFC-091 (full implementation)
- **KPIs**: Load <1s, Lighthouse >90
- **Design**: `docs/design/mockups/dashboard-overview.png`
- **Code**: `apps/web/src/app/dashboard/page.tsx`
- **Components**:
  - Stats cards (Total Leads, Qualified, Avg Score, Converted)
  - Recent Leads list
  - AI Insights panel
  - Activity Overview timeline
- **RACI**: R: Frontend Dev / A: PM / C: UX / I: CEO

---

## Implementation Status

| Route | Task | Status | API Connected | Navigation | Notes |
|-------|------|--------|---------------|------------|-------|
| /dashboard | ENV-009-AI | Placeholder | No | Shared layout | 4 stat cards, Recent Leads, AI Insights, Activity Overview - all static |
| /leads | IFC-004 | Basic | No | Module sidebar via `(list)/layout.tsx` | Table with filters, sample leads |
| /leads/new | IFC-004 | Basic | No | Module sidebar via `(list)/layout.tsx` | 3-step wizard form |
| /contacts | IFC-089 | Basic | No | Module sidebar via `(list)/layout.tsx` | Search + table grid, sample contacts |
| /contacts/new | IFC-089 | Basic | No | Module sidebar via `(list)/layout.tsx` | 3-step wizard form |
| /contacts/[id] | IFC-090 | Basic | No | Full-width (no module sidebar) | Contact 360 view |
| /deals | IFC-091 | BACKLOG | - | - | Not implemented |
| /analytics | IFC-096 | Placeholder | No | **Own nav bar** | 4 metric cards, Pipeline placeholder, AI Recommendations |

### Status Legend

| Status | Description |
|--------|-------------|
| **BACKLOG** | Not started, no code exists |
| **Placeholder** | UI exists with static/sample data, no API connection |
| **Basic** | UI functional with placeholder data, some interactivity |
| **Connected** | UI connected to API, real data flows |
| **Complete** | Fully implemented with tests and documentation |

---

## Current Implementation Details

### Dashboard (/dashboard)

**File**: `apps/web/src/app/dashboard/page.tsx`

**Actual State** (as of 2025-12-27):
- Uses shared layout with Navigation sidebar (`lg:pl-64` offset)
- 4 StatCard components in grid:
  - Total Leads: "--" (placeholder)
  - Qualified: "--" (placeholder)
  - Avg Score: "--" (placeholder)
  - Converted: "--" (placeholder)
- Recent Leads section: Empty placeholder
- AI Insights panel: 3 hardcoded items (High-value lead, Engagement pattern, Follow-up reminder)
- Activity Overview: Empty placeholder

**Missing**:
- API connection for real-time metrics
- Dynamic data loading
- Charts/visualizations
- Real activity feed

---

### Leads (/leads)

**File**: `apps/web/src/app/leads/(list)/page.tsx`

**Actual State**:
- **Navigation**: Uses module sidebar via `(list)/layout.tsx`
  - Lead Views: All Leads, My Leads, Unread Leads, Recently Viewed
  - Segments: Hot Leads, New from Web, Follow-up Required
  - Module Settings link
- Table with columns: Lead Name/Company, Email, Score, Status, Created Date, Actions
- 5 hardcoded sample leads with score badges
- Status filter dropdowns (Status, Score, Sort)
- Search input with filtering logic
- Pagination UI

**Missing**:
- API connection to lead.router.ts
- Real data from database
- Working filter dropdowns

### Leads New (/leads/new)

**File**: `apps/web/src/app/leads/(list)/new/page.tsx`

**Actual State**:
- **Navigation**: Uses module sidebar via `(list)/layout.tsx` (shared with list)
- 3-step wizard form: Basic Info → Company Details → Qualification (BANT)
- Clickable step indicators for navigation
- "Other" source specification field (conditional)
- Form validation with error messages
- Pro tip card at bottom

**Missing**:
- API connection to create lead
- Real form submission

---

### Contacts (/contacts)

**File**: `apps/web/src/app/contacts/(list)/page.tsx`

**Actual State**:
- **Navigation**: Uses module sidebar via `(list)/layout.tsx`
  - Contact Views: All Contacts, My Contacts, Recently Added, Recently Viewed
  - Segments: VIP Clients, Partners, Vendors
  - Module Settings link
- Table with columns: Contact Name, Company, Email, Phone, Deals/Tickets, Actions
- 5 hardcoded sample contacts with deal/ticket badges
- Filter dropdowns (Status, Company, Sort)
- Search input with filtering logic
- Pagination UI
- Click-through to contact detail page

**Missing**:
- API connection to contact.router.ts
- Real data from database
- Working filter dropdowns

### Contacts New (/contacts/new)

**File**: `apps/web/src/app/contacts/(list)/new/page.tsx`

**Actual State**:
- **Navigation**: Uses module sidebar via `(list)/layout.tsx` (shared with list)
- 3-step wizard form: Personal Details → Company & Role → Additional Info
- Clickable step indicators for navigation
- "Other" specification fields for Contact Type and Department (conditional)
- Form validation with error messages
- Pro tip card at bottom

**Missing**:
- API connection to create contact
- Real form submission

---

### Analytics (/analytics)

**File**: `apps/web/src/app/analytics/page.tsx`

**Actual State**:
- **Navigation**: Has its OWN inline nav bar (inconsistent with shared layout)
- 4 MetricCard components:
  - Total Revenue: $125,000
  - Active Leads: 48
  - Conversion Rate: 23%
  - Avg Deal Size: $12,500
- Pipeline Overview: Empty placeholder
- Top AI Recommendations: 3 RecommendationItem components with sample data

**Missing**:
- Should use shared Navigation sidebar (currently has own nav)
- API connection for real metrics
- Charts and visualizations
- Date range filtering
- Export functionality

---

## Navigation Architecture

### Resolved: Module Sidebar Pattern (Sprint 6)

The navigation inconsistency has been resolved using **Next.js Route Groups**:

**Pattern**: Each CRM module (contacts, leads) has its own sidebar layout that applies only to list/create pages, while detail pages render full-width.

```
/contacts/
├── (list)/layout.tsx      ← Module sidebar (Contact Views, Segments, Settings)
│   ├── page.tsx           ← /contacts (with sidebar)
│   └── new/page.tsx       ← /contacts/new (with sidebar)
└── [id]/page.tsx          ← /contacts/123 (NO sidebar, full-width)

/leads/
├── (list)/layout.tsx      ← Module sidebar (Lead Views, Segments, Settings)
│   ├── page.tsx           ← /leads (with sidebar)
│   └── new/page.tsx       ← /leads/new (with sidebar)
└── [id]/page.tsx          ← /leads/123 (NO sidebar, full-width)
```

**Benefits**:
- DRY: Sidebar code lives in one place per module
- Consistent UX: Navigation persists when switching between list and create views
- Flexibility: Detail pages can have full-width layouts without the module sidebar
- Maintainable: Easy to update sidebar items in one location

**Remaining Work**:
- `/analytics` still uses inline nav bar (to be refactored)

---

## Notes

- All paths follow Next.js 16 App Router convention: `apps/web/src/app/{route}/page.tsx`
- **Route Groups**: Use `(list)/` folders for pages that share a module sidebar layout
- Design mockups must be referenced in Sprint_plan.csv with `DESIGN:` prefix
- API routers follow tRPC pattern in `apps/api/src/modules/{domain}/`
- E2E tests use Playwright in `tests/e2e/`
- Navigation architecture resolved in Sprint 6 using route groups (see Navigation Architecture section)
