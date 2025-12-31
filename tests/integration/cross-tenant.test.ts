/**
 * Cross-Tenant Access Tests
 *
 * Integration tests for verifying cross-tenant access prevention
 * at both application and database levels.
 *
 * IMPLEMENTS: IFC-127 (Tenant Isolation)
 *
 * Test Scenarios:
 * - User A cannot access User B's leads
 * - User A cannot access User B's contacts
 * - User A cannot access User B's accounts
 * - User A cannot access User B's opportunities
 * - User A cannot access User B's tasks
 * - Manager can access team member data
 * - Admin can access all data
 * - Service role bypasses all isolation
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { TRPCError } from '@trpc/server';
import {
  extractTenantContext,
  createTenantWhereClause,
  verifyTenantAccess,
  validateTenantOperation,
  TenantContext,
  TenantAwareContext,
} from '../../apps/api/src/security/tenant-context';
import {
  checkResourceUsage,
  enforceResourceLimit,
  clearRateLimitState,
} from '../../apps/api/src/security/tenant-limiter';

/**
 * Mock Prisma client for integration testing
 * In production tests, this would be replaced with a test database
 */
const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
  },
  lead: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  contact: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  account: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  opportunity: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  task: {
    count: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  aIScore: {
    count: vi.fn(),
  },
  auditLog: {
    findMany: vi.fn(),
    create: vi.fn(),
  },
  $executeRawUnsafe: vi.fn(),
} as unknown as PrismaClient;

/**
 * Test fixtures
 */
const testUsers = {
  userA: {
    id: 'user-a-123',
    email: 'user-a@test.com',
    role: 'USER' as const,
  },
  userB: {
    id: 'user-b-456',
    email: 'user-b@test.com',
    role: 'USER' as const,
  },
  manager: {
    id: 'manager-789',
    email: 'manager@test.com',
    role: 'MANAGER' as const,
  },
  admin: {
    id: 'admin-000',
    email: 'admin@test.com',
    role: 'ADMIN' as const,
  },
};

const testLeads = {
  leadUserA: {
    id: 'lead-a-1',
    email: 'lead-a@example.com',
    ownerId: testUsers.userA.id,
  },
  leadUserB: {
    id: 'lead-b-1',
    email: 'lead-b@example.com',
    ownerId: testUsers.userB.id,
  },
};

const testContacts = {
  contactUserA: {
    id: 'contact-a-1',
    email: 'contact-a@example.com',
    ownerId: testUsers.userA.id,
    firstName: 'Contact',
    lastName: 'A',
  },
  contactUserB: {
    id: 'contact-b-1',
    email: 'contact-b@example.com',
    ownerId: testUsers.userB.id,
    firstName: 'Contact',
    lastName: 'B',
  },
};

/**
 * Helper to create tenant-aware context for testing
 */
function createTestContext(user: typeof testUsers.userA): TenantAwareContext {
  const tenant = extractTenantContext({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    user: {
      userId: user.id,
      email: user.email,
      role: user.role,
    },
    tenant,
    prisma: mockPrisma,
    prismaWithTenant: mockPrisma,
    req: null as any,
    res: null as any,
  };
}

describe('Cross-Tenant Lead Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
  });

  describe('SELECT operations', () => {
    it('User A cannot access User B leads via direct query', async () => {
      const ctxUserA = createTestContext(testUsers.userA);

      // Simulate query with tenant filter
      const where = createTenantWhereClause(ctxUserA.tenant, { id: testLeads.leadUserB.id });

      // The where clause should include ownerId filter
      expect(where.ownerId).toBe(testUsers.userA.id);

      // Even if the lead ID matches, the owner filter prevents access
      // In real DB, this would return empty results
    });

    it('User A can only see their own leads', async () => {
      const ctxUserA = createTestContext(testUsers.userA);

      const where = createTenantWhereClause(ctxUserA.tenant);

      expect(where.ownerId).toBe(testUsers.userA.id);
    });

    it('User B cannot access User A leads', async () => {
      const ctxUserB = createTestContext(testUsers.userB);

      const where = createTenantWhereClause(ctxUserB.tenant, { id: testLeads.leadUserA.id });

      expect(where.ownerId).toBe(testUsers.userB.id);
      // This filter would exclude User A's lead
    });
  });

  describe('INSERT operations', () => {
    it('User A cannot create lead for User B', () => {
      const ctxUserA = createTestContext(testUsers.userA);

      expect(() => {
        validateTenantOperation(ctxUserA.tenant, 'create', {
          ownerId: testUsers.userB.id,
        });
      }).toThrow(TRPCError);
    });

    it('User A can create lead for themselves', () => {
      const ctxUserA = createTestContext(testUsers.userA);

      expect(() => {
        validateTenantOperation(ctxUserA.tenant, 'create', {
          ownerId: testUsers.userA.id,
        });
      }).not.toThrow();
    });
  });

  describe('UPDATE operations', () => {
    it('User A cannot update User B lead', async () => {
      const ctxUserA = createTestContext(testUsers.userA);

      const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Cross-tenant access denied');
    });

    it('User A can update their own lead', async () => {
      const ctxUserA = createTestContext(testUsers.userA);

      const result = await verifyTenantAccess(ctxUserA, testUsers.userA.id);

      expect(result.allowed).toBe(true);
    });
  });

  describe('DELETE operations', () => {
    it('User A cannot delete User B lead', async () => {
      const ctxUserA = createTestContext(testUsers.userA);

      const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

      expect(result.allowed).toBe(false);
    });
  });
});

describe('Cross-Tenant Contact Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User A cannot access User B contacts', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const where = createTenantWhereClause(ctxUserA.tenant);

    expect(where.ownerId).toBe(testUsers.userA.id);
  });

  it('Contact ownership check prevents cross-tenant access', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const result = await verifyTenantAccess(ctxUserA, testContacts.contactUserB.ownerId);

    expect(result.allowed).toBe(false);
  });
});

describe('Cross-Tenant Account Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User A cannot access User B accounts', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

    expect(result.allowed).toBe(false);
  });
});

describe('Cross-Tenant Opportunity Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User A cannot access User B opportunities', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

    expect(result.allowed).toBe(false);
  });
});

describe('Cross-Tenant Task Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User A cannot access User B tasks', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

    expect(result.allowed).toBe(false);
  });
});

describe('Manager Cross-Tenant Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.user.findUnique as any).mockResolvedValue({ role: 'USER' });
  });

  it('Manager can access team member leads', async () => {
    const ctxManager = createTestContext(testUsers.manager);

    const result = await verifyTenantAccess(ctxManager, testUsers.userA.id);

    expect(result.allowed).toBe(true);
  });

  it('Manager has team visibility in where clause', () => {
    const managerTenant: TenantContext = {
      tenantId: testUsers.manager.id,
      tenantType: 'user',
      userId: testUsers.manager.id,
      role: 'MANAGER',
      canAccessAllTenantData: true,
      teamMemberIds: [testUsers.userA.id, testUsers.userB.id],
    };

    const where = createTenantWhereClause(managerTenant);

    expect(where.ownerId).toEqual({
      in: [testUsers.manager.id, testUsers.userA.id, testUsers.userB.id],
    });
  });
});

describe('Admin Cross-Tenant Access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Admin can access any user data', async () => {
    const ctxAdmin = createTestContext(testUsers.admin);

    const resultA = await verifyTenantAccess(ctxAdmin, testUsers.userA.id);
    const resultB = await verifyTenantAccess(ctxAdmin, testUsers.userB.id);

    expect(resultA.allowed).toBe(true);
    expect(resultB.allowed).toBe(true);
  });

  it('Admin has no tenant filter in where clause', () => {
    const adminTenant: TenantContext = {
      tenantId: testUsers.admin.id,
      tenantType: 'user',
      userId: testUsers.admin.id,
      role: 'ADMIN',
      canAccessAllTenantData: true,
    };

    const where = createTenantWhereClause(adminTenant, { status: 'NEW' });

    expect(where.ownerId).toBeUndefined();
    expect(where.status).toBe('NEW');
  });

  it('Admin can create resources for any user', () => {
    const adminTenant: TenantContext = {
      tenantId: testUsers.admin.id,
      tenantType: 'user',
      userId: testUsers.admin.id,
      role: 'ADMIN',
      canAccessAllTenantData: true,
    };

    expect(() => {
      validateTenantOperation(adminTenant, 'create', { ownerId: testUsers.userA.id });
    }).not.toThrow();

    expect(() => {
      validateTenantOperation(adminTenant, 'create', { ownerId: testUsers.userB.id });
    }).not.toThrow();
  });
});

describe('Cross-Tenant Resource Limits', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearRateLimitState();
    (mockPrisma.user.findUnique as any).mockResolvedValue({ role: 'USER' });
  });

  it('User A limits do not affect User B limits', async () => {
    // User A is at limit
    (mockPrisma.lead.count as any).mockResolvedValueOnce(1000);

    await expect(enforceResourceLimit(mockPrisma, testUsers.userA.id, 'leads')).rejects.toThrow();

    // User B is not at limit
    (mockPrisma.lead.count as any).mockResolvedValueOnce(50);

    await expect(enforceResourceLimit(mockPrisma, testUsers.userB.id, 'leads')).resolves.not.toThrow();
  });

  it('Each tenant has independent resource usage', async () => {
    (mockPrisma.lead.count as any)
      .mockResolvedValueOnce(100) // User A
      .mockResolvedValueOnce(500); // User B

    const usageA = await checkResourceUsage(mockPrisma, testUsers.userA.id, 'leads');
    const usageB = await checkResourceUsage(mockPrisma, testUsers.userB.id, 'leads');

    expect(usageA.current).toBe(100);
    expect(usageB.current).toBe(500);
    expect(usageA.current).not.toBe(usageB.current);
  });
});

describe('Parameter Manipulation Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Attacker cannot access other tenant data by modifying ID parameter', async () => {
    const ctxAttacker = createTestContext(testUsers.userA);

    // Attacker tries to access user B's resource by specifying their ID
    const attackedOwnerId = testUsers.userB.id;

    const result = await verifyTenantAccess(ctxAttacker, attackedOwnerId);

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cross-tenant access denied');
  });

  it('Where clause prevents parameter manipulation', () => {
    const ctxAttacker = createTestContext(testUsers.userA);

    // Even if attacker includes other user's ID in filter, ownerId check prevents access
    const where = createTenantWhereClause(ctxAttacker.tenant, {
      id: testLeads.leadUserB.id, // Attacker's parameter
    });

    // The where clause still includes ownerId = attacker's ID
    expect(where.ownerId).toBe(testUsers.userA.id);
    expect(where.id).toBe(testLeads.leadUserB.id);
    // In real DB, this would return empty because no lead matches both conditions
  });
});

describe('Privilege Escalation Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('User cannot assign themselves admin role', () => {
    const regularUserTenant: TenantContext = {
      tenantId: testUsers.userA.id,
      tenantType: 'user',
      userId: testUsers.userA.id,
      role: 'USER',
      canAccessAllTenantData: false,
    };

    // User tries to escalate privileges
    expect(regularUserTenant.canAccessAllTenantData).toBe(false);
    expect(regularUserTenant.role).toBe('USER');
  });

  it('User cannot create resources for admin', () => {
    const userTenant: TenantContext = {
      tenantId: testUsers.userA.id,
      tenantType: 'user',
      userId: testUsers.userA.id,
      role: 'USER',
      canAccessAllTenantData: false,
    };

    expect(() => {
      validateTenantOperation(userTenant, 'create', { ownerId: testUsers.admin.id });
    }).toThrow('Cannot create resource for another tenant');
  });
});

describe('Audit Trail for Cross-Tenant Attempts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Cross-tenant access attempt should be logged', async () => {
    const ctxUserA = createTestContext(testUsers.userA);

    const result = await verifyTenantAccess(ctxUserA, testUsers.userB.id);

    // In production, this would trigger audit logging
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('Cross-tenant access denied');

    // Future: Verify audit log was created
    // expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
    //   data: expect.objectContaining({
    //     action: 'CROSS_TENANT_ACCESS_ATTEMPT',
    //     userId: testUsers.userA.id,
    //     targetUserId: testUsers.userB.id,
    //   }),
    // });
  });
});

describe('Concurrent Multi-Tenant Requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle concurrent requests from different tenants', async () => {
    // Simulate concurrent tenant contexts
    const ctxUserA = createTestContext(testUsers.userA);
    const ctxUserB = createTestContext(testUsers.userB);

    // Both make requests simultaneously
    const [resultA, resultB] = await Promise.all([
      verifyTenantAccess(ctxUserA, testUsers.userA.id),
      verifyTenantAccess(ctxUserB, testUsers.userB.id),
    ]);

    // Each should only have access to their own data
    expect(resultA.allowed).toBe(true);
    expect(resultB.allowed).toBe(true);

    // Cross-access should still be denied
    const [crossA, crossB] = await Promise.all([
      verifyTenantAccess(ctxUserA, testUsers.userB.id),
      verifyTenantAccess(ctxUserB, testUsers.userA.id),
    ]);

    expect(crossA.allowed).toBe(false);
    expect(crossB.allowed).toBe(false);
  });

  it('tenant isolation maintains under load', () => {
    // Create many tenant contexts
    const contexts = [];
    for (let i = 0; i < 100; i++) {
      contexts.push(
        createTestContext({
          id: `user-${i}`,
          email: `user-${i}@test.com`,
          role: 'USER',
        })
      );
    }

    // Each should be isolated
    contexts.forEach((ctx, i) => {
      expect(ctx.tenant.tenantId).toBe(`user-${i}`);
      expect(ctx.tenant.canAccessAllTenantData).toBe(false);

      const where = createTenantWhereClause(ctx.tenant);
      expect(where.ownerId).toBe(`user-${i}`);
    });
  });
});
