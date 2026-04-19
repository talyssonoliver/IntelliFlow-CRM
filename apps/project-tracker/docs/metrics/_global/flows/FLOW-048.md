### 7.1 Billing & Subscription Management

**Cenario**: Admin or tenant owner needs to manage their subscription plan, view
invoices, manage payment methods, process upgrades/downgrades, and download
receipts.

**Especificacoes Tecnicas**:

```yaml
id: FLOW-048
name: Billing & Subscription Management
category: Billing & Payments
priority: High
sprint: 14
related_tasks:
  - IFC-198  # Billing Domain Core
  - IFC-099  # ERP/Payment Connectors (Stripe)
  - PG-025   # Billing Portal
  - PG-026   # Checkout
  - PG-027   # Invoices
  - PG-028   # Invoice Detail
  - PG-029   # Payment Methods
  - PG-030   # Subscriptions
  - PG-031   # Receipts

actors:
  - Tenant Admin
  - Billing Manager
  - System (Stripe webhooks)
  - Finance Team (read-only)

pre_conditions:
  - User authenticated with valid tenant session
  - User has billing:read (view) or billing:write (manage) permission
  - Stripe integration configured (STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
  - Tenant has a Stripe customer ID (auto-created on first billing access)

flow_steps:
  1_billing_portal:
    description: 'Billing overview dashboard with subscription, usage, and invoices'
    task: PG-025
    ui_triggers:
      - Navigate to /billing via sidebar or settings menu
      - Click "Billing" in account dropdown
    sections:
      subscription_overview:
        - Current plan name and tier badge (Starter/Professional/Enterprise)
        - Billing cycle indicator (monthly/annual)
        - Next billing date with amount
        - Seat count with usage
        - Status badge (active/trialing/past_due/canceled)
      payment_method:
        - Default card display (brand icon, last 4 digits, expiry)
        - "Manage" link to payment methods page
        - Expiring soon warning (within 30 days)
      usage_metrics:
        - API calls: used / limit with progress bar
        - Storage: used GB / limit GB with progress bar
        - Active users: count / limit with progress bar
        - Color coding: green (<80%), yellow (80-95%), red (>95%)
      invoice_history:
        - Last 5 invoices with date, amount, status, download link
        - "View All" link to full invoice list
    artifacts:
      - apps/web/src/app/(billing)/billing/page.tsx
      - apps/web/src/components/billing/billing-portal.tsx
      - apps/web/src/lib/billing/stripe-portal.ts

  2_checkout:
    description: 'Payment form for new subscriptions and plan changes'
    task: PG-026
    ui_triggers:
      - Click "Subscribe" on pricing page
      - Click "Upgrade" from subscription manager
      - Direct link /billing/checkout?plan=<planId>
    features:
      card_input:
        - Card number with real-time brand detection (Visa, Mastercard, Amex, etc.)
        - Expiry date (MM/YY format with auto-formatting)
        - CVC input (3 or 4 digits based on brand)
        - Cardholder name
      order_summary:
        - Plan name and description
        - Billing cycle (monthly/annual with savings badge)
        - Unit price and quantity
        - Tax calculation (VAT where applicable)
        - Total amount
      validation:
        - Real-time card number validation (Luhn algorithm)
        - Expiry date must be future
        - CVC length validation per brand
        - All fields required
      payment_flow:
        - Submit creates PaymentIntent via Stripe
        - 3D Secure handled via client secret redirect
        - Success redirects to /billing with confirmation toast
        - Failure shows inline error with retry option
    domain_events:
      - InvoiceCreatedEvent on successful payment
      - ReceiptIssuedEvent after payment confirmation
    artifacts:
      - apps/web/src/app/(billing)/billing/checkout/page.tsx
      - apps/web/src/components/billing/checkout-form.tsx
      - apps/web/src/lib/billing/payment-processor.ts

  3_invoice_list:
    description: 'Paginated invoice history with status filters and PDF download'
    task: PG-027
    ui_triggers:
      - Navigate to /billing/invoices
      - Click "View All Invoices" from billing portal
    features:
      table:
        - Columns: Date, Invoice ID (INV-YYYY-NNNNNN), Amount, Status, Paid Date, Actions
        - Status badges: Draft (gray), Open (blue), Paid (green), Void (red), Uncollectible (orange)
        - Sortable by date and amount
      actions:
        - Download PDF button per invoice
        - View in browser (opens /billing/invoices/[id])
        - "Load More" pagination
      empty_state:
        - "No invoices yet" with explanation
        - Link to pricing/subscription page
    artifacts:
      - apps/web/src/app/(billing)/billing/invoices/page.tsx
      - apps/web/src/components/billing/invoice-list.tsx
      - apps/web/src/lib/billing/pdf-generator.ts

  4_invoice_detail:
    description: 'Single invoice view with line items, tax breakdown, and actions'
    task: PG-028
    ui_triggers:
      - Click invoice row in list
      - Direct URL /billing/invoices/[id]
      - Link from receipt or email notification
    sections:
      header:
        - Invoice number (INV-YYYY-NNNNNN)
        - Status badge with timestamp
        - Issue date and due date
        - Customer details (name, email, address)
      line_items:
        - Description, quantity, unit price, total per line
        - Line item types: SUBSCRIPTION, ONE_TIME, USAGE, CREDIT, DISCOUNT
      totals:
        - Subtotal
        - Tax breakdown (rate, type, jurisdiction, amount)
        - Total amount
        - Amount paid / Amount due
      actions:
        - Download PDF
        - Pay now (if status is OPEN)
        - Send reminder (admin only)
    domain_rules:
      - totalAmount = subtotal + totalTax
      - amountDue = totalAmount - amountPaid + amountRefunded
      - Only OPEN invoices show "Pay Now" button
    artifacts:
      - apps/web/src/app/(billing)/billing/invoices/[id]/page.tsx
      - apps/web/src/components/billing/invoice-detail.tsx
      - apps/web/src/lib/billing/invoice-actions.ts

  5_payment_methods:
    description: 'Card management with add, remove, set default'
    task: PG-029
    ui_triggers:
      - Navigate to /billing/settings
      - Click "Manage" from billing portal payment section
    features:
      card_list:
        - Card brand icon, last 4 digits, expiry date
        - Default indicator badge
        - Expiring soon warning (amber badge if <30 days)
      actions:
        - Set as default (radio-like selection)
        - Remove card (with confirmation dialog)
        - Add new card (opens modal with card input form)
      validation:
        - Cannot remove the only/default payment method if subscription active
        - New card validated before attaching to customer
    stripe_operations:
      - attachPaymentMethod: Links card to Stripe customer
      - detachPaymentMethod: Removes card from customer
      - setDefaultPaymentMethod: Updates customer default
    artifacts:
      - apps/web/src/app/(billing)/billing/settings/page.tsx
      - apps/web/src/components/billing/payment-methods.tsx
      - apps/web/src/lib/billing/card-manager.ts

  6_subscription_manager:
    description: 'Plan comparison, upgrade/downgrade, and cancellation'
    task: PG-030
    ui_triggers:
      - Navigate to /billing/subscriptions
      - Click "Change Plan" from billing portal
    features:
      current_plan:
        - Plan name, status, billing cycle
        - Feature list with checkmarks
        - Next renewal date and amount
      plan_comparison:
        - 3-column grid: Starter (£29/mo), Professional (£79/mo), Enterprise (£199/mo)
        - Annual pricing toggle (20% savings)
        - Feature matrix with included/excluded indicators
        - "Popular" badge on Professional plan
        - Current plan highlighted
      upgrade_flow:
        - Click "Upgrade" on target plan
        - Confirmation dialog with proration preview
        - Shows price difference and immediate charge
        - Processes upgrade via Stripe subscription update
      downgrade_flow:
        - Click "Downgrade" on lower plan
        - Warning about feature loss
        - Takes effect at end of current billing period
      cancellation:
        - "Cancel Subscription" button
        - Confirmation dialog with retention offer
        - Reason selection (optional)
        - Cancel at period end (not immediate)
        - Reactivation option before period ends
    domain_events:
      - InvoiceIssuedEvent on proration charge
      - InvoicePaidEvent after upgrade payment
    artifacts:
      - apps/web/src/app/(billing)/billing/subscriptions/page.tsx
      - apps/web/src/components/billing/subscription-manager.tsx
      - apps/web/src/lib/billing/plan-changes.ts

  7_receipts:
    description: 'Receipt list with download and email delivery'
    task: PG-031
    ui_triggers:
      - Navigate to /billing/receipts
      - Auto-email after payment
    features:
      receipt_list:
        - Receipt number (RCT-YYYY-NNNNNN), date, amount, linked invoice
        - Download PDF button
        - Email receipt button
      auto_delivery:
        - Receipt emailed automatically on successful payment
        - Configurable email recipients (billing contact)
    domain_rules:
      - Receipts are immutable (created once, never modified)
      - One receipt per payment transaction
      - Links to parent invoice via invoiceId
    artifacts:
      - apps/web/src/app/billing/receipts/page.tsx
      - apps/web/src/components/billing/receipt-list.tsx
      - apps/web/src/lib/billing/receipt-emailer.ts

  8_webhook_processing:
    description: 'Stripe webhook handling for payment events'
    ui_triggers:
      - Stripe sends POST to /api/webhooks/stripe
    events_handled:
      - invoice.paid: Update invoice status to PAID, generate receipt
      - invoice.payment_failed: Mark as past_due, send notification
      - customer.subscription.updated: Sync subscription state
      - customer.subscription.deleted: Mark subscription canceled
      - payment_intent.succeeded: Record payment on invoice
      - charge.refunded: Process refund on invoice
    security:
      - Signature verification using STRIPE_WEBHOOK_SECRET
      - Idempotency via event ID deduplication
      - Replay protection via timestamp validation
    domain_events:
      - InvoicePaymentRecordedEvent
      - InvoicePaidEvent
      - InvoiceRefundedEvent
      - ReceiptIssuedEvent

edge_cases:
  - expired_card: 'Payment fails with card_expired; show update card prompt before retry'
  - insufficient_funds: 'Payment fails with insufficient_funds; user notified with retry option'
  - 3d_secure_failed: 'Authentication challenge fails; payment rolled back, user can retry'
  - concurrent_plan_change: 'Optimistic locking prevents double-upgrade; second request sees updated state'
  - webhook_out_of_order: 'Idempotent handlers; status checks before state transitions'
  - cancel_then_resubscribe: 'Reactivation before period end restores subscription; after period end creates new subscription'
  - refund_partial: 'Partial refund keeps invoice OPEN with reduced amountDue; full refund reverts to OPEN if balance > 0'
  - void_with_payments: 'Cannot void invoice with payments; must refund first'
  - currency_mismatch: 'All operations enforce currency consistency (GBP); mismatch rejected with BillingCurrencyMismatchError'
  - free_trial_expiry: 'Trial ending triggers invoice creation; payment failure starts dunning process'

technical_artifacts:
  domain:
    - 'packages/domain/src/crm/billing/Invoice.ts (EXISTS - IFC-198)'
    - 'packages/domain/src/crm/billing/Receipt.ts (EXISTS - IFC-198)'
    - 'packages/domain/src/crm/billing/LineItem.ts (EXISTS - IFC-198)'
    - 'packages/domain/src/crm/billing/TaxRate.ts (EXISTS - IFC-198)'
    - 'packages/domain/src/crm/billing/PaymentTerms.ts (EXISTS - IFC-198)'

  adapters:
    - 'packages/adapters/src/payments/stripe/StripeAdapter.ts (EXISTS - IFC-099)'
    - 'packages/adapters/src/payments/stripe/StripeHttpClient.ts (EXISTS)'
    - 'packages/adapters/src/payments/stripe/types.ts (EXISTS)'

  validators:
    - 'packages/validators/src/billing.ts (EXISTS - IFC-198)'

  api:
    - 'apps/api/src/modules/billing/billing.router.ts (EXISTS)'

  ui:
    - 'apps/web/src/components/billing/billing-portal.tsx (EXISTS - PG-025)'
    - 'apps/web/src/components/billing/checkout-form.tsx (EXISTS - PG-026)'
    - 'apps/web/src/components/billing/invoice-list.tsx (EXISTS - PG-027)'
    - 'apps/web/src/components/billing/payment-methods.tsx (EXISTS - PG-029)'
    - 'apps/web/src/components/billing/subscription-manager.tsx (EXISTS - PG-030)'
    - 'apps/web/src/components/billing/receipt-list.tsx (EXISTS - PG-031)'

  api_endpoints:
    - 'billing.getSubscription (query)'
    - 'billing.listInvoices (query, paginated)'
    - 'billing.getPaymentMethods (query)'
    - 'billing.getUpcomingInvoice (query, proration preview)'
    - 'billing.getUsageMetrics (query)'
    - 'billing.updatePaymentMethod (mutation)'
    - 'billing.removePaymentMethod (mutation)'
    - 'billing.updateSubscription (mutation)'
    - 'billing.cancelSubscription (mutation)'
    - 'billing.ensureCustomer (mutation)'
    - 'billing.createCheckoutSubscription (mutation)'

  performance:
    - page_load: '<500ms'
    - api_response: '<200ms'
    - checkout_complete: '<3s (including Stripe round-trip)'
    - webhook_processing: '<500ms'

  security:
    - tenant_isolation: 'All billing queries scoped to tenant via Stripe customer metadata'
    - permission_check: 'billing:read for viewing, billing:write for mutations'
    - pci_compliance: 'Card data never touches server; Stripe Elements handles PCI scope'
    - webhook_verification: 'HMAC signature verification on all Stripe webhooks'
    - idempotency: 'Event ID deduplication prevents double-processing'

success_metrics:
  - checkout_conversion: '>80% of started checkouts complete'
  - page_load: '<500ms p95 on all billing pages'
  - payment_success_rate: '>95% first-attempt payment success'
  - webhook_processing: '<500ms p95 processing time'
  - test_coverage: '>90%'
  - lighthouse: '>=90 on all billing routes'
```

**Cenario**: Sarah, tenant admin, needs to upgrade from Starter to Professional
plan, review recent invoices, and update an expiring credit card.

**Passos Detalhados**:

```yaml
1. Acessar Portal de Billing:
  - Navegar via sidebar "Billing"
  - Ver plano atual: Starter (£29/mês)
  - Status: active, próximo billing: 15 Mar 2026
  - Uso: 450/1000 API calls, 2.1/5GB storage

2. Comparar Planos:
  - Clicar "Change Plan"
  - Ver 3 planos lado a lado
  - Professional destacado como "Popular"
  - Toggle para anual: £79/mês → £63.20/mês (20% economia)
  - Comparar features: Professional inclui API ilimitado

3. Realizar Upgrade:
  - Clicar "Upgrade to Professional"
  - Dialog de confirmação com proration:
    - Crédito pelo período restante do Starter
    - Cobrança proporcional do Professional
    - Diferença imediata: £37.50
  - Confirmar upgrade
  - Toast: "Upgraded to Professional successfully"

4. Verificar Invoice:
  - Navegar para /billing/invoices
  - Nova invoice INV-2026-000042 (Upgrade proration)
  - Status: Paid (verde)
  - Clicar para ver detalhes: line items com crédito + cobrança

5. Atualizar Cartão:
  - Navegar para /billing/settings
  - Ver aviso: "Card ending 4242 expires in 15 days"
  - Clicar "Add New Card"
  - Preencher dados do novo cartão
  - Set as default
  - Remover cartão antigo
```

**Edge Cases**:

- Cartão expirado durante upgrade -> Mostra prompt para atualizar cartão
- Webhook delayed -> Invoice status atualizado na próxima sync
- Downgrade com features em uso -> Warning com lista de features que serão
  perdidas
- Cancelamento -> Acesso mantido até fim do período, opção de reativar

**Sistemas**:

- `apps/web/src/components/billing/billing-portal.tsx`
- `apps/web/src/components/billing/subscription-manager.tsx`
- `apps/web/src/components/billing/checkout-form.tsx`
- `apps/api/src/modules/billing/billing.router.ts`
- `packages/domain/src/crm/billing/Invoice.ts`
- `packages/adapters/src/payments/stripe/StripeAdapter.ts`

**Documentacao Relacionada**:

- [ADR-029: Billing Architecture](../../../../../docs/architecture/adr/ADR-029-billing-architecture.md)
- [PRD: Billing Portal](../../../../../docs/planning/prd-billing-portal.md)
- [PRD: Billing Domain Core](../../../../../docs/planning/prd-billing-domain.md)
