# PRD: Account Management & Hierarchy

**Version:** 1.0
**Date:** 2026-02-08
**Owners:** Product Lead, Domain Lead
**Related Tasks:** IFC-103, IFC-107, IFC-185, PG-134
**Decision Records:** ADR-026-account-hierarchy.md
**Implements:** FLOW-046

## Summary

Deliver a full account management module with CRUD, parent/child hierarchy (up to 5 levels), tier segmentation, and per-account views for contacts, opportunities, activity, and pipeline charts. Accounts are a core CRM entity linking contacts and deals to a company.

## Goals

- Provide a list page with search, filters (industry, owner, revenue, employees), sortable table, and aggregate stat cards.
- Provide a detail page with tabbed interface: Overview, Contacts, Opportunities, Activity, Pipeline, Hierarchy.
- Support self-referencing parent/child hierarchy with tree visualization, keyboard navigation, and WCAG 2.1 AA accessibility.
- Automatic tier segmentation (Enterprise / Mid-Market / SMB / Startup / Unknown) derived from revenue.
- Cursor-based pagination for contacts and opportunities sub-lists.
- Sidebar navigation with views (All, My, Recent) and tier filters.

## Non-Goals

- Account merging or deduplication (future sprint).
- Revenue forecasting or AI-based account scoring (handled by Intelligence context).
- Billing or subscription management at account level.

## Users & Use Cases

- **Sales Reps**: Create accounts, link contacts/opportunities, view pipeline per account.
- **Account Managers**: Manage corporate hierarchies (parent/subsidiary), track consolidated pipeline across hierarchy.
- **Sales Managers**: Filter accounts by tier, review top accounts by revenue, drill into activity.
- **AI Assistant**: Surface account insights and next-best-actions (future integration via Intelligence context).

## Functional Requirements

### Account List (FR-1)

- Full-text search on account name (300ms debounce).
- Filters: industry, owner, revenue range, employee count range.
- Stat cards: Total Accounts, Total Revenue, Average Revenue, Accounts with Opportunities.
- Sortable table: Name, Industry, Revenue, Employees, Owner, Created.
- Pagination: 20 per page.
- Bulk actions: export, bulk delete (with confirmation).

### Account Detail (FR-2)

- Header: Name, tier badge, edit/delete buttons, back navigation.
- Delete disabled when account has linked contacts or opportunities.
- Tabs: Overview (fields + website link), Contacts (cursor-paginated with status filter), Opportunities (cursor-paginated with stage filter + summary cards), Activity (merged timeline), Pipeline (revenue chart + trend chart), Hierarchy (tree).
- Pin to dashboard via `useEntityPin` hook.

### Hierarchy Management (FR-3)

- Self-referencing `parentAccountId` with ON DELETE SET NULL.
- Recursive tree rendering up to 5 levels.
- Current account highlighted with "(current)" label.
- Each tree node shows: name, tier badge, revenue, contact/opportunity counts.
- Ancestor breadcrumb trail above tree.
- "Set Parent Account" picker with search; validates no self-reference, no cycle, max depth 5, same tenant.
- "Remove Parent" button (visible when parent exists).
- `AccountHierarchyUpdatedEvent` domain event on changes.
- Keyboard navigation: ArrowDown/Up (move focus), ArrowRight (expand/first child), ArrowLeft (collapse/parent), Enter (navigate), Home/End (first/last).

### Tier Segmentation (FR-4)

- Tiers derived from revenue: Enterprise (>=10M), Mid-Market (>=1M), SMB (>=100K), Startup (>0), Unknown (null/0).
- Badge on detail header, colored dot on list revenue column, tier filter in sidebar.

## Non-Functional Requirements

- **Performance**: List load <500ms, detail load <300ms, hierarchy query <200ms, setParent <100ms.
- **Security**: All queries scoped to tenant via RLS and where clause. Cross-tenant parent explicitly validated.
- **Accessibility**: Tree component meets WCAG 2.1 AA (role="tree", role="treeitem", aria-expanded, roving tabIndex).
- **Reliability**: Optimistic concurrency via Prisma; orphaned children get null parent on parent deletion.

## Metrics

- p95 list load <500ms; hierarchy render <200ms for 5-level tree.
- Test coverage >90%.
- Zero cross-tenant data leaks.
- WCAG 2.1 AA compliance on tree component.

## Acceptance Criteria

- Account CRUD works end-to-end with tenant isolation.
- Hierarchy tree renders correctly for 1-5 level depth.
- Cycle detection prevents circular hierarchies.
- Delete is disabled for accounts with contacts/opportunities; tooltip explains why.
- Invalid UUID in URL shows "Account Not Found" without API call.
- All 105 tests pass (47 backend + 58 frontend).

## Dependencies

- ADR-002 (DDD), ADR-004 (Tenancy), ADR-019 (Core CRM Foundation), ADR-026 (Account Hierarchy).
- IFC-103 (Account Aggregate), IFC-107 (Account Repository), IFC-185 (Account tRPC Router).

## Risks / Mitigations

- **Risk**: Deep hierarchies degrade query performance. **Mitigation**: maxDepth parameter limits recursive queries; default 5.
- **Risk**: Concurrent hierarchy edits cause inconsistency. **Mitigation**: Optimistic concurrency via Prisma; last write wins.
- **Risk**: Cross-tenant parent linking. **Mitigation**: Explicit tenant check in AccountService.setParent before save.
- **Risk**: Orphaned children on parent deletion. **Mitigation**: ON DELETE SET NULL FK constraint.
