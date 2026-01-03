/**
 * Billing Router Tests
 *
 * @implements PG-025 (Billing Portal)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { billingRouter } from '../billing.router';
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

// Mock StripeAdapter
const mockStripeAdapter = {
  listSubscriptions: vi.fn(),
  listInvoices: vi.fn(),
  listPaymentMethods: vi.fn(),
  getCustomer: vi.fn(),
  attachPaymentMethod: vi.fn(),
  detachPaymentMethod: vi.fn(),
  updateSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  createCustomer: vi.fn(),
};

// Mock the StripeAdapter module
vi.mock('@intelliflow/adapters', () => ({
  StripeAdapter: vi.fn(() => mockStripeAdapter),
}));

// Mock environment variable
vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_123');

describe('billingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          stripeCustomerId: null,
        } as UserSession,
        prisma: {} as unknown,
      };

      // Create a caller for testing
      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.getSubscription();
      expect(result).toBeNull();
    });

    it('returns subscription when user has active subscription', async () => {
      mockStripeAdapter.listSubscriptions.mockResolvedValue({
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
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.getSubscription();
      expect(result).toEqual(mockSubscription);
    });

    it('returns null when no subscriptions exist', async () => {
      mockStripeAdapter.listSubscriptions.mockResolvedValue({
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
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

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
          stripeCustomerId: null,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.listInvoices({ page: 1, limit: 10 });
      expect(result.invoices).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('returns paginated invoices', async () => {
      mockStripeAdapter.listInvoices.mockResolvedValue({
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
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

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
          stripeCustomerId: null,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.getPaymentMethods();
      expect(result).toEqual([]);
    });

    it('returns payment methods with isDefault flag', async () => {
      mockStripeAdapter.listPaymentMethods.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockPaymentMethod],
      });

      mockStripeAdapter.getCustomer.mockResolvedValue({
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
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

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
          stripeCustomerId: null,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      await expect(
        caller.cancelSubscription({ atPeriodEnd: true })
      ).rejects.toThrow(TRPCError);
    });

    it('cancels subscription at period end', async () => {
      const canceledSubscription = {
        ...mockSubscription,
        cancelAtPeriodEnd: true,
      };

      mockStripeAdapter.listSubscriptions.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: [mockSubscription],
      });

      mockStripeAdapter.cancelSubscription.mockResolvedValue({
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
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.cancelSubscription({ atPeriodEnd: true });
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(mockStripeAdapter.cancelSubscription).toHaveBeenCalledWith('sub_123', true);
    });
  });

  // ============================================
  // getUsageMetrics Tests
  // ============================================

  describe('getUsageMetrics', () => {
    it('returns null when user has no stripeCustomerId', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: null,
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.getUsageMetrics();
      expect(result).toBeNull();
    });

    it('returns usage metrics when user has subscription', async () => {
      const mockContext = {
        user: {
          userId: 'user_123',
          email: 'test@example.com',
          role: 'USER',
          tenantId: 'tenant_123',
          stripeCustomerId: 'cus_123',
        } as UserSession,
        prisma: {} as unknown,
      };

      const caller = billingRouter.createCaller(mockContext as Parameters<typeof billingRouter.createCaller>[0]);

      const result = await caller.getUsageMetrics();
      expect(result).not.toBeNull();
      expect(result?.apiCalls).toBeDefined();
      expect(result?.storage).toBeDefined();
      expect(result?.activeUsers).toBeDefined();
    });
  });
});
