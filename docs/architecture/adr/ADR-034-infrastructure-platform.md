# ADR-034: Infrastructure & Platform Engineering

**Status:** Superseded by [ADR-064](ADR-064-terraform-single-source-of-truth.md)
(2026-06-05)

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

> **Correction (2026-06-05, see ADR-064):** the "already in production" framing
> above is **overstated**. An audit found `terraform validate` broken for ~2
> weeks (provider-schema drift), empty environment `tfvars`, a `null_resource`
> Supabase module (no real drift detection), and the three `apps/workers`
> services **not provisioned to Railway at all**. `ai-worker` also ships no OTel
> SDK. The tool/architecture choices below stand; their _implementation status_
> did not. ADR-064 supersedes this ADR, extends scope to the workers +
> monitoring stack, and tracks the real remaining work via the `INFRA-TF-*`
> tasks.

See attestation files at `.specify/sprints/sprint-{N}/attestations/{TASK_ID}/`
for validation evidence.

### Validation Criteria

- [x] Tool/architecture choices made (Terraform, blue/green, OTel, BullMQ)
- [~] Implementation partial — see ADR-064 correction above
- [ ] In production use — **NOT** true for the three workers; Terraform
      provisioning is drifted/broken (ADR-064 Phase 2/3 to remediate)

### Rollback Plan

Superseded by [ADR-064](ADR-064-terraform-single-source-of-truth.md), which
carries the live decision and remediation plan.
