# PRD: Billing Domain Core (IFC-198)

## Summary

Core billing domain layer for IntelliFlow CRM following DDD principles. Provides Invoice and Receipt aggregate roots with payment state machines, tax/refund business rules, and application services for orchestrating billing operations.

## Goals

1. Implement Invoice aggregate root with full lifecycle management (DRAFT → OPEN → PAID/VOID/UNCOLLECTIBLE)
2. Implement Receipt aggregate root as immutable proof-of-payment records
3. Enforce all billing invariants (totals, payment limits, refund limits, currency consistency)
4. Provide BillingDomainService for application-layer orchestration
5. Define repository ports for future persistence implementation

## Entities

### Invoice (Aggregate Root)
- Status state machine: DRAFT → OPEN → PAID | VOID | UNCOLLECTIBLE
- Embedded line items with quantity × unitPrice calculation
- Tax calculation via TaxRate value object
- Payment tracking (partial payments, refunds)
- Invariants: totalAmount = subtotal + tax, amountDue = total - paid + refunded

### Receipt (Aggregate Root)
- Immutable proof-of-payment record
- One receipt per payment transaction
- Links to invoice via invoiceId

### Value Objects
- **LineItem**: description, quantity, unitPrice, total, type
- **TaxRate**: rate (0-100%), type (VAT/SALES_TAX/GST/NONE), jurisdiction
- **PaymentTerms**: daysUntilDue, due date calculation
- **InvoiceId / ReceiptId**: UUID-based identifiers

## State Machine

```
DRAFT ──→ OPEN ──→ PAID (terminal)
  │         │
  │         ├──→ VOID (terminal)
  │         │
  │         └──→ UNCOLLECTIBLE (terminal)
  │
  └──→ VOID (terminal)
```

## Acceptance Criteria

1. Invoice.ts with full aggregate implementation
2. Receipt.ts with full aggregate implementation
3. All 5 invoice statuses enforced via canTransitionInvoiceTo()
4. 100% valid/invalid transitions tested (25 combinations)
5. Line items with quantity × unitPrice calculation
6. Tax calculation via TaxRate.calculate()
7. Payment recording updates amountPaid/amountDue, auto-transitions to PAID
8. Refund validates amount ≤ amountPaid
9. Void only allowed when amountPaid = 0
10. All aggregates include tenantId for multi-tenancy
11. Domain events emitted for all state changes
12. BillingDomainService with Result<T, DomainError> returns
13. Repository ports defined (InvoiceRepository, ReceiptRepository)
14. Test coverage: domain >95%, application >90%
15. p95 billing rule evaluation <50ms
16. This PRD document created

## References

- ADR-019: Core CRM Foundation
- PRD: ERP/Payment Connectors (prd-erp-connectors.md)
- Sprint Plan: IFC-198 (Sprint 29)
