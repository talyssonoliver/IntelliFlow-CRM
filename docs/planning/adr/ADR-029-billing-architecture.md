# ADR-029: Billing Architecture and Payment Integration

**Status:** Accepted
**Date:** 2026-02-09
**Deciders:** Platform Lead, FinOps Lead, Backend Lead
**Related Tasks:** IFC-198, IFC-099, PG-025, PG-031

## Context and Problem Statement

IntelliFlow CRM needs a billing system supporting subscription plans, one-time charges, invoicing, payment processing, and receipts. We need to decide on the payment provider integration strategy, how billing domain objects relate to the external provider, where PCI compliance boundaries sit, and how the invoice lifecycle maps to Stripe events. The system must support 3 pricing tiers with monthly/annual billing, proration on plan changes, and automated receipt delivery.

## Decision Drivers

- **PCI Compliance**: Minimize PCI scope; card data must never touch IntelliFlow servers.
- **Domain Integrity**: Billing domain must enforce its own invariants independently of the payment provider.
- **Auditability**: Every payment, refund, and status change must be traceable.
- **Reliability**: Webhook-based synchronization must handle out-of-order events and retries.
- **Simplicity**: Avoid building payment infrastructure; leverage a proven provider.

## Considered Options

- **Option 1**: Direct Stripe SDK integration with Stripe-managed billing pages (Stripe Billing Portal).
- **Option 2**: Custom billing domain with Stripe as payment adapter behind a port interface.
- **Option 3**: Self-managed payment processing with direct bank API integration.

## Decision Outcome

Chosen option: **"Custom billing domain with Stripe as payment adapter behind a port interface"**, because it maintains hexagonal architecture boundaries (domain never depends on Stripe), allows switching payment providers without domain changes, enforces billing invariants in our domain layer regardless of external state, and provides full audit trail in our database.

### Positive Consequences

- **Domain independence**: Invoice aggregate enforces state machine (DRAFT -> OPEN -> PAID/VOID/UNCOLLECTIBLE) without Stripe dependency.
- **Testability**: Domain and application layers testable with mock payment port.
- **Provider portability**: PaymentServicePort interface allows switching from Stripe to another provider.
- **Full audit trail**: All state changes logged with domain events in our database.
- **Custom UI**: Full control over billing UI/UX, not limited to Stripe's hosted pages.

### Negative Consequences

- **Sync complexity**: Must keep local invoice state synchronized with Stripe via webhooks.
- **Dual state**: Invoice exists in both IntelliFlow DB and Stripe; reconciliation needed.
- **More code**: Custom billing portal vs using Stripe's hosted solution.

## Implementation Notes

### Domain Model

```typescript
// Invoice state machine (from packages/domain/src/crm/billing/)
const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'] as const;
const PAYMENT_STATUSES = ['PENDING', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED'] as const;
const PAYMENT_METHODS = ['CARD', 'BANK_TRANSFER', 'ACH', 'PAYPAL', 'MANUAL', 'CREDIT'] as const;
const LINE_ITEM_TYPES = ['SUBSCRIPTION', 'ONE_TIME', 'USAGE', 'CREDIT', 'DISCOUNT'] as const;
```

### Invoice State Machine

```
DRAFT ──→ OPEN ──→ PAID (terminal)
  │         │
  │         ├──→ VOID (terminal)
  │         │
  │         └──→ UNCOLLECTIBLE (terminal)
  │
  └──→ VOID (terminal)
```

Rules:
- Only DRAFT invoices are editable (add/remove line items).
- Issuing transitions DRAFT -> OPEN and sets the due date from PaymentTerms.
- Payment recording validates amount > 0 and <= amountDue; auto-transitions to PAID when fully paid.
- Cannot void an invoice with payments; must refund first.
- Refund amount must be <= (amountPaid - amountRefunded); full refund reverts PAID -> OPEN.
- PAID, VOID, and UNCOLLECTIBLE are terminal states.

### Payment Provider Port

```typescript
// PaymentServicePort (from packages/application/)
interface PaymentServicePort {
  // Customer
  createCustomer(params: CreateCustomerParams): Promise<Result<Customer, DomainError>>;
  getCustomer(id: string): Promise<Result<Customer, DomainError>>;

  // Subscriptions
  createSubscription(params: CreateSubscriptionParams): Promise<Result<Subscription, DomainError>>;
  updateSubscription(id: string, params: UpdateParams): Promise<Result<Subscription, DomainError>>;
  cancelSubscription(id: string, params: CancelParams): Promise<Result<void, DomainError>>;

  // Payment Methods
  attachPaymentMethod(params: AttachParams): Promise<Result<PaymentMethod, DomainError>>;
  detachPaymentMethod(id: string): Promise<Result<void, DomainError>>;
  listPaymentMethods(customerId: string): Promise<Result<PaymentMethod[], DomainError>>;

  // Invoices
  getInvoice(id: string): Promise<Result<Invoice, DomainError>>;
  listInvoices(customerId: string): Promise<Result<Invoice[], DomainError>>;

  // Refunds
  createRefund(params: RefundParams): Promise<Result<Refund, DomainError>>;

  // Webhooks
  constructWebhookEvent(payload: string, signature: string): Promise<Result<WebhookEvent, DomainError>>;

  // Health
  checkConnection(): Promise<HealthStatus>;
}
```

### Stripe Adapter

The `StripeAdapter` implements `PaymentServicePort` using a custom HTTP client (no Stripe SDK dependency). Key design choices:
- **Custom HTTP**: Direct REST API calls to avoid SDK version lock-in and bundle size.
- **Result pattern**: All operations return `Result<T, DomainError>` for explicit error handling.
- **Facade pattern**: Delegates to handler modules (customers, subscriptions, invoices, etc.).

### Webhook Processing

```
Stripe → POST /api/webhooks/stripe → Signature Verification → Event Handler → Domain Event
```

| Stripe Event | Action | Domain Event |
|-------------|--------|-------------|
| `invoice.paid` | Update invoice to PAID, generate receipt | InvoicePaidEvent, ReceiptIssuedEvent |
| `invoice.payment_failed` | Mark as past_due, notify admin | InvoicePaymentRecordedEvent |
| `customer.subscription.updated` | Sync subscription state | (application event) |
| `customer.subscription.deleted` | Mark canceled | (application event) |
| `charge.refunded` | Process refund on invoice | InvoiceRefundedEvent |

Reliability:
- Event ID stored for idempotency (deduplication).
- Timestamp validation prevents replay attacks (reject events >5min old).
- Status checked before state transition (out-of-order safe).

### PCI Compliance Boundary

```
┌─────────────────────────────────────────────────┐
│  Browser (PCI Scope: Stripe Elements only)      │
│  ┌─────────────────────────────────────┐        │
│  │  Stripe Elements iFrame             │        │
│  │  (card number, CVC, expiry)         │ ←── Card data never leaves this iFrame
│  └─────────────────────────────────────┘        │
│  IntelliFlow UI handles everything else         │
└───────────────┬─────────────────────────────────┘
                │ PaymentMethod ID (tok_xxx)
                ▼
┌─────────────────────────────────────────────────┐
│  IntelliFlow API (OUT OF PCI SCOPE)             │
│  - Receives tokenized payment method IDs only   │
│  - Never sees, stores, or transmits card data   │
│  - Attaches token to Stripe customer via API    │
└───────────────┬─────────────────────────────────┘
                │ API calls with token
                ▼
┌─────────────────────────────────────────────────┐
│  Stripe API (PCI Level 1 certified)             │
│  - Stores and processes card data               │
│  - Handles 3D Secure authentication             │
│  - Sends webhooks for payment events            │
└─────────────────────────────────────────────────┘
```

### Pricing Configuration

Pricing tiers stored as application configuration (not in database for v1):

| Plan | Monthly (pence) | Annual (pence/mo) | API Calls | Storage | Users |
|------|----------------|-------------------|-----------|---------|-------|
| Starter | 2900 | 2320 | 1,000 | 5 GB | 3 |
| Professional | 7900 | 6320 | Unlimited | 25 GB | 15 |
| Enterprise | 19900 | 15920 | Unlimited | 100 GB | Unlimited |

All amounts in pence (GBP cents) as integers to avoid floating point errors.

### Access Control

| Action | Required Permission |
|--------|-------------------|
| View billing portal, invoices, receipts | billing:read |
| Manage payment methods | billing:write |
| Change subscription plan | billing:write |
| Cancel subscription | billing:write |
| Download invoice/receipt PDF | billing:read |

### Database Considerations

Billing entities (Invoice, Receipt) currently exist as domain aggregates without Prisma models. When persistence is implemented:
- `Invoice` table with line items as JSON column or separate `InvoiceLineItem` table.
- `Receipt` table linked to Invoice via `invoiceId`.
- `stripeCustomerId` on User model for Stripe customer linkage.
- All billing tables tenant-scoped with `tenantId`.

## Verification

- Invoice state machine: all 25 transition combinations tested (valid + invalid).
- Payment recording: partial payments, full payments, over-payment rejected.
- Refund rules: amount validation, status transitions, payment status updates.
- Webhook idempotency: duplicate events processed exactly once.
- PCI boundary: no card data in IntelliFlow logs, network traces, or database.
- Proration: preview matches actual charge within rounding tolerance.

## Links

- [FLOW-048: Billing & Subscription Management](../../apps/project-tracker/docs/metrics/_global/flows/FLOW-048.md)
- [PRD: Billing Portal](../prd-billing-portal.md)
- [PRD: Billing Domain Core](../prd-billing-domain.md)
- Related: [ADR-019 Core CRM Foundation](./ADR-019-core-crm-foundation.md)
- Related: [ADR-001 Modern Stack](./ADR-001-modern-stack.md)
