# ADR-026: Account Hierarchy Design

**Status:** Accepted

**Date:** 2026-02-08

**Deciders:** Tech Lead, Domain Architect, Frontend Lead

**Technical Story:** IFC-103, IFC-107, IFC-185, PG-134

## Context and Problem Statement

IntelliFlow CRM needs to model corporate structures where a parent company
(e.g., TechCorp HQ) has subsidiaries (TechCorp Brasil, TechCorp UK). Users need
to visualize these relationships, set/remove parent accounts, and see
consolidated pipeline data. How should we implement the parent/child hierarchy
for accounts?

## Decision Drivers

- **Data Model Simplicity**: Minimize schema complexity for a self-referencing
  relationship.
- **Query Performance**: Hierarchy traversal (ancestors + descendants) must be
  fast (<200ms).
- **Domain Integrity**: Prevent cycles, enforce max depth, and isolate tenants.
- **UI Accessibility**: Tree component must meet WCAG 2.1 AA.
- **Scalability**: Support up to 5 levels deep without recursive CTE overhead.

## Considered Options

- **Option 1**: Self-referencing foreign key with recursive application-level
  traversal
- **Option 2**: Materialized path (store full ancestor path as string, e.g.,
  "/root/parent/child")
- **Option 3**: Closure table (separate table storing all ancestor-descendant
  pairs)
- **Option 4**: Nested sets (left/right integer boundaries)

## Decision Outcome

Chosen option: **"Self-referencing foreign key with recursive application-level
traversal"**, because it provides the simplest schema change (single nullable
column), works naturally with Prisma's self-relation support, keeps domain logic
in the application layer where cycle detection and depth validation belong, and
is sufficient for our max-depth-5 constraint.

### Positive Consequences

- **Simple schema**: Single `parentAccountId` column with self-FK and index
- **Prisma-native**: Self-relations work out of the box (`parent`/`children` in
  Prisma schema)
- **Domain control**: Cycle detection and depth validation live in
  AccountService, testable without DB
- **Deletion handling**: ON DELETE SET NULL automatically orphans children
  safely
- **Low migration risk**: Single ALTER TABLE, no new tables needed

### Negative Consequences

- **N+1 risk**: Naive recursive queries can cause N+1; mitigated by loading full
  subtree in one query with `include` depth
- **No native ancestry query**: Finding all ancestors requires walking up the
  chain; acceptable at max depth 5
- **Application-level cycle detection**: Must walk ancestor chain before
  allowing setParent; O(depth) queries

## Pros and Cons of the Options

### Self-Referencing FK (Chosen)

Single nullable `parentAccountId` column referencing same table.

- Good, because minimal schema change (1 column, 1 index, 1 FK)
- Good, because Prisma self-relations are first-class
- Good, because domain validation stays in application layer
- Good, because ON DELETE SET NULL handles parent removal cleanly
- Bad, because finding all ancestors requires iterative queries
- Bad, because cycle detection is application responsibility

### Materialized Path

Store ancestor path as string (e.g., "/acc-1/acc-2/acc-3").

- Good, because ancestor queries are simple string prefix matches
- Good, because subtree queries use LIKE 'path%'
- Bad, because path must be updated on every reparent (cascading update to all
  descendants)
- Bad, because path string parsing is fragile
- Bad, because not natively supported by Prisma
- Bad, because over-engineered for max depth 5

### Closure Table

Separate `account_hierarchy` table with (ancestor_id, descendant_id, depth).

- Good, because all hierarchy queries are simple JOINs
- Good, because performant for deep hierarchies
- Bad, because requires separate table and triggers/hooks to maintain
- Bad, because insert/delete must update O(depth) rows
- Bad, because significantly more complex for our simple max-5 use case

### Nested Sets

Store left/right integer boundaries for tree traversal.

- Good, because subtree queries are range comparisons (fast)
- Good, because ancestry is implicit in the numbering
- Bad, because any insert/move requires renumbering many rows
- Bad, because concurrent modifications are very difficult
- Bad, because significantly over-engineered for max depth 5
- Bad, because poor fit for frequently-modified trees

## Implementation Notes

### Database Schema

```sql
ALTER TABLE "accounts" ADD COLUMN "parentAccountId" TEXT;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_parentAccountId_fkey"
  FOREIGN KEY ("parentAccountId") REFERENCES "accounts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "accounts_parentAccountId_idx" ON "accounts"("parentAccountId");
```

### Prisma Schema

```prisma
model Account {
  // ... existing fields
  parentAccountId String?
  parent          Account?  @relation("AccountHierarchy", fields: [parentAccountId], references: [id], onDelete: SetNull)
  children        Account[] @relation("AccountHierarchy")
}
```

### Domain Rules

1. **No self-reference**: `accountId !== parentAccountId`
2. **No cycles**: Walk ancestor chain from proposed parent; reject if current
   account found
3. **Max depth 5**: Count depth from root to proposed position; reject if > 5
4. **Same tenant**: Both accounts must belong to the same tenant
5. **Idempotent removal**: Removing parent when none exists is a no-op

### Hierarchy Query Strategy

```typescript
// AccountService.getHierarchy(accountId)
// 1. Load current account with children (Prisma include, depth 5)
// 2. Walk parent chain to find ancestors (iterative, max 5 queries)
// 3. Return { ancestors, current (with nested children), rootAccount }
```

### API Endpoints

| Endpoint               | Method   | Description                                |
| ---------------------- | -------- | ------------------------------------------ |
| `account.getHierarchy` | Query    | Returns ancestors + subtree for an account |
| `account.setParent`    | Mutation | Sets or removes parent (null = remove)     |

### Frontend Tree Component

- `role="tree"` container with `aria-label="Account hierarchy"`
- `role="treeitem"` on each node with `aria-expanded` for expandable nodes
- Roving `tabIndex` for keyboard focus management
- Visual highlight on current account with "(current)" label
- Ancestor breadcrumb trail for context above tree

### Event

`AccountHierarchyUpdatedEvent` published on setParent/removeParent with:

- `accountId`, `previousParentId`, `newParentId`, `tenantId`

## Links

- [FLOW-046: Account Management & Hierarchy](../../apps/project-tracker/docs/metrics/_global/flows/FLOW-046.md)
- [PRD: Account Management](../prd-account-management.md)
- Related: [ADR-002 Domain-Driven Design](./ADR-002-domain-driven-design.md)
- Related: [ADR-019 Core CRM Foundation](./ADR-019-core-crm-foundation.md)
- Related: [ADR-004 Tenancy](./ADR-004-multi-tenancy.md)
