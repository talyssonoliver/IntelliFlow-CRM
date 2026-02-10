# PRD: Billing Portal & Subscription Management (PG-025 to PG-031)

**Version:** 1.0
**Date:** 2026-02-09
**Owners:** Platform Lead, FinOps Lead
**Related Tasks:** PG-025, PG-026, PG-027, PG-028, PG-029, PG-030, PG-031, IFC-198, IFC-099
**Decision Records:** ADR-029-billing-architecture.md
**Implements:** FLOW-048

## Summary

Self-service billing portal for IntelliFlow CRM tenants. Covers subscription management (plan selection, upgrades, downgrades, cancellation), payment method management, invoice history with PDF generation, checkout flow with Stripe integration, and receipt delivery. Builds on the IFC-198 billing domain (Invoice/Receipt aggregates) and IFC-099 Stripe adapter.

## Goals

1. Provide a self-service billing portal where admins manage subscriptions without contacting support.
2. Support 3 pricing tiers (Starter, Professional, Enterprise) with monthly and annual billing.
3. Display real-time usage metrics (API calls, storage, active users) against plan limits.
4. Full invoice lifecycle visible to users: list, detail, download PDF, payment history.
5. Secure payment method management (add, remove, set default) via Stripe Elements.
6. Transparent upgrade/downgrade with proration preview before committing.
7. Receipt generation and auto-delivery by email after every successful payment.

## Non-Goals

- Custom pricing or negotiated enterprise contracts (handled by sales team, IFC-055).
- Billing address / tax ID management UI (future enhancement).
- Multi-currency support (GBP only for v1; currency expansion in IFC-055).
- Dunning management UI (automatic via Stripe; admin notified via email).
- Usage-based billing (flat subscription tiers only for v1).

## Users & Use Cases

- **Tenant Admin**: Manages subscription, payment methods, views invoices. Full billing:write access.
- **Billing Manager**: Views subscription and invoices. billing:read access.
- **Finance Team**: Downloads invoices and receipts for accounting. billing:read access.
- **System (Stripe Webhooks)**: Processes payment events, updates invoice status, generates receipts.

## Pricing Tiers

| Plan | Monthly | Annual (20% off) | API Calls | Storage | Users |
|------|---------|-------------------|-----------|---------|-------|
| Starter | £29/mo | £23.20/mo (£278.40/yr) | 1,000/mo | 5 GB | 3 |
| Professional | £79/mo | £63.20/mo (£758.40/yr) | Unlimited | 25 GB | 15 |
| Enterprise | £199/mo | £159.20/mo (£1,910.40/yr) | Unlimited | 100 GB | Unlimited |

## Functional Requirements

### FR-1: Billing Portal (PG-025)

- Subscription overview card: plan name, tier badge, billing cycle, next billing date, seat count, status.
- Default payment method display with brand icon, last 4 digits, expiry.
- Usage metrics with progress bars (API calls, storage, active users) and color-coded thresholds.
- Recent invoice history (last 5) with quick download links.
- Navigation to all billing sub-pages (invoices, payment methods, subscriptions, receipts).

### FR-2: Checkout Flow (PG-026)

- Card input with real-time brand detection (Visa, Mastercard, Amex, Discover, JCB).
- Expiry date (MM/YY) and CVC inputs with format validation.
- Order summary showing plan, billing cycle, tax, total.
- 3D Secure support via Stripe client secret redirect.
- Success confirmation with redirect to billing portal.
- Error handling with specific messages per Stripe error code (card_declined, expired_card, etc.).

### FR-3: Invoice List (PG-027)

- Paginated table: date, invoice number, amount, status badge, paid date, actions.
- Status badges: Draft (gray), Open (blue), Paid (green), Void (red), Uncollectible (orange).
- PDF download per invoice.
- "Load More" pagination (cursor-based).
- Empty state with link to subscription page.

### FR-4: Invoice Detail (PG-028)

- Invoice header: number (INV-YYYY-NNNNNN), status, issue date, due date, customer details.
- Line items table: description, quantity, unit price, line total.
- Tax breakdown: rate, type (VAT/SALES_TAX/GST), jurisdiction, amount.
- Totals: subtotal, tax, total, amount paid, amount due.
- Actions: download PDF, pay now (OPEN invoices only).

### FR-5: Payment Methods (PG-029)

- Card list with brand icon, last 4 digits, expiry, default indicator.
- Expiring soon warning (amber badge when <30 days to expiry).
- Add new card via modal dialog.
- Set as default payment method.
- Remove card with confirmation dialog.
- Cannot remove last/default card if subscription is active.

### FR-6: Subscription Manager (PG-030)

- Current plan card with status, features, renewal info.
- 3-column plan comparison grid with feature matrix.
- Monthly/annual toggle with savings calculation.
- Upgrade flow with proration preview (immediate charge shown).
- Downgrade flow with feature loss warning (effective at period end).
- Cancellation with retention offer, reason selection, and "cancel at period end" behavior.
- Reactivation option before current period ends.

### FR-7: Receipts (PG-031)

- Receipt list: number (RCT-YYYY-NNNNNN), date, amount, linked invoice.
- PDF download per receipt.
- Auto-email on successful payment (configurable recipients).
- Receipts are immutable read-only records.

## Non-Functional Requirements

- **Performance**: All billing pages load <500ms P95. Checkout complete (including Stripe) <3s. API responses <200ms.
- **Security**: Card data never touches IntelliFlow servers (Stripe Elements for PCI scope). Webhook signature verification via HMAC. billing:write required for mutations. Tenant isolation via Stripe customer metadata.
- **Accessibility**: All forms keyboard accessible. Error messages announced via aria-live. Status badges use color + icon.
- **Lighthouse**: Score >=90 on all /billing/* routes.

## Metrics

- Checkout conversion rate >80%.
- Payment success rate >95% first attempt.
- Billing page load <500ms P95.
- Webhook processing <500ms P95.
- Test coverage >90%.
- Lighthouse >=90.

## Acceptance Criteria

1. Billing portal displays current subscription with correct plan, status, and usage metrics.
2. Checkout form processes payment via Stripe and creates subscription.
3. 3D Secure authentication challenge works end-to-end.
4. Invoice list paginates correctly and all statuses display appropriate badges.
5. Invoice detail shows line items, tax breakdown, and correct totals.
6. Payment method add/remove/set-default works without errors.
7. Cannot remove the only card when subscription is active.
8. Plan upgrade shows proration preview and charges immediately.
9. Plan downgrade takes effect at end of current period.
10. Cancellation allows reason selection and cancels at period end.
11. Receipts auto-email on payment and display in receipt list.
12. Stripe webhooks update invoice/subscription status correctly.
13. All billing mutations require billing:write permission.
14. All billing views require billing:read permission.

## Dependencies

- IFC-198 (Billing Domain Core) - COMPLETED.
- IFC-099 (ERP/Payment Connectors / Stripe Adapter) - COMPLETED.
- IFC-107 (Account Aggregate) - COMPLETED (for customer linkage).
- ADR-029 (Billing Architecture).
- FLOW-048 (Billing & Subscription Management flow).

## Risks / Mitigations

- **Risk**: Stripe API outage blocks all billing operations. **Mitigation**: Graceful degradation with cached subscription state; "Billing service unavailable" banner; webhook replay on recovery.
- **Risk**: Webhook events arrive out of order. **Mitigation**: Idempotent handlers with event ID deduplication; status checks before state transitions.
- **Risk**: PCI compliance scope creep. **Mitigation**: Card data never stored or transmitted by IntelliFlow; Stripe Elements isolates PCI scope to Stripe.
- **Risk**: Proration calculation errors. **Mitigation**: Use Stripe's built-in proration engine; preview shown before commit; audit log for all changes.
- **Risk**: Users cancel then want to resubscribe. **Mitigation**: "Cancel at period end" (not immediate); reactivation button before period expires.
