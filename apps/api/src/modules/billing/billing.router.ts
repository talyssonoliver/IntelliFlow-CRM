/**
 * Billing Router
 *
 * Provides type-safe tRPC endpoints for billing management:
 * - Subscription management
 * - Payment methods
 * - Invoice history
 * - Usage metrics
 *
 * Uses existing StripeAdapter from packages/adapters
 *
 * @implements PG-025 (Billing Portal)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import {
  listInvoicesInputSchema,
  updatePaymentMethodInputSchema,
  updateSubscriptionInputSchema,
  cancelSubscriptionInputSchema,
  getUpcomingInvoiceInputSchema,
} from '@intelliflow/validators';

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
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' |
          'past_due' | 'canceled' | 'unpaid' | 'paused';
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
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
  createCustomer(params: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<StripeResult<StripeCustomer>>;
  getCustomer(customerId: string): Promise<StripeResult<StripeCustomer | null>>;
  listSubscriptions(customerId: string): Promise<StripeResult<StripeSubscription[]>>;
  listInvoices(customerId: string): Promise<StripeResult<StripeInvoice[]>>;
  listPaymentMethods(customerId: string): Promise<StripeResult<StripePaymentMethod[]>>;
  attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<StripeResult<StripePaymentMethod>>;
  detachPaymentMethod(paymentMethodId: string): Promise<StripeResult<StripePaymentMethod>>;
  updateSubscription(subscriptionId: string, params: { priceId?: string; quantity?: number }): Promise<StripeResult<StripeSubscription>>;
  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<StripeResult<StripeSubscription>>;
}

// ============================================
// Stripe Adapter Factory
// ============================================

// Dynamic import of StripeAdapter to avoid module resolution issues
let StripeAdapterClass: new (config: StripeConfig) => IStripeAdapter;

async function loadStripeAdapter(): Promise<void> {
  if (!StripeAdapterClass) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapters = await import('@intelliflow/adapters') as any;
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
// Billing Router
// ============================================

export const billingRouter = createTRPCRouter({
  /**
   * Get current subscription for the authenticated user
   *
   * Returns null if user has no Stripe customer ID or no active subscription.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const stripe = await getStripeAdapter();
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return null;
    }

    const result = await stripe.listSubscriptions(user.stripeCustomerId);

    if (result.isFailure) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: result.error.message,
      });
    }

    const subscriptions = result.value;

    // Return the first active subscription (customers typically have one)
    const activeSubscription = subscriptions.find(
      (sub) => sub.status === 'active' || sub.status === 'trialing'
    );

    return activeSubscription ?? (subscriptions.length > 0 ? subscriptions[0] : null);
  }),

  /**
   * List invoices with pagination
   */
  listInvoices: protectedProcedure
    .input(listInvoicesInputSchema)
    .query(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
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

      const result = await stripe.listInvoices(user.stripeCustomerId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: result.error.message,
        });
      }

      const allInvoices = result.value;
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
   * Get payment methods for the user
   */
  getPaymentMethods: protectedProcedure.query(async ({ ctx }) => {
    const stripe = await getStripeAdapter();
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return [] as (StripePaymentMethod & { isDefault: boolean })[];
    }

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
    return result.value.map((pm) => ({
      ...pm,
      isDefault: pm.id === defaultPaymentMethodId,
    }));
  }),

  /**
   * Attach a new payment method to the customer
   */
  updatePaymentMethod: protectedProcedure
    .input(updatePaymentMethodInputSchema)
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found. Please set up billing first.',
        });
      }

      // Attach payment method to customer
      const result = await stripe.attachPaymentMethod(
        input.paymentMethodId,
        user.stripeCustomerId
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      return {
        success: true,
        paymentMethod: result.value,
      };
    }),

  /**
   * Detach a payment method from the customer
   */
  removePaymentMethod: protectedProcedure
    .input(updatePaymentMethodInputSchema.pick({ paymentMethodId: true }))
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

      const result = await stripe.detachPaymentMethod(input.paymentMethodId);

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      return { success: true };
    }),

  /**
   * Update subscription (change plan or quantity)
   */
  updateSubscription: protectedProcedure
    .input(updateSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

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

      const result = await stripe.updateSubscription(activeSubscription.id, {
        priceId: input.priceId,
        quantity: input.quantity,
      });

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      return result.value;
    }),

  /**
   * Cancel subscription
   */
  cancelSubscription: protectedProcedure
    .input(cancelSubscriptionInputSchema)
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No billing account found.',
        });
      }

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

      const result = await stripe.cancelSubscription(
        activeSubscription.id,
        input.atPeriodEnd
      );

      if (result.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: result.error.message,
        });
      }

      return result.value;
    }),

  /**
   * Get upcoming invoice (proration preview)
   *
   * Note: This requires extending StripeAdapter with retrieveUpcomingInvoice.
   * For now, returns a placeholder response.
   */
  getUpcomingInvoice: protectedProcedure
    .input(getUpcomingInvoiceInputSchema)
    .query(async ({ ctx }) => {
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        return null;
      }

      // Placeholder - would need to extend StripeAdapter
      return {
        amountDue: 0,
        currency: 'gbp',
        prorationDate: new Date(),
        invoiceItems: [],
      };
    }),

  /**
   * Create or get Stripe customer for current user
   *
   * Creates a Stripe customer if user doesn't have one,
   * and updates the user record with the customer ID.
   */
  ensureCustomer: protectedProcedure.mutation(async ({ ctx }) => {
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
    await ctx.prisma.user.update({
      where: { id: user.userId },
      data: { stripeCustomerId: result.value.id },
    });

    return result.value;
  }),

  /**
   * Get usage metrics for the current billing period
   *
   * Note: This would integrate with analytics/metering in production.
   * For now, returns mock data.
   */
  getUsageMetrics: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return null;
    }

    // Mock usage data - would come from analytics in production
    return {
      apiCalls: {
        current: 8500,
        limit: 10000,
      },
      storage: {
        current: 2.4,
        limit: 5,
        unit: 'GB' as const,
      },
      activeUsers: {
        current: 12,
        limit: 25,
      },
    };
  }),

  /**
   * Create a checkout subscription
   *
   * Creates a new subscription for the authenticated user.
   * In production, this would create a Stripe checkout session.
   */
  createCheckoutSubscription: protectedProcedure
    .input(z.object({
      planId: z.string(),
      billingCycle: z.enum(['monthly', 'annual']),
      paymentMethodId: z.string(),
    }))
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
        await ctx.prisma.user.update({
          where: { id: user.userId },
          data: { stripeCustomerId: customerId },
        });
      }

      // Attach payment method to customer
      const attachResult = await stripe.attachPaymentMethod(
        input.paymentMethodId,
        customerId
      );

      if (attachResult.isFailure) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: attachResult.error.message,
        });
      }

      // In production, create subscription via Stripe
      // For now, return a mock subscription ID
      const subscriptionId = `sub_${Date.now()}_${input.planId}`;

      return {
        subscriptionId,
        customerId,
        planId: input.planId,
        billingCycle: input.billingCycle,
      };
    }),
});
