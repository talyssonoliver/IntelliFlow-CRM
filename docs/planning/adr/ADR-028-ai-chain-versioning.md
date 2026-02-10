# ADR-028: AI Chain Versioning and Lifecycle Management

**Status:** Accepted
**Date:** 2026-02-09
**Deciders:** AI Lead, Backend Lead, Product Lead
**Related Tasks:** IFC-086, PG-128, PG-104

## Context and Problem Statement

IntelliFlow uses multiple AI chains (scoring, qualification, email writing, follow-up) with different prompts, models, and parameters. We need a system to version these chains, manage their lifecycle (draft → active → deprecated → archived), support A/B testing between versions, and maintain a complete audit trail. How should we architect the versioning, rollout strategy, and memory budget tracking?

## Decision Drivers

- **Safety**: Activating a new version must not disrupt production without rollback capability.
- **Auditability**: Every version change must be traceable to a user, timestamp, and reason.
- **Flexibility**: Support immediate rollout, percentage-based rollout, and A/B testing.
- **Budget Control**: Zep episode usage must be tracked to avoid exceeding free tier limits.
- **Simplicity**: Avoid over-engineering; 4 chain types with ~10 versions each is the expected scale.

## Considered Options

- **Option 1**: Version control in Git (prompts as files, GitOps workflow).
- **Option 2**: Database-backed versioning with application-level lifecycle management.
- **Option 3**: External prompt management platform (e.g., PromptLayer, Langfuse).

## Decision Outcome

Chosen option: **"Database-backed versioning with application-level lifecycle management"**, because it keeps all CRM data in one place (PostgreSQL), enables tenant-scoped versioning, integrates naturally with tRPC and the existing hexagonal architecture, and avoids external vendor dependency for a core capability.

### Positive Consequences

- **Single source of truth**: Versions stored alongside CRM data with tenant isolation.
- **Full lifecycle**: DRAFT → ACTIVE → DEPRECATED → ARCHIVED with domain event emission.
- **Rollback**: Creates new version from any previous version (never mutates history).
- **Audit trail**: Every action logged with user, timestamp, previous state, new state, and reason.
- **Tenant isolation**: Each tenant manages their own chain versions independently.

### Negative Consequences

- **No Git history**: Prompt changes don't appear in code review; mitigated by audit log.
- **Schema complexity**: ChainVersion + ChainVersionAudit tables added to schema.
- **No cross-tenant sharing**: Tenants can't share versions; acceptable for current scale.

## Implementation Notes

### Domain Model

```typescript
// Chain types (from domain constants)
const CHAIN_TYPES = ['SCORING', 'QUALIFICATION', 'EMAIL_WRITER', 'FOLLOWUP'] as const;

// Version statuses (lifecycle states)
const CHAIN_VERSION_STATUSES = ['DRAFT', 'ACTIVE', 'DEPRECATED', 'ARCHIVED'] as const;

// Rollout strategies
const ROLLOUT_STRATEGIES = ['IMMEDIATE', 'PERCENTAGE', 'AB_TEST'] as const;
```

### State Machine

```
DRAFT ──→ ACTIVE ──→ DEPRECATED ──→ ARCHIVED
  │                                     ↑
  └─────────────────────────────────────┘ (direct archive)
```

Rules:
- Only one ACTIVE version per chain type per tenant.
- Activating a version automatically deprecates the current active version.
- Rollback creates a NEW version (clone) with DRAFT status; original remains unchanged.
- ARCHIVED is terminal; version can only be viewed, not reactivated.

### Rollout Strategy

| Strategy | Behavior |
|----------|----------|
| IMMEDIATE | 100% traffic to new version on activation |
| PERCENTAGE | Split traffic by configured percentage (e.g., 80/20) |
| AB_TEST | Route traffic to control/treatment versions with experiment tracking |

### Zep Episode Budget

Zep memory adapter tracks episode usage:
- `used`: Current episode count.
- `total`: Plan episode limit (free tier = 1000).
- `warningThreshold`: 80% of total.
- `hardLimit`: 95% of total.
- Budget synced from Zep Cloud API on adapter initialization; persisted locally for offline access.

### Service Architecture

```
ChainVersionService (Application Layer)
  ├── ChainVersionRepositoryPort (Domain Port)
  ├── ChainVersionAuditRepositoryPort (Domain Port)
  ├── EventBus (for domain events)
  └── Methods: create, activate, deprecate, archive, rollback, compare, getAuditLog
```

### Access Control

| Action | Required Role |
|--------|---------------|
| View versions | Tenant member |
| Create/update draft | Tenant member |
| Activate/deprecate/archive/rollback | Admin |
| View audit log | Admin |

## Verification

- Lifecycle transitions enforced: invalid transitions (e.g., ARCHIVED → ACTIVE) rejected with domain error.
- Only one ACTIVE version per chain type per tenant at any time.
- Rollback creates new version, never mutates existing records.
- Audit log entries created for every state change.
- Zep budget gauge reflects actual cloud usage within 5-minute sync window.

## Links

- [FLOW-045: AI Chain Versioning Admin UI](../../apps/project-tracker/docs/metrics/_global/flows/FLOW-045.md)
- [PRD: AI Chain Versioning Admin](../prd-ai-chain-versioning.md)
- Related: [ADR-022 AI Features Quality](./ADR-022-ai-features-quality.md)
- Related: [ADR-001 Modern Stack](./ADR-001-modern-stack.md)
