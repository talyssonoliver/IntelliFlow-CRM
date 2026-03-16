# Design System & UI Mockups

## Overview

This directory contains design mockups and UI specifications that **MUST** be
referenced when implementing UI tasks.

## Directory Structure

```
docs/design/
├── README.md              # This file
├── sitemap.md             # Full application sitemap (~90 pages)
├── page-registry.md       # Central registry of all UI pages with KPIs, paths, ownership
└── mockups/               # 32 unique mockups (PNG + HTML prototypes)
    ├── account-list.*           # Account list view
    ├── ai-review-queue.*        # AI agent review/approval queue
    ├── billing-portal.*         # Billing & subscription management
    ├── calendar-detail.*        # Calendar event detail
    ├── case_list.*              # Case list view
    ├── case-detail.*            # Case detail page
    ├── case-new.*               # New case creation form
    ├── compliance-dashboard-mockup.html  # Compliance dashboard
    ├── contact-360-view.*       # Contact 360 page (IFC-090)
    ├── contact-list.*           # Contact list view (IFC-092)
    ├── create-new-contact.*     # New contact creation form
    ├── create-new-lead.*        # New lead creation form
    ├── create-new-record.*      # Generic new record creation
    ├── customize-dashboard.*    # Dashboard customization view
    ├── dashboard-overview.*     # Dashboard with pipeline (IFC-091)
    ├── deal-forecast.*          # Deal forecasting dashboard (IFC-093)
    ├── deals-detail.*           # Deal detail page (IFC-094)
    ├── deals-kanban.*           # Deals Kanban board view (IFC-095)
    ├── edit-pinned-home-authenticated.*  # Home page pin editing
    ├── email-compose.*          # Email composition view
    ├── home-authenticated.html  # Authenticated home page
    ├── lead_list.png            # Lead list view (IFC-097)
    ├── lead-360-view.*          # Lead 360 detail page
    ├── lead-list.html           # Lead list interactive prototype
    ├── lead-new.png             # New lead form (IFC-096)
    ├── lead-settings.*          # Lead module settings
    ├── notification-page.html   # Notification center
    ├── notification-settings.html  # Notification settings
    ├── right-side-home-authenticated.*  # Home page right sidebar
    ├── sentiment-analysis.*     # Sentiment analysis dashboard
    ├── ticket-datail.*          # Ticket detail page
    └── tickets-sla.*            # Tickets with SLA monitoring (IFC-098)
```

## Page Registry

See `page-registry.md` for the complete list of all UI pages including:

- Route paths and KPIs
- Code file locations (correct paths)
- Task mappings
- RACI ownership
- Implementation status

## Design Reference Convention (CRITICAL)

All UI tasks in `Sprint_plan.csv` **MUST** include a `DESIGN:` prefix in their
prerequisites column pointing to the relevant mockup.

### Example

```csv
"IFC-090","Core CRM","Contact 360 Page","...","DESIGN:docs/design/mockups/contact-360-view.png;FILE:..."
```

## Why This Matters

### Problem Identified (2025-12-27)

During Sprint 6, we discovered that the implemented UI (basic placeholder
dashboard) diverged significantly from the planned designs (Contact 360 view,
Pipeline Kanban). Root cause analysis revealed:

1. **Design mockups existed** but were not linked to tasks
2. **No DESIGN: prefix** existed in the CSV format
3. **Agents implementing tasks** had no way to know the design vision
4. **Foundation tasks (ENV-009-AI)** created placeholder UI
5. **Actual UI tasks (IFC-090, IFC-091)** were still in BACKLOG

### Prevention Measures

1. **DESIGN: prefix** - All UI tasks must reference design mockups
2. **Design directory** - Centralized location for all mockups
3. **Context pack builder** - Should include design references
4. **STOA-Domain validation** - Should verify design match

## Design Mockup Mapping

| Mockup | Tasks | Description |
| --- | --- | --- |
| `account-list` | IFC-100 | Account list view with search and filters |
| `ai-review-queue` | PG-148 | AI agent review/approval queue |
| `billing-portal` | PG-045 | Billing portal with subscription management |
| `calendar-detail` | IFC-082 | Calendar event detail page |
| `case_list` | IFC-133 | Case list view with search and filters |
| `case-detail` | IFC-134 | Case detail page |
| `case-new` | IFC-134 | New case creation form |
| `compliance-dashboard-mockup` | GOV-001 | Compliance/governance dashboard |
| `contact-360-view` | IFC-090 | Contact detail page with tabs, AI insights, tasks |
| `contact-list` | IFC-092 | Contact list view with search, filters, and bulk actions |
| `create-new-contact` | IFC-092 | New contact creation form |
| `create-new-lead` | IFC-096 | New lead creation form (alternate design) |
| `create-new-record` | — | Generic new record creation pattern |
| `customize-dashboard` | IFC-091 | Dashboard customization/widget editor |
| `dashboard-overview` | IFC-091 | Dashboard with pipeline stages, charts |
| `deal-forecast` | IFC-093 | Deal forecasting dashboard with predictive analytics |
| `deals-detail` | IFC-094 | Individual deal detail page with stages, activities, and notes |
| `deals-kanban` | IFC-095 | Deals displayed in Kanban board format by pipeline stages |
| `edit-pinned-home-authenticated` | PG-025 | Home page pinned items editor |
| `email-compose` | IFC-079 | Email composition view |
| `home-authenticated` | PG-025 | Authenticated home/dashboard page |
| `lead-360-view` | IFC-097 | Lead 360 detail page with scoring and conversion data |
| `lead_list` / `lead-list` | IFC-097 | Lead list view with conversion tracking and scoring |
| `lead-new` | IFC-096 | New lead creation form with qualification fields |
| `lead-settings` | PG-178 | Lead module settings page |
| `notification-page` | IFC-044 | Notification center / inbox |
| `notification-settings` | PG-174 | Notification settings and channel management |
| `right-side-home-authenticated` | PG-025 | Home page right sidebar (upcoming events, quick actions) |
| `sentiment-analysis` | IFC-116 | Sentiment analysis dashboard |
| `ticket-datail` | IFC-098 | Ticket detail page (note: filename typo "datail") |
| `tickets-sla` | IFC-098 | Support tickets with SLA monitoring and escalation alerts |
| `workflow-progress-panel` | PG-193 | Real-time N/N step progress tracker for agent workflow runs — progress bar, per-step status icons (pending/running/completed/failed), integrated into /agent-approvals/agents and /agent-approvals/logs |

## UI Components Required (from designs)

### Contact 360 View (`contact-360-view.png`)

- [ ] Contact header (photo, name, company, role)
- [ ] Key metrics (Revenue Won, Conversion Probability)
- [ ] Action buttons (+New Deal, +New Ticket)
- [ ] Tab navigation (Overview, Activity Timeline, Deals, Tickets, Documents, AI
      Insights)
- [ ] Activity timeline with dates
- [ ] Deals list with stage/value/date
- [ ] Tasks checklist with due dates
- [ ] AI Insights panel (Conversion %, Lifetime Value, Churn Risk)
- [ ] Notes section

### Dashboard Overview (`dashboard-overview.png`)

- [ ] Left sidebar navigation (Dashboard, Contacts, Deals, Reports, Settings)
- [ ] Pipeline stages (Qualification → Needs Analysis → Proposal → Negotiation →
      Closed)
- [ ] Contact card with activity
- [ ] Deals by Stage pie chart
- [ ] Revenue bar chart
- [ ] Tasks section
- [ ] Reports section

### Contact List (`contact-list.png`)

- [ ] Search bar with advanced filters
- [ ] Contact cards with photo, name, company, last activity
- [ ] Bulk action toolbar (select all, export, delete)
- [ ] Sort options (name, company, last contact, revenue)
- [ ] Pagination controls
- [ ] Quick actions (view, edit, create deal)

### Lead List (`lead_list.png`)

- [ ] Lead scoring indicators
- [ ] Conversion probability percentages
- [ ] Lead source tracking
- [ ] Qualification status badges
- [ ] Follow-up reminders
- [ ] Bulk qualification actions

### New Lead Form (`lead-new.png`)

- [ ] Contact information fields (name, email, phone, company)
- [ ] Lead qualification questions
- [ ] Source selection dropdown
- [ ] Priority assignment
- [ ] Initial notes section
- [ ] Assignment to sales rep

### Deals Kanban (`deals-kanban.png`)

- [ ] Pipeline stage columns (Prospect, Qualification, Proposal, Negotiation,
      Closed Won/Lost)
- [ ] Deal cards with value, company, contact, days in stage
- [ ] Drag and drop functionality between stages
- [ ] Stage limits and warnings
- [ ] Quick edit capabilities
- [ ] Deal creation from any stage

### Deal Detail (`deals-detail.png`)

- [ ] Deal header (company, contact, value, probability, close date)
- [ ] Stage progression timeline
- [ ] Activity feed
- [ ] Documents and attachments
- [ ] Competitor analysis
- [ ] Next steps checklist
- [ ] Deal team members

### Deal Forecast (`deal-forecast.png`)

- [ ] Forecast accuracy metrics
- [ ] Pipeline velocity charts
- [ ] Revenue projections by quarter
- [ ] Risk assessment indicators
- [ ] Forecast vs actual comparisons
- [ ] Scenario planning tools

### Tickets SLA (`tickets-sla.png`)

- [ ] SLA status indicators (green/yellow/red)
- [ ] Time remaining counters
- [ ] Escalation warnings
- [ ] Priority levels
- [ ] Agent assignment
- [ ] Resolution tracking

## Adding New Designs

When adding new design mockups:

1. Save to `docs/design/mockups/` with descriptive filename
2. Update this README with the task mapping
3. Add `DESIGN:docs/design/mockups/<filename>` to relevant CSV tasks
4. Run sync to update task registry

## Validation

Before marking a UI task as DONE, verify:

1. Implementation matches the design mockup
2. All components from the design are present
3. Responsive behavior matches design intent
4. Lighthouse score meets targets (>90)
