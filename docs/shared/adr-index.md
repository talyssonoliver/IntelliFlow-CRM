# Architecture Decision Records (ADR) Index

This document provides a comprehensive index of all Architecture Decision Records in the IntelliFlow CRM project.

## ADR Registry

| ADR ID | Title | Status | Date | Category |
|--------|-------|--------|------|----------|
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
| [ADR-011](../shared/ADR-011-domain-events.md) | Domain Events Implementation | Accepted | 2025-12-24 | Domain |
| [ADR-WORKFLOW](../adr/adr-workflow-decision.md) | Workflow Engine Decision (IFC-141) | Accepted | 2025-12-29 | Workflow |

## ADR Categories

### Technology Decisions
- ADR-001: Modern Stack Selection (Next.js, tRPC, Prisma, TypeScript)

### Architecture Decisions
- ADR-002: Domain-Driven Design with Hexagonal Architecture
- ADR-010: Architecture Boundary Enforcement

### API Decisions
- ADR-003: Type-Safe API Design with tRPC

### Security Decisions
- ADR-004: Multi-Tenancy Strategy (User-level with RLS)
- ADR-008: Audit Logging Requirements
- ADR-009: Zero Trust Security Model

### Workflow Decisions
- ADR-005: Workflow Engine Selection (LangGraph + BullMQ)
- ADR-WORKFLOW: Temporal for Durable Workflows (IFC-141)

### AI Decisions
- ADR-006: AI Agent Tools and Integration

### Governance Decisions
- ADR-007: Data Governance Policies

### Domain Decisions
- ADR-011: Domain Events Implementation

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

*Last Updated: 2025-12-29*
*Maintained by: Engineering Team*
