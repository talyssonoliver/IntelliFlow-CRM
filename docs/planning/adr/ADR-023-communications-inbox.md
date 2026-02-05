# ADR-023: Communications & Inbox (Email/SMS/Webhooks)

**Status:** Accepted  
**Date:** 2026-02-02  
**Deciders:** Integration Lead, Product Lead, Security Lead  
**Related Tasks:** IFC-144, IFC-170, IFC-171, IFC-173

## Context and Problem
- Email/SMS/webhook flows were implemented separately; need unified rules for deliverability, idempotency, and compliance (SPF/DKIM/DMARC).

## Decision
1) **Deliverability:** Enforce SPF/DKIM/DMARC; bounce tracking; rate limits per tenant; audit logs.  
2) **Idempotency/Webhooks:** Webhooks must be idempotent with retries/backoff; store delivery receipts; signature verification required.  
3) **Attachments/Security:** AV scan, size caps, MIME validation; PII handling per tenant policy.  
4) **Evidence:** Tests for signature verification, retry/idempotency, and deliverability config; artifacts stored with attestation.

## Considered Options
- Provider-specific shortcuts (rejected).  
- Unified connector contracts + verification (chosen).

## Consequences
Positive: Reliable delivery, fewer dupes, better compliance. Negative: More connector setup and tests.

## Implementation Notes
- Outbound/inbound parsers normalize headers; store thread-id; enforce tenant isolation.  
- Signature + timestamp verification on inbound webhooks.  
- Rate-limit middleware; retention policies for logs.

## Verification
- MATOP Automation + Security STOAs verify signature tests, retry logs, and SPF/DKIM/DMARC config artifacts.

## Links
- ADR-005 Workflow Engine, ADR-015 Security.
