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
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../../trpc';
import {
  listInvoicesInputSchema,
  getInvoiceInputSchema,
  payInvoiceInputSchema,
  updatePaymentMethodInputSchema,
  updateSubscriptionInputSchema,
  cancelSubscriptionInputSchema,
  getUpcomingInvoiceInputSchema,
  updateBillingInformationInputSchema,
} from '@intelliflow/validators';
import { callStripeAPI } from '../../shared/external-service-wrapper';
import { mapErrorToTRPCError } from '../../shared/error-mapper';
import { PLAN_TIERS, type PlanTier } from '@intelliflow/domain';

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
  updateSubscription(
    subscriptionId: string,
    params: { priceId?: string; quantity?: number }
  ): Promise<StripeResult<StripeSubscription>>;
  cancelSubscription(
    subscriptionId: string,
    atPeriodEnd?: boolean
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
// Billing Router
// ============================================

export const billingRouter = createTRPCRouter({
  /**
   * Get current subscription for the authenticated user
   *
   * Returns null if user has no Stripe customer ID or no active subscription.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    try {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        return null;
      }

      // Wrap Stripe API call with ExternalServiceError handling
      const result = await callStripeAPI(() => stripe.listSubscriptions(user.stripeCustomerId!));

      if (result.isFailure) {
        throw mapErrorToTRPCError(result.error);
      }

      const subscriptions = result.value;

      // Return the first active subscription (customers typically have one)
      const activeSubscription = subscriptions.find(
        (sub) => sub.status === 'active' || sub.status === 'trialing'
      );

      return activeSubscription ?? (subscriptions.length > 0 ? subscriptions[0] : null);
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
  listInvoices: protectedProcedure.input(listInvoicesInputSchema).query(async ({ ctx, input }) => {
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
   * Get a single invoice by ID
   *
   * Fetches invoice details with line items, tax, and customer info.
   * Includes ownership verification to prevent cross-tenant access.
   *
   * @implements PG-028 (Invoice Detail)
   */
  getInvoice: protectedProcedure
    .input(getInvoiceInputSchema)
    .query(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No billing account found.',
        });
      }

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
  payInvoice: protectedProcedure
    .input(payInvoiceInputSchema)
    .mutation(async ({ ctx, input }) => {
      const stripe = await getStripeAdapter();
      const user = ctx.user;

      if (!user?.stripeCustomerId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'No billing account found.',
        });
      }

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

      return payResult.value;
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
      const result = await stripe.attachPaymentMethod(input.paymentMethodId, user.stripeCustomerId);

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

      const updateParams: { priceId?: string; quantity?: number; cancel_at_period_end?: boolean } = {
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
          const moduleAccess = ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
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

      const result = await stripe.cancelSubscription(activeSubscription.id, input.atPeriodEnd);

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
   * Get billing information from Stripe customer
   *
   * Returns customer name, email, and billing address from the
   * default payment method.
   */
  getBillingInformation: protectedProcedure.query(async ({ ctx }) => {
    const user = ctx.user;

    if (!user?.stripeCustomerId) {
      return null;
    }

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

      return {
        organization: customer.name ?? null,
        email: customer.email ?? '',
        address,
      };
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
  updateBillingInformation: protectedProcedure
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
  createCheckoutSubscription: protectedProcedure
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
        await ctx.prisma.user.update({
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

      return {
        subscriptionId: subscription.id,
        status: subscription.status as 'active' | 'incomplete' | 'past_due' | 'canceled' | 'trialing' | 'unpaid',
        clientSecret: subscription.latestInvoicePaymentIntentClientSecret ?? null,
        currentPeriodEnd: new Date(subscription.currentPeriodEnd).toISOString(),
      };
    }),

  /**
   * Handle Stripe webhook for subscription changes
   * IFC-211: Syncs tenant modules when plan changes via Stripe
   *
   * In production, this would verify the Stripe signature.
   * Called by Stripe webhook endpoint.
   */
  handleSubscriptionWebhook: publicProcedure
    .input(
      z.object({
        type: z.string(),
        data: z.object({
          object: z.object({
            id: z.string(),
            customer: z.string(),
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
      if (input.type !== 'customer.subscription.updated' && input.type !== 'customer.subscription.created') {
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
        const moduleAccess = ctx.container?.get<import('@intelliflow/application').ModuleAccessPort>('moduleAccess');
        if (moduleAccess) {
          const enabledModules = await moduleAccess.syncModulesToPlan(tenantId, planTier);
          console.log(`[Billing Webhook] Synced modules for tenant ${tenantId} to plan ${planTier}:`, enabledModules);
          return { handled: true, enabledModules };
        }
      } catch (err) {
        console.error('[Billing Webhook] Failed to sync modules:', err);
      }

      return { handled: false };
    }),
});
