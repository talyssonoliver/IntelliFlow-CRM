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
  StripeInvoiceLineItem,
} from './types';

export function mapToCustomer(data: Record<string, unknown>): StripeCustomer {
  return {
    id: (data.id as string | null | undefined) ?? '',
    email: data.email ? (data.email as string) : undefined,
    name: data.name ? (data.name as string) : undefined,
    phone: data.phone ? (data.phone as string) : undefined,
    description: data.description ? (data.description as string) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
    defaultPaymentMethodId: data.invoice_settings
      ? ((data.invoice_settings as Record<string, unknown>).default_payment_method as string | null | undefined) ?? ''
      : undefined,
    balance: Number(data.balance ?? 0),
    currency: (data.currency as string | null | undefined) ?? 'usd',
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToPaymentMethod(data: Record<string, unknown>): StripePaymentMethod {
  const card = data.card as Record<string, unknown> | undefined;
  const bankAccount = data.us_bank_account as Record<string, unknown> | undefined;
  const billingDetails = (data.billing_details as Record<string, unknown>) ?? {};
  const address = (billingDetails.address as Record<string, unknown>) ?? {};

  return {
    id: (data.id as string | null | undefined) ?? '',
    type: ((data.type as string | null | undefined) ?? 'card') as StripePaymentMethod['type'],
    customerId: data.customer ? (data.customer as string) : undefined,
    card: card
      ? {
          brand: (card.brand as string | null | undefined) ?? '',
          last4: (card.last4 as string | null | undefined) ?? '',
          expMonth: Number(card.exp_month ?? 0),
          expYear: Number(card.exp_year ?? 0),
          funding: (card.funding as string | null | undefined) ?? '',
        }
      : undefined,
    bankAccount: bankAccount
      ? {
          bankName: (bankAccount.bank_name as string | null | undefined) ?? '',
          last4: (bankAccount.last4 as string | null | undefined) ?? '',
          routingNumber: bankAccount.routing_number
            ? (bankAccount.routing_number as string)
            : undefined,
          accountHolderType: ((bankAccount.account_holder_type as string | null | undefined) ?? 'individual') as
            | 'individual'
            | 'company',
        }
      : undefined,
    billingDetails: {
      name: billingDetails.name ? (billingDetails.name as string) : undefined,
      email: billingDetails.email ? (billingDetails.email as string) : undefined,
      phone: billingDetails.phone ? (billingDetails.phone as string) : undefined,
      address: {
        line1: address.line1 ? (address.line1 as string) : undefined,
        line2: address.line2 ? (address.line2 as string) : undefined,
        city: address.city ? (address.city as string) : undefined,
        state: address.state ? (address.state as string) : undefined,
        postalCode: address.postal_code ? (address.postal_code as string) : undefined,
        country: address.country ? (address.country as string) : undefined,
      },
    },
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToPaymentIntent(data: Record<string, unknown>): StripePaymentIntent {
  return {
    id: (data.id as string | null | undefined) ?? '',
    amount: Number(data.amount ?? 0),
    currency: (data.currency as string | null | undefined) ?? 'usd',
    status: ((data.status as string | null | undefined) ?? 'requires_payment_method') as StripePaymentIntent['status'],
    customerId: data.customer ? (data.customer as string) : undefined,
    paymentMethodId: data.payment_method ? (data.payment_method as string) : undefined,
    clientSecret: (data.client_secret as string | null | undefined) ?? '',
    description: data.description ? (data.description as string) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
    receiptEmail: data.receipt_email ? (data.receipt_email as string) : undefined,
    capturedAmount: data.amount_received ? Number(data.amount_received) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToRefund(data: Record<string, unknown>): StripeRefund {
  return {
    id: (data.id as string | null | undefined) ?? '',
    paymentIntentId: (data.payment_intent as string | null | undefined) ?? '',
    amount: Number(data.amount ?? 0),
    currency: (data.currency as string | null | undefined) ?? 'usd',
    status: ((data.status as string | null | undefined) ?? 'pending') as StripeRefund['status'],
    reason: data.reason ? ((data.reason as string) as StripeRefund['reason']) : undefined,
    receiptNumber: data.receipt_number ? (data.receipt_number as string) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
  };
}

export function mapToSubscription(data: Record<string, unknown>): StripeSubscription {
  const items = data.items as Record<string, unknown> | undefined;
  const itemsData = (items?.data as Array<Record<string, unknown>>) ?? [];
  const firstItem = itemsData[0] ?? {};
  const price = firstItem.price as Record<string, unknown> | undefined;

  return {
    id: (data.id as string | null | undefined) ?? '',
    customerId: (data.customer as string | null | undefined) ?? '',
    status: ((data.status as string | null | undefined) ?? 'incomplete') as StripeSubscription['status'],
    priceId: price ? ((price.id as string | null | undefined) ?? '') : '',
    quantity: Number(firstItem.quantity ?? 1),
    currency: (data.currency as string | null | undefined) ?? 'usd',
    currentPeriodStart: new Date(Number(data.current_period_start ?? 0) * 1000),
    currentPeriodEnd: new Date(Number(data.current_period_end ?? 0) * 1000),
    cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
    canceledAt: data.canceled_at ? new Date(Number(data.canceled_at) * 1000) : undefined,
    trialStart: data.trial_start ? new Date(Number(data.trial_start) * 1000) : undefined,
    trialEnd: data.trial_end ? new Date(Number(data.trial_end) * 1000) : undefined,
    metadata: data.metadata as Record<string, string> | undefined,
  };
}

function extractChargeCard(charge: unknown): Record<string, unknown> | undefined {
  if (typeof charge !== 'object' || charge === null) return undefined;
  const pmDetails = (charge as Record<string, unknown>).payment_method_details as
    | Record<string, unknown>
    | undefined;
  return pmDetails?.card as Record<string, unknown> | undefined;
}

function extractCardDetails(charge: unknown): {
  paymentMethodBrand: string | undefined;
  paymentMethodLast4: string | undefined;
} {
  const card = extractChargeCard(charge);
  if (!card) return { paymentMethodBrand: undefined, paymentMethodLast4: undefined };
  return {
    paymentMethodBrand: card.brand ? (card.brand as string) : undefined,
    paymentMethodLast4: card.last4 ? (card.last4 as string) : undefined,
  };
}

function mapInvoiceLineItems(
  data: Record<string, unknown>
): StripeInvoiceLineItem[] {
  const linesObj = data.lines as Record<string, unknown> | undefined;
  const linesData = (linesObj?.data as Array<Record<string, unknown>>) ?? [];
  return linesData.map((item) => ({
    id: (item.id as string | null | undefined) ?? '',
    description: (item.description as string | null | undefined) ?? '',
    quantity: Number(item.quantity ?? 1),
    unitAmount: Number(item.unit_amount ?? 0),
    amount: Number(item.amount ?? 0),
    currency: (item.currency as string | null | undefined) ?? (data.currency as string | null | undefined) ?? 'usd',
  }));
}

function mapInvoiceBillingAddress(
  data: Record<string, unknown>
):
  | {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    }
  | undefined {
  const customerAddress = data.customer_address as Record<string, unknown> | undefined;
  if (!customerAddress) return undefined;
  return {
    line1: customerAddress.line1 ? (customerAddress.line1 as string) : undefined,
    line2: customerAddress.line2 ? (customerAddress.line2 as string) : undefined,
    city: customerAddress.city ? (customerAddress.city as string) : undefined,
    state: customerAddress.state ? (customerAddress.state as string) : undefined,
    postalCode: customerAddress.postal_code ? (customerAddress.postal_code as string) : undefined,
    country: customerAddress.country ? (customerAddress.country as string) : undefined,
  };
}

export function mapToInvoice(data: Record<string, unknown>): StripeInvoice {
  const lineItems = mapInvoiceLineItems(data);
  const billingAddress = mapInvoiceBillingAddress(data);

  // Extract payment method details from the expanded charge object.
  // Stripe returns `charge` as either a string ID or an expanded object
  // containing `payment_method_details.card.{brand, last4}`.
  const { paymentMethodBrand, paymentMethodLast4 } = extractCardDetails(data.charge);

  return {
    id: (data.id as string | null | undefined) ?? '',
    customerId: (data.customer as string | null | undefined) ?? '',
    subscriptionId: data.subscription ? (data.subscription as string) : undefined,
    status: ((data.status as string | null | undefined) ?? 'draft') as StripeInvoice['status'],
    amountDue: Number(data.amount_due ?? 0),
    amountPaid: Number(data.amount_paid ?? 0),
    amountRemaining: Number(data.amount_remaining ?? 0),
    currency: (data.currency as string | null | undefined) ?? 'usd',
    dueDate: data.due_date ? new Date(Number(data.due_date) * 1000) : undefined,
    paidAt: data.status_transitions
      ? new Date(Number((data.status_transitions as Record<string, unknown>).paid_at ?? 0) * 1000)
      : undefined,
    hostedInvoiceUrl: data.hosted_invoice_url ? (data.hosted_invoice_url as string) : undefined,
    invoicePdf: data.invoice_pdf ? (data.invoice_pdf as string) : undefined,
    created: new Date(Number(data.created ?? 0) * 1000),
    number: data.number ? (data.number as string) : undefined,
    description: data.description ? (data.description as string) : undefined,
    subtotal: data.subtotal == null ? undefined : Number(data.subtotal),
    tax: data.tax == null ? undefined : Number(data.tax),
    discount: data.discount == null ? undefined : Number(data.discount),
    customerEmail: data.customer_email ? (data.customer_email as string) : undefined,
    customerName: data.customer_name ? (data.customer_name as string) : undefined,
    paymentMethodBrand,
    paymentMethodLast4,
    billingAddress,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
  };
}
