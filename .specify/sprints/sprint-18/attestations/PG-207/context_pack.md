# Context Pack: PG-207

**Run ID:** run-2026-10-21T00-01-45Z
**Generated:** 2026-10-21T00:01:46.134Z

## Task Details

- **Section:** Settings
- **Description:** Module Settings - Email (/email/email-settings)
- **Status:** In Progress
- **Target Sprint:** 18

## File Excerpts

### 📄 apps/web/src/components/sidebar/configs/email.ts

**SHA256:** `ff6d3f6320fddf5db22ef177511592d15610455cfc9d448db3dda87401622177`

```
import type { SidebarConfig, SidebarItem } from '../sidebar-types';
import {
  EmailComposeButton,
  EmailSidebarExtras,
  EmailStorageIndicator,
} from './EmailSidebarContent';

/** Settings items shown when on an email settings page */
export const EMAIL_SETTINGS_ITEMS: SidebarItem[] = [
  { id: 'email-settings', label: 'Email Settings', icon: 'tune', href: '/email/email-settings' },
  { id: 'signatures', label: 'Signatures', icon: 'draw', href: '/email/signatures' },
  { id: 'templates', label: 'Templates', icon: 'draft', href: '/email/templates' },
];

const SETTINGS_PATHS = EMAIL_SETTINGS_ITEMS.map(
  (item) => new URL(item.href, 'http://localhost').pathname
);

/** Check if the pathname is an email settings page */
export function isEmailSettingsPage(pathname: string): boolean {
  return SETTINGS_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const FOLDER_SECTIONS = (unreadCounts?: Record<string, number>): SidebarConfig['sections'] => [
  {
    id: 'folders',
    title: 'Folders',
    items: [
      { id: 'inbox', label: 'Inbox', icon: 'inbox', href: '/email', badge: unreadCounts?.inbox },
      { id: 'sent', label: 'Sent', icon: 'send', href: '/email?folder=sent' },
      { id: 'drafts', label: 'Drafts', icon: 'draft', href: '/email?folder=drafts' },
      { id: 'archive', label: 'Archive', icon: 'archive', href: '/email?folder=archive' },
      { id: 'spam', label: 'Spam', icon: 'report', href: '/email?folder=spam' },
      { id: 'trash', label: 'Trash', icon: 'delete', href: '/email?folder=trash' },
    ],
  },
];

/**
 * List mode — compose button, folders, labels, storage, Module Settings button.
 */
export function createEmailSidebarConfig(
  unreadCounts?: Record<string, number>,
  onSettingsClick?: () => void
): SidebarConfig {
  return {
    moduleId: 'email',
    moduleTitle: 'Email',
    moduleIcon: 'mail',
    beforeContent: EmailComposeButton,
    afterContent: EmailSidebarExtras,
    showSettings: !!onSettingsClick,
    onSettingsClick,
    footerContent: EmailStorageIndicator,
    sections: FOLDER_SECTIONS(unreadCounts),
  };
}

/**
 * Settings mode — settings items inline at top, folders below, labels + storage at bottom.
 */
export function createEmailSettingsSidebarConfig(
  beforeContent: SidebarConfig['beforeContent'],
  unreadCounts?: Record<string, number>
): SidebarConfig {
  return {
    moduleId: 'email',
    moduleTitle: 'Email',
    moduleIcon: 'mail',
    showSettings: false,
    beforeContent,
    afterContent: EmailSidebarExtras,
    sections: FOLDER_SECTIONS(unreadCounts),
  };
}

```

### 📄 apps/web/src/app/contacts/(list)/contact-settings/ContactSettingsContent.tsx (truncated: 120/468 lines)

**SHA256:** `0ea144e641da815e3e4f289c51839efdaad3bab1c84a503ca06d1c0a27a276a7`

```
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Button, Card, toast } from '@intelliflow/ui';
import { ModuleSettingsShell } from '@/components/shared/module-settings-shell';
import type {
  ContactRequiredFieldKey,
  CreateContactTagInput,
  UpdateContactTagInput,
} from '@intelliflow/validators';
import { ContactSettingsLoading } from './ContactSettingsLoading';
import { DuplicateDetectionTab, type DuplicateRuleRow } from './components/DuplicateDetectionTab';
import { RequiredFieldsTab, type RequiredFieldRow } from './components/RequiredFieldsTab';
import { TagsTab, type TagRow, type TagsTabHandle } from './components/TagsTab';
import { AutomationTab, type ContactAutomationSettings } from './components/AutomationTab';
import { AISettingsTab } from './components/AISettingsTab';
import { ConfigurationSummary } from './components/ConfigurationSummary';

const DEFAULT_AUTOMATION: ContactAutomationSettings = {
  autoMergeOnExactEmail: false,
  notifyOnDuplicate: true,
  restrictTagCreationToAdmins: false,
  normalizePhoneNumbers: true,
  autoCapitalizeNames: true,
  preventDeleteWithOpenDeals: true,
  notifyOnOwnerChange: false,
  // AI defaults off — opt-in privacy stance (PG-182 audit F4)
  aiDuplicateDetection: false,
  aiEnrichment: false,
  aiTagSuggestions: false,
  aiInsightGeneration: false,
  aiAutoReplyDrafting: false,
};

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  /** Optional action slot rendered on the right of the header, aligned with
   *  the title row (same pattern as shared/page-header.tsx actions). */
  action?: React.ReactNode;
}

function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
[... 348 lines omitted ...]

      {/* Required Fields */}
      <Card className="lg:col-span-5 p-4 sm:p-5">
        <SectionHeader
          icon="checklist"
          iconBg="bg-emerald-100 dark:bg-emerald-900/30"
          iconFg="text-emerald-600 dark:text-emerald-400"
          title="Required Fields"
          description="Fields that must be filled in before a contact can be saved."
        />
        <RequiredFieldsTab fields={localFields} onFieldsChange={handleFieldsChange} />
      </Card>

      {/* Tags */}
      <Card className="lg:col-span-8 p-4 sm:p-5">
        <SectionHeader
          icon="sell"
          iconBg="bg-violet-100 dark:bg-violet-900/30"
          iconFg="text-violet-600 dark:text-violet-400"
          title="Tags"
          description="Vocabulary of tags available across the contacts module."
          action={
            <Button size="sm" onClick={() => tagsTabRef.current?.openCreate()}>
              New Tag
            </Button>
          }
        />
        <TagsTab
          ref={tagsTabRef}
          tags={(tagsQuery.data ?? []) as TagRow[]}
          onCreate={handleTagCreate}
          onUpdate={handleTagUpdate}
          onDelete={handleTagDelete}
        />
      </Card>

      {/* Configuration Summary */}
      <Card className="lg:col-span-4 p-4 sm:p-5">
        <SectionHeader
          icon="summarize"
          iconBg="bg-slate-100 dark:bg-slate-800"
          iconFg="text-slate-600 dark:text-slate-300"
          title="Configuration Summary"
          description="Live overview of what you have configured on this page."
        />
        <ConfigurationSummary
          rules={localRules}
          fields={localFields}
          tags={(tagsQuery.data ?? []) as TagRow[]}
          automation={localAutomation}
          lastUpdated={
            automationQuery.data?.updatedAt ? new Date(automationQuery.data.updatedAt) : null
          }
          isDirty={isDirty}
        />
      </Card>
    </ModuleSettingsShell>
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

### 📄 docs/planning/prd-module-settings.md (truncated: 120/1127 lines)

**SHA256:** `88cb35d86d77f2c46c9a84b2748ae3f36b4172ee6345be7f0e6103866bda0b37`

```
# PRD: Module Settings Pages

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Feature Name  | Module Settings Pages                                                  |
| Status        | Active                                                                 |
| Related Tasks | PG-178, PG-182, PG-183, PG-196, PG-197, PG-201, PG-202, PG-204, PG-207 |
| Created       | 2026-03-11                                                             |
| Last Updated  | 2026-10-21                                                             |
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
[... 1007 lines omitted ...]
  and decide whether members without their own mailbox may send through it.
- **US-EM3 (Honest sending)**: As a user, I want an email to show SENT only when
  it actually left, and a clear prompt when I have no mailbox connected.
- **US-EM4 (Reply-to)**: As an admin, I want to set a tenant-wide reply-to
  address.
- **US-EM5 (Bounces)**: As an admin, I want bounced addresses detected
  automatically and suppressed according to our rules, so that we stop mailing
  dead addresses.
- **US-EM6 (Suppression list)**: As an admin, I want to see, add and remove
  suppressed addresses.
- **US-EM7 (Signatures)**: As a user, I want personal signatures, and as an
  admin, organisation signatures, with a default that is prefilled in new
  messages.
- **US-EM8 (Tracking)**: As an admin, I want to choose whether opens and clicks
  are tracked once tracking ships (IFC-221).

### Additional Acceptance Criteria

Defined as AC-EM-001..040 in the spec (finalised at spec consensus). In summary:

- AC-EM-001 to 009: personal and company mailboxes; SMTP presets; encrypted,
  write-only secrets (refused without the key); SSRF-safe test connection; OAuth
  with PKCE and single-use state; disconnect revokes; unconfigured providers
  shown disabled; revoked tokens move the mailbox to ERROR.
- AC-EM-010 to 019: one send path for user mail; mailbox resolution (own, then
  company if allowed, else refuse; no fallback from a broken own mailbox); From
  is the mailbox address; failures are FAILED with no fallback; SENT only when
  accepted; suppressed recipients skipped before quota; attachments really sent;
  coded errors shown in compose.
- AC-EM-020 to 023: admin-edited tenant settings with documented defaults; reset
  keeps mailboxes, signatures and suppressions; tracking labelled as pending
  IFC-221.
- AC-EM-024 to 031: lease-based bounce reader; only delivery-status reports,
  matched to our own sent records; hard/soft rules; per-recipient bounces;
  idempotent; optional sender notification; audited suppression management.
- AC-EM-032 to 036: user and org signatures, sanitised, unique names
  (superRefine + index), one default per scope, prefill on new messages only.
- AC-EM-037 to 040: tenant and user isolation with negative tests; playbook
  layout; WCAG 2.1 AA and Lighthouse ≥ 90 (or NEEDS_HUMAN); registries.

### Boolean toggles (playbook §8)

| Toggle                       | Category | Runtime consumer                             |
| ---------------------------- | -------- | -------------------------------------------- |
| `allowTenantMailboxFallback` | 1        | mailbox resolution in the user-mail sender   |
| `notifySenderOnBounce`       | 1        | bounce reader → `email_bounced` notification |
| `trackOpens`                 | 2        | IFC-221 (broadened to every mailbox kind)    |
| `trackClicks`                | 2        | IFC-221 (broadened to every mailbox kind)    |
| `EmailSignature.isDefault`   | 1        | compose prefill                              |

No AI toggles; no colour tokens; no tags (TagsTab N/A).

### Delivery status

| Item                                          | Status  |
| --------------------------------------------- | ------- |
| Spec (owner rulings Q1-Q10, ADR-085)          | Drafted |
| DB, domain, validators, adapters, API, web    | Planned |
| Validations, reviews, Lighthouse, attestation | Planned |

```

---

*This context pack was auto-generated for agent context acknowledgement.*