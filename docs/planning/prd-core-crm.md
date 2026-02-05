# PRD: Core CRM Workspace (Contacts, Deals, Pipeline, Tickets, Documents)

**Version:** 1.0  
**Date:** 2026-02-02  
**Owners:** Product Lead, Domain Lead  
**Related Tasks:** IFC-061, IFC-063, IFC-089, IFC-090, IFC-091, IFC-092, IFC-093, IFC-094, IFC-101–IFC-110  
**Decision Records:** ADR-019-core-crm-foundation.md

## Summary
Deliver a cohesive CRM workspace covering contacts, accounts, deals, tasks/tickets, and document handling with consistent tenancy, state machines, and performance budgets.

## Goals
- Unified UX for core CRM entities with p99 <100ms for core CRUD.
- Enforced tenancy/RLS and domain invariants across all entities.
- SLA-aware ticketing with status transitions and auditability.
- Document storage with hashing, versioning, and secure access.

## Non-Goals
- Advanced analytics dashboards (handled separately).
- Marketing site or auth funnel (see PRD-public-site-auth).

## Users & Use Cases
- Sales/CS reps: manage contacts/deals, update pipeline, attach documents.
- Support agents: log tickets with SLA timers and status flows.
- Managers: view consistent lists without placeholder data; export via API.

## Functional Requirements
- CRUD for contacts/accounts/deals/tickets/docs with pagination, search, filters.
- Ticket and deal status enums with validated transitions; SLA timers emitted as events.
- Documents: content hash, MIME validation, versioning, signed URL retrieval.
- RLS/RBAC enforced at API layer; tenant_id required on all writes/reads.

## Non-Functional Requirements
- Performance: p99 <100ms CRUD; indexed queries; no N+1 on list pages.
- Security: tenancy isolation per ADR-004; audit logging per ADR-008.
- Reliability: contract tests for transitions and RLS; zero placeholder data.

## Metrics
- p99 latency (CRUD) <100ms; list endpoints <150ms.
- SLA breach rate <1%; zero unauthorized cross-tenant access.
- Zero placeholder or null KPI rows in lists.

## Acceptance Criteria
- Contract tests cover RLS, status transitions, and document access.
- No hardcoded/placeholder data in UI/API responses.
- Perf test results attached meeting budgets.

## Dependencies
- ADR-001, ADR-002, ADR-003, ADR-004, ADR-008, ADR-019.

## Risks / Mitigations
- Risk: Performance regressions under load → Mitigate with perf tests and indexes.
- Risk: Cross-tenant leakage → Mitigate with RLS tests and contract checks.
