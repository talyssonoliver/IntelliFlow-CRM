# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records (ADRs) for IntelliFlow
CRM. ADRs document important architectural decisions, their context,
alternatives considered, and consequences.

## ADR Index

### Sprint 1 Foundation ADRs (IFC-135)

These ADRs establish the foundational architecture for IntelliFlow CRM:

| ADR                                          | Title                                                                | Status                                        | Date       | Sprint | Technical Story  |
| -------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- | ---------- | ------ | ---------------- |
| [ADR-001](./ADR-001-modern-stack.md)         | Modern AI-First Technology Stack                                     | ✅ Accepted (partially superseded by ADR-048) | 2025-12-20 | 1      | IFC-001          |
| [ADR-002](./ADR-002-domain-driven-design.md) | Domain-Driven Design (DDD) Approach                                  | ✅ Accepted                                   | 2025-12-21 | 1      | IFC-002          |
| [ADR-003](./ADR-003-type-safe-api-design.md) | Type-Safe API Design with tRPC                                       | ✅ Accepted                                   | 2025-12-21 | 1      | IFC-003          |
| [ADR-004](./ADR-004-multi-tenancy.md)        | Multi-tenancy Architecture                                           | ✅ Accepted                                   | 2025-12-20 | 1      | IFC-135          |
| [ADR-005](./ADR-005-workflow-engine.md)      | Workflow Engine Architecture (LangGraph + Temporal + BullMQ + Rules) | ✅ Accepted                                   | 2025-12-29 | 4      | IFC-135, IFC-141 |

### Additional Architecture ADRs

These ADRs cover advanced topics for later sprints:

| ADR                                     | Title                              | Status                                        | Date       | Sprint | Technical Story  |
| --------------------------------------- | ---------------------------------- | --------------------------------------------- | ---------- | ------ | ---------------- |
| [ADR-006](./ADR-006-agent-tools.md)     | Agent Tool-Calling Model           | ✅ Accepted (partially superseded by ADR-048) | 2025-12-20 | 4      | IFC-139          |
| [ADR-007](./ADR-007-data-governance.md) | Data Governance and Classification | ✅ Accepted                                   | 2025-12-20 | 4      | IFC-140, GOV-001 |
| [ADR-008](./ADR-008-audit-logging.md)   | Audit Logging Approach             | ✅ Accepted                                   | 2025-12-20 | 2      | ENV-008-AI       |

### Sprint 0 ADRs (Process/Tooling)

| ADR                                                       | Title                                | Status                                        | Date | Sprint | Technical Story                            |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------------- | ---- | ------ | ------------------------------------------ |
| [ADR-012 (CSV)](./ADR-012-csv-source-of-truth.md)         | CSV as Source of Truth               | ✅ Accepted                                   | -    | 0      | Metrics System                             |
| [ADR-013 (Sprint)](./ADR-013-sprint-scoped-validation.md) | Sprint-Scoped Validation             | ✅ Accepted                                   | -    | 0      | Metrics System                             |
| [ADR-015](./ADR-015-security-validation.md)               | Security Validation & Remediation    | ✅ Accepted                                   | -    | 0      | ENV-013-AI, IFC-046, IFC-040               |
| [ADR-016](./ADR-016-analytics-integrity.md)               | Real-Time Analytics Integrity        | ✅ Accepted                                   | -    | 0      | IFC-037, IFC-038                           |
| [ADR-017](./ADR-017-workflow-reliability.md)              | Workflow Reliability & Observability | ✅ Accepted                                   | -    | 0      | IFC-029-033                                |
| [ADR-018](./ADR-018-performance-load-testing.md)          | Performance & Load Testing Strategy  | ✅ Accepted                                   | -    | 0      | IFC-047, IFC-033                           |
| [ADR-019](./ADR-019-core-crm-foundation.md)               | Core CRM Domain Foundations          | ✅ Accepted                                   | -    | 0      | IFC-061, IFC-063, IFC-089-094, IFC-101-110 |
| [ADR-020](./ADR-020-public-site-auth.md)                  | Public Site & Auth Funnel            | ✅ Accepted                                   | -    | 0      | PG-001-018                                 |
| [ADR-021](./ADR-021-governance-ops-release.md)            | Governance, Ops, Release Gates       | ✅ Accepted                                   | -    | 0      | IFC-130, IFC-132-134, IFC-142, IFC-160     |
| [ADR-022](./ADR-022-ai-features-quality.md)               | AI Features Quality & Safety         | ✅ Accepted (partially superseded by ADR-048) | -    | 0      | IFC-039, IFC-085, IFC-086, IFC-095         |
| [ADR-023](./ADR-023-communications-inbox.md)              | Communications & Inbox               | ✅ Accepted                                   | -    | 0      | IFC-144, IFC-170-173                       |
| [ADR-024](./ADR-024-scheduling-calendar.md)               | Scheduling & Calendar Integration    | ✅ Accepted                                   | -    | 0      | IFC-136-138, IFC-172                       |

### Auth & Security ADRs

| ADR                                                    | Title                                   | Status      | Date       | Sprint | Technical Story |
| ------------------------------------------------------ | --------------------------------------- | ----------- | ---------- | ------ | --------------- |
| [ADR-039](./ADR-039-saml-sso-integration.md)           | SAML SSO Integration for Enterprise     | ✅ Accepted | 2026-02-25 | 15     | PG-124          |
| [ADR-045](./ADR-045-entity-detail-componentization.md) | CRM Entity Detail Page Componentization | ✅ Accepted | 2026-03-16 | 19     | IFC-305         |

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

New ADRs should follow the [MADR template](./template.md) structure:

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

- **Total ADRs**: 48 (ADR-000 through ADR-048, minus ADR-014 consolidated into
  ADR-005)
- **Sprint 1 Foundation**: 5 ADRs (ADR-001 to ADR-005)
- **High-Risk Coverage**: Security (ADR-015), Analytics (ADR-016), Workflow
  (ADR-017), Performance (ADR-018), Core CRM (ADR-019), Web/Auth (ADR-020),
  Governance/Release (ADR-021), AI Safety (ADR-022), Comms (ADR-023), Scheduling
  (ADR-024)
- **Stakeholder Approval**: ✅ Accepted
- **IFC-002 Links**: ✅ All ADRs reference domain model design

### Retroactive ADRs (Backfilled 2026-02-22)

| ADR                                               | Title                              | Status                                        | Date       | Technical Story                                               |
| ------------------------------------------------- | ---------------------------------- | --------------------------------------------- | ---------- | ------------------------------------------------------------- |
| [ADR-030](./ADR-030-environment-setup.md)         | Environment & Infrastructure Setup | ✅ Accepted                                   | 2026-02-22 | ENV-001-AI, ENV-003-AI, ENV-004-AI, ENV-005-AI, ENV-009-AI    |
| [ADR-031](./ADR-031-ai-pipeline-design.md)        | AI Pipeline Architecture           | ✅ Accepted (partially superseded by ADR-048) | 2026-02-22 | ENV-011-AI, IFC-005, IFC-015, IFC-020, IFC-021                |
| [ADR-032](./ADR-032-feature-flags-performance.md) | Feature Flags & Performance        | ✅ Accepted                                   | 2026-02-22 | ENV-014-AI, ENV-015-AI                                        |
| [ADR-033](./ADR-033-security-hardening.md)        | Security Hardening                 | ✅ Accepted                                   | 2026-02-22 | IFC-073, IFC-077, IFC-113, IFC-114, IFC-121, IFC-125, IFC-143 |
| [ADR-034](./ADR-034-infrastructure-platform.md)   | Infrastructure & Platform          | ✅ Accepted                                   | 2026-02-22 | IFC-075, IFC-078, IFC-111, IFC-112, IFC-116, IFC-163, IFC-167 |
| [ADR-035](./ADR-035-case-document-pipeline.md)    | Case Document Pipeline             | ✅ Accepted                                   | 2026-02-22 | IFC-152–IFC-156                                               |
| [ADR-036](./ADR-036-event-consumers.md)           | Event Consumer Framework           | ✅ Accepted                                   | 2026-02-22 | IFC-151, IFC-168                                              |
| [ADR-037](./ADR-037-ai-output-review.md)          | AI Output Review Layer             | ✅ Accepted                                   | 2026-02-22 | IFC-176–IFC-181                                               |

### Sprint 14 ADRs (Accessibility & Documentation)

| ADR                                                | Title                      | Status      | Date       | Technical Story  |
| -------------------------------------------------- | -------------------------- | ----------- | ---------- | ---------------- |
| [ADR-038](./ADR-038-accessibility-architecture.md) | Accessibility Architecture | ✅ Accepted | 2026-02-23 | DOC-007, DOC-008 |

### Sprint 15+ ADRs (Backfilled 2026-04-15)

Previously missing from the index — backfilled during the ADR consolidation:

| ADR                                                       | Title                                         | Status      | Date       | Technical Story  |
| --------------------------------------------------------- | --------------------------------------------- | ----------- | ---------- | ---------------- |
| [ADR-000](./ADR-000-feasibility.md)                       | Project Feasibility & Business Case           | ⏳ Proposed | 2025-12-14 | EXC-INIT-001     |
| [ADR-009](./ADR-009-zero-trust-security.md)               | Zero-Trust Security Architecture              | ✅ Accepted | 2025-12-21 | IFC-098          |
| [ADR-010](./ADR-010-architecture-boundary-enforcement.md) | Architecture Boundary Enforcement             | ✅ Accepted | 2025-12-22 | IFC-010          |
| [ADR-011](./ADR-011-domain-events.md)                     | Domain Event Architecture                     | ✅ Accepted | 2025-12-23 | IFC-011, IFC-150 |
| [ADR-025](./ADR-025-tenant-id-normalization.md)           | TenantId Normalization Across Schema          | ⏳ Proposed | 2026-02-03 | IFC-127          |
| [ADR-026](./ADR-026-account-hierarchy.md)                 | Account Hierarchy Model                       | ✅ Accepted | 2026-02-08 | IFC-100          |
| [ADR-027](./ADR-027-authenticated-home-composition.md)    | Authenticated Home Page Composition           | ✅ Accepted | 2026-02-15 | PG-104           |
| [ADR-028](./ADR-028-ai-chain-versioning.md)               | AI Chain Versioning System                    | ✅ Accepted | 2026-02-09 | IFC-086          |
| [ADR-029](./ADR-029-billing-architecture.md)              | Billing & Subscription Architecture           | ✅ Accepted | 2026-02-22 | IFC-077          |
| [ADR-040](./ADR-040-calendar-ui-library.md)               | Calendar UI Library Selection                 | ✅ Accepted | 2026-03-01 | PG-139           |
| [ADR-041](./ADR-041-email-outbound-provider.md)           | Outbound Email Provider                       | ✅ Accepted | 2026-03-04 | IFC-223          |
| [ADR-042](./ADR-042-router-middleware-standardization.md) | tRPC Router Middleware Standardization        | ✅ Accepted | 2026-03-08 | IFC-185          |
| [ADR-043](./ADR-043-ai-monitoring-data-persistence.md)    | AI Monitoring Data Persistence                | ⏳ Proposed | 2026-03-16 | IFC-297          |
| [ADR-048](./ADR-048-hybrid-ai-inference.md)               | Hybrid AI Inference (LiteLLM Proxy + Factory) | ✅ Accepted | 2026-04-16 | Sprint 17        |
| [ADR-044](./ADR-044-timezone-strategy.md)                 | UTC-First Timezone Strategy                   | ✅ Accepted | 2026-03-15 | IFC-191, IFC-192 |
| [ADR-046](./ADR-046-material-symbols-font-subsetting.md)  | Material Symbols Font Subsetting              | ⏳ Proposed | 2026-04-13 | PG-216           |
| [ADR-047](./ADR-047-hexagonal-architecture.md)            | Hexagonal Architecture (Ports & Adapters)     | ✅ Accepted | 2025-12-21 | IFC-002          |

### Consolidated / Removed ADRs

- **ADR-014 (Workflow Engine Selection)** — merged into ADR-005 on 2026-04-15.
  ADR-005 now covers the full 4-engine architecture (LangGraph + Temporal +
  BullMQ + Rules Engine). Original two-phase decision history preserved in
  ADR-005's Revision History section.

## Next Steps

Future ADRs use IDs **048+**.

## Resources

- [Architecture Overview](../overview.md)
- [Sprint Plan](../../../apps/project-tracker/docs/metrics/_global/Sprint_plan.csv)
- [ADR Template](./template.md)
- [Decision Workflow](../decision-workflow.md)

---

**Last Updated**: 2026-04-15 **Maintained by**: Architecture Team **Review
Cycle**: Quarterly (after each major sprint milestone)
