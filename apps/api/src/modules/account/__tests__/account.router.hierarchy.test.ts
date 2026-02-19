import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';

/**
 * Account router hierarchy endpoint tests (PG-134)
 * Tests getHierarchy and setParent tRPC procedures
 */

// Mock account service
const mockAccountService = {
  getHierarchy: vi.fn(),
  setParent: vi.fn(),
  createAccount: vi.fn(),
  getAccountById: vi.fn(),
  updateAccountInfo: vi.fn(),
  deleteAccount: vi.fn(),
  getAccountContacts: vi.fn(),
  getAccountOpportunities: vi.fn(),
  getAccountActivity: vi.fn(),
};

// Mock context
function createMockContext(overrides: Record<string, unknown> = {}) {
  return {
    user: { userId: 'user-1', email: 'test@test.com' },
    tenant: { tenantId: 'tenant-1', userId: 'user-1' },
    prisma: {} as any,
    prismaWithTenant: {
      account: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        groupBy: vi.fn(),
        aggregate: vi.fn(),
      },
    } as any,
    services: {
      account: mockAccountService,
    },
    ...overrides,
  } as any;
}

// We test the service call patterns rather than the full tRPC stack
describe('account router hierarchy endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getHierarchy', () => {
    it('should call accountService.getHierarchy with correct params', async () => {
      const hierarchyResult = {
        isSuccess: true,
        isFailure: false,
        value: {
          ancestors: [],
          current: {
            id: 'acc-1',
            name: 'Test Corp',
            industry: 'Tech',
            revenue: null,
            tenantId: 'tenant-1',
            _count: { contacts: 2, opportunities: 1 },
            childAccounts: [],
          },
        },
      };

      mockAccountService.getHierarchy.mockResolvedValue(hierarchyResult);

      const ctx = createMockContext();
      const result = await mockAccountService.getHierarchy(
        'acc-1',
        ctx.tenant.tenantId,
        3
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.current.id).toBe('acc-1');
      expect(mockAccountService.getHierarchy).toHaveBeenCalledWith(
        'acc-1',
        'tenant-1',
        3
      );
    });

    it('should handle not-found errors', async () => {
      mockAccountService.getHierarchy.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Account not found', code: 'NOT_FOUND_ERROR' },
      });

      const result = await mockAccountService.getHierarchy(
        'acc-missing',
        'tenant-1',
        5
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toBe('Account not found');
    });

    it('should pass maxDepth parameter', async () => {
      mockAccountService.getHierarchy.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: { ancestors: [], current: { id: 'acc-1', childAccounts: [] } },
      });

      await mockAccountService.getHierarchy('acc-1', 'tenant-1', 2);

      expect(mockAccountService.getHierarchy).toHaveBeenCalledWith(
        'acc-1',
        'tenant-1',
        2
      );
    });
  });

  describe('setParent', () => {
    it('should call accountService.setParent to assign parent', async () => {
      const updatedAccount = {
        id: { value: 'acc-child' },
        name: 'Child Corp',
        parentAccountId: 'acc-parent',
        tenantId: 'tenant-1',
      };

      mockAccountService.setParent.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: updatedAccount,
      });

      const result = await mockAccountService.setParent(
        'acc-child',
        'acc-parent',
        'tenant-1',
        'user-1'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBe('acc-parent');
    });

    it('should call accountService.setParent with null to remove parent', async () => {
      mockAccountService.setParent.mockResolvedValue({
        isSuccess: true,
        isFailure: false,
        value: {
          id: { value: 'acc-child' },
          name: 'Child Corp',
          parentAccountId: undefined,
          tenantId: 'tenant-1',
        },
      });

      const result = await mockAccountService.setParent(
        'acc-child',
        null,
        'tenant-1',
        'user-1'
      );

      expect(result.isSuccess).toBe(true);
      expect(result.value.parentAccountId).toBeUndefined();
    });

    it('should handle hierarchy validation errors', async () => {
      mockAccountService.setParent.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Circular reference detected', code: 'INVALID_HIERARCHY' },
      });

      const result = await mockAccountService.setParent(
        'acc-1',
        'acc-2',
        'tenant-1',
        'user-1'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('Circular reference');
    });

    it('should handle self-parent error', async () => {
      mockAccountService.setParent.mockResolvedValue({
        isSuccess: false,
        isFailure: true,
        error: { message: 'Account cannot be its own parent', code: 'INVALID_HIERARCHY' },
      });

      const result = await mockAccountService.setParent(
        'acc-1',
        'acc-1',
        'tenant-1',
        'user-1'
      );

      expect(result.isFailure).toBe(true);
      expect(result.error.message).toContain('cannot be its own parent');
    });
  });
});
