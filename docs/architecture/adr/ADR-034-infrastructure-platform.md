# ADR-034: Infrastructure & Platform Engineering

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-075, IFC-078, IFC-111, IFC-112, IFC-116, IFC-163,
IFC-167

> **Note**: This ADR was retroactively created to document architectural
> decisions made during implementation. The decisions described here are already
> in production.

## Context and Problem Statement

IntelliFlow CRM requires infrastructure-as-code, platform engineering standards,
static analysis CI integration, deployment strategy, full observability, and
worker runtime standardization.

## Decision Drivers

- Reproducible infrastructure provisioning
- Zero-downtime deployments
- Continuous code quality enforcement
- Full distributed tracing across services
- Standardized worker process management

## Considered Options

- Terraform for infrastructure-as-code
- Blue/green deployment via Vercel/Railway
- SonarQube + ESLint for static analysis in CI
- OpenTelemetry for distributed tracing with Jaeger/Grafana
- Standardized apps/workers/ directory with BullMQ consumers

## Decision Outcome

Chosen: Terraform for IaC, blue/green deployment, SonarQube CI integration,
OpenTelemetry instrumentation, and standardized worker runtime under
apps/workers/ with BullMQ.

### Positive Consequences

- Terraform enables reproducible multi-environment provisioning
- Blue/green eliminates deployment downtime
- SonarQube catches quality issues before merge
- OpenTelemetry provides end-to-end request tracing
- Unified worker runtime simplifies operational management

### Negative Consequences

- Terraform state management requires careful handling
- SonarQube server adds infrastructure cost
- OpenTelemetry SDK adds ~2ms overhead per span

## Implementation Notes

All related tasks are completed. See attestation files at
`.specify/sprints/sprint-{N}/attestations/{TASK_ID}/` for validation evidence.

### Validation Criteria

- [x] Implementation complete (retroactive)
- [x] Tests passing
- [x] In production use

### Rollback Plan

N/A — decisions are already in production. Future changes should create a new
ADR that supersedes this one.
