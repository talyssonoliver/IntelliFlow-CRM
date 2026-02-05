# PRD: Communications & Inbox (Email/SMS/Webhooks)

**Version:** 1.0  
**Date:** 2026-02-02  
**Owners:** Integration Lead, Product Lead  
**Related Tasks:** IFC-144, IFC-170, IFC-171, IFC-173  
**Decision Records:** ADR-023-communications-inbox.md

## Summary
Unify outbound/inbound email, SMS, and webhook processing with deliverability, idempotency, and compliance guarantees.

## Goals
- Reliable deliverability (SPF/DKIM/DMARC) and verified signatures on inbound.
- Idempotent webhooks with retries/backoff and delivery receipts.
- Secure attachment handling and PII controls per tenant.

## Non-Goals
- Marketing campaign tooling (separate scope).
- In-app chat (not covered here).

## Users & Use Cases
- Support agents: receive/process inbound emails and webhooks into tickets.
- Ops/Integrations: connect external systems via signed webhooks; receive delivery receipts.

## Functional Requirements
- Outbound email/SMS with rate limits per tenant; bounce tracking.
- Inbound parsing with thread-id, signature verification, retries/backoff.
- Webhook delivery receipts stored; idempotency keys enforced.
- Attachments: AV scan, size/MIME limits; PII redaction pipeline.

## Non-Functional Requirements
- Reliability: retry with exponential backoff; dead-letter metrics.
- Security: signature + timestamp validation; encrypted storage for logs/attachments.
- Compliance: retention policies per tenant.

## Metrics
- Delivery success rate >99%; duplicate rate <0.1%.
- Signature verification failures logged; webhook error rate <0.5%.

## Acceptance Criteria
- Tests for signature verification, idempotency, retries.
- Deliverability config (SPF/DKIM/DMARC) documented and validated.
- No placeholder payloads in test fixtures.

## Dependencies
- ADR-005, ADR-015, ADR-023.

## Risks / Mitigations
- Risk: Provider quirks → Mitigate with provider contract tests and retries.
- Risk: PII leakage → Mitigate with redaction and AV scanning.
