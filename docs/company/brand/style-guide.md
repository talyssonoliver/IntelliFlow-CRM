# IntelliFlow CRM Style Guide

Component patterns and implementation guidelines extracted from approved mockups.

> **Location**: `docs/company/brand/style-guide.md`
> **Last Updated**: 2025-12-27

---

## Design System References

| Resource | Location | Purpose |
|----------|----------|---------|
| **Visual Identity** | `docs/company/brand/visual-identity.md` | Design tokens (colors, typography) |
| **Flow Index** | `apps/project-tracker/docs/metrics/_global/flows/flow-index.md` | All 38 user flows |
| **Sitemap** | `docs/design/sitemap.md` | Route → Flow mapping |
| **Accessibility** | `docs/company/brand/accessibility-patterns.md` | ARIA patterns |
| **Do's and Don'ts** | `docs/company/brand/dos-and-donts.md` | Best practices |

---

## Quick Reference

| Component | Primary Class | Variants |
|-----------|---------------|----------|
| Button Primary | `btn-primary` | `btn-sm`, `btn-lg` |
| Button Secondary | `btn-secondary` | `btn-outline` |
| Card | `card` | `card-elevated`, `card-bordered` |
| Badge | `badge` | `badge-success`, `badge-warning`, `badge-danger` |
| Input | `input` | `input-error`, `input-disabled` |
| Table | `data-table` | `table-striped`, `table-hover` |

---

## Buttons

### Primary Button

Used for primary actions (Save, Submit, Create).

```html
<button class="inline-flex items-center justify-center gap-2 px-4 py-2
               bg-primary text-white font-medium text-sm rounded
               hover:bg-primary-hover transition-colors
               focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2">
  <span class="material-symbols-outlined text-lg">add</span>
  New Lead
</button>
```

**Tailwind Classes:**
```
bg-[#137fec] hover:bg-[#0e6ac7] text-white font-medium text-sm px-4 py-2 rounded
```

### Secondary Button

Used for secondary actions (Cancel, Back).

```html
<button class="inline-flex items-center justify-center gap-2 px-4 py-2
               bg-slate-100 text-slate-700 font-medium text-sm rounded
               hover:bg-slate-200 transition-colors
               dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
  Cancel
</button>
```

### Outline Button

Used for tertiary actions or in toolbars.

```html
<button class="inline-flex items-center justify-center gap-2 px-4 py-2
               border border-slate-300 text-slate-700 font-medium text-sm rounded
               hover:bg-slate-50 transition-colors
               dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
  <span class="material-symbols-outlined text-lg">filter_list</span>
  Filter
</button>
```

### Icon Button

Used for compact actions (edit, delete, menu).

```html
<button class="inline-flex items-center justify-center w-8 h-8
               text-slate-500 rounded hover:bg-slate-100 transition-colors
               dark:text-slate-400 dark:hover:bg-slate-800">
  <span class="material-symbols-outlined">more_vert</span>
</button>
```

### Button Sizes

| Size | Padding | Font Size | Icon Size |
|------|---------|-----------|-----------|
| sm   | `px-3 py-1.5` | `text-xs` | 16px |
| md   | `px-4 py-2` | `text-sm` | 20px |
| lg   | `px-6 py-3` | `text-base` | 24px |

---

## Cards

### Standard Card

```html
<div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200
            dark:border-slate-800 p-6">
  <h3 class="text-lg font-semibold text-slate-900 dark:text-white mb-4">
    Card Title
  </h3>
  <p class="text-slate-600 dark:text-slate-400">
    Card content goes here.
  </p>
</div>
```

### Elevated Card

```html
<div class="bg-white dark:bg-slate-900 rounded-lg shadow-md p-6">
  <!-- Content -->
</div>
```

### Metric Card

Used for KPI displays on dashboards.

```html
<div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200
            dark:border-slate-800 p-6">
  <div class="flex items-center gap-3 mb-2">
    <div class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
      <span class="material-symbols-outlined text-primary">attach_money</span>
    </div>
    <span class="text-sm text-slate-500 dark:text-slate-400">Total Revenue</span>
  </div>
  <div class="text-3xl font-bold text-slate-900 dark:text-white">$234,567</div>
  <div class="flex items-center gap-1 mt-2 text-sm text-green-600">
    <span class="material-symbols-outlined text-sm">trending_up</span>
    +12.5% from last month
  </div>
</div>
```

---

## Badges

### Status Badges

```html
<!-- Success -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
  Active
</span>

<!-- Warning -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
  Pending
</span>

<!-- Danger -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
  Overdue
</span>

<!-- Info -->
<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
             bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
  New
</span>
```

### Priority Badges

```html
<!-- High Priority -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
             bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400">
  <span class="w-1.5 h-1.5 rounded-full bg-red-500"></span>
  High
</span>

<!-- Medium Priority -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
             bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
  Medium
</span>

<!-- Low Priority -->
<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
             bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
  <span class="w-1.5 h-1.5 rounded-full bg-green-500"></span>
  Low
</span>
```

### Pipeline Stage Badges

```html
<!-- Qualification -->
<span class="px-2.5 py-1 rounded text-xs font-medium bg-primary/10 text-primary">
  Qualification
</span>

<!-- Proposal -->
<span class="px-2.5 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
  Proposal
</span>

<!-- Negotiation -->
<span class="px-2.5 py-1 rounded text-xs font-medium bg-amber-100 text-amber-700">
  Negotiation
</span>

<!-- Closed Won -->
<span class="px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
  Closed Won
</span>

<!-- Closed Lost -->
<span class="px-2.5 py-1 rounded text-xs font-medium bg-red-100 text-red-700">
  Closed Lost
</span>
```

---

## Forms

### Text Input

```html
<div class="space-y-1.5">
  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">
    Email Address
  </label>
  <input type="email"
         class="w-full px-3 py-2 border border-slate-300 rounded-lg
                text-slate-900 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                dark:bg-slate-900 dark:border-slate-700 dark:text-white"
         placeholder="you@example.com">
</div>
```

### Input with Error

```html
<div class="space-y-1.5">
  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">
    Email Address
  </label>
  <input type="email"
         class="w-full px-3 py-2 border border-red-500 rounded-lg
                text-slate-900 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent
                dark:bg-slate-900 dark:text-white"
         value="invalid-email">
  <p class="text-sm text-red-600 dark:text-red-400">
    Please enter a valid email address
  </p>
</div>
```

### Select Input

```html
<div class="space-y-1.5">
  <label class="text-sm font-medium text-slate-700 dark:text-slate-300">
    Status
  </label>
  <select class="w-full px-3 py-2 border border-slate-300 rounded-lg
                 text-slate-900 bg-white
                 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                 dark:bg-slate-900 dark:border-slate-700 dark:text-white">
    <option>Active</option>
    <option>Inactive</option>
    <option>Pending</option>
  </select>
</div>
```

### Search Input

```html
<div class="relative">
  <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
    <span class="material-symbols-outlined text-xl">search</span>
  </span>
  <input type="text"
         class="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg
                text-slate-900 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
                dark:bg-slate-900 dark:border-slate-700 dark:text-white"
         placeholder="Search contacts...">
</div>
```

---

## Tables

### Data Table

```html
<div class="bg-white dark:bg-slate-900 rounded-lg border border-slate-200
            dark:border-slate-800 overflow-hidden">
  <table class="w-full">
    <thead>
      <tr class="bg-slate-50 dark:bg-slate-800/50">
        <th class="px-4 py-3 text-left text-xs font-medium text-slate-500
                   dark:text-slate-400 uppercase tracking-wider">
          Name
        </th>
        <th class="px-4 py-3 text-left text-xs font-medium text-slate-500
                   dark:text-slate-400 uppercase tracking-wider">
          Status
        </th>
        <th class="px-4 py-3 text-right text-xs font-medium text-slate-500
                   dark:text-slate-400 uppercase tracking-wider">
          Value
        </th>
      </tr>
    </thead>
    <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30">
        <td class="px-4 py-3 text-sm text-slate-900 dark:text-white">
          John Doe
        </td>
        <td class="px-4 py-3">
          <span class="badge-success">Active</span>
        </td>
        <td class="px-4 py-3 text-sm text-slate-900 dark:text-white text-right">
          $12,345
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

### Table with Actions

```html
<tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30">
  <td class="px-4 py-3">
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700
                  flex items-center justify-center text-sm font-medium">
        JD
      </div>
      <div>
        <div class="text-sm font-medium text-slate-900 dark:text-white">John Doe</div>
        <div class="text-xs text-slate-500">john@example.com</div>
      </div>
    </div>
  </td>
  <td class="px-4 py-3 text-right">
    <div class="flex items-center justify-end gap-1">
      <button class="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100
                     rounded dark:hover:bg-slate-800">
        <span class="material-symbols-outlined text-lg">edit</span>
      </button>
      <button class="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50
                     rounded dark:hover:bg-red-900/20">
        <span class="material-symbols-outlined text-lg">delete</span>
      </button>
    </div>
  </td>
</tr>
```

---

## Navigation

### Sidebar Navigation

```html
<nav class="w-64 h-screen bg-white dark:bg-slate-900 border-r border-slate-200
            dark:border-slate-800 flex flex-col">
  <!-- Logo -->
  <div class="h-16 flex items-center px-6 border-b border-slate-200 dark:border-slate-800">
    <span class="text-xl font-bold text-primary">IntelliFlow</span>
  </div>

  <!-- Nav Items -->
  <div class="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
    <!-- Active Item -->
    <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg
                       bg-primary/10 text-primary font-medium">
      <span class="material-symbols-outlined">dashboard</span>
      Dashboard
    </a>

    <!-- Inactive Item -->
    <a href="#" class="flex items-center gap-3 px-3 py-2 rounded-lg
                       text-slate-600 hover:bg-slate-100
                       dark:text-slate-400 dark:hover:bg-slate-800">
      <span class="material-symbols-outlined">contacts</span>
      Contacts
    </a>
  </div>
</nav>
```

### Tab Navigation

```html
<div class="border-b border-slate-200 dark:border-slate-800">
  <nav class="flex gap-6">
    <!-- Active Tab -->
    <button class="px-1 py-3 text-sm font-medium text-primary
                   border-b-2 border-primary -mb-px">
      Overview
    </button>

    <!-- Inactive Tab -->
    <button class="px-1 py-3 text-sm font-medium text-slate-500
                   hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
      Activity
    </button>
  </nav>
</div>
```

---

## Modals

### Standard Modal

```html
<div class="fixed inset-0 z-50 flex items-center justify-center p-4">
  <!-- Backdrop -->
  <div class="absolute inset-0 bg-black/50"></div>

  <!-- Modal -->
  <div class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl
              w-full max-w-lg max-h-[90vh] overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4
                border-b border-slate-200 dark:border-slate-800">
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">
        Modal Title
      </h2>
      <button class="p-1 text-slate-400 hover:text-slate-600 rounded
                     dark:hover:text-slate-200">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <!-- Body -->
    <div class="px-6 py-4 overflow-y-auto">
      <p class="text-slate-600 dark:text-slate-400">Modal content here.</p>
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-end gap-3 px-6 py-4
                border-t border-slate-200 dark:border-slate-800">
      <button class="btn-secondary">Cancel</button>
      <button class="btn-primary">Save Changes</button>
    </div>
  </div>
</div>
```

---

## Avatars

### Avatar Sizes

```html
<!-- Small (24px) -->
<div class="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700
            flex items-center justify-center text-xs font-medium text-slate-600">
  JD
</div>

<!-- Medium (32px) -->
<div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700
            flex items-center justify-center text-sm font-medium text-slate-600">
  JD
</div>

<!-- Large (40px) -->
<div class="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700
            flex items-center justify-center text-base font-medium text-slate-600">
  JD
</div>

<!-- XL (48px) -->
<div class="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-700
            flex items-center justify-center text-lg font-medium text-slate-600">
  JD
</div>
```

### Avatar with Image

```html
<img src="/avatars/user.jpg"
     alt="John Doe"
     class="w-10 h-10 rounded-full object-cover">
```

### Avatar Group

```html
<div class="flex -space-x-2">
  <img src="/avatar1.jpg" class="w-8 h-8 rounded-full border-2 border-white
                                  dark:border-slate-900">
  <img src="/avatar2.jpg" class="w-8 h-8 rounded-full border-2 border-white
                                  dark:border-slate-900">
  <img src="/avatar3.jpg" class="w-8 h-8 rounded-full border-2 border-white
                                  dark:border-slate-900">
  <div class="w-8 h-8 rounded-full border-2 border-white dark:border-slate-900
              bg-slate-200 dark:bg-slate-700 flex items-center justify-center
              text-xs font-medium text-slate-600">
    +5
  </div>
</div>
```

---

## Charts

### Pipeline Kanban Column

```html
<div class="flex-1 min-w-[280px] max-w-[320px]">
  <!-- Column Header -->
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <div class="w-3 h-3 rounded-full bg-primary"></div>
      <span class="font-medium text-slate-900 dark:text-white">Qualification</span>
    </div>
    <span class="text-sm text-slate-500">$45,000</span>
  </div>

  <!-- Cards -->
  <div class="space-y-2">
    <div class="bg-white dark:bg-slate-900 p-4 rounded-lg border
                border-slate-200 dark:border-slate-800 cursor-pointer
                hover:border-primary transition-colors">
      <h4 class="font-medium text-slate-900 dark:text-white mb-1">Acme Corp</h4>
      <p class="text-sm text-slate-500 mb-2">Enterprise license</p>
      <div class="flex items-center justify-between">
        <span class="text-lg font-semibold text-slate-900 dark:text-white">$15,000</span>
        <img src="/avatar.jpg" class="w-6 h-6 rounded-full">
      </div>
    </div>
  </div>
</div>
```

---

## Empty States

```html
<div class="flex flex-col items-center justify-center py-12 px-4 text-center">
  <div class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800
              flex items-center justify-center mb-4">
    <span class="material-symbols-outlined text-3xl text-slate-400">inbox</span>
  </div>
  <h3 class="text-lg font-medium text-slate-900 dark:text-white mb-1">
    No contacts yet
  </h3>
  <p class="text-slate-500 dark:text-slate-400 mb-4 max-w-sm">
    Get started by adding your first contact to the CRM.
  </p>
  <button class="btn-primary">
    <span class="material-symbols-outlined text-lg">add</span>
    Add Contact
  </button>
</div>
```

---

## Loading States

### Spinner

```html
<div class="animate-spin w-5 h-5 border-2 border-slate-200 border-t-primary rounded-full">
</div>
```

### Skeleton

```html
<div class="animate-pulse space-y-4">
  <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-3/4"></div>
  <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/2"></div>
  <div class="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
</div>
```

---

## Dark Mode Implementation

Add the following to your root HTML:

```html
<html class="dark">
  <body class="bg-background-light dark:bg-background-dark
               text-slate-900 dark:text-white">
```

### Theme Toggle

```javascript
// Toggle dark mode
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark');
  localStorage.theme = document.documentElement.classList.contains('dark')
    ? 'dark'
    : 'light';
}

// On page load
if (localStorage.theme === 'dark' ||
    (!localStorage.theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.classList.add('dark');
}
```

---

## Responsive Patterns

### Mobile-First Grid

```html
<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
  <!-- Cards -->
</div>
```

### Responsive Sidebar

```html
<!-- Mobile: Hidden, toggled via JS -->
<!-- Desktop: Always visible -->
<aside class="fixed inset-y-0 left-0 z-40 w-64 transform
              -translate-x-full lg:translate-x-0 lg:static
              transition-transform duration-200 ease-in-out">
  <!-- Sidebar content -->
</aside>
```

---

## Component → Flow Mapping

This section maps each component to the user flows where it is used. Use this to ensure
consistent implementation across the application.

### Core Components

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **btn-primary** | FLOW-001, FLOW-005, FLOW-008, FLOW-011, FLOW-017, FLOW-019 | `/login`, `/leads/new`, `/deals`, `/tickets/new` |
| **btn-secondary** | FLOW-003, FLOW-013 | `/forgot-password`, `/admin/compliance` |
| **btn-outline** | FLOW-007, FLOW-011, FLOW-020 | `/deals` (filter), `/tickets` (filter) |
| **icon-button** | FLOW-007, FLOW-011, FLOW-020 | Table actions, toolbar actions |

### Container Components

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **card** | All flows | All pages (container pattern) |
| **card-elevated** | FLOW-005, FLOW-007, FLOW-023 | `/leads`, `/deals`, `/reports/builder` |
| **metric-card** | FLOW-010, FLOW-023, FLOW-030, FLOW-038 | `/dashboard`, `/analytics`, `/ops/monitoring` |
| **modal** | FLOW-005, FLOW-007, FLOW-013, FLOW-017, FLOW-019 | Quick create, confirmations |

### Data Display

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **badge** (status) | FLOW-005, FLOW-006, FLOW-011, FLOW-012, FLOW-020 | `/leads/[id]`, `/tickets/[id]`, `/admin/roles` |
| **badge** (priority) | FLOW-011, FLOW-012 | `/tickets` |
| **badge** (pipeline) | FLOW-007, FLOW-008 | `/deals` |
| **data-table** | FLOW-005, FLOW-011, FLOW-023 | `/contacts`, `/tickets`, `/admin/audit` |
| **avatar** | FLOW-016, FLOW-017, FLOW-020 | `/contacts/[id]`, activity timeline |

### Form Components

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **input** | FLOW-001, FLOW-003, FLOW-005, FLOW-011 | All forms |
| **input-error** | All flows with validation | Form validation states |
| **select** | FLOW-005, FLOW-007, FLOW-011 | `/leads/new`, `/deals/new`, `/tickets/new` |
| **search-input** | FLOW-014, FLOW-016 | `/contacts`, `/support/kb` |

### Navigation Components

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **sidebar-nav** | FLOW-001 (after login) | All authenticated pages |
| **tab-nav** | FLOW-016, FLOW-020 | `/contacts/[id]`, `/accounts/[id]` |
| **breadcrumb** | All flows | All detail pages |

### Specialized Components

| Component | Used In Flows | Primary Routes |
|-----------|---------------|----------------|
| **pipeline-kanban** | FLOW-007, FLOW-008 | `/deals` |
| **timeline** | FLOW-020 | `/contacts/[id]` (Activity tab) |
| **chart-widgets** | FLOW-023, FLOW-038 | `/analytics`, `/ops/monitoring` |
| **empty-state** | All flows | Empty list states |
| **loading-spinner** | All flows | Loading states |
| **skeleton** | All flows | Initial load states |

---

## Flow-Specific Patterns

### Authentication Flows (FLOW-001 to FLOW-004)

**Routes**: `/login`, `/signup`, `/forgot-password`, `/reset-password`

**Required Components**:
- Card container for form
- Primary button for submit
- Input fields with validation
- Error states for invalid credentials
- Loading spinner during authentication

**Accessibility**: See `accessibility-patterns.md` → Forms section

---

### Lead Management Flows (FLOW-005 to FLOW-007)

**Routes**: `/leads`, `/leads/new`, `/leads/[id]`

**Required Components**:
- Data table with sorting/filtering
- Badges for lead score and status
- Quick create modal
- AI score display (metric card)
- Conversion action buttons

**Style Requirements**:
- Score badge colors: Red (<30), Amber (30-70), Green (>70)
- Qualification status: Use pipeline stage badges

---

### Deal Pipeline Flow (FLOW-008)

**Routes**: `/deals`

**Required Components**:
- Pipeline Kanban column layout
- Draggable deal cards
- Stage badges (Qualification, Proposal, Negotiation, Won, Lost)
- Revenue metrics

**Style Requirements**:
- Column colors match pipeline stage colors from `visual-identity.md`
- Card hover state: `border-primary`
- Drag handle: subtle indicator

---

### Ticket Management Flows (FLOW-011, FLOW-012)

**Routes**: `/tickets`, `/tickets/[id]`

**Required Components**:
- Priority badges (High=red, Medium=amber, Low=green)
- SLA countdown timer
- Status workflow badges
- Escalation indicators

**Style Requirements**:
- SLA breach: `badge-danger` with countdown
- Overdue state: red background highlight

---

### Activity Timeline Flow (FLOW-020)

**Routes**: `/contacts/[id]` (Activity tab)

**Required Components**:
- Timeline with chronological ordering
- Activity type icons
- User avatars
- Rich content previews (email, call, meeting)
- Infinite scroll / virtualization

**Style Requirements**:
- Timeline line: `border-slate-200 dark:border-slate-700`
- Activity cards: subtle hover effect
- Type icons: Material Symbols Outlined

---

### Analytics & Insights Flows (FLOW-023 to FLOW-028)

**Routes**: `/analytics`, `/reports/builder`, `/ai/insights`

**Required Components**:
- Report builder canvas (FLOW-023)
- Metric cards for KPIs
- Trend charts
- Data visualization widgets
- Export options

**Style Requirements**:
- Dashboard widgets: subtle background tint
- Chart colors: use palette from visual-identity.md
- Action buttons: primary style

---

## File References

- **Token Files**: `docs/company/brand/*.tokens.json`
- **Visual Identity**: `docs/company/brand/visual-identity.md`
- **Mockups**: `docs/design/mockups/*.html`
- **Page Registry**: `docs/design/page-registry.md`
- **Sitemap**: `docs/design/sitemap.md`
- **Flow Index**: `apps/project-tracker/docs/metrics/_global/flows/flow-index.md`
- **Accessibility**: `docs/company/brand/accessibility-patterns.md`
- **Do's and Don'ts**: `docs/company/brand/dos-and-donts.md`
