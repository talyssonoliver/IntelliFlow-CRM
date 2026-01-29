/**
 * Billing Validation Schemas
 *
 * Zod schemas for billing operations including subscriptions,
 * invoices, payment methods, and plan management.
 *
 * @implements PG-025 (Billing Portal)
 */

import { z } from 'zod';
import { paginationSchema } from './common';

// ============================================
// Enums - Stripe status values
// ============================================

export const SUBSCRIPTION_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;

export const INVOICE_STATUSES = [
  'draft',
  'open',
  'paid',
  'uncollectible',
  'void',
] as const;

export const PAYMENT_METHOD_TYPES = [
  'card',
  'bank_account',
  'sepa_debit',
  'ideal',
  'paypal',
] as const;

export const subscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES);
export const invoiceStatusSchema = z.enum(INVOICE_STATUSES);
export const paymentMethodTypeSchema = z.enum(PAYMENT_METHOD_TYPES);

export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type InvoiceStatus = z.infer<typeof invoiceStatusSchema>;
export type PaymentMethodType = z.infer<typeof paymentMethodTypeSchema>;

// ============================================
// Card Details Schema
// ============================================

export const cardDetailsSchema = z.object({
  brand: z.string(),
  last4: z.string().length(4),
  expMonth: z.number().min(1).max(12),
  expYear: z.number().min(2020).max(2100),
  funding: z.string().optional(),
});

export type CardDetails = z.infer<typeof cardDetailsSchema>;

// ============================================
// Payment Method Schema
// ============================================

export const paymentMethodSchema = z.object({
  id: z.string(),
  type: paymentMethodTypeSchema,
  card: cardDetailsSchema.optional(),
  isDefault: z.boolean(),
  created: z.coerce.date(),
});

export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

// ============================================
// Subscription Schema
// ============================================

export const subscriptionSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  status: subscriptionStatusSchema,
  priceId: z.string(),
  planName: z.string().optional(),
  quantity: z.number().int().min(1),
  currency: z.string().length(3),
  currentPeriodStart: z.coerce.date(),
  currentPeriodEnd: z.coerce.date(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.coerce.date().nullable().optional(),
  trialStart: z.coerce.date().nullable().optional(),
  trialEnd: z.coerce.date().nullable().optional(),
});

export type Subscription = z.infer<typeof subscriptionSchema>;

// ============================================
// Invoice Schema
// ============================================

export const invoiceSchema = z.object({
  id: z.string(),
  customerId: z.string(),
  subscriptionId: z.string().optional(),
  status: invoiceStatusSchema,
  amountDue: z.number(),
  amountPaid: z.number(),
  amountRemaining: z.number(),
  currency: z.string().length(3),
  dueDate: z.coerce.date().nullable().optional(),
  paidAt: z.coerce.date().nullable().optional(),
  hostedInvoiceUrl: z.string().url().nullable().optional(),
  invoicePdf: z.string().url().nullable().optional(),
  created: z.coerce.date(),
});

export type Invoice = z.infer<typeof invoiceSchema>;

// ============================================
// Input Schemas
// ============================================

/**
 * List invoices with pagination
 */
export const listInvoicesInputSchema = paginationSchema.pick({
  page: true,
  limit: true,
});

export type ListInvoicesInput = z.infer<typeof listInvoicesInputSchema>;

/**
 * Update/attach payment method
 */
export const updatePaymentMethodInputSchema = z.object({
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
  setAsDefault: z.boolean().default(true),
});

export type UpdatePaymentMethodInput = z.infer<typeof updatePaymentMethodInputSchema>;

/**
 * Update subscription (change plan or quantity)
 */
export const updateSubscriptionInputSchema = z.object({
  priceId: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
}).refine((data) => data.priceId || data.quantity, {
  message: 'Either priceId or quantity must be provided',
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionInputSchema>;

/**
 * Cancel subscription
 */
export const cancelSubscriptionInputSchema = z.object({
  atPeriodEnd: z.boolean().default(true),
  reason: z.string().max(500).optional(),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionInputSchema>;

/**
 * Get upcoming invoice preview (proration)
 */
export const getUpcomingInvoiceInputSchema = z.object({
  priceId: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
});

export type GetUpcomingInvoiceInput = z.infer<typeof getUpcomingInvoiceInputSchema>;

// ============================================
// Response Schemas
// ============================================

/**
 * Paginated invoices response
 */
export const invoiceListResponseSchema = z.object({
  invoices: z.array(invoiceSchema),
  total: z.number().int().min(0),
  page: z.number().int().min(1),
  limit: z.number().int().min(1),
  hasMore: z.boolean(),
});

export type InvoiceListResponse = z.infer<typeof invoiceListResponseSchema>;

/**
 * Proration preview response
 */
export const prorationPreviewSchema = z.object({
  amountDue: z.number(),
  currency: z.string().length(3),
  prorationDate: z.coerce.date(),
  invoiceItems: z.array(
    z.object({
      description: z.string(),
      amount: z.number(),
    })
  ),
});

export type ProrationPreview = z.infer<typeof prorationPreviewSchema>;

/**
 * Usage metrics
 */
export const usageMetricsSchema = z.object({
  apiCalls: z.object({
    current: z.number().int().min(0),
    limit: z.number().int().min(0),
  }),
  storage: z.object({
    current: z.number().min(0),
    limit: z.number().min(0),
    unit: z.enum(['GB', 'MB']).default('GB'),
  }),
  activeUsers: z.object({
    current: z.number().int().min(0),
    limit: z.number().int().min(0),
  }),
});

export type UsageMetrics = z.infer<typeof usageMetricsSchema>;

// ============================================
// Plan Configuration Schema
// ============================================

export const planFeatureSchema = z.object({
  name: z.string(),
  included: z.boolean(),
  limit: z.number().optional(),
});

export const planSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  priceMonthly: z.number().int().min(0),
  priceAnnual: z.number().int().min(0),
  currency: z.string().length(3).default('GBP'),
  features: z.array(planFeatureSchema),
  popular: z.boolean().default(false),
  maxUsers: z.number().int().min(1).nullable(),
});

export type Plan = z.infer<typeof planSchema>;
export type PlanFeature = z.infer<typeof planFeatureSchema>;

// ============================================
// Checkout Schemas (PG-026)
// ============================================

export const BILLING_CYCLES = ['monthly', 'annual'] as const;
export const billingCycleSchema = z.enum(BILLING_CYCLES);
export type BillingCycle = z.infer<typeof billingCycleSchema>;

/**
 * Create checkout subscription input
 * Used when user submits checkout form with card details
 */
export const createCheckoutInputSchema = z.object({
  planId: z.string().min(1, 'Plan ID is required'),
  billingCycle: billingCycleSchema,
  paymentMethodId: z.string().min(1, 'Payment method ID is required'),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutInputSchema>;

/**
 * Checkout response with subscription details
 * Includes clientSecret for 3D Secure handling
 */
export const checkoutResponseSchema = z.object({
  subscriptionId: z.string(),
  status: subscriptionStatusSchema,
  clientSecret: z.string().nullable().optional(),
  currentPeriodEnd: z.coerce.date(),
});

export type CheckoutResponse = z.infer<typeof checkoutResponseSchema>;

/**
 * Payment error codes for checkout form
 */
export const PAYMENT_ERROR_CODES = [
  'CARD_DECLINED',
  'EXPIRED_CARD',
  'INSUFFICIENT_FUNDS',
  'PROCESSING_ERROR',
  'VALIDATION_ERROR',
  'INVALID_CVC',
  'INVALID_EXPIRY',
  'INVALID_NUMBER',
  'RATE_LIMIT',
] as const;

export const paymentErrorCodeSchema = z.enum(PAYMENT_ERROR_CODES);
export type PaymentErrorCode = z.infer<typeof paymentErrorCodeSchema>;

/**
 * Card brand detection for UI display
 */
export const CARD_BRANDS = [
  'visa',
  'mastercard',
  'amex',
  'discover',
  'diners',
  'jcb',
  'unionpay',
  'unknown',
] as const;

export const cardBrandSchema = z.enum(CARD_BRANDS);
export type CardBrand = z.infer<typeof cardBrandSchema>;
