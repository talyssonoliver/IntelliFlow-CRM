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
