# ADR-019: Core CRM Domain Foundations (Contacts, Deals, Tasks, Tickets, Docs)

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Domain Lead, Product Lead, QA Lead (STOA-Domain/Quality)  
**Related Tasks:** IFC-061, IFC-063, IFC-089, IFC-090, IFC-091, IFC-092, IFC-093, IFC-094, IFC-101–IFC-110

## Context and Problem
- Core CRM entities were implemented across multiple tasks without a unified domain contract, risking divergent invariants and regressions.
- Need consistent tenancy, state machines, and performance budgets across contacts, deals, tickets, and documents.

## Decision
1) **DDD Aggregates:** Contacts/Accounts/Deals/Tickets/Docs remain in domain layer; no infra logic inside aggregates.  
2) **Tenancy/Auth:** Every aggregate includes tenant_id; RLS/RBAC per ADR-004 enforced in adapters; API must pass tenant/user.  
3) **State Machines:** Tickets/deals use explicit status enums; SLA timers emitted as domain events; transitions validated in domain services.  
4) **Documents:** Store content hash, MIME, versioning, signed URLs; attachments tied to tenant and owner.  
5) **Performance:** p99 <100ms for core CRUD; indexed queries; pagination mandatory; N+1 eliminated.  
6) **Evidence:** Contract tests + schema snapshots; no placeholder/hardcoded rows in listings.

## Considered Options
- Per-feature bespoke models (rejected: fragmentation).  
- Monolith model (rejected: breaks bounded contexts).  
- Bounded contexts with shared primitives (chosen).

## Consequences
Positive: Consistent behavior, clearer audits, lower regression risk.  
Negative: Slight overhead maintaining shared contracts/tests.

## Implementation Notes
- Reuse `packages/validators` and interface repos in `packages/application`; adapters in `packages/adapters`.  
- SLA logic in domain services; persistence only in adapters.  
- Contract tests enforce RLS, status transitions, non-placeholder data.

## Verification
- MATOP Domain + Quality STOAs check RLS, transitions, contract tests, and non-placeholder data.

## Links
- ADR-001, ADR-002, ADR-003, ADR-004, ADR-008.
