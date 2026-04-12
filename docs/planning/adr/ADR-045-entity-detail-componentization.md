# ADR-045: CRM Entity Detail Page Componentization

**Status:** Accepted

**Date:** 2026-03-16

**Deciders:** Architecture Team, Frontend Lead

**Technical Story:** IFC-305

## Context and Problem Statement

The CRM entity detail pages (Leads, Contacts, Accounts) each contain 2,500+
lines of inline code with extensive duplication across pages. Three shared
components (`EntityHeader`, `SearchFilterBar`, `ActivityFeed`) exist but are
bypassed. `ContactDetail.tsx` (503 lines) was built as the model presentational
component but was never wired into the contacts page. AI insight transforms are
copy-pasted 3 times with minor divergence. This violates all 5 SOLID principles
and makes testing, maintenance, and feature parity across entities impractical.

## Decision Drivers

- **SRP**: Each page file handles 10+ responsibilities (fetching, transforms,
  state, rendering, tabs, sidebar, dialogs, badges, skeletons, errors)
- **OCP**: Adding a field to the profile card requires editing each 2,600-line
  page separately instead of extending through composition
- **LSP**: Three different icon implementations render the same icons
  non-interchangeably
- **ISP**: Each page depends on every transform, tab, and dialog even when only
  one is needed
- **DIP**: Pages depend directly on concrete useMemo transforms instead of
  shared abstractions
- **Testability**: 2,600-line files can't achieve 90% coverage; extracted
  components can trivially
- **Feature parity**: Leads and Contacts drift independently instead of sharing
  a foundation

## Considered Options

1. **Cross-entity shared components** (recommended) — Extract shared
   `EntityProfileCard`, `ActivityFilterBar`, `AiInsightMetricsGrid`,
   `ai-insight-transforms.ts` utility; wire existing `EntityHeader`,
   `SearchFilterBar`, `ActivityFeed`; create entity-specific shells
   (`LeadDetail.tsx`, wire `ContactDetail.tsx`)
2. **Per-entity extraction only** — Extract components within each entity's
   directory without cross-entity sharing
3. **Status quo** — Leave pages as-is, accept coverage gaps

## Decision Outcome

Chosen option: **Option 1 — Cross-entity shared components**

Rationale: Options 2 would reduce file size but perpetuate duplication. Option 3
blocks testability and maintenance. Option 1 eliminates ~1,500 lines of
duplication, enables 90%+ per-component coverage, and establishes a pattern for
Deals and future entities.

### Target Architecture

```
apps/web/src/
  components/
    shared/
      entity-profile-card.tsx      # NEW: avatar banner + fields + metrics grid
      activity-filter-bar.tsx      # NEW: search + type pills + person select
      ai-insight-metrics-grid.tsx  # NEW: 3-card stat row
      entity-error-state.tsx       # NEW: error/not-found card
      entity-detail-skeleton.tsx   # NEW: 3-column loading skeleton
      confirmation-dialog.tsx      # NEW: generic alert dialog wrapper
      entity-header.tsx            # EXISTS: wire into leads/contacts
      search-filter-bar.tsx        # EXISTS: wire into activity tabs
    leads/
      LeadDetail.tsx               # NEW: shell component (~350 lines)
      tabs/                        # NEW: 6 tab components
      hooks/useLeadData.ts         # NEW: data transforms
    contacts/
      ContactDetail.tsx            # EXISTS: wire into page
  lib/shared/
    ai-insight-transforms.ts       # NEW: shared churnRisk/NBA/engagement utils
```
