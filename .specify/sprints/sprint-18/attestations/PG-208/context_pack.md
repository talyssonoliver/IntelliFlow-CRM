# Context Pack: PG-208

**Run ID:** 20261020231931-3d9aa8b9
**Generated:** 2026-10-20T23:21:07.234Z

## Task Details

- **Section:** Settings
- **Description:** Module Settings - Task Automation (/tasks/(list)/automation)
- **Status:** In Progress
- **Target Sprint:** 18

## File Excerpts

### 📄 apps/web/src/components/sidebar/configs/tasks.ts

**SHA256:** `7b5eae2b337198c73fc922ff4bc3011baf3acf25b1f3aaae8a485eeea8c0718d`

```
import type { SidebarConfig, SidebarItem } from '../sidebar-types';

/** Settings items shown when on a task settings page */
export const TASK_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'task-settings', label: 'Task Settings', icon: 'tune', href: '/tasks/task-settings' },
  { id: 'task-types', label: 'Task Types', icon: 'category', href: '/tasks/task-types' },
  { id: 'automation', label: 'Task Automation', icon: 'auto_awesome', href: '/tasks/automation' },
];

const SETTINGS_PATHS = TASK_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is a task settings page */
export function isTaskSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const VIEW_SECTIONS: SidebarConfig['sections'] = [
  {
    id: 'views',
    title: 'Task Views',
    items: [
      { id: 'all', label: 'All Tasks', icon: 'checklist', href: '/tasks' },
      { id: 'my', label: 'My Tasks', icon: 'person', href: '/tasks?view=my' },
      {
        id: 'overdue',
        label: 'Overdue',
        icon: 'warning',
        color: 'text-destructive',
        href: '/tasks?view=overdue',
      },
      { id: 'today', label: 'Due Today', icon: 'today', href: '/tasks?view=today' },
      { id: 'upcoming', label: 'Upcoming', icon: 'event_upcoming', href: '/tasks?view=upcoming' },
      {
        id: 'task-calendar',
        label: 'Task Calendar',
        icon: 'calendar_month',
        href: '/calendar?show=tasks',
      },
    ],
  },
  {
    id: 'priority',
    title: 'By Priority',
    items: [
      {
        id: 'urgent',
        label: 'Urgent',
        icon: 'priority_high',
        color: 'text-destructive',
        href: '/tasks?priority=URGENT',
      },
      {
        id: 'high',
        label: 'High Priority',
        icon: 'flag',
        color: 'text-warning',
        href: '/tasks?priority=HIGH',
      },
    ],
  },
];

/** List mode — filters inline + Module Settings button */
export function createTasksSidebarConfig(onSettingsClick: () => void): SidebarConfig {
  return {
    moduleId: 'tasks',
    moduleTitle: 'Tasks',
    moduleIcon: 'task_alt',
    onSettingsClick,
    showSettings: true,
    sections: VIEW_SECTIONS,
  };
}

/** Settings mode — settings items inline at top, Task Views & Priority sections below */
export function createTasksSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent']
): SidebarConfig {
  return {
    moduleId: 'tasks',
    moduleTitle: 'Tasks',
    moduleIcon: 'task_alt',
    showSettings: false,
    beforeContent,
    sections: VIEW_SECTIONS,
  };
}

```

### 📄 apps/web/src/app/tasks/(list)/task-settings/page.tsx

**SHA256:** `0be3cbd2258063c6e5342cf568d0e1b2c41e3a8e8e06a2d81dd6857cc4a0bfc0`

```
// Task Settings Page — PG-191
// Server component + Suspense wrapper around the client orchestrator.

import { Suspense } from 'react';
import TaskSettingsContent from './TaskSettingsContent';
import TaskSettingsLoading from './TaskSettingsLoading';

export const metadata = {
  title: 'Task Settings — Aurora',
  description:
    'Configure default due-date offset, reminder defaults, and task templates for the Tasks module.',
};

export default function TaskSettingsPage() {
  return (
    <Suspense fallback={<TaskSettingsLoading />}>
      <TaskSettingsContent />
    </Suspense>
  );
}

```

### 📄 docs/planning/module-settings-playbook.md (truncated: 120/252 lines)

**SHA256:** `d6ded4b5d5ce3e951a6d6491d626cf636bd209faa96101edc39cdb0bfb8b5fa3`

```
# Module Settings Playbook

**Status**: Canonical. Created 2026-04-14 after the PG-182 / PG-183 audit
rounds.

Any new `Module Settings - <Entity>` task (PG-184 Deals, PG-185 Tickets, PG-186
Documents, PG-187 Reports, PG-188 Billing, PG-189 Appointments, PG-190 Cases,
PG-191 Tasks, etc.) MUST follow this playbook from day one. Every item below is
a real audit finding that already cost a hardening round on PG-182 and PG-183.

Reference implementations:

- Frontend: `apps/web/src/app/contacts/(list)/contact-settings/**` and
  `apps/web/src/app/accounts/(list)/account-settings/**`.
- Backend: `apps/api/src/modules/contact/contact-settings.router.ts` +
  `contact-automation.ts` and the account equivalents.
- Validators: `packages/validators/src/contact-settings.ts` +
  `account-settings.ts`.
- Prisma models: `Contact*` and `Account*` suffix families in
  `packages/db/prisma/schema.prisma`.
- Migration structure:
  `packages/db/prisma/migrations/20260414120000_contact_settings_hardening` and
  `20260414140000_account_settings_hardening`.

## 1. Page layout (frontend)

- Use **`PageHeader`** (`apps/web/src/components/shared/page-header.tsx`) with
  breadcrumbs + title + description + `actions` array. DO NOT use
  `ModuleSettingsLayout` (tabs + sticky sidebar) — that pattern is deprecated
  for module settings.
- Wrap everything in a **12-column bento grid**:
  `grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5`.
- Each section is a `<Card>` with a `SectionHeader` (icon tile + title +
  description + optional `action` slot). Padding: `p-4 sm:p-5`, not `p-6`.
- Full-width wrapper (`w-full`). No `max-w-7xl`.
- **`SectionHeader` exposes `action?: ReactNode`** so CTAs like "New Tag" sit
  aligned with the title row, not below it. Match the `page-header.tsx`
  action-slot shape.
- Mobile: everything stacks to single column at `<lg`. Duplicate-rule row uses
  `grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto_auto]` so rows
  don't cram between md and lg.
- Loading skeleton (`{Entity}SettingsLoading.tsx`) must mirror the bento shape
  so there is no layout shift when data resolves.

## 2. Empty states

- Use
  **`<EmptyState entity="…" phase="passive" size="sm" className="py-4 px-3 gap-2" />`**
  with project SVGs from
  `packages/ui/src/components/empty-state-illustrations.tsx`.
- Suggested entity mappings (when no exact match exists):
  - Tags → `entity="pinned"`
  - Duplicate rules → `entity="rules"`
  - Required fields / policy → `entity="notes"` via `illustration` prop
- **No action button inside the empty state** if the parent Card already renders
  the CTA in the SectionHeader. Duplicate CTAs violate system design.

## 3. Buttons

- **"Add Rule" / "Add X"** inside a tab: `<Button size="sm">Add Rule</Button>`
[... 132 lines omitted ...]

## 12. Tests

- **Scoped tests must mock `prismaMock.$transaction`** with
  `mockResolvedValue([...])` or `mockImplementation(async (cb) => cb(tx))` —
  otherwise the destructive-write tests hit `undefined.map(...)` or similar.
- **Cross-tenant negative test** per mutation: pass a foreign tenant's id,
  assert Prisma P2025 is translated to a tRPC error.
- **Zod superRefine test**: a duplicate `(field, matchStrategy)` pair payload
  must reject at the validator layer.
- **Admin-only tag test**: non-ADMIN/OWNER caller with
  `restrictTagCreationToAdmins=true` receives `FORBIDDEN`.
- **Empty state tests** use `entity=` or `illustration=` and do NOT rely on an
  `action={...}` button (the page header owns the CTA).
- **resetToDefaults test** asserts all three resets (duplicate rules, required
  fields, automation) are invoked from handleReset in the content component.
- Existing entity router tests (e.g. `contact.router.test.ts`) need `beforeEach`
  stubs for `{entity}AutomationSetting.findUnique` → null and
  `{entity}RequiredField.findMany` → [] — otherwise `load{Entity}Automation`
  crashes on `undefined.map`.

## 13. PRD + attestation

- Extend `docs/planning/prd-module-settings.md` (do not create a new PRD) with a
  `PG-NNN Addendum` section listing the user stories and acceptance criteria
  specific to the entity. Include AC numbers in the `AC-C…` / `AC-D…` scheme to
  avoid collisions.
- Attestation hashes MUST include the new migrations for the entity's hardening
  layer (CHECK constraint + AI-default flip) — not just the initial `_settings`
  migration.
- CSV status flows
  `Backlog → Specifying → Spec Complete → Planning → Plan Complete → In Progress → In Review → Completed`.
  Do NOT flip to `Completed` until compliance-check, build, and Lighthouse have
  all run.

## 14. Spec-session / plan-session must cite this playbook

Any new module-settings spec MUST include in its **Related Documents** section:

- `docs/planning/prd-module-settings.md`
- **`docs/planning/module-settings-playbook.md`** (this file)
- PG-182 and PG-183 spec/plan paths as reference implementations.

The plan MUST enumerate, per Boolean toggle in the schema, which of the three
categories (§8) it falls into.

## 15. Order of operations recommendation

If you are planning multiple PG-18x settings pages:

- You can ship PG-184, PG-185, PG-186 in parallel — they don't depend on each
  other.
- You should NOT block PG-184+ on IFC-310/311/312 completing. Instead, have each
  new PG-18x either (a) wire category-1 toggles in the same PR or (b) register
  category-2 follow-ups against the relevant broader IFC-\* task, whose scope
  will grow to include the new entity.
- Whenever a new entity ships, broaden IFC-310 (rule evaluator), IFC-311
  (reassign), and IFC-312 (AI chains) to cover it — same pattern used to extend
  them from "contacts-only" to "contacts + accounts" on 2026-04-14.

```

### 📄 docs/planning/prd-module-settings.md (truncated: 120/1122 lines)

**SHA256:** `ce436b84c811e661855aa2d5aa8504336d4626b23ad9dd95fb36e6963249de35`

```
# PRD: Module Settings Pages

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Feature Name  | Module Settings Pages                                                  |
| Status        | Active                                                                 |
| Related Tasks | PG-178, PG-182, PG-183, PG-196, PG-197, PG-201, PG-202, PG-204, PG-208 |
| Created       | 2026-03-11                                                             |
| Last Updated  | 2026-10-17                                                             |
| Author        | Spec Session (PG-178)                                                  |

## Problem Statement

IntelliFlow CRM has 11 entity modules (Leads, Contacts, Accounts, Deals,
Tickets, Documents, Reports, Billing, Appointments, Cases, Tasks), each with
module-specific configuration needs. Currently, sidebar gear icons link to
`/settings/<module>` URLs that return 404 (IFC-232 identified 6 broken settings
links). Administrators need per-module configuration pages to customize pipeline
stages, scoring rules, custom fields, automation toggles, and other
module-specific behavior without developer intervention.

## User Stories

### US-1: Lead Stage Configuration

As a CRM Admin, I want to configure lead pipeline stages (add, remove, reorder,
set colors and default stage) so that the pipeline reflects my organization's
sales process.

### US-2: Lead Scoring Rules

As a CRM Admin, I want to define activity-based scoring rules (email open, email
click, meeting scheduled, etc.) with point values so that lead scores
automatically reflect engagement.

### US-3: Lead Custom Fields

As a CRM Admin, I want to add custom fields to the Lead entity (dropdown, text,
currency, date, etc.) so that we can capture business-specific data.

### US-4: Lead Automation Toggles

As a CRM Admin, I want to toggle automation features (auto-assignment, instant
notifications, duplicate detection) on/off so that I can control automated lead
processing.

### US-5: Reusable Settings Pattern

As a developer, I want a shared ModuleSettingsLayout component so that all 11
module settings pages follow the same tab-based pattern with Save/Reset actions.

## Acceptance Criteria

- AC-01: `/settings/leads` page renders with 4 tabs: Lead Stages, Scoring Rules,
  Custom Fields, Automation
- AC-02: Lead stages can be added, removed, reordered (drag-drop), and each
  stage has a color and display name
- AC-03: One stage is always marked as "Default Stage"
- AC-04: Scoring rules display activity types with configurable point values
- AC-05: Custom fields table supports CRUD with field name and data type columns
[... 1002 lines omitted ...]
### Additional User Stories

- **US-TA1 (Event rules)**: As a tenant admin, I want a rule that creates a task
  when a lead, contact, deal or account event happens, so that follow-up work
  starts without anyone remembering to do it.
- **US-TA2 (Scheduled rules)**: As a tenant admin, I want rules that run on a
  daily, weekly, monthly or custom schedule in my timezone, so that recurring
  work is created automatically.
- **US-TA3 (Webhook rules)**: As a tenant admin, I want an external system to
  create a task by sending a signed request to a per-rule URL, so that events
  from outside the CRM become work.
- **US-TA4 (Round-robin)**: As a tenant admin, I want a rule to hand tasks to a
  chosen group of teammates in turn, so that workload is shared evenly.
- **US-TA5 (Trust)**: As a sales rep, I want to be notified about automated
  tasks and to see which rule created a task and why a rule did or did not run,
  so that I trust automatically created work.

### Additional Acceptance Criteria

Defined as AC-TA-001..020 in the spec (finalised at spec consensus). In summary:

- AC-TA-001: the page follows the module-settings playbook.
- AC-TA-002: admins and managers manage rules (up to 50); only admins and owners
  manage webhook secrets; others read only; denials audit-logged.
- AC-TA-003: one trigger and up to three actions in a fixed order; repeated
  actions and identical active rules refused.
- AC-TA-004 to 006: event, schedule and webhook triggers execute (nine v1
  events; once per schedule slot; signed, replay-safe webhook).
- AC-TA-007 to 011: create task (templates, due date, owner, link), round-robin,
  assignee visibility, notify, lead-conversion rule.
- AC-TA-012 / 013: run history and guardrails (caps before any run is written).
- AC-TA-014 / 015: settings card with Reset to Defaults; tag catalogue with
  colour CHECK.
- AC-TA-016 to 018: tenant isolation, secrets never exposed, transactional
  writes.
- AC-TA-019 / 020: WCAG 2.1 AA, Lighthouse ≥ 90 (or NEEDS_HUMAN), registries.

### Boolean toggles (playbook §8)

| Toggle                                           | Category | Runtime consumer                              |
| ------------------------------------------------ | -------- | --------------------------------------------- |
| `TaskAutomationRule.isActive`                    | 1, wired | intake, schedule claim, execution, Test Rule  |
| `TaskAutomationSetting.automationEnabled`        | 1, wired | intake, webhook, execution, Test Rule         |
| `TaskAutomationSetting.notifyRuleOwnerOnFailure` | 1, wired | engine notifies the rule creator on a failure |
| `TaskAutomationTag.isActive`                     | 1, wired | inactive tags hidden from the rule picker     |

No AI toggles exist on these models ("AI defaults FALSE": N/A).

**Prisma migration** `20261020120000_task_automation` (Class A, additive, no
backfill) must be applied to production before this ships.

### Delivery status

| Item                                                | Status  |
| --------------------------------------------------- | ------- |
| Spec (5-agent exploration, challenge, consensus)    | Done    |
| Plan                                                | Pending |
| Domain, validators, DB, API, runtime, settings page | Pending |
| Validations, reviews, Lighthouse, attestation       | Pending |

```

---

*This context pack was auto-generated for agent context acknowledgement.*