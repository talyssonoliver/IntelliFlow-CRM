# ADR-036: Event Consumer Framework & Worker Migration

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-151, IFC-168

> **Note**: This ADR was retroactively created to document architectural decisions
> made during implementation. The decisions described here are already in production.

## Context and Problem Statement

IntelliFlow CRM's domain events system needs reliable consumers with retry logic, dead-letter queues, and backoff strategies. The AI worker also needed migration from ad-hoc processing to BullMQ-based job queue.

## Decision Drivers

- Reliable event processing with at-least-once delivery
- Dead-letter queue for failed event handling
- Exponential backoff for transient failures
- Unified job processing pattern across all workers

## Considered Options

- BullMQ consumers with configurable retry and DLQ
- Event-driven architecture with domain event bus
- Standardized worker base class with health checks

## Decision Outcome

Chosen: BullMQ-based event consumers with configurable retry (exponential backoff, max 3 attempts), dead-letter queue for investigation, and standardized worker base class.

### Positive Consequences

- Consistent retry behavior across all event consumers
- DLQ enables investigation of persistent failures
- Health checks enable Kubernetes readiness probes

### Negative Consequences

- Redis dependency for all event processing
- DLQ requires manual review process

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
