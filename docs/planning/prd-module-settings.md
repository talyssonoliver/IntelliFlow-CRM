# PRD: Module Settings Pages

| Field         | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Feature Name  | Module Settings Pages                                          |
| Status        | Active                                                         |
| Related Tasks | PG-178, PG-182, PG-183, PG-196, PG-197, PG-201, PG-202, PG-204 |
| Created       | 2026-03-11                                                     |
| Last Updated  | 2026-10-17                                                     |
| Author        | Spec Session (PG-178)                                          |

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

## PG-187 Addendum: Report Settings (2026-04-19)

### User Stories

- **US-R1 (Analyst)**: As an analyst, I want to set a tenant-wide default date
  range for analytics reports (7d/14d/30d/90d) so that every chart and export
  starts consistent without me adjusting the range on each page.
- **US-R2 (Analyst)**: As an analyst, I want to pick the display currency (ISO
  4217 code) that applies to every revenue chart and export.
- **US-R3 (Ops manager)**: As an ops manager, I want to turn on scheduled email
  delivery of standard reports, pick the frequency (daily / weekly / monthly),
  the weekday (for weekly), delivery time, recipient list, and format
  (pdf/csv/excel), so that stakeholders get reports on a cadence without logging
  in.
- **US-R4 (Tenant admin)**: As a tenant admin, I need a "Reset to defaults"
  action that restores `30d / USD / scheduled delivery disabled` in one click
  with explicit confirmation.

### Acceptance Criteria (Reports)

- AC-R1: Page lives at `/analytics/report-settings` and is routed through
  `apps/web/src/app/analytics/(list)/report-settings/page.tsx` so it inherits
  the `AnalyticsSettingsSidebarNav` rendered by `analytics/(list)/layout.tsx`
  when `isReportSettingsPage(pathname) === true`.
- AC-R2: Prior `apps/web/src/app/analytics/report-settings/**` (broken prior
  implementation, commit `cb5308c2`) is DELETED — no duplicate route, no
  orphaned files.
- AC-R3: Layout uses `PageHeader` + 12-column bento grid with 3 `Card`s (Default
  Range, Currency, Scheduled Delivery). `ModuleSettingsLayout` is NOT used, per
  playbook §1 deprecation.
- AC-R4: Prisma model `ReportGeneralConfig` exists in
  `packages/db/prisma/schema.prisma` with `@@unique([tenantId])`, `Tenant`
  relation, and columns `defaultRange String @default("30d")`,
  `currency String @default("USD")`, `scheduledDelivery Json @default("...")`.
  Migration SQL under
  `packages/db/prisma/migrations/<ts>_add_report_general_config/`.
- AC-R5: `ReportGeneralConfig` exported from the `export type { … }` list in
  `packages/db/src/index.ts` (playbook §10).
- AC-R6: `packages/validators/src/index.ts` includes
  `export * from './report-settings';` — `updateReportSettingsSchema`,
  `DEFAULT_REPORT_SETTINGS`, `ScheduledDelivery`, and peers are reachable from
  `@intelliflow/validators`.
- AC-R7: `reportSettingsRouter` is imported and merged into
  `apps/api/src/modules/analytics/analytics.router.ts` under the
  `reportSettings` namespace, so
  `trpc.analytics.reportSettings.{get, update, resetToDefaults}` resolves.
- AC-R8: All 3 section components (`DefaultRangeSection`, `CurrencySection`,
  `ScheduledDeliverySection`) derive their enum option lists from the Zod
  schemas in `packages/validators/src/report-settings.ts`
  (`defaultRangeSchema.options`, `scheduledDeliveryFrequencySchema.options`,
  `scheduledDeliveryFormatSchema.options`). No duplicated string-literal union
  types in the UI.
- AC-R9: `ReportSettingsContent.tsx` parses server-returned settings through the
  Zod schemas before seeding local state. Unknown values fall back to
  `DEFAULT_REPORT_SETTINGS`. No `as DefaultRangeValue` unchecked casts.
- AC-R10: Scheduled delivery enforces `recipients.length >= 1` when
  `enabled === true`. Save button disables and a `role="alert"` message explains
  the requirement. Server-side Zod `.superRefine` enforces the same rule so a
  malformed client cannot bypass.
- AC-R11: `onReset` triggers a `ConfirmationDialog` then calls
  `analytics.reportSettings.resetToDefaults`; toast on success/failure; dirty
  flag clears after server round-trip.
- AC-R12: Page accessibility: every form control has `htmlFor`/`id` pair or
  `aria-label`; decorative icons use `aria-hidden="true"`; validation errors use
  `role="alert"`.
- AC-R13: `/analytics/report-settings` is present in the `url` array in
  `lighthouserc.js`.
- AC-R14: Lighthouse production-build run achieves ≥ 0.9 on both performance and
  accessibility (measured in CI).
- AC-R15: Unit/integration tests: validator (happy + 4 negative paths), router
  (`get`, `update` × 3 fields, `resetToDefaults`, cross-tenant negative, Zod
  rejection paths; 13+ cases), frontend (3 section components, orchestrator
  Save/Reset/dirty logic, page.tsx smoke; 79+ cases). All 4 validations
  (TypeScript / Tests / Lint / Build) pass honestly — no fabricated exit codes.
- AC-R16: Attestation file hashes are produced via
  `certutil -hashfile <path> SHA256` and verified against the committed tree.
  Attestation `notes` records any deviation from the plan honestly.

### Follow-up tasks (2026-04-19)

None blocking. Sibling stubs `/analytics/report-templates` and
`/analytics/scheduled-reports` remain at the wrong route-group level (no
sidebar). Their own tasks in later sprints should address the move.

## PG-196 Addendum: Account Tiers (2026-10-07)

Owner ruling A (2026-10-07): each tenant configures the existing revenue tiers
(ENTERPRISE / MID_MARKET / SMB / STARTUP as the starting set); the account card,
Account Settings hierarchy tab and sidebar tier links read that one
configuration, and the `/accounts?tier=` filters work. Decision record:
`docs/architecture/adr/ADR-073-tenant-configurable-account-tiers.md`.

### Additional User Stories

- **US-T1 (Tier definitions)**: As a workspace admin, I want to rename,
  recolour, re-threshold, add and remove account tiers so that the tier labels
  match how my business segments customers by annual revenue.
- **US-T2 (Default tier)**: As a workspace admin, I want to choose which tier an
  account shows when no annual revenue is recorded.
- **US-T3 (Benefits)**: As a workspace admin, I want to record the benefits each
  tier receives so that account owners see them on the account.
- **US-T4 (Up/down rules)**: As an account owner, I want to be notified when one
  of my accounts moves up or down a tier, when my admin turns that on.

### Additional Acceptance Criteria

- AC-T01..AC-T16 and NF-001..NF-005 as specified in
  `.specify/sprints/sprint-18/specifications/PG-196-spec.md` (route
  `/accounts/account-tiers`; defaults equal the IFC-273 bands; ADMIN-only
  writes; tier-change notifications default off; working `?tier=` filters;
  hierarchy tab and `requireParentForTiers` keyed on tier keys and enforced on
  transitions).

### Status (2026-10-07)

Implemented on `feat/pg-196-account-tiers` (domain → web, all package-scoped
validations green). Open before completion: Lighthouse ≥ 90 on the authenticated
page (or an owner waiver), push + pre-ship. Evidence:
`artifacts/lighthouse/PG-196/README.md`.

### Dropped (category 3, playbook §8)

Hysteresis, grace periods and manual tier overrides: tiers are derived from
revenue, so these would need a persisted tier that nothing reads today.

## PG-197 Addendum: Territory Mapping (2026-10-07)

Owner ruling A (2026-10-07): full feature — optional account geography,
territories, and territory-driven owner assignment wired to `autoAssignOwner`.
Spec: `.specify/sprints/sprint-18/specifications/PG-197-spec.md`. ADR-074.

### Additional User Stories

- **US-T1 (Account location)**: As a sales rep, I want to record an account's
  country, region and postal code when I create or edit it, so that it can be
  routed to the right team.
- **US-T2 (Territories)**: As a CRM Admin, I want to define territories by
  country, region and postcode prefix, with members and an assignment strategy
  (round-robin, load-balance or manual), so that new accounts land with the
  right owner.
- **US-T3 (Overlap and fallback)**: As a CRM Admin, I want to order territories
  by priority and choose one default territory, so that overlapping rules
  resolve predictably and unmatched accounts still get an owner.
- **US-T4 (Auto-assignment)**: As a CRM Admin, I want new accounts created
  without an explicit owner to be assigned through the matching territory when
  Auto-assign owner is on, and to be able to test an address before relying on
  it.

### Additional Acceptance Criteria

- AC-T1: `/accounts/territory-mapping` follows the module-settings playbook
  (PageHeader, 12-column bento grid, canonical EmptyState, playbook buttons,
  Save disabled when `!isDirty || isSaving || hasConflict`).
- AC-T2: Territories are listed in evaluation order (highest priority first) and
  can be reordered by drag and by keyboard-accessible buttons.
- AC-T3: A territory has a tenant-unique (case-insensitive) name, colour,
  strategy, active flag, members, and rules of (country, optional region,
  optional postcode prefix); duplicate rules are rejected ("rows N and M").
- AC-T4: At most one default territory; it must be active; it is used when no
  rule matches, including accounts with no location.
- AC-T5: Territory changes are restricted to admin roles
  (ADMIN/MANAGER/OWNER/SUPER_ADMIN); all reads and writes are tenant-scoped.
- AC-T6: Reset to Defaults deletes all territories, rules and members only;
  account owners and the Auto-assign owner setting are unchanged.
- AC-T7: "Test an address" previews which territory and strategy would apply
  without changing any state.
- AC-T8: Accounts have optional, normalised `country` (ISO alpha-2), `region`
  and `postalCode`, editable on `/accounts/new` and `/accounts/[id]/edit`.
- AC-T9: With Auto-assign owner on, a new account without an explicit owner is
  assigned by the matching territory's strategy; with it off, or with an
  explicit owner, behaviour is unchanged. Failures fall back to the creator.
- AC-T10: Non-admins can only choose themselves as an explicit owner.
- AC-T11: The CREATE audit entry records how the owner was chosen.
- AC-T12: Lighthouse ≥ 90 on the territory, new-account and edit-account pages.

### Delivery Status (2026-10-07, branch `feat/pg-197-territory-mapping`)

| AC     | Status    | Evidence                                                                                                                                                                                                                                                                                       |
| ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AC-T1  | Delivered | `TerritoryMappingContent.tsx` (PageHeader, 12-column grid, EmptyState `rules`/`passive`); `TerritoryDialog` Save rule                                                                                                                                                                          |
| AC-T2  | Delivered | `TerritoryList.tsx` — dnd-kit with `KeyboardSensor` + up/down buttons, live-region announcement                                                                                                                                                                                                |
| AC-T3  | Delivered | `account-territories.ts` validators (superRefine "rows N and M"); `lower(name)` and rule de-dupe indexes                                                                                                                                                                                       |
| AC-T4  | Delivered | `setDefault` clear-then-set transaction; inactive/deleted default → `PRECONDITION_FAILED`                                                                                                                                                                                                      |
| AC-T5  | Delivered | `accountTerritories` mutations gated on `ACCOUNT_OWNER_ADMIN_ROLES`; explicit `tenantId` on every query; RLS + composite FKs                                                                                                                                                                   |
| AC-T6  | Delivered | `resetToDefaults` deletes territories only (router test asserts no account/automation writes)                                                                                                                                                                                                  |
| AC-T7  | Delivered | `accountTerritories.preview` (read-only, never moves the cursor) + "Test an address" form                                                                                                                                                                                                      |
| AC-T8  | Delivered | `Account` geography (domain/validators/service/repository/API); `/accounts/new`, `/accounts/[id]/edit`                                                                                                                                                                                         |
| AC-T9  | Delivered | `resolveAccountOwner` in `handleAccountCreate`; BR-15 fallback to the creator                                                                                                                                                                                                                  |
| AC-T10 | Delivered | `assertExplicitOwner` — non-admin naming another user → `FORBIDDEN` before any lookup                                                                                                                                                                                                          |
| AC-T11 | Delivered | CREATE audit `afterState` = `{ ownerId, ownerSource, territoryId?, strategy?, reason? }`                                                                                                                                                                                                       |
| AC-T12 | **Open**  | Lighthouse not run: `LHCI_TEST_EMAIL`/`LHCI_TEST_PASSWORD` are not configured on the build host and the harness authenticates against the production Supabase project. Harness parametrised (`LHCI_URLS`, `LHCI_OUTPUT_DIR`) so the three routes can be audited once credentials are provided. |

#### Playbook §8 — Boolean toggle categories (PG-197)

| Toggle                                         | Category                                         | Consumer                                        |
| ---------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| `AccountAutomationSetting.autoAssignOwner`     | 1 — wired                                        | `handleAccountCreate` → `resolveAccountOwner`   |
| `AccountAutomationSetting.notifyOnOwnerChange` | 1 — wired (IFC-311 reassign), extended to create | `notifyAccountAssignedOnCreate`                 |
| `AccountTerritory.isActive`                    | 1 — wired                                        | `resolveTerritory` ignores inactive territories |
| `AccountTerritory.isDefault`                   | 1 — wired                                        | `resolveTerritory` fallback                     |

No AI toggles were added. Out-of-scope finding filed: #830 (Deals sidebar
"Territory Map" is a dead link).

## PG-201 Addendum: Scheduled Reports (2026-10-13)

Owner ruling (2026-10-13): no new table — the existing `report_schedules` table
is evolved in place and nothing is dropped; schedules are a cron expression plus
an IANA timezone (presets keep the legacy frequency/day/time columns
consistent); the Report Settings "Scheduled Delivery" card becomes a link and
its saved setting is copied once into `report_schedules`; schedules get tags
(TagsTab via `forwardRef`). Contract for the future IFC-308 cron:
`docs/architecture/adr/ADR-078-report-schedule-contract.md`.

### Additional User Stories

- As an admin or manager, I schedule a report template to be emailed to a list
  of recipients on a daily, weekly, monthly or quarterly cadence, or on a custom
  cron, in my team's timezone.
- As an admin or manager, I pause, edit, tag and delete schedules.
- As any analytics user, I can see the tenant's schedules and when each runs
  next.
- As a tenant that used the old Report Settings delivery, I find my saved
  setting as a paused schedule I only need to attach a template to.

### Additional Acceptance Criteria

- AC-SR-001: `/analytics/scheduled-reports` shows real `report_schedules` rows
  or the canonical EmptyState (`entity="reports"`, `phase="passive"`, no
  button).
- AC-SR-002: PageHeader + 12-column bento grid; New Schedule is the only primary
  CTA.
- AC-SR-003: presets and a custom 5-field cron, each with an IANA timezone; the
  server derives the cron for presets and keeps the legacy columns consistent.
- AC-SR-004: 1–50 recipients, case-insensitive duplicates rejected.
- AC-SR-005: new schedules choose PDF / CSV / email body; Excel stays only on
  copied rows that already use it (create rejects it, update refuses a switch to
  it, the dialog offers it only to such a row).
- AC-SR-006: an active schedule always references a template or a report
  definition (DB CHECK + API); private templates of other users stay hidden; a
  template still used by a schedule cannot be deleted (CONFLICT).
- AC-SR-007: duplicate names rejected by a Zod superRefine in the dialog and by
  the `(tenantId, lower(name))` unique index.
- AC-SR-008: tags via TagsTab (`forwardRef`); rename/delete rewrite schedule
  tags in one transaction; colorToken CHECK on schedules and tags.
- AC-SR-009: every destructive write in `$transaction`; no `skipDuplicates`.
- AC-SR-010: cross-tenant ids return NOT_FOUND and never touch another tenant.
- AC-SR-011: active schedules show their next occurrence, computed from the cron
  and timezone when read (never a past time); paused schedules show "Paused".
- AC-SR-012: writes limited to ADMIN / MANAGER / OWNER / SUPER_ADMIN; at most
  one run per hour (also across DST changes); at most 100 active and 500 total
  schedules per tenant; activation re-validates the stored recipients;
  activation and recipient changes are audited (count only, no addresses).
- AC-SR-013: Report Settings links to the new page and no longer writes
  `scheduledDelivery`; its Reset to Defaults keeps the legacy value.
- AC-SR-014: additive migration; the one-time copy is idempotent, tenant-scoped
  and leaves the legacy JSON untouched (production data write — owner applies).
- AC-SR-015: the page states that automated delivery waits for IFC-308.
- AC-SR-016: WCAG 2.1 AA; Lighthouse >= 90 (authenticated run needs the owner).

### Boolean toggles (playbook §8)

- `ReportSchedule.isActive` — category 2: consumed by IFC-308 (Backlog).
- `ReportScheduleTag.isActive` — category 1: the dialog only offers active tags.
- AI toggles — none on this entity ("AI defaults FALSE" is N/A).

### Follow-ups

- Restrict recipients to tenant members or approved domains (owner's delegate,
  2026-10-13: follow-up, not blocking).
- IFC-308 registers/removes BullMQ job schedulers and adds the
  `report_executions.scheduleId` FK + index.

## PG-204 Addendum: Case Types (2026-10-13)

Owner ruling (2026-10-13): Q1 = A, case types are applied at case creation; Q2 =
Yes, with no type the PG-190 module defaults apply (type first, then module
defaults). Spec: `.specify/sprints/sprint-18/specifications/PG-204-spec.md`.
ADR-076.

### Additional User Stories

- **US-CT1 (Taxonomy)**: As a CRM Admin, I want to define case types with a
  name, category and colour, so that cases are classified consistently.
- **US-CT2 (Defaults)**: As a CRM Admin, I want each case type to carry a
  default priority, an SLA in days, required fields and a resolution checklist,
  so that new cases start correctly without manual setup.
- **US-CT3 (Picker)**: As a case handler, I want to pick a case type when I
  create a case and see which defaults it will apply, so that I only fill in
  what differs.
- **US-CT4 (Module defaults)**: As a CRM Admin, I want the Case Settings default
  priority and required fields to apply when no type is picked, so that those
  settings actually take effect.

### Additional Acceptance Criteria

AC-CT1 to AC-CT16 are defined in the spec. In summary:

- `/cases/case-types` follows the playbook (PageHeader, 12-column bento grid,
  canonical EmptyState, playbook buttons, list `openCreate` via `forwardRef`).
- Names are tenant-unique (case-insensitive); there are 8 colour tokens (DB
  CHECK), an SLA of 1–3650 days, at most 20 checklist items and at most 50
  types.
- At most one default type, which must be active. A type used by cases cannot be
  deleted (deactivate it instead).
- Changes are limited to admins and managers; reads are open; everything is
  LEGAL-gated and tenant-scoped (cross-tenant negative tests).
- On create, priority is chosen as explicit > type > Case Settings default >
  MEDIUM, and the deadline as explicit > end of the local day N days ahead >
  none.
- Required fields are the type's set if it has one, otherwise the tenant's.
  Values are checked after defaults are applied.
- The checklist is seeded as PENDING case tasks in the same transaction as the
  case.
- New Case gets a Case type picker that replaces the unpersisted Category
  select, a "Use default" priority option and a hint. Case detail shows the
  type.
- Lighthouse ≥ 90 on `/cases/case-types` and `/cases/new`. WCAG 2.1 AA.

### Boolean toggles (playbook §8)

| Toggle               | Category  | Runtime consumer                                  |
| -------------------- | --------- | ------------------------------------------------- |
| `CaseType.isActive`  | 1 — wired | `caseTypes.listActive`; `cases.create` rejects it |
| `CaseType.isDefault` | 1 — wired | New Case picker preselection                      |

No AI toggles were added.

### Delivery Status (2026-10-13, branch `feat/pg-204-case-types`)

| AC      | Status    | Evidence                                                                                                                                 |
| ------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AC-CT1  | Delivered | `CaseTypesContent.tsx` (PageHeader, 12-column grid, EmptyState `cases`/`folder`/`passive`, `New Case Type` in the SectionHeader)         |
| AC-CT2  | Delivered | `case-types.ts` validators (superRefine), `case_types` CHECKs + `lower(name)` index (`tests/integration/case-types.test.ts`)             |
| AC-CT3  | Delivered | `CaseTypeList.tsx` `forwardRef` + `useImperativeHandle({ openCreate })`                                                                  |
| AC-CT4  | Delivered | `case-types.router.ts` `$transaction` on create/update/delete/setDefault; no `skipDuplicates`; P2002 → CONFLICT                          |
| AC-CT5  | Delivered | `setDefault` clear-then-set; partial unique index; default cannot be deleted or deactivated                                              |
| AC-CT6  | Delivered | `delete` → CONFLICT with the case count; composite FK `cases(tenantId, caseTypeId)` (integration test)                                   |
| AC-CT7  | Delivered | admin-only mutations, LEGAL gate (`legal-module-entitlement.test.ts`), cross-tenant NOT_FOUND tests                                      |
| AC-CT8  | Delivered | `CaseForm` type picker, "Use default", status hint; the unpersisted category list is gone                                                |
| AC-CT9  | Delivered | `resolveCaseCreateDefaults` + `computeSlaDeadline` (DST and +14h tests)                                                                  |
| AC-CT10 | Delivered | required fields checked on effective values; `BAD_REQUEST` names them                                                                    |
| AC-CT11 | Delivered | checklist seeded as PENDING `CaseTask`s in the case transaction                                                                          |
| AC-CT12 | Delivered | tenant preflight for type, client and assignee                                                                                           |
| AC-CT13 | Delivered | `getById.caseType` + `CaseDetail` badge; `updateCaseSchema` strips `caseTypeId`                                                          |
| AC-CT14 | Delivered | PG-190 defaults applied with no type; "Assign to me" fixed (`ctx.tenant.userId`)                                                         |
| AC-CT15 | **Open**  | Lighthouse not run: `LHCI_TEST_EMAIL`/`LHCI_TEST_PASSWORD` are not configured and the harness authenticates against production Supabase. |
| AC-CT16 | Delivered | axe checks in component tests; a11y-expert review recorded in the attestation                                                            |

Also fixed: the New Case client picker searched contacts while `cases.clientId`
references accounts, so cases could not be created from the UI. Out-of-scope
findings: #864–#867 (see
`.specify/sprints/sprint-18/findings/PG-204-findings.md`). **Prisma migration**
`20261013120000_case_types` (Class A) must be applied to production before this
ships.

## PG-205 Addendum: Contact Types (2026-10-17)

Owner ruling (2026-10-17): types start as the current six (customer, prospect,
partner, vendor, investor, other) and are tenant-editable, with no data
migration of existing contacts; a type is applied at contact creation; "default
labels" means default tags from the ContactTag list; "default fields" means
default values. Spec:
`.specify/sprints/sprint-18/specifications/PG-205-spec.md`. ADR-080. The row's
person/organization wording is superseded (organisations are Accounts).

### Additional User Stories

- **US-CTY1 (Taxonomy)**: As a CRM Admin, I want to rename, recolour, add and
  deactivate contact types, so that contacts are classified in our own terms.
- **US-CTY2 (Defaults)**: As a CRM Admin, I want each contact type to carry
  default values, extra required fields and default tags, so that new contacts
  start correctly.
- **US-CTY3 (Picker)**: As a sales rep, I want to pick a contact type when I
  create or edit a contact, so that the type is recorded and its defaults apply.
- **US-CTY4 (Find by type)**: As a sales rep, I want to filter the contacts list
  by type and see the type in the list, so that the Partners/Vendors segments in
  the sidebar actually work.

### Additional Acceptance Criteria

Defined as AC-CTY-001..018 in the spec (finalised at spec consensus). In
summary:

- AC-CTY-001: the page follows the module-settings playbook.
- AC-CTY-002: each tenant gets the six system types on first use, seeded for
  that tenant only.
- AC-CTY-003: admins and managers create (up to 50), rename, recolour,
  deactivate and set the default type; others read only.
- AC-CTY-004 to 006: names unique per tenant (case-insensitive), an 18-token
  colour, server-generated keys that are immutable and never reserved.
- AC-CTY-007 / 008: at most one default type, which must be active. System types
  cannot be deleted; custom types only when unused and not the default.
- AC-CTY-009 / 010: each type stores a default status, department, owner rule,
  required fields and default tags. On create, explicit input wins over the
  type's defaults.
- AC-CTY-011: an unknown, foreign or inactive key is rejected with one message;
  an unchanged stored key is kept.
- AC-CTY-012: the "job title required" rule checks the real `title` field.
- AC-CTY-013 / 014: type picker on New and Edit ("Other" free text removed);
  type badge, Type filter and working sidebar segments on the list.
- AC-CTY-015 / 016: everything tenant-scoped; changes and denials audit-logged
  without PII.
- AC-CTY-017 / 018: WCAG 2.1 AA, Lighthouse ≥ 90 (or NEEDS_HUMAN), registries
  updated.

### Boolean toggles (playbook §8)

| Toggle                  | Category | Runtime consumer                                             |
| ----------------------- | -------- | ------------------------------------------------------------ |
| `ContactType.isActive`  | 1, wired | `listActive`; contact create/update reject new inactive keys |
| `ContactType.isDefault` | 1, wired | New Contact picker preselection                              |
| `ContactType.isSystem`  | 1, wired | delete refused; reserved-key CHECK                           |

No AI toggles were added. The 12 existing `ContactAutomationSetting` flags were
already wired.

### Delivery status

| Item                                               | Status      |
| -------------------------------------------------- | ----------- |
| Domain, validators, DB (2 Class A migrations), API | Implemented |
| Settings page, picker, list filter/badge, segments | Implemented |
| Validations (typecheck, tests, lint, build, knip)  | Done        |
| Reviews (simplify, a11y WCAG 2.1 AA, codex)        | Done        |
| Lighthouse (authenticated routes)                  | NEEDS_HUMAN |
| Code review, STOA, attestation                     | In Progress |

## PG-198 Addendum: Approval Policies (2026-10-13)

Owner rulings R1–R3 (2026-10-13):

- The router lives in `apps/api/src/modules/agent/`.
- Policies govern **both** approval queues: agent tool actions and AI email
  auto-response drafts.
- All four rules are enforced now: timeout, minimum reviewer, auto-approve and
  escalation.
- The reviewer rule is a **minimum role**.
- Each policy carries a **colour token**.

Spec: `.specify/sprints/sprint-18/specifications/PG-198-spec.md`. ADR-079.

### Additional User Stories

- **US-P1 (Timeouts)**: As a CRM Admin, I want to set how long AI work may wait
  for review in each queue, so that stale items expire instead of being approved
  late.
- **US-P2 (Reviewer seniority)**: As a CRM Admin, I want to require a minimum
  reviewer role per policy, so that sensitive AI actions are decided by
  managers.
- **US-P3 (Bounded automation)**: As a CRM Admin, I want to opt specific agents
  into auto-approval above a high confidence threshold, so that routine,
  low-impact work doesn't wait for a person. It must stay off by default and
  need a confirmation to turn on.
- **US-P4 (Escalation)**: As a CRM Admin, I want undecided items to escalate to
  a named person after a delay, so that nothing sits unnoticed until it expires.
- **US-P5 (Per-agent overrides)**: As a CRM Admin, I want to route particular
  agents or actions to a different policy, and see which policy decides each
  kind of item.
- **US-P6 (Trust)**: As a reviewer, I want approved actions to really run, to
  see a real model confidence or none, and to see when an item was escalated.

### Additional Acceptance Criteria

AC-P1..AC-P22 are spec AC-001..AC-022, in order.

- AC-P1: The page follows the module-settings playbook.
- AC-P2: Admin-only mutations; others read only (FORBIDDEN server-side).
- AC-P3: Policy fields and limits:
  - name unique per queue;
  - an 18-token colour;
  - timeout 5..10080 min;
  - minimum role;
  - auto-approve OFF by default, threshold 90..99;
  - escalation with a delay below the timeout and a target in the tenant.
- AC-P4: Per-agent overrides. Duplicate pairs are rejected ("rows N and M"). A
  pair already on another policy is a CONFLICT.
- AC-P5: Multi-row writes are transactional.
- AC-P6: Everything is tenant-scoped; a foreign id is NOT_FOUND.
- AC-P7: With no policies, behaviour is unchanged.
- AC-P8 / AC-P9: New agent actions and new drafts take their expiry from the
  effective policy.
- AC-P10: Decisions require the policy minimum role. Draft actors come from the
  session.
- AC-P11: Approving runs the real mutation exactly once. Failures are stored,
  never reported as success.
- AC-P12: Confidence is real or absent, never derived.
- AC-P13: Auto-approve fires only within its strict conditions and is
  audit-logged.
- AC-P14: Overdue items escalate once with a notification. Replicas never
  double-fire.
- AC-P15: Colour CHECK. The AI default FALSE is restated in SQL.
- AC-P16: Lighthouse ≥ 90 (NEEDS_HUMAN when credentials are unavailable).
- AC-P17: TagsTab N/A.
- AC-P18: A deleted escalation target shows "(former user)" with a warning.
- AC-P19: Non-admins see no mutation controls.
- AC-P20: Enabling auto-approve asks for confirmation.
- AC-P21: Colour chips carry the policy name.
- AC-P22: The preview queue shows real confidence or "—", impact separately, and
  an Escalated badge.

### Delivery Status (2026-10-13, branch `feat/pg-198-approval-policies`)

| AC             | Status    | Evidence                                                                                                                                                                 |
| -------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| AC-P1          | Delivered | `ApprovalPoliciesContent.tsx` (PageHeader, 12-column bento, EmptyState `rules`/`passive`), `PolicyDialog` Save rule, `ApprovalPoliciesLoading`                           |
| AC-P2, AC-P19  | Delivered | `assertAgentSettingsAdmin` on every `approvalPolicies` mutation; `list.canManage` hides controls                                                                         |
| AC-P3, AC-P15  | Delivered | `approval-policies.ts` validators + migration `20261013120000` CHECKs (colour, timeout, threshold, delay < timeout)                                                      |
| AC-P4          | Delivered | `superRefine` "rows N and M"; unique `(tenantId, scope, agentKey, actionType)` → CONFLICT; `AssignmentsEditor` client check                                              |
| AC-P5, AC-P6   | Delivered | `$transaction` on all multi-row writes; explicit `tenantId`; composite FK `(tenantId, policyId, scope)`; RLS                                                             |
| AC-P7          | Delivered | `APPROVAL_POLICY_DEFAULTS` (30 min / 24 h, permission-only, no auto-approve, no escalation)                                                                              |
| AC-P8, AC-P9   | Delivered | `resolveAgentToolExpiry` in the five approval tools; `draftPolicy` in `autoResponse.create/regenerate`                                                                   |
| AC-P10         | Delivered | `assertPolicyReviewer` (agent), `assertDraftReviewer` + `sessionActor` (auto-response)                                                                                   |
| AC-P11         | Delivered | `claimForExecution` + `approved-action-executor` (tRPC caller of the target module); `executionError`; rollback token only where a real compensation exists (#856, #931) |
| AC-P12, AC-P22 | Delivered | Store keeps caller confidence or NULL; chain no 0.7 fallback; preview shows "—" for none and 0% for a reported 0                                                         |
| AC-P13         | Delivered | `evaluateAutoApproval`; `system:approval-policy` actor; audit with policy id, threshold, confidence                                                                      |
| AC-P14         | Delivered | `approval-escalation-sweep.ts` (advisory xact lock, once-only, post-commit notify + audit)                                                                               |
| AC-P16         | **Open**  | Authenticated Lighthouse needs `LHCI_TEST_*` credentials; the only Supabase is production (NEEDS_HUMAN, same as PG-196/197)                                              |
| AC-P17         | N/A       | Policies carry no tags                                                                                                                                                   |
| AC-P18         | Delivered | `hasFormerTarget` → card note + dialog "(former user)" option and warning                                                                                                |
| AC-P20, AC-P21 | Delivered | `ConfirmationDialog` before enabling; `PolicyChip` renders the name next to the swatch                                                                                   |

#### Playbook §8 — Boolean toggle categories (PG-198)

| Toggle                              | Category  | Consumer                                                                                         |
| ----------------------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `ApprovalPolicy.autoApproveEnabled` | 1 — wired | `agent.executeTool` → `tryAutoApprove`; `autoResponse.submitForApproval` → `tryAutoApproveDraft` |
| `ApprovalPolicy.escalationEnabled`  | 1 — wired | `runApprovalSweep` (in-process scheduler)                                                        |
| `ApprovalPolicy.isDefault`          | 1 — wired | `resolveApprovalPolicy` scope-default fallback                                                   |

AI toggle default: `autoApproveEnabled` is FALSE in Zod, Prisma and SQL
(playbook §7).

Red flags tracked:

- fixed on this branch: #853, #854, #855, #870, #874;
- fixed on main by PG-204: #872 (the `cases.create` assignee default; the issue
  is still open on GitHub);
- open: #856, #857, #883.

## PG-202 Addendum: Availability (2026-10-17)

Owner ruling (2026-10-17,
`.specify/sprints/sprint-18/context/PG-202/PG-202-owner-ruling.md`): Q1 =
firm-wide; Q2 = reuse the `AppointmentSettings` buffers and timezone, editing
moves to Availability; Q3 = enforce at appointment create, reschedule and
findNextSlot (coordinator cleared the overlap with the appointments lane); Q4 =
all-day closures; Q5 = ADMIN + MANAGER edit; Q6 = an appointment fits one day;
Q7 = the New Appointment form starts from the firm buffers. Spec:
`.specify/sprints/sprint-18/specifications/PG-202-spec.md`. ADR-081.

### Additional User Stories

- **US-AV1 (Hours)**: As a firm admin or manager, I want to set our weekly
  working hours per weekday (one or more ranges, in the firm timezone), so that
  appointments are only booked when we are open.
- **US-AV2 (Closures)**: As a firm admin or manager, I want to record all-day
  closure date ranges with an optional reason, so that nobody books us on
  holidays or office closures.
- **US-AV3 (Limits)**: As a firm admin or manager, I want an optional maximum
  number of bookings per day and default buffers, so that the calendar is not
  overloaded and new appointments start with our usual buffer times.
- **US-AV4 (Enforcement)**: As a user booking or rescheduling an appointment, I
  want a clear message when the time is outside the firm's availability, so that
  I can pick a valid time.

### Additional Acceptance Criteria

AC-001 to AC-027 are defined in the spec. In summary:

- `/calendar/availability` follows the playbook (PageHeader, 12-column bento,
  canonical EmptyState, playbook buttons, closures list `openCreate` via
  `forwardRef`); read-only for non-admins.
- Weekly hours stored as local minutes per weekday in the firm timezone (1..6
  ranges, no overlaps); closures as inclusive `DATE` ranges (≤ 200, ≤ 366 days);
  optional daily cap 1..500; buffers 0..240; named DB CHECKs, RLS.
- Configured firms: create and reschedule reject bookings outside the start
  day's hours, on closures, past local midnight or over the daily cap;
  findNextSlot only offers valid slots. Firms that never saved availability keep
  the legacy rules unchanged.
- `/calendar/calendar-settings` stops editing buffers and timezone and links to
  Availability.
- Cross-tenant negative tests; WCAG 2.1 AA (axe in component tests); Lighthouse
  ≥ 90 (NEEDS_HUMAN without credentials).

### Boolean toggles (playbook §8)

No persisted Boolean toggles. The weekday open switch and the "Limit bookings
per day" switch are draft-only controls mapped to hour rows and
`maxDailyBookings`, both enforced at booking (category 1). No AI toggles; no
colour tokens.

**Prisma migration** `20261017130000_availability` (Class A) must be applied to
production before this ships.

**Delivery (2026-10-17):** implemented on `feat/pg-202-availability`: page,
`calendar.availability` router, booking enforcement at create, reschedule and
findNextSlot, Calendar Settings pointer and New Appointment buffer prefill. The
migration was approved by an independent SQL review and is not applied to
production.
