# ADR-065: CRM → Portal delivery & billing sync (Leangency 14-day flow)

**Status:** Proposed

**Date:** 2026-06-07

**Deciders:** Architecture Team

**Technical Story:** IFC-314

## Context and Problem Statement

The leangency-portal now runs the 14-day, event-gated delivery flow and reflects
billing the CRM owns. Today the cross-repo link is one-way (portal → CRM via the
`inbound` router). The CRM has no return path: no instalment model, no Stripe
invoice-create, no subscription persistence, and no outbound push to the portal.
This ADR records how the CRM closes that loop without owning delivery state.

## Decision Drivers

- The **portal owns delivery state** (phase + the 14-day SLA clock); the **CRM
  owns billing** (Stripe). The CRM must mirror billing to the portal, not drive
  delivery — so the integration must not let either side clobber the other.
- Delivery must be **at-least-once + idempotent** (the portal endpoint is
  idempotent; the CRM should route the push through the existing transactional
  outbox rather than fire-and-forget).
- Reuse existing infra: the `domain_events` outbox, the BullMQ scheduler in
  `ai-worker`, and the shared `PORTAL_INTERNAL_SECRET` (today inbound-only).

## Considered Options

- **A — Push via the transactional outbox** (`domain_events` → a
  `PortalDeliverySync` handler in the events-worker). At-least-once, retried.
- **B — Direct fetch from `CloseDealWonUseCase`.** Simpler but fire-and-forget;
  no retry; couples the use case to HTTP.
- **C — Configure a `WebhookEndpoint` row pointed at the portal.** Generic, but
  the portal contract is bespoke (provision-then-deliver) and not a fit for the
  generic webhook channel.

## Decision Outcome

Chosen option: **A (outbox-routed push)** — to be finalised during the IFC-314
spec/plan session. Field ownership: the CRM writes `tier`, `signedAt`,
`crmDealId`, `setupInstalments`, `subscriptionStatus`, `subscriptionRenewsAt`
(and `phase: pending_onboarding` once, on deal-won) to
`POST /api/internal/delivery`; it never sends the portal-owned phase/clock
fields. The portal endpoint contract, field-ownership matrix, and CRM build
order are specified in the portal repo (`docs/CRM_DELIVERY_INTEGRATION.md` +
`docs/CRM_DELIVERY_AUDIT.md`).

The full ADR will be fleshed out during implementation (instalment scheduling
for D7/D14 via delayed BullMQ jobs, the Stripe webhook-signature move off tRPC,
and the subscription-status persistence model).
