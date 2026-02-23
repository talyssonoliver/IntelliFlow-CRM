# ADR-037: AI Output Review Layer Architecture

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-176, IFC-177, IFC-178, IFC-179, IFC-180, IFC-181

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

AI-generated outputs (lead scores, content suggestions, risk assessments) need human review before application. A full-stack review layer was needed spanning validators, use cases, database, adapters, API router, and frontend UI.

## Decision Drivers

- Human-in-the-loop approval for high-stakes AI decisions
- Audit trail of all AI output reviews
- Type-safe review workflow from API to UI
- Configurable approval thresholds per output type

## Considered Options

- Hexagonal architecture: Domain → Validators → Application → DB → Adapters → Router → UI
- Zod validators for review request/response schemas
- Prisma model for review records with status workflow
- tRPC router with role-based access for reviewers

## Decision Outcome

Chosen: Full hexagonal stack following project conventions — Zod validators, application use cases with ports, Prisma model, repository adapters, tRPC router, and React review UI.

### Positive Consequences

- Consistent with project hexagonal architecture
- Type-safe from database to frontend
- Audit trail for compliance requirements
- Configurable thresholds allow gradual AI autonomy

### Negative Consequences

- Full hexagonal stack is verbose for a single feature
- Review queue can become bottleneck if not monitored

## Implementation Notes

All related tasks are completed. See attestation files at
`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/` for validation evidence.

### Validation Criteria

- [x] Implementation complete (retroactive)
- [x] Tests passing
- [x] In production use

### Rollback Plan

N/A — decisions are already in production. Future changes should create a new ADR
that supersedes this one.
