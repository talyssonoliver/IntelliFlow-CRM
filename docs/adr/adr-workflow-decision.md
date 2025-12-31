# ADR: Workflow Engine Selection for IntelliFlow CRM

**Status:** Accepted

**Date:** 2025-12-29

**Deciders:** Engineering Team, Tech Lead, Product Manager

**Technical Story:** IFC-141 - Evaluate workflow engines and implement selected engine

---

## Context and Problem Statement

IntelliFlow CRM requires workflow automation for:
- Case management lifecycle (open -> in-progress -> closed)
- Lead nurturing sequences
- Approval workflows (human-in-the-loop)
- Long-running business processes (spanning days/weeks)
- Event-driven automation from domain events

We need to select the appropriate workflow engine(s) to handle these requirements while integrating with our existing LangGraph (AI workflows) and BullMQ (background jobs) infrastructure per ADR-005.

## Decision Drivers

1. **Reliability**: Workflows must not lose state or fail silently
2. **Durability**: Support for long-running processes (months/years for cases)
3. **Integration**: Compatible with TypeScript, tRPC, and domain events
4. **Human-in-the-loop**: Support approval steps and manual interventions
5. **Scalability**: Handle growth from MVP to production scale
6. **Cost**: Balance licensing/hosting costs vs development effort
7. **Maintainability**: Minimize long-term maintenance burden

## Considered Options

### Option 1: n8n (Low-Code Platform)

Visual workflow automation with 400+ integrations.

**Pros:**
- Visual workflow builder
- Many pre-built integrations
- Quick to prototype

**Cons:**
- Not designed for durable execution
- Poor AI/LangChain integration
- Limited TypeScript support
- Basic state management

**Score: 6.0/10**

### Option 2: Temporal (Durable Execution Framework)

Enterprise-grade workflow orchestration with guaranteed execution.

**Pros:**
- Guaranteed workflow completion
- Exactly-once semantics
- Full TypeScript SDK
- Proven at scale (Netflix, Uber, Stripe)
- Built-in saga pattern support
- Signals for human interaction
- Time-travel debugging

**Cons:**
- Requires Temporal Server
- Steeper learning curve
- Not AI-native (but integrates via activities)

**Score: 7.8/10**

### Option 3: Custom Event-Driven Engine

Build on top of existing domain events and BullMQ.

**Pros:**
- Full control
- No external dependencies
- Direct domain model integration

**Cons:**
- Significant development effort (4-6 weeks)
- Must build reliability features ourselves
- Higher maintenance burden
- Risk of reinventing poorly

**Score: 6.4/10**

## Decision Outcome

**Chosen option: Hybrid Architecture with Temporal for Durable Workflows**

We adopt a hybrid architecture:

| Workflow Type | Engine | Rationale |
|---------------|--------|-----------|
| AI Orchestration | LangGraph | AI-native, state management, human-in-loop |
| Durable Business Processes | Temporal | Guaranteed execution, saga support |
| Background Jobs | BullMQ | Simple, existing infrastructure |
| Real-time Rules | Custom Rules Engine | Low-latency, domain-specific |

### Architecture Overview

```
Domain Events --> Event Router --> Workflow Dispatcher
                                           |
                    +----------------------+----------------------+
                    |                      |                      |
              [LangGraph]           [Temporal]              [BullMQ]
              AI Workflows          Durable Flows           Simple Jobs
              - Lead Scoring        - Case Lifecycle        - Email Send
              - AI Qualification    - Approval Flows        - Data Sync
              - Agent Chains        - Order Sagas           - Cleanup
```

### Why This Approach

1. **Temporal for reliability**: Business processes like case management cannot fail silently
2. **LangGraph for AI**: Purpose-built for AI agent orchestration (per ADR-005)
3. **BullMQ for simplicity**: Existing infrastructure for simple background jobs
4. **Rules engine for speed**: Low-latency rule evaluation without workflow overhead

## Implementation Plan

### Phase 1: Infrastructure (Week 1)
- Set up Temporal Server via Docker Compose
- Configure Temporal TypeScript SDK
- Create workflow engine wrapper

### Phase 2: Core Workflows (Week 2)
- Implement case lifecycle workflow
- Add domain event triggers
- Build activity implementations

### Phase 3: Rules Engine (Week 3)
- Implement rules engine for simple automations
- Configure rule definitions
- Add rule evaluation to event handlers

### Phase 4: Integration (Week 4)
- Connect to existing event bus
- Add observability (metrics, tracing)
- Document and train team

## Consequences

### Positive

- **Guaranteed execution**: Critical workflows cannot be lost
- **Scalability**: Temporal proven at massive scale
- **Type safety**: Full TypeScript support across stack
- **Debugging**: Temporal UI provides workflow visibility
- **Flexibility**: Right tool for each workflow type

### Negative

- **Complexity**: Three workflow systems to understand
- **Infrastructure**: Temporal Server requires operation
- **Learning curve**: Team must learn Temporal concepts
- **Cost**: Temporal Server hosting (~$100-200/month)

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Temporal complexity | Start with simple workflows, gradually increase |
| Infrastructure overhead | Use Docker Compose initially, Temporal Cloud later |
| Team learning curve | Training materials, runbooks, pair programming |
| Routing complexity | Clear documentation on when to use each engine |

## Validation Criteria

- [ ] Temporal Server running in development
- [ ] Case lifecycle workflow implemented and tested
- [ ] Rules engine processing events correctly
- [ ] Workflow execution success rate >95%
- [ ] Event-to-workflow latency <500ms
- [ ] Training materials delivered to team

## Related Decisions

- **ADR-005**: LangGraph + BullMQ for AI workflows and background jobs
- **ADR-002**: Domain-Driven Design principles
- **IFC-135**: Event-driven architecture implementation

## Links

- [Temporal Documentation](https://docs.temporal.io/)
- [Temporal TypeScript SDK](https://docs.temporal.io/typescript/introduction)
- [Comparison Matrix](../../artifacts/misc/workflow-comparison-matrix.md)
- [ADR-005 Workflow Engine](../planning/adr/ADR-005-workflow-engine.md)

---

*Document Version: 1.0*
*Last Updated: 2025-12-29*
