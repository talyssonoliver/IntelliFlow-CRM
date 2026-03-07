# ADR-041: Email Outbound Provider Wiring

## Status

Accepted

## Date

2026-03-06

## Technical Story

IFC-223 — Wire actual Email Outbound Adapter (Resolves R-018)

## Context and Problem Statement

The email outbound adapter (`packages/adapters/src/messaging/email/outbound.ts`)
has a `SendGridProvider` implementation and a `MockEmailProvider`, but:

1. Neither `EmailServiceAdapter` nor `OutboundEmailService` is registered in
   `apps/api/src/container.ts`
2. The `NotificationService` delegates email delivery to `NotificationServicePort`,
   which currently only has a `MockNotificationServiceAdapter`
3. The `SendGridProvider.getDeliverabilityStats()` and `checkBounce()` are stubs
4. The factory `createOutboundEmailService()` defaults to mock in development
5. Environment variables (`EMAIL_PROVIDER`, `EMAIL_API_KEY`) exist but are not
   consumed by any runtime path

We need to wire the existing adapter code to a real SMTP/API provider so emails
actually dispatch in production.

## Decision Drivers

- R-018 requirement: emails must dispatch to external provider
- Existing SendGrid provider code is already written but unwired
- KPI: deliverability >= 95%
- Must support provider failover (SendGrid primary, SMTP fallback)
- Development must continue using mock provider (no real emails in dev/test)

## Considered Options

1. **Wire existing SendGrid provider** — use current `SendGridProvider` + env-based config
2. **Replace with Resend** — modern email API with better DX
3. **Use nodemailer SMTP** — direct SMTP connection to any provider

## Decision Outcome

**Option 1: Wire existing SendGrid provider** — the code is already written and
tested. The task scope is wiring, not rewriting. Add env-based provider selection
and register in container.

### Consequences

- Good: minimal code changes, leverages existing tested code
- Good: SendGrid is industry standard with webhook support
- Neutral: `getDeliverabilityStats()` and `checkBounce()` stubs need completion
  for full monitoring but are not blocking for email dispatch
- Risk: API key management requires proper secret handling

## Implementation Notes

- Register `EmailServiceAdapter` in `container.ts` with env-based config
- Create `RealNotificationServiceAdapter` that bridges `NotificationServicePort`
  to `EmailServiceAdapter` for the email channel
- Wire `NotificationService` → `RealNotificationServiceAdapter` → `EmailServiceAdapter` → `SendGridProvider`
- Keep `MockNotificationServiceAdapter` for test/dev environments

## Known Gaps

- `NotificationService.processRetries()` polling is not scheduled in the API container. This is a known gap deferred to a follow-up task.
- In-memory rate limiter (`EmailRateLimiter`) is ineffective across pods. Replace with Redis-backed limiter in follow-up task.
