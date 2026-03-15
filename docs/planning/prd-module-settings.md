# PRD: Module Settings Pages

| Field | Value |
|-------|-------|
| Feature Name | Module Settings Pages |
| Status | Active |
| Related Tasks | PG-178 |
| Created | 2026-03-11 |
| Last Updated | 2026-03-11 |
| Author | Spec Session (PG-178) |

## Problem Statement

IntelliFlow CRM has 11 entity modules (Leads, Contacts, Accounts, Deals, Tickets, Documents, Reports, Billing, Appointments, Cases, Tasks), each with module-specific configuration needs. Currently, sidebar gear icons link to `/settings/<module>` URLs that return 404 (IFC-232 identified 6 broken settings links). Administrators need per-module configuration pages to customize pipeline stages, scoring rules, custom fields, automation toggles, and other module-specific behavior without developer intervention.

## User Stories

### US-1: Lead Stage Configuration
As a CRM Admin, I want to configure lead pipeline stages (add, remove, reorder, set colors and default stage) so that the pipeline reflects my organization's sales process.

### US-2: Lead Scoring Rules
As a CRM Admin, I want to define activity-based scoring rules (email open, email click, meeting scheduled, etc.) with point values so that lead scores automatically reflect engagement.

### US-3: Lead Custom Fields
As a CRM Admin, I want to add custom fields to the Lead entity (dropdown, text, currency, date, etc.) so that we can capture business-specific data.

### US-4: Lead Automation Toggles
As a CRM Admin, I want to toggle automation features (auto-assignment, instant notifications, duplicate detection) on/off so that I can control automated lead processing.

### US-5: Reusable Settings Pattern
As a developer, I want a shared ModuleSettingsLayout component so that all 11 module settings pages follow the same tab-based pattern with Save/Reset actions.

## Acceptance Criteria

- AC-01: `/settings/leads` page renders with 4 tabs: Lead Stages, Scoring Rules, Custom Fields, Automation
- AC-02: Lead stages can be added, removed, reordered (drag-drop), and each stage has a color and display name
- AC-03: One stage is always marked as "Default Stage"
- AC-04: Scoring rules display activity types with configurable point values
- AC-05: Custom fields table supports CRUD with field name and data type columns
- AC-06: Automation toggles use Switch components for auto-assignment, notifications, lead recurrence
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
