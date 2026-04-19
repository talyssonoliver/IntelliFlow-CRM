# PRD: Module Settings Pages

| Field         | Value                  |
| ------------- | ---------------------- |
| Feature Name  | Module Settings Pages  |
| Status        | Active                 |
| Related Tasks | PG-178, PG-182, PG-183 |
| Created       | 2026-03-11             |
| Last Updated  | 2026-04-13             |
| Author        | Spec Session (PG-178)  |

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
- AC-06: Automation toggles use Switch components for auto-assignment,
  notifications, lead recurrence
- AC-07: Save Changes persists all settings via tRPC mutation
- AC-08: Reset to Defaults restores factory default configuration
- AC-09: Settings sidebar and settings home page include Lead Settings entry
- AC-10: ModuleSettingsLayout is reusable across all entity settings pages
- AC-11: Page uses existing lead sidebar (navigates from leads module)
- AC-12: Lighthouse score >=90

## Non-Functional Requirements

- NF-01: Settings page load <500ms
- NF-02: Save operation <200ms
- NF-03: All interactions keyboard-accessible (WCAG 2.1 AA)
- NF-04: Tenant-scoped data isolation (multi-tenant safe)

## Design Reference

- Mockup HTML: `docs/design/mockups/lead-settings.html`
- Mockup PNG: `docs/design/mockups/lead-settings.png`

## PG-182 — Contact Settings Extension (2026-04-13)

### User Stories (Contacts)

- **US-C1 Duplicate Detection**: As a CRM Admin, I want to configure which
  contact fields are used for duplicate detection (email exact match, phone
  normalized match, fuzzy name+company match) so the system flags duplicates at
  ingestion without blocking legitimate records.
- **US-C2 Required Fields**: As a CRM Admin, I want to mark contact fields as
  required (e.g. email, phone, company) so data quality is enforced on
  create/update.
- **US-C3 Tags Config**: As a CRM Admin, I want to manage the tag vocabulary
  (name, color, description, sort order, active flag) used across the contacts
  module so tagging stays consistent between users.
- **US-C4 Automation Toggles**: As a CRM Admin, I want to toggle automation
  behavior (auto-merge on exact email, notify on duplicate, restrict tag
  creation to admins) so organisational policy drives behavior.

### Acceptance Criteria (Contacts)

- AC-C1: `/contacts/contact-settings` renders with 4 tabs: Duplicate Detection,
  Required Fields, Tags, Automation.
- AC-C2: Duplicate rules list supports add/remove/toggle with a `matchStrategy`
  enum (`exact` | `normalized` | `fuzzy`) and a per-rule `threshold` (0–100) for
  fuzzy strategies.
- AC-C3: Required Fields tab lists canonical Contact fields (email, phone,
  company, jobTitle, owner) with a Switch per field; at least one field (email)
  MUST remain required.
- AC-C4: Tags tab supports CRUD (name, color, description, sortOrder); colors
  use the shared Tailwind palette; deleting a tag that is referenced warns the
  admin.
- AC-C5: Automation tab toggles: `autoMergeOnExactEmail`, `notifyOnDuplicate`,
  `restrictTagCreationToAdmins`.
- AC-C6: Save Changes persists all four tabs via one tRPC round-trip
  (`contactSettings.saveAll` umbrella mutation OR parallel per-tab mutations);
  settings sidebar nav (`ContactSettingsSidebarNav`) resolves to the three
  existing in-module routes.
- AC-C7: Reset to Defaults restores factory rules (email exact, phone
  normalized), required-field defaults (email only), and removes user-created
  tags.
- AC-C8: Page reuses `ModuleSettingsLayout` from PG-178 — no new layout
  component is created.
- AC-C9: `/settings/contacts` continues to redirect to
  `/contacts/contact-settings` (already in place).
- AC-C10: Lighthouse score >=90 on production build.
- AC-C11: Multi-tenant isolation — every Prisma model in this PRD has
  `tenantId` + compound unique constraints where applicable.

### PG-182 Addendum 2026-04-14 — Data Hygiene + AI Toggles

Following the audit of the initial PG-182 delivery, the
`ContactAutomationSetting` model now carries 11 booleans (was 3). They fall into
three groups:

1. **Duplicate-detection policy (3)** — `autoMergeOnExactEmail`,
   `notifyOnDuplicate`, `restrictTagCreationToAdmins`.
2. **Data hygiene (4, wired in contact.router)** — `normalizePhoneNumbers`
   (E.164 normalization on save), `autoCapitalizeNames` (Title-Case transform on
   save), `preventDeleteWithOpenDeals` (delete gate counts only ACTIVE
   opportunities), `notifyOnOwnerChange` (notification on reassignment — pending
   notification infrastructure).
3. **AI & Intelligence (5)** — `aiDuplicateDetection`, `aiEnrichment`,
   `aiTagSuggestions`, `aiInsightGeneration`, `aiAutoReplyDrafting`. All default
   **off** (opt-in privacy stance). The AI toggles surface a "pending" badge in
   the UI because the supporting AI chains are tracked by `FOLLOWUP-PG-182-C`
   (separate task).

### Acceptance Criteria (additions)

- AC-C12: Data-hygiene toggles are enforced at runtime by
  `apps/api/src/modules/contact/contact-automation.ts`; unit tests in
  `__tests__/contact-automation.test.ts` cover each transform.
- AC-C13: `ContactRequiredField` policy is now enforced on `contact.create` and
  `contact.update` — creating a contact without a required field returns
  `BAD_REQUEST` listing the missing fields.
- AC-C14: `restrictTagCreationToAdmins` is enforced in
  `contactSettings.tags.create` via `FORBIDDEN` when a non-admin submits.
- AC-C15: All AI toggles default `false` in the DB (seeded via migration
  `20260414120000_contact_settings_hardening`) so the platform ships opt-in, not
  opt-out.
- AC-C16: Destructive multi-row writes (`duplicateRules.updateAll`,
  `requiredFields.updateAll`, both `resetToDefaults`) run inside
  `prisma.$transaction` so a mid-operation failure cannot leave a tenant with
  zero rules.
- AC-C17: `contactTag.colorToken` has a DB `CHECK` constraint enforcing the Zod
  allowlist — the schema can no longer silently store garbage.
- AC-C18: Zod `updateContactDuplicateRulesSchema` rejects payloads that contain
  two rows with the same `(field, matchStrategy)` pair; the UI disables Save
  while a conflict exists and displays an inline warning.
- AC-C19: `automation.resetToDefaults` exists and is called from the UI "Reset
  to Defaults" action alongside the other two reset procedures.

### Follow-up tasks (created 2026-04-14, cover both PG-182 and PG-183)

- **IFC-310** — Duplicate-detection runtime for **contacts + accounts**.
  Unblocks `autoMergeOnExactEmail`, `autoLinkContactsByDomain` (account-only),
  `notifyOnDuplicate`, `aiDuplicateDetection` (contact-only),
  `aiIndustryInference`
  - `aiEnrichment` (account-side AI hook). Ships a shared rule evaluator plus
    per-entity services.
- **IFC-311** — Reassign endpoints for **contacts + accounts** +
  `notifyOnOwnerChange` wiring. PG-182 already ships `notifyContactReassignment`
  and adds `contact_reassigned` to NOTIFICATION_TYPES; PG-183 ships
  `notifyAccountReassignment`. IFC-311 adds the actual reassign/bulkReassign
  procedures and the `account_reassigned` notification type.
- **IFC-312** — AI chains for **contacts + accounts**: shared enrichment
  adapter, contact and account tag suggestions, contact and account insight
  generation, contact reply drafting, plus account-only `aiIndustryInference`
  and `aiAccountScoring`. Unblocks every remaining AI toggle on both entities.

## PG-183 Addendum: Account Settings (2026-04-13)

### Additional User Stories

- **US-6 (Account Hierarchy)**: As a CRM Admin, I want to configure hierarchy
  rules for accounts (max nesting depth, require hierarchy for enterprise tier,
  disallow self-cycles) so that parent/child relationships stay consistent.
- **US-7 (Industry Taxonomy)**: As a CRM Admin, I want to maintain the list of
  allowed industry values (label, key, sort order, active flag) so that account
  records use a consistent, pickable taxonomy.
- **US-8 (Account Custom Fields)**: As a CRM Admin, I want to add custom fields
  to the Account entity (text, number, currency, dropdown, date, boolean) so
  that we can capture business-specific account data.

### Additional Acceptance Criteria

- AC-13: `/accounts/account-settings` page renders with 3 tabs: Hierarchy,
  Industry, Custom Fields.
- AC-14: Hierarchy tab exposes `maxDepth` (1-10), `requireParentForTiers`
  (multi-select), and `preventCycles` (read-only true).
- AC-15: Industry tab supports CRUD on industry options (label, key, sortOrder,
  isActive) rendered in a DataTable with a create/edit dialog.
- AC-16: Custom Fields tab supports CRUD with the same data-type union as Lead
  Custom Fields (text, number, currency, dropdown, date, boolean).
- AC-17: Page renders inside the `/accounts/(list)/layout.tsx` in-module sidebar
  (uses `AccountSettingsSidebarNav`, NOT `/settings/<module>` shell).
- AC-18: `ModuleSettingsLayout` is reused unchanged.
- AC-19: Settings home search and `/settings` sidebar link to
  `/accounts/account-settings` (not the deprecated `/settings/accounts`).

## PG-186 Addendum: Document Settings (2026-04-15)

### User Stories

- **US-D1 (File Types)**: As a CRM Admin, I want to configure allowed MIME types
  and max upload size so that users cannot upload invalid or oversized files.
- **US-D2 (Antivirus)**: As a CRM Admin, I want to enable antivirus scanning on
  uploads and configure quarantine/block policies so that malware is caught
  before storage.
- **US-D3 (Duplicate Detection)**: As a CRM Admin, I want to define
  duplicate-detection rules (field + strategy + collision action) so that the
  system can detect and handle duplicate documents on upload.
- **US-D4 (Required Fields)**: As a CRM Admin, I want to mark document fields as
  required (with `title` always locked) so that documents cannot be saved
  without essential metadata.
- **US-D5 (Tags)**: As a CRM Admin, I want to manage a tag vocabulary for
  documents (name, color, description) so that users can consistently classify
  documents.
- **US-D6 (Automation)**: As a CRM Admin, I want to enable automation flags
  (normalize filename, notify on duplicate, restrict tag creation) so that
  data-hygiene rules apply to all document operations.
- **US-D7 (Retention)**: As a CRM Admin, I want to configure per-category
  retention periods and legal hold overrides so that documents are archived or
  deleted in compliance with policy.

### Acceptance Criteria

- AC-D1: `/documents/document-settings` renders a 9-card bento grid inside the
  `DocumentSettingsSidebarNav` layout.
- AC-D2: Page is accessible via the documents module's in-module sidebar — NOT
  the global settings shell.
- AC-D3: General Config card renders MIME-type chips (add/remove), max upload
  size (1–500 MB), and default retention days.
- AC-D4: Antivirus card renders 3 Switches: enableAntivirusScan,
  quarantineOnDetect, blockOnScanFailure.
- AC-D5: Duplicate Detection tab renders an inline row editor; duplicate
  `(field, matchStrategy)` pair blocks Save.
- AC-D6: Required Fields tab renders 5 field rows; `title` row Switch is locked
  to `checked=true disabled`.
- AC-D7: Tags tab uses `forwardRef<TagsTabHandle>` with `openCreate()` callable
  from SectionHeader action slot.
- AC-D8: Automation card renders 5 Category-1 toggles; AI card renders 7
  Category-2 toggles with `aria-disabled="true"` and "pending" badge.
- AC-D9: Retention Policies tab renders a DataTable; create/edit via Dialog with
  legalHoldOverride switch.
- AC-D10: Save Changes button is disabled when `!isDirty || hasConflict`;
  enabled when at least one tab is dirty without conflict.
- AC-D11: Reset to Defaults calls all 5 `resetToDefaults` mutations in
  `Promise.all`; Tags and custom data preserved.
- AC-D12: `documentSettingsRouter` is registered in `apps/api/src/router.ts` as
  `documentSettings`.
- AC-D13: Two migrations created: `20260419120000_document_settings` (6 tables +
  RLS) and `20260419120100_document_settings_hardening` (CHECK constraints + AI
  default = false restatements).
- AC-D14: Category-1 automation helpers (`normalizeFilename`,
  `assertNotDeleteGuarded`, `notifyDocumentReassignment`) are wired into
  `documents.router.ts` create/update/delete procedures.
- AC-D15: `'document_reassigned'` added to `NOTIFICATION_TYPES` array in
  `packages/validators/src/notifications.ts`.
- AC-D16: `settings-search.ts` contains a "documents" entry linking to
  `/documents/document-settings`.
- AC-D17: Lighthouse performance score ≥90 on production build for
  `/documents/document-settings`.
- AC-D18: Router tests include cross-tenant negative cases: foreign `tenantId`
  on `tags.update` → NOT_FOUND.

## PG-184 Addendum: Deal Settings (2026-04-16)

### User Stories

- **US-D1 (Pipeline)**: As a CRM Admin, I want the deal-settings page to surface
  the existing pipeline stage configuration so that stage order, color and
  probability management stays in one canonical place.
- **US-D2 (Win/Loss)**: As a CRM Admin, I want to maintain a WON/LOST reason
  taxonomy so that sales reps close deals against a consistent vocabulary.
- **US-D3 (Scoring)**: As a CRM Admin, I want to define deterministic scoring
  rules (field + operator + value + points) so that the IFC-312 runtime can
  combine rule-based scoring with AI scoring.
- **US-D4 (Duplicate Detection)**: As a CRM Admin, I want to configure
  duplicate-detection rules per `(field, matchStrategy)` so that suspected
  duplicates are flagged and optionally auto-merged on create.
- **US-D5 (Required Fields)**: As a CRM Admin, I want to mark deal fields as
  required (with `accountId` and `ownerId` always locked) so that deals cannot
  be saved without essential context.
- **US-D6 (Tags)**: As a CRM Admin, I want to manage a tag vocabulary for deals
  (name, 18 color tokens, description) so that users can consistently categorize
  deals.
- **US-D7 (Automation)**: As a CRM Admin, I want to toggle 10 category-1
  automation flags plus a numeric `highValueThreshold` so that name
  capitalization, currency normalization, delete guards, and
  owner/stage/high-value notifications fire automatically on opportunity
  create/update/delete.
- **US-D8 (AI Toggles)**: As a CRM Admin, I want to opt in to 6 AI-driven
  behaviours (duplicate detection, scoring, next-step, tag suggestions,
  insights, win/loss prediction) with defaults FALSE so that I can enable them
  deliberately as IFC-312 ships the underlying chains.

### Acceptance Criteria

- AC-D1: `/deals/deal-settings` renders the in-module Deal Settings sidebar (via
  `DealSettingsSidebarNav`) with a sticky `PageHeader` and 12-column bento grid
  (playbook §1 — NOT `ModuleSettingsLayout`).
- AC-D2: Page contains 7 `Card` sections with anchor IDs `#pipeline`,
  `#win-loss`, `#scoring`, `#duplicate-detection`, `#required-fields`, `#tags`,
  `#automation`.
- AC-D3: Pipeline card reuses `trpc.pipelineConfig.*` — NO new pipeline model or
  router is introduced.
- AC-D4: Win/Loss card supports grouped listing, create/edit, isActive toggle,
  and soft-delete when any Opportunity references the reason key.
- AC-D5: Scoring card supports list + create + edit + delete for
  `DealScoringRule` with field/operator/value/points form and a "Runtime scoring
  delivered by IFC-312" note.
- AC-D6: Duplicate Detection card — Add Rule button is right-aligned
  `<Button size="sm">Add Rule</Button>` with no icon or outline (playbook §3);
  Zod `superRefine` rejects duplicate `(field, matchStrategy)` pairs.
- AC-D7: Required Fields card — `accountId` and `ownerId` switches are disabled;
  Zod refine rejects any payload that drops either.
- AC-D8: Tags card uses `forwardRef<TagsTabHandle>` + `useImperativeHandle`
  (playbook §4); `swatchClass(token)` falls back to `slate` for unknown tokens.
- AC-D9: Automation card renders 16 toggles in 5 sections (Duplicate Detection,
  RBAC, Data Hygiene, Notifications + `highValueThreshold`, AI); AI section
  shows a "Runtime delivered by IFC-312" hint.
- AC-D10: Reset to Defaults uses a `ConfirmationDialog` that enumerates the 5
  resets (duplicate rules, required fields, win/loss, scoring, automation); tags
  and pipeline stages are preserved.
- AC-D11: `dealSettings` tRPC router is registered in `apps/api/src/router.ts`
  and appears on the generated client.
- AC-D12: 6 new Prisma models created with tenant-scoped constraints + hardening
  migration (CHECK constraints for tag colorToken and win/loss category +
  AI-default `false` restatements).
- AC-D13: `deal-automation.ts` is the runtime consumer of every category-1
  toggle; `opportunity.router.ts` `create`/`update`/`delete` call through it.
  `deal_reassigned`, `deal_stage_changed`, `deal_high_value_moved`,
  `deal_duplicate_suspected` are present in `NOTIFICATION_TYPES`.
- AC-D14: Lighthouse production build score ≥ 0.9 (performance + accessibility)
  on `/deals/deal-settings`.

## PG-185 Addendum: Ticket Settings (2026-04-16)

Reference implementation: `apps/web/src/app/tickets/(list)/sla-policies/**`,
`apps/api/src/modules/ticket/ticket-settings.router.ts`,
`apps/api/src/modules/ticket/ticket-automation.ts`,
`packages/validators/src/ticket-settings.ts`. Playbook:
`docs/planning/module-settings-playbook.md` (MANDATORY).

### User Stories

- **US-T1 (Page Shell)**: As a Support Admin, I want `/tickets/sla-policies` to
  render the in-module Ticket Settings sidebar + a 12-column bento grid (not the
  deprecated `ModuleSettingsLayout`) so the page is consistent with Contacts /
  Accounts / Deals.
- **US-T2 (Default SLA)**: As a Support Admin, I want to pick ONE SLA policy as
  the tenant default so new tickets without an explicit SLA inherit it
  automatically (fallback: the first `SLAPolicy.isDefault=true` row).
- **US-T3 (SLA Policies card)**: As a Support Admin, I want to see all SLA
  policies in the settings page and flip the default without leaving the bento,
  with the SLA list and the automation card staying in sync.
- **US-T4 (Duplicate Rules)**: As a Support Admin, I want 4 duplicate detection
  rules (`contact_subject`, `contact_24h`, `email_subject`,
  `contact_description_5min`) with `(field, matchStrategy)` uniqueness enforced
  at the validator layer AND the database.
- **US-T5 (Required Fields)**: As a Support Admin, I want to mark
  `subject`/`description`/`contactEmail`/`contactName`/`priority`/
  `category`/`slaPolicy` as required on ticket create — with `subject` and
  `contactEmail` pinned as always-required.
- **US-T6 (Tags)**: As a Support Admin, I want to manage a tag vocabulary for
  tickets (name, 18 color tokens, description) so users can consistently
  categorize tickets.
- **US-T7 (Automation)**: As a Support Admin, I want to toggle 12 category-1
  automation flags (2 duplicate detection, 1 RBAC, 3 data hygiene, 5
  notifications, 1 escalation) plus an auto-close idle-days integer so data
  hygiene, delete guards, and notification emissions fire automatically on
  ticket create/update/delete/escalate.
- **US-T8 (AI + Auto-Close)**: As a Support Admin, I want to opt in to 6 AI
  behaviours (duplicate, categorization, sentiment, next-step, tag, insight) and
  4 auto-close knobs — all with defaults FALSE or safe — so I can enable them
  deliberately as IFC-310 (auto-close cron) and IFC-312 (AI chains) ship.

### Acceptance Criteria

- AC-T1: `/tickets/sla-policies` renders inside the Ticket Settings sidebar
  (`TicketSettingsSidebarNav`) with a sticky `PageHeader` and 12-column bento
  grid. Route physically lives under
  `apps/web/src/app/tickets/(list)/sla-policies/`.
- AC-T2: Page contains 5 `Card` sections with anchor IDs `#sla-policies`,
  `#duplicate-detection`, `#required-fields`, `#tags`, `#automation`.
- AC-T3: SLA Policies card REUSES `trpc.ticketConfig.slaPolicy.*` — no new SLA
  model or router introduced. Selecting a default on the card updates the
  automation card's `defaultSlaPolicyId`, and vice versa.
- AC-T4: Duplicate Detection card — Add Rule button is right-aligned
  `<Button size="sm">Add Rule</Button>`, no icon, no outline (playbook §3); Zod
  `superRefine` rejects duplicate `(field, matchStrategy)` pairs.
- AC-T5: Required Fields card — `subject` and `contactEmail` switches are
  disabled; Zod refine rejects any payload that drops either.
- AC-T6: Tags card uses `forwardRef<TicketTagsCardHandle>` +
  `useImperativeHandle` (playbook §4); `swatchClass(token)` falls back to
  `slate` for unknown tokens. ADMIN/OWNER gate enforced when
  `restrictTagCreationToAdmins=true`.
- AC-T7: Automation card renders 21 controls in 7 groups (Default SLA,
  Auto-Close, Duplicate Detection, RBAC, Data Hygiene, Notifications, AI);
  Auto-Close group shows a "Runtime delivered by IFC-310" hint; AI group shows a
  "Runtime delivered by IFC-312" hint.
- AC-T8: Reset to Defaults uses a `ConfirmationDialog` that enumerates the 3
  resets (duplicate rules, required fields, automation); tags and SLA policies
  are preserved.
- AC-T9: `ticketSettings` tRPC router is registered in `apps/api/src/router.ts`
  and appears on the generated client.
- AC-T10: 4 new Prisma models (`TicketDuplicateRule`, `TicketRequiredField`,
  `TicketTag`, `TicketAutomationSetting`) created with tenant-scoped
  constraints + hardening migration (CHECK constraint for tag `colorToken`,
  `autoCloseIdleDays` bounds 0..365, AI-default `false` restatements).
  `TicketAutomationSetting.defaultSlaPolicyId` FK carries `ON DELETE SET NULL`.
- AC-T11: `ticket-automation.ts` is the runtime consumer of every category-1
  toggle; `ticket.router.ts` `create`/`update`/`delete` call through it
  (`loadTicketAutomation`, `normalizeTicketSubject`, `trimTicketDescription`,
  `resolveDefaultSlaPolicyId`, `notifyTicketReassignment`,
  `notifyTicketResolved`, `notifyTicketEscalated`, `assertCanDeleteTicket`).
  `ticket_reassigned`, `ticket_resolved`, `ticket_duplicate_suspected`,
  `ticket_auto_closed` are present in `NOTIFICATION_TYPES`.
- AC-T12: Cross-tenant negative test per mutation. Cross-tenant test on
  `automation.update({defaultSlaPolicyId})` asserts that assigning another
  tenant's SLA policy yields `BAD_REQUEST`.
- AC-T13: `/settings/tickets → /tickets/sla-policies` redirect ships. Settings
  sidebar entry "Tickets" + settings-search entry ship (under the "AI &
  Automation" category).
- AC-T14: Lighthouse production build score ≥ 0.9 (performance + accessibility)
  on `/tickets/sla-policies`.
