# Architecture Decision Records (ADR) Index

This document provides a comprehensive index of all Architecture Decision Records in the IntelliFlow CRM project.

## ADR Registry

| ADR ID | Title | Status | Date | Category |
|--------|-------|--------|------|----------|
| [ADR-000](../planning/adr/ADR-000-feasibility.md) | Feasibility & Go/No-Go | Accepted | 2025-12-14 | Strategy |
| [ADR-001](../planning/adr/ADR-001-modern-stack.md) | Modern Stack Selection | Accepted | 2025-12-14 | Technology |
| [ADR-002](../planning/adr/ADR-002-domain-driven-design.md) | Domain-Driven Design | Accepted | 2025-12-14 | Architecture |
| [ADR-003](../planning/adr/ADR-003-type-safe-api-design.md) | Type-Safe API Design | Accepted | 2025-12-15 | API |
| [ADR-004](../planning/adr/ADR-004-multi-tenancy.md) | Multi-Tenancy Strategy | Accepted | 2025-12-16 | Security |
| [ADR-005](../planning/adr/ADR-005-workflow-engine.md) | Workflow Engine Selection | Accepted | 2025-12-18 | Workflow |
| [ADR-006](../planning/adr/ADR-006-agent-tools.md) | AI Agent Tools | Accepted | 2025-12-19 | AI |
| [ADR-007](../planning/adr/ADR-007-data-governance.md) | Data Governance | Accepted | 2025-12-20 | Governance |
| [ADR-008](../planning/adr/ADR-008-audit-logging.md) | Audit Logging | Accepted | 2025-12-21 | Security |
| [ADR-009](../planning/adr/ADR-009-zero-trust-security.md) | Zero Trust Security | Accepted | 2025-12-22 | Security |
| [ADR-010](../planning/adr/ADR-010-architecture-boundary-enforcement.md) | Architecture Boundary Enforcement | Accepted | 2025-12-23 | Architecture |
| [ADR-011](../planning/adr/ADR-011-domain-events.md) | Domain Events Implementation | Accepted | 2025-12-24 | Domain |
| [ADR-012](../planning/adr/ADR-012-csv-source-of-truth.md) | CSV Source of Truth for Plan Governance | Accepted | 2025-12-17 | Process |
| [ADR-013](../planning/adr/ADR-013-sprint-scoped-validation.md) | Sprint-Scoped Validation for Plan Linting | Accepted | 2025-12-17 | Process |
| [ADR-014](../planning/adr/ADR-014-workflow-engine-decision.md) | Workflow Engine Decision (IFC-141) | Accepted | 2025-12-29 | Workflow |
| [ADR-015](../planning/adr/ADR-015-security-validation.md) | Security Validation and Remediation | Accepted | 2026-02-02 | Security |
| [ADR-016](../planning/adr/ADR-016-analytics-integrity.md) | Real-Time Analytics Integrity | Accepted | 2026-02-02 | Data |
| [ADR-017](../planning/adr/ADR-017-workflow-reliability.md) | Workflow Reliability & Observability | Accepted | 2026-02-02 | Workflow |
| [ADR-018](../planning/adr/ADR-018-performance-load-testing.md) | Performance and Load Testing Strategy | Accepted | 2026-02-02 | Performance |
| [ADR-019](../planning/adr/ADR-019-core-crm-foundation.md) | Core CRM Domain Foundations | Accepted | 2026-02-02 | Domain |
| [ADR-020](../planning/adr/ADR-020-public-site-auth.md) | Public Site & Auth Funnel | Accepted | 2026-02-02 | Web |
| [ADR-021](../planning/adr/ADR-021-governance-ops-release.md) | Governance, Ops, Release Gates | Accepted | 2026-02-02 | Governance |
| [ADR-022](../planning/adr/ADR-022-ai-features-quality.md) | AI Features Quality & Safety | Accepted | 2026-02-02 | AI |
| [ADR-023](../planning/adr/ADR-023-communications-inbox.md) | Communications & Inbox (Email/SMS/Webhooks) | Accepted | 2026-02-02 | Integration |
| [ADR-024](../planning/adr/ADR-024-scheduling-calendar.md) | Scheduling & Calendar Integration | Accepted | 2026-02-02 | Scheduling |

## ADR Categories

### Security Decisions
- ADR-004: Multi-Tenancy Strategy (User-level with RLS)
- ADR-008: Audit Logging Requirements
- ADR-009: Zero Trust Security Model
- ADR-015: Security Validation and Remediation
- ADR-021: Governance, Ops, Release Gates (supply chain + promotion)

### Workflow Decisions
- ADR-005: Workflow Engine Selection (LangGraph + BullMQ)
- ADR-014: Temporal vs n8n vs Custom (IFC-141)
- ADR-017: Workflow Reliability & Observability
- ADR-024: Scheduling & Calendar Integration

### AI Decisions
- ADR-006: AI Agent Tools and Integration
- ADR-022: AI Features Quality & Safety

### Governance Decisions
- ADR-007: Data Governance Policies
- ADR-012: CSV Source of Truth for Plan Governance
- ADR-013: Sprint-Scoped Validation for Plan Linting
- ADR-021: Governance, Ops, Release Gates (promotion/SLO/incident)

### Domain Decisions
- ADR-011: Domain Events Implementation
- ADR-019: Core CRM Domain Foundations (contacts/deals/tickets/docs)

### Data / Analytics Decisions
- ADR-016: Real-Time Analytics Integrity
- ADR-019: Core CRM Domain Foundations (analytics aspects)

### Performance Decisions
- ADR-018: Performance and Load Testing Strategy

### Web/Auth Decisions
- ADR-020: Public Site & Auth Funnel

### Communications / Integration Decisions
- ADR-023: Communications & Inbox (Email/SMS/Webhooks)

### Scheduling Decisions
- ADR-024: Scheduling & Calendar Integration

## ADR Lifecycle

1. **Draft** - Initial proposal, open for discussion
2. **Proposed** - Formal proposal ready for review
3. **Accepted** - Decision approved and ready for implementation
4. **Deprecated** - Superseded by a newer decision
5. **Rejected** - Proposal was not accepted

## Creating New ADRs

1. Copy the template from `docs/planning/adr/template.md`
2. Use the next available ADR number
3. Follow the naming convention: `ADR-XXX-brief-description.md`
4. Submit for review via PR
5. Update this index after acceptance

## Related Documents

- [ADR Template](../planning/adr/template.md)
- [Architecture Overview](../architecture/overview.md)
- [Security Documentation](../security/README.md)
- [Compliance Dashboard](../../artifacts/misc/compliance-dashboard-mockup.md)

---

*Last Updated: 2026-02-02*
*Maintained by: Engineering Team*
