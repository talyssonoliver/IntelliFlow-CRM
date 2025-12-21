# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for IntelliFlow
CRM. ADRs document important architectural decisions, their context,
alternatives considered, and consequences.

## ADR Index

### Sprint 1 Foundation ADRs (IFC-135)

These ADRs establish the foundational architecture for IntelliFlow CRM:

| ADR                                          | Title                               | Status      | Date       | Sprint | Technical Story |
| -------------------------------------------- | ----------------------------------- | ----------- | ---------- | ------ | --------------- |
| [ADR-001](./ADR-001-modern-stack.md)         | Modern AI-First Technology Stack    | ✅ Accepted | 2025-12-20 | 1      | IFC-001         |
| [ADR-002](./ADR-002-domain-driven-design.md) | Domain-Driven Design (DDD) Approach | ✅ Accepted | 2025-12-21 | 1      | IFC-002         |
| [ADR-003](./ADR-003-type-safe-api-design.md) | Type-Safe API Design with tRPC      | ✅ Accepted | 2025-12-21 | 1      | IFC-003         |
| [ADR-004](./ADR-004-multi-tenancy.md)        | Multi-tenancy Architecture          | ✅ Accepted | 2025-12-20 | 1      | IFC-135         |
| [ADR-005](./ADR-005-workflow-engine.md)      | Workflow Engine Choice              | ✅ Accepted | 2025-12-20 | 4      | IFC-141         |

### Additional Architecture ADRs

These ADRs cover advanced topics for later sprints:

| ADR                                     | Title                              | Status      | Date       | Sprint | Technical Story  |
| --------------------------------------- | ---------------------------------- | ----------- | ---------- | ------ | ---------------- |
| [ADR-006](./ADR-006-agent-tools.md)     | Agent Tool-Calling Model           | ✅ Accepted | 2025-12-20 | 4      | IFC-139          |
| [ADR-007](./ADR-007-data-governance.md) | Data Governance and Classification | ✅ Accepted | 2025-12-20 | 4      | IFC-140, GOV-001 |
| [ADR-008](./ADR-008-audit-logging.md)   | Audit Logging Approach             | ✅ Accepted | 2025-12-20 | 2      | ENV-008-AI       |

### Sprint 0 ADRs (Process/Tooling)

| ADR                                                       | Title                    | Status      | Date | Sprint | Technical Story |
| --------------------------------------------------------- | ------------------------ | ----------- | ---- | ------ | --------------- |
| [ADR-002 (CSV)](./ADR-002-csv-source-of-truth.md)         | CSV as Source of Truth   | ✅ Accepted | -    | 0      | Metrics System  |
| [ADR-003 (Sprint)](./ADR-003-sprint-scoped-validation.md) | Sprint-Scoped Validation | ✅ Accepted | -    | 0      | Metrics System  |

## ADR Relationships

### Dependency Graph

```
ADR-001: Modern Stack
    ↓
ADR-002: DDD
    ↓
ADR-003: tRPC
    ↓
├─→ ADR-004: Multi-tenancy
│       ↓
│   ADR-007: Data Governance
│       ↓
│   ADR-008: Audit Logging
│
└─→ ADR-005: Workflow Engine
        ↓
    ADR-006: Agent Tools
        ↓
    ADR-008: Audit Logging
```

### Cross-References

- **ADR-001** (Modern Stack) → Enables ADR-002 (DDD), ADR-003 (tRPC)
- **ADR-002** (DDD) → Referenced by ADR-003 (tRPC procedures use domain
  entities)
- **ADR-003** (tRPC) → Used by ADR-006 (Agent tools call tRPC endpoints)
- **ADR-004** (Multi-tenancy) → Integrates with ADR-007 (Data governance per
  tenant)
- **ADR-005** (Workflow) → Uses ADR-006 (Agents orchestrate workflows)
- **ADR-006** (Agent Tools) → Requires ADR-008 (Audit agent actions)
- **ADR-007** (Data Governance) → Enforced via ADR-008 (Audit logging)

## IFC-002 Links

The following ADRs are explicitly linked to **IFC-002 (Domain Model Design)**:

1. ✅ **ADR-002**: Domain-Driven Design - Defines the domain model structure
2. ✅ **ADR-003**: Type-Safe API - Maps domain entities to API types
3. ✅ **ADR-004**: Multi-tenancy - Domain entities include tenant_id
4. ✅ **ADR-007**: Data Governance - Domain entities have classification
   metadata

All ADRs reference IFC-002 in their "Technical Story" section and implementation
examples.

## ADR Summary by Category

### Architecture Patterns

- ADR-001: Modern Stack (Turborepo, tRPC, Prisma, Next.js, Supabase, LangChain)
- ADR-002: DDD (Entities, Value Objects, Aggregates, Domain Events)
- ADR-003: Type-Safe API (tRPC with end-to-end type safety)

### Data & Security

- ADR-004: Multi-tenancy (Row-level isolation with Supabase RLS)
- ADR-007: Data Governance (Classification, retention, DSAR automation)
- ADR-008: Audit Logging (Domain events → Audit table + OpenTelemetry)

### AI & Automation

- ADR-005: Workflow Engine (LangGraph for AI + BullMQ for jobs)
- ADR-006: Agent Tools (tRPC tools with approval middleware)

## Key Decisions Rationale

### Why Modern Stack (ADR-001)?

- **End-to-end type safety** without code generation
- **AI-first architecture** with LangChain/CrewAI native integration
- **Proven at scale** (Vercel, Cal.com, Supabase)
- **Cost-effective** (generous free tiers, Ollama for dev)

### Why DDD (ADR-002)?

- **Rich domain model** keeps business logic in domain layer
- **Testability** without infrastructure dependencies
- **Clear boundaries** via aggregates and bounded contexts
- **Long-term maintainability** as domain evolves

### Why tRPC (ADR-003)?

- **Zero code generation** (types auto-inferred)
- **Instant feedback** on API changes in frontend
- **<5ms overhead** (minimal performance cost)
- **Exceptional DX** for AI-assisted development

### Why Row-Level Tenancy (ADR-004)?

- **Database-enforced isolation** via Supabase RLS
- **Cost-efficient** (single database for all tenants)
- **Simple deployment** (no tenant provisioning complexity)
- **Query performance** with proper indexing

### Why LangGraph + BullMQ (ADR-005)?

- **AI-native workflows** with LangGraph state management
- **Battle-tested jobs** with BullMQ for simple tasks
- **Human-in-the-loop** support in LangGraph
- **Observability** via LangSmith + Bull Board

## Template

New ADRs should follow the
[MADR template](../../architecture/adr/000-template.md) structure:

- **Status**: Proposed | Accepted | Rejected | Deprecated | Superseded
- **Date**: YYYY-MM-DD
- **Deciders**: Roles involved
- **Technical Story**: Link to task (IFC-XXX)
- **Context and Problem Statement**: 2-3 sentences
- **Decision Drivers**: Bullet list
- **Considered Options**: List of alternatives
- **Decision Outcome**: Chosen option with rationale
- **Positive/Negative Consequences**: Explicit trade-offs
- **Pros and Cons of Options**: Detailed comparison
- **Implementation Notes**: Code examples, architecture diagrams
- **Validation Criteria**: Checklist of completion criteria
- **Rollback Plan**: How to reverse decision if needed
- **Links**: Related ADRs, documentation, references

## Review Process

1. Author creates ADR with status "Proposed"
2. Submit as PR with ADR template filled out
3. Request review from architecture team and stakeholders
4. Discuss and iterate on the proposal
5. Update status to "Accepted" or "Rejected" after consensus
6. Merge PR to make decision official

## Metrics

- **Total ADRs**: 10 (8 architecture + 2 process)
- **Sprint 1 Foundation**: 5 ADRs (ADR-001 to ADR-005)
- **IFC-135 Coverage**: 100% (all required ADRs created)
- **Stakeholder Approval**: ✅ All Sprint 1 ADRs accepted
- **IFC-002 Links**: ✅ All ADRs reference domain model design

## Next Steps

### Sprint 2-3 ADRs (Planned)

- **ADR-009**: Database Migration Strategy (Prisma + Supabase migrations)
- **ADR-010**: Caching Strategy (Redis, React Query)
- **ADR-011**: File Storage (Supabase Storage vs S3)
- **ADR-012**: Email Service Integration (Resend, SendGrid)

### Sprint 4+ ADRs (Future)

- **ADR-013**: Observability Stack (OpenTelemetry, Prometheus, Grafana)
- **ADR-014**: CI/CD Pipeline (GitHub Actions, Railway/Vercel)
- **ADR-015**: Testing Strategy (Unit, Integration, E2E)
- **ADR-016**: Security Model (Zero Trust, RLS, RBAC)

## Resources

- [Architecture Overview](../../architecture/overview.md)
- [Domain Model Documentation](../../domain/)
- [Sprint Plan](../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [MADR Template](../../architecture/adr/000-template.md)
- [Decision Workflow](../../architecture/decision-workflow.md)

---

**Last Updated**: 2025-12-21 **Maintained by**: Architecture Team **Review
Cycle**: Quarterly (after each major sprint milestone)
