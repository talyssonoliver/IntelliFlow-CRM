# ADR-033: Security Hardening Decisions

**Status:** Accepted

**Date:** 2026-02-22

**Deciders:** Architecture Team (retroactive documentation)

**Technical Story:** IFC-073, IFC-077, IFC-113, IFC-114, IFC-121, IFC-125,
IFC-143, IFC-169

> **Note**: This ADR was retroactively created to document architectural
> decisions made during implementation. The decisions described here are already
> in production.

## Context and Problem Statement

IntelliFlow CRM handles sensitive customer data requiring comprehensive
security: GDPR compliance, API protection, secrets management, prompt injection
prevention, and threat modeling.

## Decision Drivers

- GDPR/SOC2 compliance requirements
- Protection against API abuse and DDoS
- Secure secrets management with rotation
- AI-specific security (prompt injection prevention)
- Cookie consent and privacy-first design

## Considered Options

- Upstash rate limiting via tRPC middleware
- HashiCorp Vault / AWS Secrets Manager for secrets with rotation
- Input sanitization + output validation for prompt injection defense
- OWASP threat modeling framework
- Cookie consent banner with granular preferences

## Decision Outcome

Chosen: Multi-layered security approach — Upstash rate limiting at API layer,
secrets management with automated rotation, dual-guard prompt injection
prevention (input sanitize + output validate), OWASP threat modeling, and
GDPR-compliant cookie consent.

### Positive Consequences

- Defense in depth across all attack vectors
- Automated secret rotation reduces human error
- Prompt injection guards protect AI features
- GDPR cookie consent built into platform from start

### Negative Consequences

- Multiple security layers increase operational complexity
- Rate limiting can affect legitimate high-volume users
- Prompt injection detection has false positive potential

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
