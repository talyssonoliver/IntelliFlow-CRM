// Billing Domain Constants
// Single source of truth for all billing enums and state machine

// Invoice lifecycle statuses
export const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID', 'UNCOLLECTIBLE'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

// Payment tracking within invoice
export const PAYMENT_STATUSES = [
  'PENDING',
  'PARTIALLY_PAID',
  'PAID',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Payment methods
export const PAYMENT_METHODS = [
  'CARD',
  'BANK_TRANSFER',
  'ACH',
  'PAYPAL',
  'MANUAL',
  'CREDIT',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// Line item types
export const LINE_ITEM_TYPES = ['SUBSCRIPTION', 'ONE_TIME', 'USAGE', 'CREDIT', 'DISCOUNT'] as const;
export type LineItemType = (typeof LINE_ITEM_TYPES)[number];

// Tax types
export const TAX_TYPES = ['VAT', 'SALES_TAX', 'GST', 'NONE'] as const;
export type TaxType = (typeof TAX_TYPES)[number];

// Refund reasons
export const REFUND_REASONS = [
  'CUSTOMER_REQUEST',
  'DUPLICATE_PAYMENT',
  'BILLING_ERROR',
  'SERVICE_NOT_DELIVERED',
  'SUBSCRIPTION_CANCELLED',
  'OTHER',
] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

// State machine transitions
export const VALID_INVOICE_TRANSITIONS: Record<InvoiceStatus, readonly InvoiceStatus[]> = {
  DRAFT: ['OPEN', 'VOID'],
  OPEN: ['PAID', 'VOID', 'UNCOLLECTIBLE'],
  PAID: [],
  VOID: [],
  UNCOLLECTIBLE: [],
};

export function canTransitionInvoiceTo(from: InvoiceStatus, to: InvoiceStatus): boolean {
  return VALID_INVOICE_TRANSITIONS[from].includes(to);
}

export function isTerminalInvoiceStatus(status: InvoiceStatus): boolean {
  return VALID_INVOICE_TRANSITIONS[status].length === 0;
}
