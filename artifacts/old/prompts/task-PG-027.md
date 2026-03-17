# Task Execution Prompt

Implement the selected task(s) with TDD, brand/page/sitemap, and flow context.
### Key Objectives
- Code: Deliver high-quality, tested code for the web app
- Integration: Seamlessly integrate new features into existing architecture
- Security: Ensure robust security and compliance
- Performance: Optimize for speed and responsiveness
- Availability: Ensure high availability and reliability
- Maintainability: Write clean, maintainable code
- Documentation: Provide clear documentation and specs

## Dynamic Project Context

**Current Sprint:** 14
**Sprint Progress:** 8/30 (27%)

### Recommended Actions

1. Ready to start: PG-026, PG-027, PG-029

### Impact of Completing This Task

Completing **PG-027** will unblock: PG-028

### Blocked Tasks (for context)

- **IFC-061** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-101
- **IFC-062** ← blocked by: IFC-061, FILE:docs/api/contracts/api-contracts.yaml;IFC-104
- **IFC-063** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-104
- **IFC-064** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-063
- **IFC-065** ← blocked by: FILE:docs/api/contracts/api-contracts.yaml;IFC-092
- ... and 6 more

### Ready to Start (after current task)

- **PG-026**: Checkout
- **PG-029**: Payment Methods
- **PG-030**: Subscriptions
- **PG-031**: Receipts

---

## PG-027 – Invoices

**Sprint:** 14
**Section:** Billing Pages
**Owner:** Platform BE (STOA-Foundation)
**Status:** Backlog

You must adhere to the following guidelines while implementing this task: .specify/memory/constitution.md

### Dependencies
- PG-025

**Dependency Status:**
- PG-025 (DONE)

### Pre-requisites
- [✓] FILE: `artifacts/sprint0/codex-run/Framework.md`
- [✓] FILE: `audit-matrix.yml`
- ENV: Invoice list
- ENV: PDF generation
- [✗] FILE: `apps/web/app/(billing)/billing/page.tsx`

### Definition of Done
1. Response <200ms, Lighthouse ≥90, invoices displayed
2. artifacts: page.tsx, invoice-list.tsx, pdf-generator.ts

### Artifacts to Track
- ARTIFACT:apps/web/app/(billing)/billing/invoices/page.tsx
- ARTIFACT:apps/web/components/billing/invoice-list.tsx
- ARTIFACT:apps/web/lib/billing/pdf-generator.ts
- EVIDENCE:artifacts/attestations/PG-027/context_ack.json

### Validation
AUDIT:manual-review;GATE:lighthouse-gte-90

### Brand / UX / Flows References
- Brand: docs/company/brand/style-guide.md
- Page Registry: docs/design/page-registry.md
- Sitemap: docs/design/sitemap.md
- Check the relevant Flows: apps/project-tracker/docs/metrics/_global/flows/

### Context Controls
- Build context pack and context ack before coding.
- Evidence folder: artifacts/attestations/<task_id>/
- Use spec/plan if present under .specify/.

---

## Brand Design System Context

### Color Palette

```
Primary:       #137fec  (Main brand color)
Primary Hover: #0e6ac7  (Darker state for interactions)
Primary Muted: #137fec1a (10% opacity for backgrounds)
```

The primary blue (`#137fec`) is used for:
- Primary buttons and CTAs
- Links and interactive elements
- Active/selected states
- Brand accents


| Mode  | Background | Surface | Elevated |
|-------|------------|---------|----------|
| Light | `#f6f7f8`  | `#ffffff` | `#ffffff` |
| Dark  | `#101922`  | `#1e2936` | `#1e2936` |


| Status  | Color     | Background | Text      |
|---------|-----------|------------|-----------|
| Success | `#22c55e` | `#dcfce7`  | `#166534` |
| Warning | `#f59e0b` | `#fef3c7`  | `#92400e` |
| Danger  | `#ef4444` | `#fee2e2`  | `#991b1b` |
| Info    | `#137fec` | `#dbeafe`  | `#1e40af` |


| Stage         | Color     | Usage |
|---------------|-----------|-------|
| Qualification | `#137fec` | Initial lead stage |
| Proposal      | `#6366f1` | Proposal sent |
| Negotiation   | `#f59e0b` | In negotiation |
| Closed Won    | `#22c55e` | Successfully closed |
| Closed Lost   | `#ef4444` | Lost opportunity |


| Priority | Badge Color | Background |
|----------|-------------|------------|
| High     | `#ef4444`   | `#fef2f2`  |
| Medium   | `#f59e0b`   | `#fffbeb`  |
| Low      | `#22c55e`   | `#f0fdf4`  |

### Typography

### Font Family

```css
font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont,
             'Segoe UI', Roboto, sans-serif;
```

Inter is our primary typeface. It provides excellent readability at all sizes
and supports all required font weights.

### Font Weights

| Weight | Name      | Usage |
|--------|-----------|-------|
| 300    | Light     | Large hero text (sparingly) |
| 400    | Regular   | Body text, paragraphs |
| 500    | Medium    | Labels, buttons, emphasized text |
| 600    | Semibold  | Subheadings, card titles |
| 700    | Bold      | Page headings, emphasis |
| 800    | Extrabold | Hero sections (sparingly) |

### Type Scale

| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| H1    | 48px | Bold   | 1.25        | Page titles |
| H2    | 36px | Bold   | 1.25        | Section headings |
| H3    | 30px | Semibold | 1.25      | Subsection headings |
| H4    | 24px | Semibold | 1.375     | Card headings |
| H5    | 20px | Medium | 1.375       | Widget titles |
| H6    | 18px | Medium | 1.5         | Small headings |
| Body  | 16px | Regular | 1.5        | Primary content |
| Small | 14px | Regular | 1.5        | Secondary content |
| Caption | 12px | Regular | 1.5      | Labels, captions |

### Spacing & Layout

We use a base-4 spacing system aligned with Tailwind CSS:

| Token | Value | Usage |
|-------|-------|-------|
| 1     | 4px   | Tight internal spacing |
| 2     | 8px   | Default internal spacing |
| 3     | 12px  | Medium internal spacing |
| 4     | 16px  | Default component padding |
| 6     | 24px  | Section padding |
| 8     | 32px  | Large section spacing |
| 12    | 48px  | Page section margins |

---

## Component Patterns

**Button Pattern:**
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


Used for secondary actions (Cancel, Back).

```html
<button class="inline-flex items-center justify-center gap-2 px-4 py-2
               bg-slate-100 text-slate-700 font-medium text-sm rounded
               hover:bg-slate-200 transition-colors
               dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700">
  Cancel
</button>
```


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


Used for compact actions (edit, delete, menu).

```html
<button class="inline-flex items-center justify-center w-8 h-8
               text-slate-500 rounded hover:bg-slate-100 transition-colors
               dark:text-slate-400 dark:hover:bg-slate-800">
  <span class="material-symbols-outlined">more_vert</span>
</button>
```


| Size | Padding | Font Size | Icon Size |
|------|---------|-----------|-----------|
| sm   | `px-3 py-1.5` | `text-xs` | 16px |
| md   | `px-4 py-2` | `text-sm` | 20px |
| lg   | `px-6 py-3` | `text-base` | 24px |

---

**Card Pattern:**
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


```html
<div class="bg-white dark:bg-slate-900 rounded-lg shadow-md p-6">
  <!-- Content -->
</div>
```


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

**Form Pattern:**
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

**Input Pattern:**
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

**Badge Pattern:**
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

**Avatar Pattern:**
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


```html
<img src="/avatars/user.jpg"
     alt="John Doe"
     class="w-10 h-10 rounded-full object-cover">
```


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

**Table Pattern:**
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

**Modal Pattern:**
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

---

## Accessibility Requirements (WCAG 2.1 AA)

# IntelliFlow Accessibility Patterns

WCAG 2.1 AA compliant patterns for all interactive components.

---

## Quick Reference

| Component | Key ARIA | Keyboard | Focus |
|-----------|----------|----------|-------|
| Button | `aria-label`, `aria-disabled` | Enter, Space | Visible ring |
| Link | `aria-current` | Enter | Visible ring |
| Modal | `role="dialog"`, `aria-modal` | Escape to close | Trap focus |
| Dropdown | `aria-expanded`, `aria-haspopup` | Arrow keys | Roving tabindex |
| Tab | `role="tablist"`, `aria-selected` | Arrow keys | Roving tabindex |
| Form | `aria-describedby`, `aria-invalid` | Tab navigation | Input focus |
| Alert | `role="alert"`, `aria-live` | N/A | N/A |
| Table | `scope`, `aria-sort` | Arrow keys (optional) | Cell focus |

---

## Buttons

### Standard Button

```html
<button
  type="button"
  class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white
         rounded font-medium hover:bg-primary-hover
         focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2
         disabled:opacity-50 disabled:cursor-not-allowed"
>
  Save Changes
</button>
```

### Icon-Only Button

```html
<button
  type="button"
  aria-label="Delete contact"
  class="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded
         focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
>
  <span class="material-symbols-outlined" aria-hidden="true">delete</span>
</button>
```

### Loading Button

```html
<button
  type="button"
  disabled
  aria-busy="true"
  class="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white
         rounded font-medium opacity-75 cursor-wait"
>
  <svg class="animate-spin h-4 w-4" aria-hidden="true" viewBox="0 0 24 24">
    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"/>
    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
  </svg>
  <span>Saving...</span>
</button>
```

### Toggle Button

```html
<button
  type="button"
  role="switch"
  aria-checked="false"
  aria-label="Enable notifications"
  class="relative w-11 h-6 bg-slate-200 rounded-full
         focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
  onclick="this.setAttribute('aria-checked', this.getAttribute('aria-checked') === 'true' ? 'false' : 'true')"
>
  <span class="sr-only">Enable notifications</span>
  <span
    aria-hidden="true"
    class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow
           transform transition-transform
           [[aria-checked=true]_&]:translate-x-5"
  ></span>
</button>
```

---

## Navigation

### Main Navigation

```html
<nav aria-label="Main navigation">
  <ul class="flex gap-1" role="list">
    <li>
      <a
        href="/dashboard"
        aria-current="page"
        class="flex items-center gap-3 px-3 py-2 rounded-lg
               bg-primary/10 text-primary font-medium"
      >
        <span class="material-symbols-o

---

## Do's and Don'ts

# IntelliFlow Design System: Do's and Don'ts

A quick reference guide for maintaining consistency across the application.

---

## Colors

### DO

```html
<!-- Use semantic color tokens -->
<button class="bg-primary hover:bg-primary-hover">Save</button>
<span class="text-green-600">Success message</span>
<div class="bg-red-50 text-red-800">Error alert</div>
```

- Use the primary blue (`#137fec`) for main CTAs
- Use status colors consistently (green=success, amber=warning, red=error)
- Apply dark mode variants using `dark:` prefix
- Use muted backgrounds for badges (`bg-green-100` not solid `bg-green-500`)

### DON'T

```html
<!-- Hard-coded colors -->
<button class="bg-blue-600">Save</button>  <!-- Wrong blue! -->
<button class="bg-[#2563eb]">Save</button> <!-- Old incorrect value -->

<!-- Random color choices -->
<span class="text-purple-600">Success</span> <!-- Purple for success? -->
<div class="bg-pink-500">Warning</div>       <!-- Pink for warning? -->
```

- Don't use `blue-600` - use `primary` or `#137fec`
- Don't mix color conventions (stick to our palette)
- Don't use low-contrast color combinations
- Don't use colors inconsistently across similar elements

---

## Typography

### DO

```html
<!-- Consistent heading hierarchy -->
<h1 class="text-3xl font-bold">Page Title</h1>
<h2 class="text-2xl font-semibold">Section</h2>
<h3 class="text-xl font-medium">Subsection</h3>
<p class="text-base text-slate-600">Body text</p>
<span class="text-sm text-slate-500">Caption</span>
```

- Use Inter font family throughout
- Follow the type scale (xs, sm, base, lg, xl, 2xl, 3xl)
- Use appropriate font weights (400 body, 500 labels, 600 headings, 700 titles)
- Maintain consistent line heights

### DON'T

```html
<!-- Inconsistent sizing -->
<h1 class="text-4xl">Title</h1>
<h2 class="text-3xl">Also Title?</h2>  <!-- Too close in size -->

<!-- Wrong font -->
<p style="font-family: Arial">Text</p>  <!-- Not Inter! -->

<!-- Random weights -->
<span class="font-black">Label</span>   <!-- Too heavy for label -->
<h1 class="font-normal">Title</h1>      <!-- Too light for title -->
```

- Don't skip heading levels (h1 → h3)
- Don't use custom fonts
- Don't use extreme font weights (100, 900) for regular UI
- Don't use all caps except for small labels

---

## Spacing

### DO

```html
<!-- Consistent spacing scale -->
<div class="p-4">Card padding (16px)</div>
<div class="p-6">Section padding (24px)</div>
<div class="space-y-4">Stacked items with 16px gap</div>
<div 

---

## Delivery Checklist
- Follow TDD: write/extend tests before implementation.
- Respect Definition of Done and produce required artifacts.
- Run lint/typecheck/test/build/security scans.
- Attach evidence (context_pack, context_ack, summaries).

### Implementation Checklist
- [ ] Verify all colors match brand palette
- [ ] Verify typography follows design system
- [ ] Test keyboard navigation
- [ ] Test screen reader compatibility
- [ ] Verify dark mode styling
- [ ] Verify responsive design (mobile, tablet, desktop)
- [ ] Verify Lighthouse score ≥90
- [ ] Create attestation evidence