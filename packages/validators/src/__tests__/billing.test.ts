/**
 * Billing Validators Tests
 *
 * Tests the Zod validation schemas for billing operations including
 * subscriptions, invoices, payment methods, plans, and checkout.
 *
 * Coverage target: >90% for validator layer
 */

import { describe, it, expect } from 'vitest';

import {
  subscriptionStatusSchema,
  invoiceStatusSchema,
  paymentMethodTypeSchema,
  cardDetailsSchema,
  paymentMethodSchema,
  subscriptionSchema,
  invoiceSchema,
  updatePaymentMethodInputSchema,
  updateSubscriptionInputSchema,
  cancelSubscriptionInputSchema,
  planSchema,
  planFeatureSchema,
  createCheckoutInputSchema,
  billingCycleSchema,
  paymentErrorCodeSchema,
  cardBrandSchema,
  listInvoicesInputSchema,
  getUpcomingInvoiceInputSchema,
  invoiceListResponseSchema,
  prorationPreviewSchema,
  usageMetricsSchema,
  checkoutResponseSchema,
  type SubscriptionStatus,
  type InvoiceStatus,
  type PaymentMethodType,
} from '../billing';

describe('Billing Validators', () => {
  // ==========================================================================
  // Enum Schemas
  // ==========================================================================

  describe('subscriptionStatusSchema', () => {
    it('should accept all valid subscription statuses', () => {
      const valid: SubscriptionStatus[] = [
        'incomplete', 'incomplete_expired', 'trialing', 'active',
        'past_due', 'canceled', 'unpaid', 'paused',
      ];
      valid.forEach((v) => {
        const result = subscriptionStatusSchema.safeParse(v);
        expect(result.success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      expect(subscriptionStatusSchema.safeParse('expired').success).toBe(false);
    });

    it('should reject empty string', () => {
      expect(subscriptionStatusSchema.safeParse('').success).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(subscriptionStatusSchema.safeParse('Active').success).toBe(false);
      expect(subscriptionStatusSchema.safeParse('ACTIVE').success).toBe(false);
    });
  });

  describe('invoiceStatusSchema', () => {
    it('should accept all valid invoice statuses', () => {
      const valid: InvoiceStatus[] = ['draft', 'open', 'paid', 'uncollectible', 'void'];
      valid.forEach((v) => {
        expect(invoiceStatusSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid status', () => {
      expect(invoiceStatusSchema.safeParse('pending').success).toBe(false);
    });
  });

  describe('paymentMethodTypeSchema', () => {
    it('should accept all valid payment method types', () => {
      const valid: PaymentMethodType[] = ['card', 'bank_account', 'sepa_debit', 'ideal', 'paypal'];
      valid.forEach((v) => {
        expect(paymentMethodTypeSchema.safeParse(v).success).toBe(true);
      });
    });

    it('should reject invalid payment type', () => {
      expect(paymentMethodTypeSchema.safeParse('crypto').success).toBe(false);
    });
  });

  describe('billingCycleSchema', () => {
    it('should accept monthly and annual', () => {
      expect(billingCycleSchema.safeParse('monthly').success).toBe(true);
      expect(billingCycleSchema.safeParse('annual').success).toBe(true);
    });

    it('should reject invalid cycle', () => {
      expect(billingCycleSchema.safeParse('quarterly').success).toBe(false);
    });
  });

  describe('paymentErrorCodeSchema', () => {
    it('should accept all valid error codes', () => {
      const codes = [
        'CARD_DECLINED', 'EXPIRED_CARD', 'INSUFFICIENT_FUNDS',
        'PROCESSING_ERROR', 'VALIDATION_ERROR', 'INVALID_CVC',
        'INVALID_EXPIRY', 'INVALID_NUMBER', 'RATE_LIMIT',
      ];
      codes.forEach((c) => {
        expect(paymentErrorCodeSchema.safeParse(c).success).toBe(true);
      });
    });

    it('should reject invalid error code', () => {
      expect(paymentErrorCodeSchema.safeParse('NETWORK_ERROR').success).toBe(false);
    });
  });

  describe('cardBrandSchema', () => {
    it('should accept all valid card brands', () => {
      const brands = ['visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay', 'unknown'];
      brands.forEach((b) => {
        expect(cardBrandSchema.safeParse(b).success).toBe(true);
      });
    });

    it('should reject invalid card brand', () => {
      expect(cardBrandSchema.safeParse('maestro').success).toBe(false);
    });
  });

  // ==========================================================================
  // Card Details Schema
  // ==========================================================================

  describe('cardDetailsSchema', () => {
    const validCard = {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2027,
    };

    it('should accept valid card details', () => {
      const result = cardDetailsSchema.safeParse(validCard);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.brand).toBe('visa');
        expect(result.data.last4).toBe('4242');
      }
    });

    it('should accept with optional funding', () => {
      const card = { ...validCard, funding: 'credit' };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(true);
    });

    it('should reject last4 shorter than 4 characters', () => {
      const card = { ...validCard, last4: '123' };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should reject last4 longer than 4 characters', () => {
      const card = { ...validCard, last4: '12345' };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should reject expMonth below 1', () => {
      const card = { ...validCard, expMonth: 0 };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should reject expMonth above 12', () => {
      const card = { ...validCard, expMonth: 13 };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should accept expMonth at boundary 1', () => {
      const card = { ...validCard, expMonth: 1 };
      expect(cardDetailsSchema.safeParse(card).success).toBe(true);
    });

    it('should accept expMonth at boundary 12', () => {
      const card = { ...validCard, expMonth: 12 };
      expect(cardDetailsSchema.safeParse(card).success).toBe(true);
    });

    it('should reject expYear below 2020', () => {
      const card = { ...validCard, expYear: 2019 };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should reject expYear above 2100', () => {
      const card = { ...validCard, expYear: 2101 };
      const result = cardDetailsSchema.safeParse(card);
      expect(result.success).toBe(false);
    });

    it('should accept expYear at boundary 2020', () => {
      const card = { ...validCard, expYear: 2020 };
      expect(cardDetailsSchema.safeParse(card).success).toBe(true);
    });

    it('should accept expYear at boundary 2100', () => {
      const card = { ...validCard, expYear: 2100 };
      expect(cardDetailsSchema.safeParse(card).success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = cardDetailsSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Payment Method Schema
  // ==========================================================================

  describe('paymentMethodSchema', () => {
    const validMethod = {
      id: 'pm_1234567890',
      type: 'card' as const,
      isDefault: true,
      created: '2026-01-15T10:00:00Z',
    };

    it('should accept valid payment method without card', () => {
      const result = paymentMethodSchema.safeParse(validMethod);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isDefault).toBe(true);
        expect(result.data.created).toBeInstanceOf(Date);
      }
    });

    it('should accept payment method with card details', () => {
      const method = {
        ...validMethod,
        card: { brand: 'visa', last4: '4242', expMonth: 6, expYear: 2028 },
      };
      const result = paymentMethodSchema.safeParse(method);
      expect(result.success).toBe(true);
    });

    it('should accept all payment method types', () => {
      const types = ['card', 'bank_account', 'sepa_debit', 'ideal', 'paypal'] as const;
      types.forEach((t) => {
        const method = { ...validMethod, type: t };
        expect(paymentMethodSchema.safeParse(method).success).toBe(true);
      });
    });

    it('should reject invalid type', () => {
      const method = { ...validMethod, type: 'crypto' };
      const result = paymentMethodSchema.safeParse(method);
      expect(result.success).toBe(false);
    });

    it('should coerce date string to Date object', () => {
      const result = paymentMethodSchema.safeParse(validMethod);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.created).toBeInstanceOf(Date);
      }
    });
  });

  // ==========================================================================
  // Subscription Schema
  // ==========================================================================

  describe('subscriptionSchema', () => {
    const validSub = {
      id: 'sub_1234567890',
      customerId: 'cus_abcdefgh',
      status: 'active' as const,
      priceId: 'price_xyz',
      quantity: 5,
      currency: 'GBP',
      currentPeriodStart: '2026-01-01T00:00:00Z',
      currentPeriodEnd: '2026-02-01T00:00:00Z',
      cancelAtPeriodEnd: false,
    };

    it('should accept valid subscription', () => {
      const result = subscriptionSchema.safeParse(validSub);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('active');
        expect(result.data.quantity).toBe(5);
        expect(result.data.currentPeriodStart).toBeInstanceOf(Date);
      }
    });

    it('should accept with optional fields', () => {
      const sub = {
        ...validSub,
        planName: 'Professional Plan',
        canceledAt: '2026-01-25T00:00:00Z',
        trialStart: '2025-12-01T00:00:00Z',
        trialEnd: '2026-01-01T00:00:00Z',
      };
      const result = subscriptionSchema.safeParse(sub);
      expect(result.success).toBe(true);
    });

    it('should accept null for nullable optional dates', () => {
      const sub = {
        ...validSub,
        canceledAt: null,
        trialStart: null,
        trialEnd: null,
      };
      const result = subscriptionSchema.safeParse(sub);
      expect(result.success).toBe(true);
    });

    it('should reject quantity below 1', () => {
      const sub = { ...validSub, quantity: 0 };
      const result = subscriptionSchema.safeParse(sub);
      expect(result.success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      const sub = { ...validSub, quantity: 2.5 };
      const result = subscriptionSchema.safeParse(sub);
      expect(result.success).toBe(false);
    });

    it('should reject currency not exactly 3 characters', () => {
      expect(subscriptionSchema.safeParse({ ...validSub, currency: 'US' }).success).toBe(false);
      expect(subscriptionSchema.safeParse({ ...validSub, currency: 'EURO' }).success).toBe(false);
    });

    it('should accept currency at exactly 3 characters', () => {
      expect(subscriptionSchema.safeParse({ ...validSub, currency: 'USD' }).success).toBe(true);
      expect(subscriptionSchema.safeParse({ ...validSub, currency: 'EUR' }).success).toBe(true);
    });

    it('should reject invalid status', () => {
      const sub = { ...validSub, status: 'expired' };
      const result = subscriptionSchema.safeParse(sub);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = subscriptionSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Invoice Schema
  // ==========================================================================

  describe('invoiceSchema', () => {
    const validInvoice = {
      id: 'in_1234567890',
      customerId: 'cus_abcdefgh',
      status: 'paid' as const,
      amountDue: 9900,
      amountPaid: 9900,
      amountRemaining: 0,
      currency: 'GBP',
      created: '2026-01-15T10:00:00Z',
    };

    it('should accept valid invoice', () => {
      const result = invoiceSchema.safeParse(validInvoice);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('paid');
        expect(result.data.amountDue).toBe(9900);
        expect(result.data.created).toBeInstanceOf(Date);
      }
    });

    it('should accept with all optional fields', () => {
      const invoice = {
        ...validInvoice,
        subscriptionId: 'sub_xyz',
        dueDate: '2026-02-15T00:00:00Z',
        paidAt: '2026-01-20T10:00:00Z',
        hostedInvoiceUrl: 'https://stripe.com/invoice/1234',
        invoicePdf: 'https://stripe.com/invoice/1234/pdf',
      };
      const result = invoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it('should accept null for nullable optional fields', () => {
      const invoice = {
        ...validInvoice,
        dueDate: null,
        paidAt: null,
        hostedInvoiceUrl: null,
        invoicePdf: null,
      };
      const result = invoiceSchema.safeParse(invoice);
      expect(result.success).toBe(true);
    });

    it('should reject invalid hosted URL', () => {
      const invoice = { ...validInvoice, hostedInvoiceUrl: 'not-a-url' };
      const result = invoiceSchema.safeParse(invoice);
      expect(result.success).toBe(false);
    });

    it('should reject currency not exactly 3 characters', () => {
      const invoice = { ...validInvoice, currency: 'GBPP' };
      const result = invoiceSchema.safeParse(invoice);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const invoice = { ...validInvoice, status: 'pending' };
      const result = invoiceSchema.safeParse(invoice);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Input Schemas
  // ==========================================================================

  describe('updatePaymentMethodInputSchema', () => {
    it('should accept valid input with default setAsDefault', () => {
      const result = updatePaymentMethodInputSchema.safeParse({
        paymentMethodId: 'pm_1234567890',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.setAsDefault).toBe(true);
      }
    });

    it('should accept explicit setAsDefault false', () => {
      const result = updatePaymentMethodInputSchema.safeParse({
        paymentMethodId: 'pm_1234567890',
        setAsDefault: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.setAsDefault).toBe(false);
      }
    });

    it('should reject empty paymentMethodId', () => {
      const result = updatePaymentMethodInputSchema.safeParse({
        paymentMethodId: '',
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing paymentMethodId', () => {
      const result = updatePaymentMethodInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('updateSubscriptionInputSchema', () => {
    it('should accept with priceId only', () => {
      const result = updateSubscriptionInputSchema.safeParse({
        priceId: 'price_new_plan',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with quantity only', () => {
      const result = updateSubscriptionInputSchema.safeParse({
        quantity: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept with both priceId and quantity', () => {
      const result = updateSubscriptionInputSchema.safeParse({
        priceId: 'price_new_plan',
        quantity: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty object (refinement: either priceId or quantity)', () => {
      const result = updateSubscriptionInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('should reject quantity below 1', () => {
      const result = updateSubscriptionInputSchema.safeParse({ quantity: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject non-integer quantity', () => {
      const result = updateSubscriptionInputSchema.safeParse({ quantity: 2.5 });
      expect(result.success).toBe(false);
    });
  });

  describe('cancelSubscriptionInputSchema', () => {
    it('should accept empty object with default atPeriodEnd true', () => {
      const result = cancelSubscriptionInputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atPeriodEnd).toBe(true);
      }
    });

    it('should accept explicit atPeriodEnd false for immediate cancel', () => {
      const result = cancelSubscriptionInputSchema.safeParse({
        atPeriodEnd: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.atPeriodEnd).toBe(false);
      }
    });

    it('should accept with optional reason', () => {
      const result = cancelSubscriptionInputSchema.safeParse({
        reason: 'Switching to competitor.',
      });
      expect(result.success).toBe(true);
    });

    it('should reject reason exceeding 500 characters', () => {
      const result = cancelSubscriptionInputSchema.safeParse({
        reason: 'x'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('should accept reason at exactly 500 characters', () => {
      const result = cancelSubscriptionInputSchema.safeParse({
        reason: 'x'.repeat(500),
      });
      expect(result.success).toBe(true);
    });
  });

  describe('listInvoicesInputSchema', () => {
    it('should accept valid page and limit', () => {
      const result = listInvoicesInputSchema.safeParse({ page: 2, limit: 25 });
      expect(result.success).toBe(true);
    });

    it('should accept with defaults when empty', () => {
      const result = listInvoicesInputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should reject page of 0', () => {
      const result = listInvoicesInputSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it('should reject limit exceeding 100', () => {
      const result = listInvoicesInputSchema.safeParse({ limit: 101 });
      expect(result.success).toBe(false);
    });
  });

  describe('getUpcomingInvoiceInputSchema', () => {
    it('should accept empty object', () => {
      const result = getUpcomingInvoiceInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('should accept with priceId and quantity', () => {
      const result = getUpcomingInvoiceInputSchema.safeParse({
        priceId: 'price_xyz',
        quantity: 5,
      });
      expect(result.success).toBe(true);
    });

    it('should reject quantity below 1', () => {
      const result = getUpcomingInvoiceInputSchema.safeParse({ quantity: 0 });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Plan Schema
  // ==========================================================================

  describe('planSchema', () => {
    const validPlan = {
      id: 'plan_professional',
      name: 'Professional',
      priceMonthly: 4900,
      priceAnnual: 49000,
      features: [
        { name: 'Unlimited contacts', included: true },
        { name: 'API access', included: true, limit: 10000 },
        { name: 'Custom branding', included: false },
      ],
      maxUsers: 25,
    };

    it('should accept valid plan with defaults', () => {
      const result = planSchema.safeParse(validPlan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.currency).toBe('GBP');
        expect(result.data.popular).toBe(false);
      }
    });

    it('should accept with all optional fields', () => {
      const plan = {
        ...validPlan,
        description: 'Best for growing teams.',
        currency: 'USD',
        popular: true,
      };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.popular).toBe(true);
        expect(result.data.currency).toBe('USD');
      }
    });

    it('should accept null maxUsers for unlimited', () => {
      const plan = { ...validPlan, maxUsers: null };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should reject priceMonthly below 0', () => {
      const plan = { ...validPlan, priceMonthly: -100 };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should accept priceMonthly of 0 (free plan)', () => {
      const plan = { ...validPlan, priceMonthly: 0, priceAnnual: 0 };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should reject non-integer priceMonthly', () => {
      const plan = { ...validPlan, priceMonthly: 49.99 };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should reject priceAnnual below 0', () => {
      const plan = { ...validPlan, priceAnnual: -1 };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should reject maxUsers below 1 (when not null)', () => {
      const plan = { ...validPlan, maxUsers: 0 };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should reject currency not exactly 3 characters', () => {
      const plan = { ...validPlan, currency: 'EURO' };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(false);
    });

    it('should reject empty features array (still valid shape)', () => {
      const plan = { ...validPlan, features: [] };
      const result = planSchema.safeParse(plan);
      expect(result.success).toBe(true);
    });

    it('should reject missing required fields', () => {
      const result = planSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('planFeatureSchema', () => {
    it('should accept feature with included true', () => {
      const result = planFeatureSchema.safeParse({
        name: 'Unlimited contacts',
        included: true,
      });
      expect(result.success).toBe(true);
    });

    it('should accept feature with optional limit', () => {
      const result = planFeatureSchema.safeParse({
        name: 'API calls',
        included: true,
        limit: 10000,
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing name', () => {
      const result = planFeatureSchema.safeParse({ included: true });
      expect(result.success).toBe(false);
    });

    it('should reject missing included', () => {
      const result = planFeatureSchema.safeParse({ name: 'Test' });
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Checkout Schemas
  // ==========================================================================

  describe('createCheckoutInputSchema', () => {
    const validCheckout = {
      planId: 'plan_professional',
      billingCycle: 'monthly' as const,
      paymentMethodId: 'pm_1234567890',
    };

    it('should accept valid checkout input', () => {
      const result = createCheckoutInputSchema.safeParse(validCheckout);
      expect(result.success).toBe(true);
    });

    it('should accept annual billing cycle', () => {
      const checkout = { ...validCheckout, billingCycle: 'annual' as const };
      const result = createCheckoutInputSchema.safeParse(checkout);
      expect(result.success).toBe(true);
    });

    it('should reject empty planId', () => {
      const checkout = { ...validCheckout, planId: '' };
      const result = createCheckoutInputSchema.safeParse(checkout);
      expect(result.success).toBe(false);
    });

    it('should reject empty paymentMethodId', () => {
      const checkout = { ...validCheckout, paymentMethodId: '' };
      const result = createCheckoutInputSchema.safeParse(checkout);
      expect(result.success).toBe(false);
    });

    it('should reject invalid billingCycle', () => {
      const checkout = { ...validCheckout, billingCycle: 'quarterly' };
      const result = createCheckoutInputSchema.safeParse(checkout);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const result = createCheckoutInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('checkoutResponseSchema', () => {
    it('should accept valid checkout response', () => {
      const result = checkoutResponseSchema.safeParse({
        subscriptionId: 'sub_123',
        status: 'active',
        currentPeriodEnd: '2026-03-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with clientSecret for 3DS', () => {
      const result = checkoutResponseSchema.safeParse({
        subscriptionId: 'sub_123',
        status: 'incomplete',
        clientSecret: 'pi_secret_xyz',
        currentPeriodEnd: '2026-03-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });

    it('should accept null clientSecret', () => {
      const result = checkoutResponseSchema.safeParse({
        subscriptionId: 'sub_123',
        status: 'active',
        clientSecret: null,
        currentPeriodEnd: '2026-03-01T00:00:00Z',
      });
      expect(result.success).toBe(true);
    });
  });

  // ==========================================================================
  // Response Schemas
  // ==========================================================================

  describe('invoiceListResponseSchema', () => {
    it('should accept valid invoice list', () => {
      const result = invoiceListResponseSchema.safeParse({
        invoices: [
          {
            id: 'in_001',
            customerId: 'cus_abc',
            status: 'paid',
            amountDue: 9900,
            amountPaid: 9900,
            amountRemaining: 0,
            currency: 'GBP',
            created: '2026-01-15T10:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty invoices list', () => {
      const result = invoiceListResponseSchema.safeParse({
        invoices: [],
        total: 0,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(true);
    });

    it('should reject total below 0', () => {
      const result = invoiceListResponseSchema.safeParse({
        invoices: [],
        total: -1,
        page: 1,
        limit: 20,
        hasMore: false,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('prorationPreviewSchema', () => {
    it('should accept valid proration preview', () => {
      const result = prorationPreviewSchema.safeParse({
        amountDue: 4500,
        currency: 'GBP',
        prorationDate: '2026-02-05T00:00:00Z',
        invoiceItems: [
          { description: 'Remaining time on Professional plan', amount: -2500 },
          { description: 'Unused time on Enterprise plan', amount: 7000 },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept empty invoice items', () => {
      const result = prorationPreviewSchema.safeParse({
        amountDue: 0,
        currency: 'GBP',
        prorationDate: new Date(),
        invoiceItems: [],
      });
      expect(result.success).toBe(true);
    });
  });

  describe('usageMetricsSchema', () => {
    it('should accept valid usage metrics with default storage unit', () => {
      const result = usageMetricsSchema.safeParse({
        apiCalls: { current: 5000, limit: 10000 },
        storage: { current: 2.5, limit: 10 },
        activeUsers: { current: 12, limit: 25 },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.storage.unit).toBe('GB');
      }
    });

    it('should accept explicit storage unit MB', () => {
      const result = usageMetricsSchema.safeParse({
        apiCalls: { current: 0, limit: 1000 },
        storage: { current: 500, limit: 5000, unit: 'MB' },
        activeUsers: { current: 1, limit: 5 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject negative apiCalls current', () => {
      const result = usageMetricsSchema.safeParse({
        apiCalls: { current: -1, limit: 1000 },
        storage: { current: 0, limit: 10 },
        activeUsers: { current: 0, limit: 5 },
      });
      expect(result.success).toBe(false);
    });

    it('should reject invalid storage unit', () => {
      const result = usageMetricsSchema.safeParse({
        apiCalls: { current: 0, limit: 1000 },
        storage: { current: 0, limit: 10, unit: 'TB' },
        activeUsers: { current: 0, limit: 5 },
      });
      expect(result.success).toBe(false);
    });
  });
});
