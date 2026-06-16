/**
 * Billing Router Tests
 *
 * @implements PG-025 (Billing Portal)
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { TRPCError } from '@trpc/server';
import { billingRouter, clearBillingCache } from '../billing.router';
import { createTRPCRouter } from '../../../trpc';
import type { UserSession } from '../../../context';

// Mock subscription data
const mockSubscription = {
  id: 'sub_123',
  customerId: 'cus_123',
  status: 'active' as const,
  priceId: 'price_professional_monthly',
  quantity: 5,
  currency: 'gbp',
  currentPeriodStart: new Date('2025-01-01'),
  currentPeriodEnd: new Date('2025-02-01'),
  cancelAtPeriodEnd: false,
};

// Mock invoice data
const mockInvoice = {
  id: 'in_123',
  customerId: 'cus_123',
  subscriptionId: 'sub_123',
  status: 'paid' as const,
  amountDue: 7900,
  amountPaid: 7900,
  amountRemaining: 0,
  currency: 'gbp',
  created: new Date('2024-12-01'),
  invoicePdf: 'https://example.com/invoice.pdf',
};

// Mock payment method
const mockPaymentMethod = {
  id: 'pm_123',
  type: 'card' as const,
  customerId: 'cus_123',
  card: {
    brand: 'visa',
    last4: '4242',
    expMonth: 12,
    expYear: 2026,
    funding: 'credit',
  },
  billingDetails: {
    name: 'Test User',
    email: 'test@example.com',
  },
  created: new Date('2024-01-01'),
};

// Mock customer
const mockCustomer = {
  id: 'cus_123',
  email: 'test@example.com',
  name: 'Test User',
  balance: 0,
  currency: 'gbp',
  created: new Date('2024-01-01'),
  defaultPaymentMethodId: 'pm_123',
};

// Mock StripeAdapter methods for spy access
const mockStripeAdapterMethods: Record<string, any> = {
  listSubscriptions: vi.fn(),
  listInvoices: vi.fn(),
  listPaymentMethods: vi.fn(),
  getCustomer: vi.fn(),
  attachPaymentMethod: vi.fn(),
  detachPaymentMethod: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  createSubscription: vi.fn(),
  getInvoice: vi.fn(),
  payInvoice: vi.fn(),
  retrieveUpcomingInvoice: vi.fn().mockResolvedValue({
    isSuccess: true,
    isFailure: false,
    value: {
      amountDue: 7900,
      currency: 'gbp',
      prorationDate: new Date('2025-02-01'),
      invoiceItems: [],
    },
  }),
};

// Create a proper class mock for StripeAdapter
class MockStripeAdapter {
  listSubscriptions = mockStripeAdapterMethods.listSubscriptions;
  listInvoices = mockStripeAdapterMethods.listInvoices;
  listPaymentMethods = mockStripeAdapterMethods.listPaymentMethods;
  getCustomer = mockStripeAdapterMethods.getCustomer;
  attachPaymentMethod = mockStripeAdapterMethods.attachPaymentMethod;
  detachPaymentMethod = mockStripeAdapterMethods.detachPaymentMethod;
  updateSubscription = mockStripeAdapterMethods.updateSubscription;
  cancelSubscription = mockStripeAdapterMethods.cancelSubscription;
  createCustomer = mockStripeAdapterMethods.createCustomer;
  updateCustomer = mockStripeAdapterMethods.updateCustomer;
  createSubscription = mockStripeAdapterMethods.createSubscription;
  getInvoice = mockStripeAdapterMethods.getInvoice;
  payInvoice = mockStripeAdapterMethods.payInvoice;
  retrieveUpcomingInvoice = mockStripeAdapterMethods.retrieveUpcomingInvoice;
}

// Mock the StripeAdapter module with a proper class
vi.mock('@intelliflow/adapters', () => ({
  StripeAdapter: MockStripeAdapter,
}));

describe('billingRouter', () => {
  // Set environment variable before importing the router
  const originalEnv = process.env.STRIPE_SECRET_KEY;

  beforeAll(() => {
    // Set the env variable directly - vi.stubEnv can have timing issues
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  });

  afterAll(() => {
    // Restore original env
    if (originalEnv !== undefined) {
      process.env.STRIPE_SECRET_KEY = originalEnv;
    } else {
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  beforeEach(() => {
    vi.clearAllMocks();
    clearBillingCache();
  });

  // ============================================
  // getSubscription Tests
  // ============================================

  describe('getSubscription', () => {
    it('returns null when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      // Create a caller for testing
      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result).toBeNull();
    });

    it('returns subscription when user has active subscription', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result).toEqual(mockSubscription);
    });

    it('returns null when no subscriptions exist', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result).toBeNull();
    });
  });

  // ============================================
  // listInvoices Tests
  // ============================================

  describe('listInvoices', () => {
    it('returns empty list when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.listInvoices({ page: 1, limit: 10 });
      expect(result.invoices).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns paginated invoices', async () => {
      mockStripeAdapterMethods.listInvoices.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockInvoice],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.listInvoices({ page: 1, limit: 10 });
      expect(result.invoices).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });
  });

  // ============================================
  // getPaymentMethods Tests
  // ============================================

  describe('getPaymentMethods', () => {
    it('returns empty list when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getPaymentMethods();
      expect(result).toEqual([]);
    });

    it('returns payment methods with isDefault flag', async () => {
      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockCustomer,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getPaymentMethods();
      expect(result).toHaveLength(1);
      expect(result[0].isDefault).toBe(true);
    });
  });

  // ============================================
  // cancelSubscription Tests
  // ============================================

  describe('cancelSubscription', () => {
    it('throws error when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.cancelSubscription({ atPeriodEnd: true })).rejects.toThrow(TRPCError);
    });

    it('cancels subscription at period end', async () => {
      const canceledSubscription = {
        ...mockSubscription,
        cancelAtPeriodEnd: true,
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.cancelSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: canceledSubscription,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.cancelSubscription({ atPeriodEnd: true });
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(mockStripeAdapterMethods.cancelSubscription).toHaveBeenCalledWith('sub_123', true);
    });
  });

  // ============================================
  // getUsageMetrics Tests
  // ============================================

  describe('getUsageMetrics', () => {
    // Build a prisma mock where every model's `count` resolves to 0.
    // The router queries ~25 different models in parallel inside getUsageMetrics,
    // so we provide a zero-count default rather than enumerating each model.
    const createUsageMetricsPrismaMock = () =>
      new Proxy(
        {},
        {
          get: () => ({ count: vi.fn().mockResolvedValue(0) }),
        }
      );

    it('returns null when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: createUsageMetricsPrismaMock() as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getUsageMetrics();
      expect(result).toBeNull();
    });

    it('returns usage metrics when user has subscription', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: createUsageMetricsPrismaMock() as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getUsageMetrics();
      expect(result).not.toBeNull();
      expect(result?.planLimits).toBeDefined();
      expect(result?.crm).toBeDefined();
      expect(result?.activity).toBeDefined();
      expect(result?.content).toBeDefined();
    });
  });

  // ============================================
  // updatePaymentMethod Tests
  // ============================================

  describe('updatePaymentMethod', () => {
    it('throws error when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.updatePaymentMethod({ paymentMethodId: 'pm_new_123' })).rejects.toThrow(
        TRPCError
      );
    });

    it('attaches payment method successfully', async () => {
      const newPaymentMethod = {
        ...mockPaymentMethod,
        id: 'pm_new_123',
      };

      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newPaymentMethod,
      });

      // setAsDefault defaults to true, so updateCustomer is called
      mockStripeAdapterMethods.updateCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockCustomer,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.updatePaymentMethod({ paymentMethodId: 'pm_new_123' });
      expect(result.success).toBe(true);
      expect(result.paymentMethod.id).toBe('pm_new_123');
      expect(mockStripeAdapterMethods.attachPaymentMethod).toHaveBeenCalledWith(
        'pm_new_123',
        'cus_123'
      );
    });

    it('throws error when Stripe fails to attach payment method', async () => {
      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid payment method' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.updatePaymentMethod({ paymentMethodId: 'pm_invalid' })).rejects.toThrow(
        TRPCError
      );
    });
  });

  // ============================================
  // removePaymentMethod Tests
  // ============================================

  describe('removePaymentMethod', () => {
    it('throws error when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.removePaymentMethod({ paymentMethodId: 'pm_123' })).rejects.toThrow(
        TRPCError
      );
    });

    it('detaches payment method successfully', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [], // No active subscriptions — guard passes
      });
      mockStripeAdapterMethods.detachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockPaymentMethod,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.removePaymentMethod({ paymentMethodId: 'pm_123' });
      expect(result.success).toBe(true);
      expect(mockStripeAdapterMethods.detachPaymentMethod).toHaveBeenCalledWith('pm_123');
    });

    it('throws error when Stripe fails to detach payment method', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [], // No active subscriptions — guard passes
      });
      mockStripeAdapterMethods.detachPaymentMethod.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Payment method not found' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.removePaymentMethod({ paymentMethodId: 'pm_nonexistent' })
      ).rejects.toThrow('Payment method not found');
    });
  });

  // ============================================
  // updateSubscription Tests
  // ============================================

  describe('updateSubscription', () => {
    it('throws error when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.updateSubscription({ priceId: 'price_enterprise_monthly' })
      ).rejects.toThrow(TRPCError);
    });

    it('throws error when no active subscription exists', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.updateSubscription({ priceId: 'price_enterprise_monthly' })
      ).rejects.toThrow('No active subscription found');
    });

    it('updates subscription price successfully', async () => {
      const updatedSubscription = {
        ...mockSubscription,
        priceId: 'price_enterprise_monthly',
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.updateSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedSubscription,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.updateSubscription({ priceId: 'price_enterprise_monthly' });
      expect(result.priceId).toBe('price_enterprise_monthly');
      expect(mockStripeAdapterMethods.updateSubscription).toHaveBeenCalledWith('sub_123', {
        priceId: 'price_enterprise_monthly',
        quantity: undefined,
      });
    });

    it('updates subscription quantity successfully', async () => {
      const updatedSubscription = {
        ...mockSubscription,
        quantity: 10,
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.updateSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedSubscription,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.updateSubscription({ quantity: 10 });
      expect(result.quantity).toBe(10);
    });

    it('throws error when Stripe fails to update subscription', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.updateSubscription.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid price ID' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.updateSubscription({ priceId: 'price_invalid' })).rejects.toThrow(
        'Invalid price ID'
      );
    });

    it('throws error when listing subscriptions fails', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Stripe API error' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.updateSubscription({ priceId: 'price_enterprise_monthly' })
      ).rejects.toThrow('Stripe API error');
    });
  });

  // ============================================
  // getUpcomingInvoice Tests
  // ============================================

  describe('getUpcomingInvoice', () => {
    it('returns null when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getUpcomingInvoice({});
      expect(result).toBeNull();
    });

    it('returns upcoming invoice preview', async () => {
      // vi.clearAllMocks() in beforeEach clears the default .mockResolvedValue;
      // re-setup the mock for this test
      mockStripeAdapterMethods.retrieveUpcomingInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          amountDue: 7900,
          currency: 'gbp',
          prorationDate: new Date('2025-02-01'),
          invoiceItems: [],
        },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getUpcomingInvoice({});
      expect(result).not.toBeNull();
      expect(result?.amountDue).toBeDefined();
      expect(result?.currency).toBe('gbp');
      expect(result?.prorationDate).toBeInstanceOf(Date);
      expect(result?.invoiceItems).toBeDefined();
    });
  });

  // ============================================
  // ensureCustomer Tests
  // ============================================

  describe('ensureCustomer', () => {
    it('returns existing customer when user already has stripeCustomerId', async () => {
      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockCustomer,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: vi.fn(),
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.ensureCustomer();
      expect(result.id).toBe('cus_123');
      expect(mockStripeAdapterMethods.getCustomer).toHaveBeenCalledWith('cus_123');
      expect(mockStripeAdapterMethods.createCustomer).not.toHaveBeenCalled();
    });

    it('creates new customer when user has no stripeCustomerId', async () => {
      const newCustomer = {
        ...mockCustomer,
        id: 'cus_new_123',
      };

      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newCustomer,
      });

      const mockPrismaUpdate = vi.fn();
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: mockPrismaUpdate,
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.ensureCustomer();
      expect(result.id).toBe('cus_new_123');
      expect(mockStripeAdapterMethods.createCustomer).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: {
          userId: 'user_123',
          tenantId: 'tenant_123',
        },
      });
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { stripeCustomerId: 'cus_new_123' },
      });
    });

    it('throws error when user is not authenticated', async () => {
      const mockContext = {
        user: null,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.ensureCustomer()).rejects.toThrow('Authentication required');
    });

    it('creates new customer when existing customer not found in Stripe', async () => {
      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: null,
      });

      const newCustomer = {
        ...mockCustomer,
        id: 'cus_recreated_123',
      };

      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newCustomer,
      });

      const mockPrismaUpdate = vi.fn();
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_deleted',
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: mockPrismaUpdate,
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.ensureCustomer();
      expect(result.id).toBe('cus_recreated_123');
      expect(mockStripeAdapterMethods.createCustomer).toHaveBeenCalled();
    });

    it('throws error when Stripe fails to create customer', async () => {
      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Stripe customer creation failed' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: vi.fn(),
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.ensureCustomer()).rejects.toThrow('Stripe customer creation failed');
    });
  });

  // ============================================
  // createCheckoutSubscription Tests
  // ============================================

  describe('createCheckoutSubscription', () => {
    it('throws error when user is not authenticated', async () => {
      const mockContext = {
        user: null,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.createCheckoutSubscription({
          planId: 'plan_pro',
          billingCycle: 'monthly',
          paymentMethodId: 'pm_123',
        })
      ).rejects.toThrow('Authentication required');
    });

    it('creates subscription with existing customer', async () => {
      // Stub the real env var so resolvePriceId succeeds
      vi.stubEnv('STRIPE_PRICE_PROFESSIONAL_MONTHLY', 'price_real_professional_monthly');

      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockPaymentMethod,
      });

      mockStripeAdapterMethods.createSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          ...mockSubscription,
          latestInvoicePaymentIntentClientSecret: null,
        },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: vi.fn(),
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.createCheckoutSubscription({
        planId: 'professional',
        billingCycle: 'monthly',
        paymentMethodId: 'pm_123',
      });

      expect(result.subscriptionId).toBe('sub_123');
      expect(result.status).toBe('active');
      expect(result.clientSecret).toBeNull();
      expect(result.currentPeriodEnd).toBe(new Date('2025-02-01').toISOString());
      expect(mockStripeAdapterMethods.createCustomer).not.toHaveBeenCalled();
      expect(mockStripeAdapterMethods.attachPaymentMethod).toHaveBeenCalledWith(
        'pm_123',
        'cus_123'
      );
    });

    it('creates new customer when user has no stripeCustomerId', async () => {
      // Stub the real env var so resolvePriceId succeeds
      vi.stubEnv('STRIPE_PRICE_ENTERPRISE_ANNUAL', 'price_real_enterprise_annual');

      const newCustomer = {
        ...mockCustomer,
        id: 'cus_new_456',
      };

      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newCustomer,
      });

      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockPaymentMethod,
      });

      mockStripeAdapterMethods.createSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          ...mockSubscription,
          id: 'sub_new_789',
          customerId: 'cus_new_456',
          latestInvoicePaymentIntentClientSecret: 'pi_secret_abc',
        },
      });

      const mockPrismaUpdate = vi.fn();
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: mockPrismaUpdate,
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.createCheckoutSubscription({
        planId: 'enterprise',
        billingCycle: 'annual',
        paymentMethodId: 'pm_456',
      });

      expect(result.subscriptionId).toBe('sub_new_789');
      expect(result.status).toBe('active');
      expect(result.clientSecret).toBe('pi_secret_abc');
      expect(mockStripeAdapterMethods.createCustomer).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        metadata: {
          userId: 'user_123',
          tenantId: 'tenant_123',
        },
      });
      expect(mockPrismaUpdate).toHaveBeenCalledWith({
        where: { id: 'user_123' },
        data: { stripeCustomerId: 'cus_new_456' },
      });
    });

    it('throws error when customer creation fails', async () => {
      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Cannot create customer' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: vi.fn(),
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.createCheckoutSubscription({
          planId: 'plan_pro',
          billingCycle: 'monthly',
          paymentMethodId: 'pm_123',
        })
      ).rejects.toThrow('Cannot create customer');
    });

    it('throws error when attaching payment method fails', async () => {
      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Invalid payment method' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(
        caller.createCheckoutSubscription({
          planId: 'plan_pro',
          billingCycle: 'monthly',
          paymentMethodId: 'pm_invalid',
        })
      ).rejects.toThrow('Invalid payment method');
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('error handling', () => {
    it('getSubscription throws error when Stripe API fails', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Stripe API unavailable' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.getSubscription()).rejects.toThrow('An unexpected error occurred');
    });

    it('listInvoices throws error when Stripe API fails', async () => {
      mockStripeAdapterMethods.listInvoices.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Failed to fetch invoices' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.listInvoices({ page: 1, limit: 10 })).rejects.toThrow(
        'Failed to fetch invoices'
      );
    });

    it('getPaymentMethods throws error when Stripe API fails', async () => {
      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Failed to fetch payment methods' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.getPaymentMethods()).rejects.toThrow('Failed to fetch payment methods');
    });

    it('cancelSubscription throws error when no active subscription found', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.cancelSubscription({ atPeriodEnd: true })).rejects.toThrow(
        'No active subscription found'
      );
    });

    it('cancelSubscription throws error when Stripe cancellation fails', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.cancelSubscription.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Subscription already canceled' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.cancelSubscription({ atPeriodEnd: true })).rejects.toThrow(
        'Subscription already canceled'
      );
    });

    it('cancelSubscription throws error when listing subscriptions fails', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Stripe connection error' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.cancelSubscription({ atPeriodEnd: true })).rejects.toThrow(
        'Stripe connection error'
      );
    });
  });

  // ============================================
  // Edge Cases
  // ============================================

  describe('edge cases', () => {
    it('getSubscription returns first non-active subscription when no active/trialing exists', async () => {
      const pastDueSubscription = {
        ...mockSubscription,
        status: 'past_due' as const,
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [pastDueSubscription],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result?.status).toBe('past_due');
    });

    it('getSubscription returns active subscription over past_due', async () => {
      const activeSubscription = { ...mockSubscription, status: 'active' as const };
      const pastDueSubscription = {
        ...mockSubscription,
        id: 'sub_456',
        status: 'past_due' as const,
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [pastDueSubscription, activeSubscription],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result?.status).toBe('active');
    });

    it('getSubscription returns trialing subscription as active', async () => {
      const trialingSubscription = {
        ...mockSubscription,
        status: 'trialing' as const,
        trialStart: new Date('2025-01-01'),
        trialEnd: new Date('2025-01-15'),
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [trialingSubscription],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getSubscription();
      expect(result?.status).toBe('trialing');
    });

    it('listInvoices handles pagination correctly', async () => {
      const invoices = Array.from({ length: 25 }, (_, i) => ({
        ...mockInvoice,
        id: `in_${i + 1}`,
      }));

      mockStripeAdapterMethods.listInvoices.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: invoices,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      // First page
      const page1 = await caller.listInvoices({ page: 1, limit: 10 });
      expect(page1.invoices).toHaveLength(10);
      expect(page1.total).toBe(25);
      expect(page1.hasMore).toBe(true);

      // Second page
      const page2 = await caller.listInvoices({ page: 2, limit: 10 });
      expect(page2.invoices).toHaveLength(10);
      expect(page2.hasMore).toBe(true);

      // Third page
      const page3 = await caller.listInvoices({ page: 3, limit: 10 });
      expect(page3.invoices).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
    });

    it('getPaymentMethods marks non-default payment method as not default', async () => {
      const nonDefaultPaymentMethod = {
        ...mockPaymentMethod,
        id: 'pm_other',
      };

      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [nonDefaultPaymentMethod],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockCustomer, // defaultPaymentMethodId is 'pm_123', not 'pm_other'
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getPaymentMethods();
      expect(result[0].isDefault).toBe(false);
    });

    it('getPaymentMethods handles customer fetch failure gracefully', async () => {
      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Customer not found' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getPaymentMethods();
      expect(result).toHaveLength(1);
      expect(result[0].isDefault).toBe(false);
    });

    it('ensureCustomer handles user without name', async () => {
      const newCustomer = {
        ...mockCustomer,
        id: 'cus_noname',
        name: undefined,
      };

      mockStripeAdapterMethods.createCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newCustomer,
      });

      const mockPrismaUpdate = vi.fn();
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          name: undefined,
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {
          user: {
            update: mockPrismaUpdate,
          },
        } as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.ensureCustomer();
      expect(mockStripeAdapterMethods.createCustomer).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: undefined,
        metadata: {
          userId: 'user_123',
          tenantId: 'tenant_123',
        },
      });
      expect(result.id).toBe('cus_noname');
    });

    it('updateSubscription finds trialing subscription', async () => {
      const trialingSubscription = {
        ...mockSubscription,
        status: 'trialing' as const,
      };

      const updatedSubscription = {
        ...trialingSubscription,
        priceId: 'price_enterprise_monthly',
      };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [trialingSubscription],
      });

      mockStripeAdapterMethods.updateSubscription.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedSubscription,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.updateSubscription({ priceId: 'price_enterprise_monthly' });
      expect(result.status).toBe('trialing');
      expect(result.priceId).toBe('price_enterprise_monthly');
    });
  });

  // ============================================
  // getInvoice Tests (PG-028)
  // ============================================

  describe('getInvoice', () => {
    const detailedInvoice = {
      ...mockInvoice,
      number: 'INV-2025-001',
      subtotal: 7900,
      tax: 1580,
      discount: 0,
      customerEmail: 'test@example.com',
      customerName: 'Test User',
      lineItems: [
        {
          id: 'li_1',
          description: 'Professional Plan',
          quantity: 1,
          unitAmount: 7900,
          amount: 7900,
          currency: 'gbp',
        },
      ],
    };

    // T-021
    it('returns invoice for valid ID', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: detailedInvoice,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.getInvoice({ invoiceId: 'in_123' });
      expect(result.id).toBe('in_123');
      expect(result.number).toBe('INV-2025-001');
      expect(result.lineItems).toHaveLength(1);
    });

    // T-022
    it('throws NOT_FOUND when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: undefined,
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.getInvoice({ invoiceId: 'in_123' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    // T-023
    it('throws NOT_FOUND when adapter returns null', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: null,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.getInvoice({ invoiceId: 'in_notexist' })).rejects.toThrow(
        expect.objectContaining({ code: 'NOT_FOUND' })
      );
    });

    // T-024
    it('throws FORBIDDEN when invoice belongs to different customer', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...detailedInvoice, customerId: 'cus_other' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.getInvoice({ invoiceId: 'in_123' })).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
    });
  });

  // ============================================
  // payInvoice Tests (PG-028)
  // ============================================

  describe('payInvoice', () => {
    const openInvoice = {
      ...mockInvoice,
      status: 'open' as const,
      amountDue: 7900,
      amountPaid: 0,
      amountRemaining: 7900,
    };

    const paidInvoice = {
      ...openInvoice,
      status: 'paid' as const,
      amountPaid: 7900,
      amountRemaining: 0,
    };

    // T-025
    it('succeeds for open invoice', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: openInvoice,
      });
      mockStripeAdapterMethods.payInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: paidInvoice,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.payInvoice({ invoiceId: 'in_123' });
      expect(result.status).toBe('paid');
      expect(result.amountPaid).toBe(7900);
    });

    // T-026
    it('rejects non-open invoice with BAD_REQUEST', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...openInvoice, status: 'paid' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.payInvoice({ invoiceId: 'in_123' })).rejects.toThrow(
        expect.objectContaining({ code: 'BAD_REQUEST' })
      );
    });

    // T-027
    it('rejects wrong customer with FORBIDDEN', async () => {
      mockStripeAdapterMethods.getInvoice.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...openInvoice, customerId: 'cus_other' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.payInvoice({ invoiceId: 'in_123' })).rejects.toThrow(
        expect.objectContaining({ code: 'FORBIDDEN' })
      );
    });
  });

  // ============================================
  // updatePaymentMethod — setDefault Tests (PG-029)
  // ============================================

  describe('updatePaymentMethod - setDefault', () => {
    it('calls updateCustomer with defaultPaymentMethodId when setAsDefault is true', async () => {
      const newPaymentMethod = { ...mockPaymentMethod, id: 'pm_new_456' };

      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newPaymentMethod,
      });

      // Mock updateCustomer for setDefault
      mockStripeAdapterMethods.updateCustomer = vi.fn().mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...mockCustomer, defaultPaymentMethodId: 'pm_new_456' },
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await caller.updatePaymentMethod({ paymentMethodId: 'pm_new_456', setAsDefault: true });

      expect(mockStripeAdapterMethods.attachPaymentMethod).toHaveBeenCalledWith(
        'pm_new_456',
        'cus_123'
      );
      expect(mockStripeAdapterMethods.updateCustomer).toHaveBeenCalledWith(
        'cus_123',
        expect.objectContaining({ defaultPaymentMethodId: 'pm_new_456' })
      );
    });

    it('does NOT call updateCustomer when setAsDefault is false', async () => {
      const newPaymentMethod = { ...mockPaymentMethod, id: 'pm_new_789' };

      mockStripeAdapterMethods.attachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: newPaymentMethod,
      });

      mockStripeAdapterMethods.updateCustomer = vi.fn();

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await caller.updatePaymentMethod({ paymentMethodId: 'pm_new_789', setAsDefault: false });

      expect(mockStripeAdapterMethods.attachPaymentMethod).toHaveBeenCalled();
      expect(mockStripeAdapterMethods.updateCustomer).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // removePaymentMethod — subscription guard Tests (PG-029)
  // ============================================

  describe('removePaymentMethod - subscription guard', () => {
    it('succeeds when no active subscription exists', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...mockCustomer, defaultPaymentMethodId: 'pm_123' },
      });

      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod],
      });

      mockStripeAdapterMethods.detachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: mockPaymentMethod,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.removePaymentMethod({ paymentMethodId: 'pm_123' });
      expect(result.success).toBe(true);
    });

    it('throws PRECONDITION_FAILED when removing default card with active subscription', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...mockCustomer, defaultPaymentMethodId: 'pm_123' },
      });

      // Include a second card so it's NOT the "last card" — tests the default-card guard specifically
      const secondPm = { ...mockPaymentMethod, id: 'pm_other_card' };
      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod, secondPm],
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.removePaymentMethod({ paymentMethodId: 'pm_123' })).rejects.toThrow(
        'Cannot remove default payment method while you have an active subscription'
      );
    });

    it('throws error when removing last card with active subscription', async () => {
      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...mockCustomer, defaultPaymentMethodId: 'pm_other' },
      });

      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod], // Only one card
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      await expect(caller.removePaymentMethod({ paymentMethodId: 'pm_123' })).rejects.toThrow(
        /cannot remove/i
      );
    });

    it('succeeds when removing non-default card even with active subscription', async () => {
      const nonDefaultPm = { ...mockPaymentMethod, id: 'pm_456' };

      mockStripeAdapterMethods.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapterMethods.getCustomer.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ...mockCustomer, defaultPaymentMethodId: 'pm_123' },
      });

      mockStripeAdapterMethods.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod, nonDefaultPm],
      });

      mockStripeAdapterMethods.detachPaymentMethod.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: nonDefaultPm,
      });

      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
          emailVerified: true,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(
        mockContext as Parameters<typeof billingRouter.createCaller>[0]
      );

      const result = await caller.removePaymentMethod({ paymentMethodId: 'pm_456' });
      expect(result.success).toBe(true);
    });
  });
});
