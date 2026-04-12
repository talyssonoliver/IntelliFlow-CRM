# PRD: AI Chain Versioning Admin (PG-128)

**Version:** 1.0 **Date:** 2026-02-09 **Owners:** AI Lead, Frontend Lead
**Related Tasks:** PG-128, IFC-086, PG-104 **Decision Records:**
ADR-028-ai-chain-versioning.md **Implements:** FLOW-045

## Summary

Provide a centralized admin interface for managing AI chain/prompt versions,
monitoring Zep episode budget, configuring A/B experiments, and viewing audit
logs. Built on top of the IFC-086 backend (ChainVersionService, chain version
router, Zep memory adapter).

## Goals

- View, filter, and search all chain versions across 4 chain types (SCORING,
  QUALIFICATION, EMAIL_WRITER, FOLLOWUP).
- Create new chain versions with custom prompts, model selection, and
  temperature configuration.
- Activate, deprecate, archive, and rollback versions with audit trail and
  confirmation dialogs.
- Compare two versions side-by-side (prompt diff, config diff).
- Monitor Zep episode budget with visual gauge (green/yellow/red thresholds).
- Configure A/B tests with percentage-based rollout strategies.
- View complete audit log with filters (version, action, user, date range).

## Non-Goals

- Prompt engineering assistance or auto-optimization (future AI feature).
- Cost tracking per chain version (covered by FinOps, IFC-055).
- Real-time latency monitoring per version (covered by observability, IFC-074).

## Users & Use Cases

- **AI Admin**: Creates and manages chain versions, monitors budget, runs A/B
  tests.
- **Tenant Member**: Views active versions and their configurations (read-only).
- **System**: Automatically selects active version for each chain type at
  inference time.

## Functional Requirements

### Overview Dashboard (FR-1)

- Active version summary for each of the 4 chain types.
- Zep episode budget gauge (used / total / remaining).
- Recent activity timeline (last 10 version changes).

### Chain Versions Management (FR-2)

- Filterable table by chain type and status (DRAFT, ACTIVE, DEPRECATED,
  ARCHIVED).
- Version cards showing: version ID, status badge, model, temperature, max
  tokens, rollout strategy, created by/at.
- Action buttons: Activate (admin), Deprecate (admin), Archive (admin), Rollback
  (admin, requires reason).
- Create new version modal: chain type, prompt editor, model selector,
  temperature slider, max tokens input.

### Version Comparison (FR-3)

- Select two versions from dropdowns.
- Side-by-side diff view for prompt text and configuration parameters.

### A/B Testing (FR-4)

- Active experiments list with status indicators.
- Configuration form: control version, treatment version, traffic split
  percentage.
- Results dashboard showing performance metrics per variant (when available).

### Zep Memory Budget (FR-5)

- Circular progress gauge with color coding: green (<80%), yellow (80-95%), red
  (>95%).
- Usage trend chart (last 30 days).
- Sync status indicator (last synced timestamp, cloud vs local).

### Audit Log (FR-6)

- Filterable table: version, action type, user, date range.
- Entries include: timestamp, user, action, previous state, new state, reason
  (for rollbacks).

## Non-Functional Requirements

- **Performance**: Page load <500ms, version list query <200ms, comparison
  <300ms, activate/rollback <1s.
- **Security**: Version viewing requires tenant membership;
  activate/deprecate/archive/rollback require admin role.
- **Accessibility**: All interactive elements keyboard accessible; status badges
  use both color and icon.
- **Lighthouse**: Score >=90 on settings/ai route.

## Metrics

- Page load <500ms P95.
- Version list query <200ms P95.
- Lighthouse >=90.
- Test coverage >90%.

## Acceptance Criteria

- All 4 chain types display with correct active version.
- Create version → Activate → Deprecate lifecycle works end-to-end.
- Rollback creates new version from selected version and requires reason.
- Comparison view shows meaningful diff between two versions.
- Zep budget gauge reflects actual usage from backend.
- Audit log captures all version lifecycle events with correct metadata.
- Admin-only actions are hidden/disabled for non-admin users.

## Dependencies

- IFC-086 (Model Versioning Backend) - COMPLETED.
- PG-104 (Settings Infrastructure) - PLANNED (dependency for settings route).
- ADR-022 (AI Features Quality).
- ADR-028 (AI Chain Versioning).

## Risks / Mitigations

- **Risk**: Activating broken version degrades AI quality. **Mitigation**:
  Confirmation dialog, rollback capability, and audit trail.
- **Risk**: Zep cloud API unavailable. **Mitigation**: Fallback to local
  persisted data with "Cloud sync unavailable" warning.
- **Risk**: A/B test configuration errors cause traffic imbalance.
  **Mitigation**: Validation that percentages sum to 100, and minimum 5% per
  variant.
