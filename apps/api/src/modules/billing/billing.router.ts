/**
 * Billing Router
 *
 * Provides type-safe tRPC endpoints for billing management:
 * - Subscription management
 * - Payment methods
 * - Invoice history
 * - Usage metrics
 *
 * Uses existing StripeAdapter from packages/adapters.
 * Implements server-side caching to avoid hitting Stripe on every page load.
 * Cache is invalidated by webhook events.
 *
 * @implements PG-025 (Billing Portal)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import {
  createTRPCRouter,
  tenantProcedure,
  verifiedTenantProcedure,
  publicProcedure,
} from '../../trpc';
import {
  listInvoicesInputSchema,
  getInvoiceInputSchema,
  payInvoiceInputSchema,
  updatePaymentMethodInputSchema,
  updateSubscriptionInputSchema,
  cancelSubscriptionInputSchema,
  pauseSubscriptionInputSchema,
  getUpcomingInvoiceInputSchema,
  updateBillingInformationInputSchema,
} from '@intelliflow/validators';
import { callStripeAPI } from '../../shared/external-service-wrapper';
import { mapErrorToTRPCError } from '../../shared/error-mapper';
import { createSubscriptionSyncHandler } from './subscription-sync';
import { buildReceiptEmail } from './receipt-email';
import {
  PLAN_TIERS,
  type PlanTier,
  SubscriptionCanceledEvent,
  SubscriptionPausedEvent,
} from '@intelliflow/domain';
import { formatDateTimeInTimezone } from '../../lib/timezone-utils';

// ============================================
// Local Type Definitions (from StripeAdapter)
// ============================================

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
  apiVersion?: string;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  latestInvoicePaymentIntentClientSecret?: string;
}

export interface StripeInvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  amount: number;
  currency: string;
}

export interface StripeInvoice {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  dueDate?: Date;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  created: Date;
  number?: string;
  subtotal?: number;
  tax?: number;
  discount?: number;
  customerEmail?: string;
  customerName?: string;
  paymentMethodBrand?: string;
  paymentMethodLast4?: string;
  billingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
  };
  lineItems?: StripeInvoiceLineItem[];
}

export interface StripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'sepa_debit' | 'ideal' | 'paypal';
  customerId?: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding: string;
  };
  billingDetails: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  created: Date;
}

export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  defaultPaymentMethodId?: string;
  balance: number;
  currency: string;
  created: Date;
}

// Simple Result type for Stripe operations
interface StripeResult<T> {
  isSuccess: boolean;
  isFailure: boolean;
  value: T;
  error: { message: string };
}

// Mock StripeAdapter interface for type safety
interface IStripeAdapter {
  createCustomer(params: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeResult<StripeCustomer>>;
  getCustomer(customerId: string): Promise<StripeResult<StripeCustomer | null>>;
  getInvoice(invoiceId: string): Promise<StripeResult<StripeInvoice | null>>;
  payInvoice(invoiceId: string): Promise<StripeResult<StripeInvoice>>;
  listSubscriptions(customerId: string): Promise<StripeResult<StripeSubscription[]>>;
  listInvoices(customerId: string): Promise<StripeResult<StripeInvoice[]>>;
  listPaymentMethods(customerId: string): Promise<StripeResult<StripePaymentMethod[]>>;
  attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<StripeResult<StripePaymentMethod>>;
  detachPaymentMethod(paymentMethodId: string): Promise<StripeResult<StripePaymentMethod>>;
  updateCustomer(
    customerId: string,
    params: { defaultPaymentMethodId?: string; email?: string; name?: string }
  ): Promise<StripeResult<StripeCustomer>>;
  updateSubscription(
    subscriptionId: string,
    params: { priceId?: string; quantity?: number }
  ): Promise<StripeResult<StripeSubscription>>;
  cancelSubscription(
    subscriptionId: string,
    atPeriodEnd?: boolean
  ): Promise<StripeResult<StripeSubscription>>;
  pauseSubscription(
    subscriptionId: string,
    resumesAt: Date
  ): Promise<StripeResult<StripeSubscription>>;
  createSubscription(params: {
    customerId: string;
    priceId: string;
    paymentMethodId: string;
    metadata?: Record<string, string>;
  }): Promise<StripeResult<StripeSubscription>>;
}

// ============================================
// Stripe Adapter Factory
// ============================================

// Dynamic import of StripeAdapter to avoid module resolution issues
let StripeAdapterClass: new (config: StripeConfig) => IStripeAdapter;

async function loadStripeAdapter(): Promise<void> {
  if (!StripeAdapterClass) {
    const adapters = (await import('@intelliflow/adapters')) as any;
    StripeAdapterClass = adapters.StripeAdapter;
  }
}

/**
 * Get configured Stripe adapter
 * Throws if Stripe is not configured
 */
async function getStripeAdapter(): Promise<IStripeAdapter> {
  await loadStripeAdapter();

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.',
    });
  }

  const config: StripeConfig = {
    secretKey,
    webhookSecret,
    apiVersion: '2024-12-18.acacia',
  };

  return new StripeAdapterClass(config);
}

// ============================================
// Billing Data Cache
// ============================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const billingCache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
  const entry = billingCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    billingCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
  billingCache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Invalidate all cache entries for a given Stripe customer.
 * Called after mutations and webhook events.
 */
export function invalidateBillingCache(customerId: string): void {
  for (const key of billingCache.keys()) {
    if (key.startsWith(customerId)) {
      billingCache.delete(key);
    }
  }
}

/**
 * Clear the entire billing cache.
 * Exported for use in tests to prevent cross-test contamination.
 */
export function clearBillingCache(): void {
  billingCache.clear();
}

// ============================================
// Billing Router
// ============================================

export const billingRouter = createTRPCRouter({
  /**
   * Get current subscription for the authenticated user
   *
   * Returns null if user has no Stripe customer ID or no active subscription.
   * Uses server-side cache to avoid hitting Stripe on every page load.
   */
  getSubscription: tenantProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return null;
    }

    const cacheKey = `${user.stripeCustomerId}:subscription`;
    const cached = getCached<StripeSubscription | null>(cacheKey);
    if (cached !== undefined) return cached;

    try {
      const stripe = await getStripeAdapter();
      const result = await callStripeAPI(() => stripe.listSubscriptions(user.stripeCustomerId!));

      if (result.isFailure) {
        throw mapErrorToTRPCError(result.error);
      }

      const subscriptions = result.value;
      const activeSubscription = subscriptions.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      const data = activeSubscription ?? (subscriptions.length > 0 ? subscriptions[0] : null);
      setCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * List invoices with pagination
   *
   * NOTE (R-003): Currently fetches all invoices from Stripe then slices in memory.
   * Acceptable for MVP (Stripe limits ~100 invoices by default). Optimize with Stripe
   * cursor-based pagination (starting_after param) when customers exceed this threshold.
   */
  listInvoices: tenantProcedure.input(listInvoicesInputSchema).query(async ({ ctx, input }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return {
        invoices: [] as StripeInvoice[],
        total: 0,
        page: input.page,
        limit: input.limit,
        hasMore: false,
      };
    }

    const cacheKey = `${user.stripeCustomerId}:invoices`;
    let allInvoices = getCached<StripeInvoice[]>(cacheKey);

    if (allInvoices === undefined) {
      const stripe = await getStripeAdapter();
      const result = await stripe.listInvoices(user.stripeCustomerId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }

      allInvoices = result.value;
      setCache(cacheKey, allInvoices);
    }

    const { page, limit } = input;
    const start = (page - 1) * limit;
    const paginatedInvoices = allInvoices.slice(start, start + limit);

    return {
      invoices: paginatedInvoices,
      total: allInvoices.length,
      page,
      limit,
      hasMore: start + paginatedInvoices.length < allInvoices.length,
    };
  }),

  /**
   * Get a single invoice by ID
   *
   * Fetches invoice details with line items, tax, and customer info.
   * Includes ownership verification to prevent cross-tenant access.
   *
   * @implements PG-028 (Invoice Detail)
   */
  getInvoice: tenantProcedure.input(getInvoiceInputSchema).query(async ({ ctx, input }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'No billing account found.',
      });
    }

    const stripe = await getStripeAdapter();
    const result = await stripe.getInvoice(input.invoiceId);

    if (result.isFailure || !result.value) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Invoice not found.',
      });
    }

    const invoice = result.value;

    // Ownership check — prevent cross-tenant access
    if (invoice.customerId !== user.stripeCustomerId) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You do not have permission to view this invoice.',
      });
    }

    return invoice;
  }),

  /**
   * Pay an open invoice
   *
   * Verifies ownership and status before initiating payment.
   * Only open invoices with outstanding balance can be paid.
   *
   * @implements PG-028 (Invoice Detail)
   */
  // SECURITY (2026-06-16): all billing mutations require a verified email.
  payInvoice: verifiedTenantProcedure
    .input(payInvoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Fetch invoice first for ownership + status verification
      const getResult = await stripe.getInvoice(input.invoiceId);

      if (getResult.isFailure || !getResult.value) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Invoice not found.',
        });
      }

      const invoice = getResult.value;

      // Ownership check
      if (invoice.customerId !== user.stripeCustomerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to pay this invoice.',
        });
      }

      // Only open invoices can be paid
      if (invoice.status !== 'open') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Invoice cannot be paid. Current status: ${invoice.status}`,
        });
      }

      const payResult = await stripe.payInvoice(input.invoiceId);

      if (payResult.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: payResult.error.message,
        });
      }

      invalidateBillingCache(user.stripeCustomerId);
      return payResult.value;
    }),

  /**
   * Get payment methods for the user
   *
   * Returns cached data when available.
   */
  getPaymentMethods: tenantProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return [] as (StripePaymentMethod & { isDefault: boolean })[];
    }

    const cacheKey = `${user.stripeCustomerId}:paymentMethods`;
    const cached = getCached<(StripePaymentMethod & { isDefault: boolean })[]>(cacheKey);
    if (cached !== undefined) return cached;

    const stripe = await getStripeAdapter();
    const result = await stripe.listPaymentMethods(user.stripeCustomerId);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    // Get customer to check default payment method
    const customerResult = await stripe.getCustomer(user.stripeCustomerId);
    const defaultPaymentMethodId = customerResult.isSuccess
      ? customerResult.value?.defaultPaymentMethodId
      : null;

    // Map payment methods with isDefault flag
    const data = result.value.map((pm) => ({
      ...pm,
      isDefault: pm.id === defaultPaymentMethodId,
    }));

    setCache(cacheKey, data);
    return data;
  }),

  /**
   * Attach a new payment method to the customer
   */
  updatePaymentMethod: verifiedTenantProcedure
    .input(updatePaymentMethodInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found. Please set up billing first.',
        });
      }

      const stripe = await getStripeAdapter();

      // Attach payment method to customer
      const result = await stripe.attachPaymentMethod(input.paymentMethodId, user.stripeCustomerId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      // Set as default payment method if requested
      if (input.setAsDefault) {
        const updateResult = await stripe.updateCustomer(user.stripeCustomerId, {
          defaultPaymentMethodId: input.paymentMethodId,
        });

        if (updateResult.isFailure) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: updateResult.error.message,
          });
        }
      }

      invalidateBillingCache(user.stripeCustomerId);

      return {
        success: true,
        paymentMethod: result.value,
      };
    }),

  /**
   * Detach a payment method from the customer
   */
  removePaymentMethod: verifiedTenantProcedure
    .input(updatePaymentMethodInputSchema.pick({ paymentMethodId: true }))
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Check subscription guard before removing
      const subsResult = await stripe.listSubscriptions(user.stripeCustomerId);
      const hasActiveSub = subsResult.isSuccess
        ? subsResult.value.some((sub) => sub.status === 'active' || sub.status === 'trialing')
        : false;

      if (hasActiveSub) {
        const customerResult = await stripe.getCustomer(user.stripeCustomerId);
        const defaultPaymentMethodId = customerResult.isSuccess
          ? customerResult.value?.defaultPaymentMethodId
          : null;
        const isDefault = input.paymentMethodId === defaultPaymentMethodId;

        // Check if there are other payment methods
        const pmResult = await stripe.listPaymentMethods(user.stripeCustomerId);
        const otherMethods = pmResult.isSuccess
          ? pmResult.value.filter((pm) => pm.id !== input.paymentMethodId)
          : [];

        if (otherMethods.length === 0) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Cannot remove your only payment method while you have an active subscription. Please add another payment method first.',
          });
        }

        if (isDefault) {
          throw new TRPCError({
            code: 'PRECONDITION_FAILED',
            message:
              'Cannot remove default payment method while you have an active subscription. Please set another card as default first.',
          });
        }
      }

      const result = await stripe.detachPaymentMethod(input.paymentMethodId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      invalidateBillingCache(user.stripeCustomerId);
      return { success: true };
    }),

  /**
   * Update subscription (change plan or quantity)
   */
  updateSubscription: verifiedTenantProcedure
    .input(updateSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Get current subscription
      const subsResult = await stripe.listSubscriptions(user.stripeCustomerId);

      if (subsResult.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: subsResult.error.message,
        });
      }

      const activeSubscription = subsResult.value.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      if (!activeSubscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active subscription found.',
        });
      }

      const updateParams: { priceId?: string; quantity?: number; cancel_at_period_end?: boolean } =
        {
          priceId: input.priceId,
          quantity: input.quantity,
        };
      if (input.cancelAtPeriodEnd !== undefined) {
        updateParams.cancel_at_period_end = input.cancelAtPeriodEnd;
      }

      const result = await stripe.updateSubscription(activeSubscription.id, updateParams);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      // IFC-211: Sync modules after plan change
      if (user.tenantId && input.priceId) {
        try {
          const moduleAccess =
            ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
          if (moduleAccess) {
            // Map Stripe priceId to PlanTier (lookup from workspace or metadata)
            const plan = await moduleAccess.getTenantPlan(user.tenantId);
            await moduleAccess.syncModulesToPlan(user.tenantId, plan);
          }
        } catch (err) {
          // Module sync failure should not block subscription update
          console.error('[Billing] Failed to sync modules after plan change:', err);
        }
      }

      invalidateBillingCache(user.stripeCustomerId);
      return result.value;
    }),

  /**
   * Cancel subscription
   */
  cancelSubscription: verifiedTenantProcedure
    .input(cancelSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Get current subscription
      const subsResult = await stripe.listSubscriptions(user.stripeCustomerId);

      if (subsResult.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: subsResult.error.message,
        });
      }

      const activeSubscription = subsResult.value.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      if (!activeSubscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active subscription found.',
        });
      }

      const result = await stripe.cancelSubscription(activeSubscription.id, input.atPeriodEnd);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      // Emit domain event
      const cancelEvent = new SubscriptionCanceledEvent(
        activeSubscription.id,
        user.stripeCustomerId,
        input.reason,
        input.atPeriodEnd,
        new Date(result.value.currentPeriodEnd),
        user.tenantId
      );
      const eventBus = ctx.container?.adapters?.eventBus;
      if (eventBus) await eventBus.publish(cancelEvent);

      invalidateBillingCache(user.stripeCustomerId);
      return result.value;
    }),

  /**
   * Pause subscription for a specified duration
   *
   * Uses Stripe's pause_collection to temporarily suspend billing.
   * CRM data and AI training progress are preserved during pause.
   */
  pauseSubscription: verifiedTenantProcedure
    .input(pauseSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Get current subscription
      const subsResult = await stripe.listSubscriptions(user.stripeCustomerId);

      if (subsResult.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: subsResult.error.message,
        });
      }

      const activeSubscription = subsResult.value.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      if (!activeSubscription) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No active subscription found.',
        });
      }

      // Calculate resume date
      const resumesAt = new Date();
      resumesAt.setMonth(resumesAt.getMonth() + input.durationMonths);

      const result = await stripe.pauseSubscription(activeSubscription.id, resumesAt);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      // Emit domain event
      const pauseEvent = new SubscriptionPausedEvent(
        activeSubscription.id,
        user.stripeCustomerId,
        input.durationMonths,
        resumesAt,
        user.tenantId
      );
      const eventBus = ctx.container?.adapters?.eventBus;
      if (eventBus) await eventBus.publish(pauseEvent);

      invalidateBillingCache(user.stripeCustomerId);
      return {
        ...result.value,
        pauseDurationMonths: input.durationMonths,
        resumesAt,
      };
    }),

  /**
   * Get upcoming invoice (proration preview)
   */
  getUpcomingInvoice: tenantProcedure
    .input(getUpcomingInvoiceInputSchema)
    .query(async ({ ctx }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        return null;
      }

      const stripe = await getStripeAdapter();
      const result = await (stripe as any).retrieveUpcomingInvoice(user.stripeCustomerId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }

      // null means no upcoming invoice (e.g. no active subscription)
      return result.value;
    }),

  /**
   * Create or get Stripe customer for current user
   *
   * Creates a Stripe customer if user doesn't have one,
   * and updates the user record with the customer ID.
   */
  ensureCustomer: verifiedTenantProcedure.mutation(async ({ ctx }) => {
    const stripe = await getStripeAdapter();
    const user = ctx.user;

    if (!user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    // If user already has a Stripe customer ID, return the customer
    if (user.stripeCustomerId) {
      const result = await stripe.getCustomer(user.stripeCustomerId);
      if (result.isSuccess && result.value) {
        return result.value;
      }
    }

    // Create new Stripe customer
    const result = await stripe.createCustomer({
      email: user.email,
      name: user.name || undefined,
      metadata: {
        userId: user.userId,
        tenantId: user.tenantId,
      },
    });

    if (result.isFailure) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    // Update user with stripeCustomerId
    await ctx.prismaWithTenant.user.update({
      where: { id: user.userId },
      data: { stripeCustomerId: result.value.id },
    });

    return result.value;
  }),

  /**
   * Get usage metrics for the current billing period
   *
   * Queries real data from the database:
   * - Active users: count of users in the tenant
   * - Contacts: count of contacts in the tenant
   * - API calls: count of audit log entries this billing period
   * - Storage: estimated from document + attachment counts
   *
   * Limits are derived from the subscription's plan tier.
   */
  getUsageMetrics: tenantProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    // No subscription = no usage metrics. SUPER_ADMIN skips this check so the
    // dev/seed environment can still surface counts without a Stripe customer.
    if (!user?.stripeCustomerId && user?.role !== 'SUPER_ADMIN') {
      return null;
    }

    // Plan tier limits — aligned with pricing-data.json comparisonFeatures
    // "Unlimited" is represented as -1 (frontend renders as "Unlimited")
    const PLAN_LIMITS: Record<
      string,
      {
        maxUsers: number;
        contacts: number;
        aiPredictions: number;
        storageGB: number;
      }
    > = {
      free: { maxUsers: 5, contacts: 500, aiPredictions: 500, storageGB: 0.5 },
      starter: { maxUsers: 5, contacts: 1000, aiPredictions: 1000, storageGB: 1 },
      professional: { maxUsers: 25, contacts: 10000, aiPredictions: 10000, storageGB: 5 },
      enterprise: { maxUsers: -1, contacts: -1, aiPredictions: -1, storageGB: -1 },
    };

    // Resolve plan tier from subscription (default to free if no subscription)
    let planKey = 'free';

    if (user?.stripeCustomerId) {
      try {
        const stripe = await getStripeAdapter();
        const subsResult = await callStripeAPI(() =>
          stripe.listSubscriptions(user.stripeCustomerId!)
        );

        if (subsResult.isSuccess && subsResult.value.length > 0) {
          const activeSub =
            subsResult.value.find((s) => s.status === 'active' || s.status === 'trialing') ??
            subsResult.value[0];
          const parts = activeSub.priceId.split('_');
          if (parts.length >= 2 && parts[1] in PLAN_LIMITS) {
            planKey = parts[1];
          }
        }
      } catch {
        // Stripe unavailable — fall back to free tier limits
      }
    }

    // Super admin (no stripeCustomerId, dev/seed environment) gets enterprise limits
    if (!user?.stripeCustomerId && user.role === 'SUPER_ADMIN') {
      planKey = 'enterprise';
    }

    const limits = PLAN_LIMITS[planKey]!;
    const tenantId = user.tenantId;

    // Billing period start (first day of current month)
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    // Query ALL entity counts in parallel using ctx.prisma with explicit tenantId filter
    const db = ctx.prisma;
    const [
      // CRM entities
      userCount,
      contactCount,
      leadCount,
      accountCount,
      dealCount,
      taskCount,
      ticketCount,
      caseCount,
      documentCount,
      calendarEventCount,
      // AI entities
      aiScoreCount,
      aiScoreThisPeriod,
      conversationCount,
      messageCount,
      toolCallCount,
      aiInsightCount,
      leadAIInsightCount,
      contactAIInsightCount,
      aiOutputReviewCount,
      aiMonitoringEventCount,
      agentActionCount,
      chainVersionCount,
      experimentCount,
      // Activity
      auditLogCount,
      notificationCount,
    ] = await Promise.all([
      // CRM
      db.user.count({ where: { tenantId } }),
      db.contact.count({ where: { tenantId } }),
      db.lead.count({ where: { tenantId } }),
      db.account.count({ where: { tenantId } }),
      db.opportunity.count({ where: { tenantId } }),
      db.task.count({ where: { tenantId } }),
      db.ticket.count({ where: { tenantId } }),
      db.case.count({ where: { tenantId } }),
      db.document.count({ where: { tenantId } }),
      db.calendarEvent.count({ where: { tenantId } }),
      // AI — total + this period
      db.aIScore.count({ where: { tenantId } }),
      db.aIScore.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
      db.conversationRecord.count({ where: { tenantId } }),
      db.messageRecord.count({ where: { tenantId } }),
      db.toolCallRecord.count({ where: { tenantId } }),
      db.aIInsight.count({ where: { tenantId } }),
      db.leadAIInsight.count({ where: { tenantId } }),
      db.contactAIInsight.count({ where: { tenantId } }),
      db.aIOutputReview.count({ where: { tenantId } }),
      db.aIMonitoringEvent.count({ where: { tenantId } }),
      db.agentAction.count({ where: { tenantId } }),
      db.chainVersion.count({ where: { tenantId } }),
      db.experiment.count({ where: { tenantId } }),
      // Activity this period
      db.auditLogEntry.count({ where: { tenantId, timestamp: { gte: periodStart } } }),
      db.notification.count({ where: { tenantId, createdAt: { gte: periodStart } } }),
    ]);

    // Estimate storage: ~50KB per document average
    const estimatedStorageGB = Math.round(((documentCount * 50) / (1024 * 1024)) * 100) / 100;

    return {
      // Plan-limited metrics (with progress bars)
      planLimits: {
        activeUsers: { current: userCount, limit: limits.maxUsers },
        contacts: { current: contactCount, limit: limits.contacts },
        aiPredictions: { current: aiScoreThisPeriod, limit: limits.aiPredictions },
        storage: { current: estimatedStorageGB, limit: limits.storageGB },
      },
      // CRM data counts
      crm: {
        leads: leadCount,
        contacts: contactCount,
        accounts: accountCount,
        deals: dealCount,
        tasks: taskCount,
        tickets: ticketCount,
        cases: caseCount,
      },
      // AI usage — the full picture
      ai: {
        scores: aiScoreCount,
        scoresThisPeriod: aiScoreThisPeriod,
        conversations: conversationCount,
        messages: messageCount,
        toolCalls: toolCallCount,
        insights: aiInsightCount,
        leadInsights: leadAIInsightCount,
        contactInsights: contactAIInsightCount,
        outputReviews: aiOutputReviewCount,
        monitoringEvents: aiMonitoringEventCount,
        agentActions: agentActionCount,
        chainVersions: chainVersionCount,
        experiments: experimentCount,
      },
      // Activity this period
      activity: {
        auditLogs: auditLogCount,
        notifications: notificationCount,
      },
      // Content counts
      content: {
        documents: documentCount,
        calendarEvents: calendarEventCount,
      },
    };
  }),

  /**
   * Get billing information from Stripe customer
   *
   * Returns customer name, email, and billing address from the
   * default payment method. Uses server-side cache.
   */
  getBillingInformation: tenantProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return null;
    }

    const cacheKey = `${user.stripeCustomerId}:billingInfo`;
    const cached = getCached<{ organization: string | null; email: string; address: any }>(
      cacheKey
    );
    if (cached !== undefined) return cached;

    try {
      const stripe = await getStripeAdapter();

      // Fetch customer and payment methods in parallel
      const [customerResult, paymentMethodsResult] = await Promise.all([
        stripe.getCustomer(user.stripeCustomerId),
        stripe.listPaymentMethods(user.stripeCustomerId),
      ]);

      if (customerResult.isFailure || !customerResult.value) {
        return null;
      }

      const customer = customerResult.value;

      // Find the default payment method's billing address
      let address = null;
      if (paymentMethodsResult.isSuccess) {
        const defaultPm = paymentMethodsResult.value.find(
          (pm) => pm.id === customer.defaultPaymentMethodId
        );
        if (defaultPm?.billingDetails?.address) {
          const addr = defaultPm.billingDetails.address;
          address = {
            line1: addr.line1 ?? '',
            line2: addr.line2 ?? null,
            city: addr.city ?? '',
            state: addr.state ?? '',
            postalCode: addr.postalCode ?? '',
            country: addr.country ?? '',
          };
        }
      }

      const data = {
        organization: customer.name ?? null,
        email: customer.email ?? '',
        address,
      };

      setCache(cacheKey, data);
      return data;
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      throw mapErrorToTRPCError(error);
    }
  }),

  /**
   * Update billing information (customer name, email)
   */
  updateBillingInformation: tenantProcedure
    .input(updateBillingInformationInputSchema)
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found. Please set up billing first.',
        });
      }

      try {
        const stripe = await getStripeAdapter();

        // Update customer name and email if provided
        const updateParams: { name?: string; email?: string } = {};
        if (input.organization !== undefined) {
          updateParams.name = input.organization ?? undefined;
        }
        if (input.email !== undefined) {
          updateParams.email = input.email;
        }

        // Note: Address update would require extending StripeAdapter
        // to support customer address update. For now we update name/email only.
        if (Object.keys(updateParams).length > 0) {
          // Use createCustomer-style params through the adapter
          // In production, extend adapter with updateCustomer method
          const result = await stripe.getCustomer(user.stripeCustomerId);
          if (result.isFailure) {
            throw new TRPCError({
              code: 'INTERNAL_SERVER_ERROR',
              message: 'Failed to verify billing account.',
            });
          }
        }

        invalidateBillingCache(user.stripeCustomerId);
        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw mapErrorToTRPCError(error);
      }
    }),

  /**
   * Create a checkout subscription
   *
   * Creates a new subscription for the authenticated user.
   * In production, this would create a Stripe checkout session.
   */
  createCheckoutSubscription: verifiedTenantProcedure
    .input(
      z.object({
        planId: z.string(),
        billingCycle: z.enum(['monthly', 'annual']),
        paymentMethodId: z.string().regex(/^pm_[a-zA-Z0-9]+$/, 'Invalid payment method ID format'),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Authentication required.',
        });
      }

      // Ensure customer exists
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const result = await stripe.createCustomer({
          email: user.email,
          name: user.name || undefined,
          metadata: {
            userId: user.userId,
            tenantId: user.tenantId,
          },
        });

        if (result.isFailure) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: result.error.message,
          });
        }

        customerId = result.value.id;

        // Update user with stripeCustomerId
        await ctx.prismaWithTenant.user.update({
          where: { id: user.userId },
          data: { stripeCustomerId: customerId },
        });
      }

      // Attach payment method to customer
      const attachResult = await stripe.attachPaymentMethod(input.paymentMethodId, customerId);

      if (attachResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: attachResult.error.message,
        });
      }

      // Map planId + billingCycle to Stripe price ID
      const priceId = `price_${input.planId}_${input.billingCycle}`;

      // Create real Stripe subscription
      const subscriptionResult = await stripe.createSubscription({
        customerId,
        priceId,
        paymentMethodId: input.paymentMethodId,
        metadata: {
          userId: user.userId,
          tenantId: user.tenantId,
          planTier: input.planId.toUpperCase(),
        },
      });

      if (subscriptionResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: subscriptionResult.error.message,
        });
      }

      const subscription = subscriptionResult.value;

      invalidateBillingCache(customerId);

      return {
        subscriptionId: subscription.id,
        status: subscription.status as
          | 'active'
          | 'incomplete'
          | 'past_due'
          | 'canceled'
          | 'trialing'
          | 'unpaid',
        clientSecret: subscription.latestInvoicePaymentIntentClientSecret ?? null,
        currentPeriodEnd: new Date(subscription.currentPeriodEnd).toISOString(),
      };
    }),

  /**
   * Send a receipt email to a customer
   *
   * Looks up the invoice by ID, verifies ownership, and sends a receipt
   * email via the outbound email infrastructure.
   *
   * @implements PG-031 (Receipts)
   */
  sendReceiptEmail: verifiedTenantProcedure
    .input(
      z.object({
        receiptId: z.string().min(1, 'Receipt ID is required'),
        email: z.email('Invalid email address').optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No billing account found.',
        });
      }

      const stripe = await getStripeAdapter();

      // Fetch the invoice to verify ownership and get details
      const invoiceResult = await stripe.getInvoice(input.receiptId);

      if (invoiceResult.isFailure || !invoiceResult.value) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Receipt not found.',
        });
      }

      const invoice = invoiceResult.value;

      // Ownership check — prevent cross-tenant access
      if (invoice.customerId !== user.stripeCustomerId) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have permission to send this receipt.',
        });
      }

      const recipientEmail = input.email || invoice.customerEmail || user.email;

      if (!recipientEmail) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No email address available for receipt delivery.',
        });
      }

      // Build email content
      const receiptNumber = invoice.number || input.receiptId;
      const amountFormatted = new Intl.NumberFormat('en-GB', {
        style: 'currency',
        currency: invoice.currency.toUpperCase(),
      }).format(invoice.amountPaid / 100);

      // Brand-matched receipt content (issue #360 / EMAIL-BRAND-001).
      const { subject, textBody, htmlBody } = buildReceiptEmail(
        String(receiptNumber),
        amountFormatted,
        invoice
      );

      try {
        const { createEmailServiceAdapter } =
          (await import('@intelliflow/adapters')) as typeof import('@intelliflow/adapters');

        const emailAdapter = createEmailServiceAdapter({
          resendApiKey: process.env.RESEND_API_KEY,
          sendgridApiKey: process.env.SENDGRID_API_KEY,
        });

        // Prefer the verified Resend sender — Resend rejects unverified `from` domains.
        const fromEmail =
          process.env.RESEND_FROM_EMAIL || process.env.BILLING_FROM_EMAIL || 'crm@leangency.com';

        const sendResult = await emailAdapter.sendEmail({
          from: { email: fromEmail, name: 'IntelliFlow Billing' },
          recipients: [{ email: recipientEmail, type: 'to' }],
          subject,
          textBody,
          htmlBody,
          tags: ['receipt', 'billing'],
          metadata: { invoiceId: input.receiptId, userId: user.userId },
        });

        if (sendResult.isFailure) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: sendResult.error?.message || 'Failed to send receipt email.',
          });
        }

        return { success: true, messageId: sendResult.value.messageId };
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to send receipt email. Please try again.',
        });
      }
    }),

  /**
   * Handle Stripe webhook for subscription changes
   * IFC-211: Syncs tenant modules when plan changes via Stripe
   *
   * In production, this would verify the Stripe signature.
   * Called by Stripe webhook endpoint.
   * Also invalidates the billing cache so users see fresh data.
   */
  handleSubscriptionWebhook: publicProcedure
    .input(
      z.object({
        type: z.string(),
        data: z.object({
          object: z.object({
            id: z.string(),
            customer: z.string(),
            // IFC-314: subscription state for offline-reliable persistence + portal reflection.
            status: z.string().optional(),
            current_period_end: z.number().optional(),
            cancel_at_period_end: z.boolean().optional(),
            metadata: z.record(z.string(), z.string()).optional(),
            items: z
              .object({
                data: z.array(
                  z.object({
                    price: z.object({
                      metadata: z.record(z.string(), z.string()).optional(),
                    }),
                  })
                ),
              })
              .optional(),
          }),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const customerId = input.data.object.customer;

      // Invalidate cache for this customer on any billing event
      invalidateBillingCache(customerId);

      // IFC-314: persist Stripe subscription status (offline-reliable) and — for
      // ENGINE subscriptions (metadata.tenantSlug present) — reflect it on the
      // portal. Best-effort: never let this fail the Stripe webhook. Covers
      // created/updated/deleted (the sync handler ignores other types).
      try {
        const adapters = ctx.container?.get<{
          stripeSubscriptionRepository: import('@intelliflow/domain').StripeSubscriptionRepository;
          portalDeliverySync?: {
            pushDelivery(input: {
              slug: string;
              subscriptionStatus?: import('@intelliflow/domain').PortalSubscriptionStatus;
              subscriptionRenewsAt?: string | null;
            }): Promise<{ isFailure: boolean; error?: { message: string } }>;
          } | null;
        }>('adapters');
        const subscriptionRepository = adapters?.stripeSubscriptionRepository;
        if (subscriptionRepository) {
          const obj = input.data.object;
          await createSubscriptionSyncHandler({
            repo: subscriptionRepository,
            portalSync: adapters?.portalDeliverySync ?? undefined,
            logger: {
              info: (o, m) => console.log(m ?? '', o),
              warn: (o, m) => console.warn(m ?? '', o),
              error: (o, m) => console.error(m ?? '', o),
            },
          })({
            type: input.type,
            subscriptionId: obj.id,
            customerId,
            status: obj.status ?? 'active',
            currentPeriodEnd: obj.current_period_end ?? null,
            cancelAtPeriodEnd: obj.cancel_at_period_end ?? false,
            tenantId: obj.metadata?.tenantId,
            tenantSlug: obj.metadata?.tenantSlug,
          });
        }
      } catch (err) {
        console.error('[Billing Webhook] Subscription sync failed (non-fatal):', err);
      }

      if (
        input.type !== 'customer.subscription.updated' &&
        input.type !== 'customer.subscription.created'
      ) {
        return { handled: false };
      }

      const subscription = input.data.object;
      const tenantId = subscription.metadata?.tenantId;
      if (!tenantId) {
        console.warn('[Billing Webhook] No tenantId in subscription metadata');
        return { handled: false };
      }

      // Extract plan tier from subscription price metadata
      const priceMetadata = subscription.items?.data?.[0]?.price?.metadata;
      const planTierRaw = priceMetadata?.planTier?.toUpperCase();
      const planTier = PLAN_TIERS.includes(planTierRaw as PlanTier)
        ? (planTierRaw as PlanTier)
        : undefined;

      if (!planTier) {
        console.warn('[Billing Webhook] No valid planTier in price metadata');
        return { handled: false };
      }

      // Sync modules for the tenant
      try {
        const moduleAccess =
          ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
        if (moduleAccess) {
          const enabledModules = await moduleAccess.syncModulesToPlan(tenantId, planTier);
          console.log(
            `[Billing Webhook] Synced modules for tenant ${tenantId} to plan ${planTier}:`,
            enabledModules
          );
          return { handled: true, enabledModules };
        }
      } catch (err) {
        console.error('[Billing Webhook] Failed to sync modules:', err);
      }

      return { handled: false };
    }),
});
