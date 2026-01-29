/**
 * Stripe Data Mappers
 */

import type {
  StripeCustomer,
  StripePaymentMethod,
  StripePaymentIntent,
  StripeRefund,
  StripeSubscription,
  StripeInvoice,
} from './types';

export function mapToCustomer(data: Record<string, unknown>): StripeCustomer {
  return {
    id: String(data.id ?? ''),
    email: data.email ? String(data.email) : undefined,
    name: data.name ? String(data.name) : undefined,
    phone: data.phone ? String(data.phone) : undefined,
    description: data.description ? String(data.description) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
    defaultPaymentMethodId: data.invoice_settings
      ? String((data.invoice_settings as Record<string, unknown>).default_payment_method ?? '')
      : undefined,
    balance: Number(data.balance ?? 0),
    currency: String(data.currency ?? 'usd'),
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToPaymentMethod(data: Record<string, unknown>): StripePaymentMethod {
  const card = data.card as Record<string, unknown> | undefined;
  const bankAccount = data.us_bank_account as Record<string, unknown> | undefined;
  const billingDetails = (data.billing_details as Record<string, unknown>) ?? {};
  const address = (billingDetails.address as Record<string, unknown>) ?? {};

  return {
    id: String(data.id ?? ''),
    type: String(data.type ?? 'card') as StripePaymentMethod['type'],
    customerId: data.customer ? String(data.customer) : undefined,
    card: card
      ? {
          brand: String(card.brand ?? ''),
          last4: String(card.last4 ?? ''),
          expMonth: Number(card.exp_month ?? 0),
          expYear: Number(card.exp_year ?? 0),
          funding: String(card.funding ?? ''),
        }
      : undefined,
    bankAccount: bankAccount
      ? {
          bankName: String(bankAccount.bank_name ?? ''),
          last4: String(bankAccount.last4 ?? ''),
          routingNumber: bankAccount.routing_number ? String(bankAccount.routing_number) : undefined,
          accountHolderType: String(bankAccount.account_holder_type ?? 'individual') as
            | 'individual'
            | 'company',
        }
      : undefined,
    billingDetails: {
      name: billingDetails.name ? String(billingDetails.name) : undefined,
      email: billingDetails.email ? String(billingDetails.email) : undefined,
      phone: billingDetails.phone ? String(billingDetails.phone) : undefined,
      address: {
        line1: address.line1 ? String(address.line1) : undefined,
        line2: address.line2 ? String(address.line2) : undefined,
        city: address.city ? String(address.city) : undefined,
        state: address.state ? String(address.state) : undefined,
        postalCode: address.postal_code ? String(address.postal_code) : undefined,
        country: address.country ? String(address.country) : undefined,
      },
    },
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToPaymentIntent(data: Record<string, unknown>): StripePaymentIntent {
  return {
    id: String(data.id ?? ''),
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? 'usd'),
    status: String(data.status ?? 'requires_payment_method') as StripePaymentIntent['status'],
    customerId: data.customer ? String(data.customer) : undefined,
    paymentMethodId: data.payment_method ? String(data.payment_method) : undefined,
    clientSecret: String(data.client_secret ?? ''),
    description: data.description ? String(data.description) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
    receiptEmail: data.receipt_email ? String(data.receipt_email) : undefined,
    capturedAmount: data.amount_received ? Number(data.amount_received) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToRefund(data: Record<string, unknown>): StripeRefund {
  return {
    id: String(data.id ?? ''),
    paymentIntentId: String(data.payment_intent ?? ''),
    amount: Number(data.amount ?? 0),
    currency: String(data.currency ?? 'usd'),
    status: String(data.status ?? 'pending') as StripeRefund['status'],
    reason: data.reason ? (String(data.reason) as StripeRefund['reason']) : undefined,
    receiptNumber: data.receipt_number ? String(data.receipt_number) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToSubscription(data: Record<string, unknown>): StripeSubscription {
  const items = data.items as Record<string, unknown> | undefined;
  const itemsData = (items?.data as Array<Record<string, unknown>>) ?? [];
  const firstItem = itemsData[0] ?? {};
  const price = firstItem.price as Record<string, unknown> | undefined;

  return {
    id: String(data.id ?? ''),
    customerId: String(data.customer ?? ''),
    status: String(data.status ?? 'incomplete') as StripeSubscription['status'],
    priceId: price ? String(price.id ?? '') : '',
    quantity: Number(firstItem.quantity ?? 1),
    currency: String(data.currency ?? 'usd'),
    currentPeriodStart: new Date(Number(data.current_period_start ?? 0) * 1000),
    currentPeriodEnd: new Date(Number(data.current_period_end ?? 0) * 1000),
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    canceledAt: data.canceled_at ? new Date(Number(data.canceled_at) * 1000) : undefined,
    trialStart: data.trial_start ? new Date(Number(data.trial_start) * 1000) : undefined,
    trialEnd: data.trial_end ? new Date(Number(data.trial_end) * 1000) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
  };
}

export function mapToInvoice(data: Record<string, unknown>): StripeInvoice {
  return {
    id: String(data.id ?? ''),
    customerId: String(data.customer ?? ''),
    subscriptionId: data.subscription ? String(data.subscription) : undefined,
    status: String(data.status ?? 'draft') as StripeInvoice['status'],
    amountDue: Number(data.amount_due ?? 0),
    amountPaid: Number(data.amount_paid ?? 0),
    amountRemaining: Number(data.amount_remaining ?? 0),
    currency: String(data.currency ?? 'usd'),
    dueDate: data.due_date ? new Date(Number(data.due_date) * 1000) : undefined,
    paidAt: data.status_transitions
      ? new Date(Number((data.status_transitions as Record<string, unknown>).paid_at ?? 0) * 1000)
      : undefined,
    hostedInvoiceUrl: data.hosted_invoice_url ? String(data.hosted_invoice_url) : undefined,
    invoicePdf: data.invoice_pdf ? String(data.invoice_pdf) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}
