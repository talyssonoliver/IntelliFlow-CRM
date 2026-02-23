# ADR-032: Feature Flags & Performance Optimization Strategy

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** ENV-014-AI, ENV-015-AI

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

IntelliFlow CRM needs runtime feature flags for gradual rollout and A/B testing, plus a performance optimization strategy to meet SLA targets (<200ms API, Lighthouse >90).

## Decision Drivers

- Gradual feature rollout without redeployment
- A/B testing support for AI features
- Sub-200ms API response times
- Lighthouse performance scores above 90

## Considered Options

- Edge Config (Vercel) for feature flags with instant propagation
- React Query + SWR for client-side caching
- Prisma query optimization with selective includes
- Next.js ISR/PPR for static-dynamic hybrid rendering

## Decision Outcome

Chosen: Edge Config for feature flags, React Query for client caching, Prisma optimized queries, and Next.js ISR/PPR for hybrid rendering. This combination targets <200ms API and >90 Lighthouse.

### Positive Consequences

- Edge Config updates propagate in <100ms globally
- React Query eliminates redundant API calls
- ISR/PPR serves static shells with dynamic data streaming

### Negative Consequences

- Edge Config is Vercel-specific (vendor lock-in)
- ISR cache invalidation can be complex

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
