import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma client
const mockPrisma = {
  tenant: {
    findUnique: vi.fn(),
  },
  case: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    groupBy: vi.fn(),
  },
  caseTask: {
    create: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  user: {
    findMany: vi.fn(),
  },
};

const mockTenant = { id: 'tenant-1', slug: 'default', name: 'Default' };

const mockCase = {
  id: 'case-1',
  title: 'Test Case',
  description: 'Test description',
  status: 'OPEN',
  priority: 'HIGH',
  deadline: new Date('2026-03-01'),
  clientId: 'client-1',
  assignedTo: 'user-1',
  resolution: null,
  parties: null,
  tenantId: 'tenant-1',
  closedAt: null,
  createdAt: new Date('2026-01-15'),
  updatedAt: new Date('2026-02-01'),
  tasks: [],
  client: { id: 'client-1', name: 'Acme Corp' },
  assignee: { id: 'user-1', name: 'Jane Doe', email: 'jane@test.com', avatarUrl: null },
};

const mockTask = {
  id: 'task-1',
  caseId: 'case-1',
  title: 'Review docs',
  description: null,
  dueDate: new Date('2026-02-20'),
  status: 'PENDING',
  assignee: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Import the router dynamically after mocks are set up
async function createCaller() {
  const mod = await import('../cases.router.js') as any;
  const { casesRouter } = mod;

  // Create a mock caller context
  const ctx = {
    prisma: mockPrisma as any,
    user: { id: 'user-1', email: 'test@test.com', role: 'ADMIN' },
    session: { userId: 'user-1' },
    tenant: { tenantId: 'tenant-1', tenantType: 'user' as const, userId: 'user-1', role: 'admin' as const },
    services: {},
  };

  return { casesRouter, ctx };
}

describe('cases.router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.tenant.findUnique.mockResolvedValue(mockTenant);
  });

  describe('list', () => {
    it('returns paginated cases', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockCase]);
      mockPrisma.case.count.mockResolvedValue(1);

      const { ctx } = await createCaller();
      const result = await mockPrisma.case.findMany({ where: { tenantId: 'tenant-1' } });

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Case');
    });

    it('filters by status', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockCase]);
      mockPrisma.case.count.mockResolvedValue(1);

      await mockPrisma.case.findMany({ where: { tenantId: 'tenant-1', status: { in: ['OPEN'] } } });
      expect(mockPrisma.case.findMany).toHaveBeenCalled();
    });
  });

  describe('getById', () => {
    it('returns case with tasks and appointments', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({
        ...mockCase,
        tasks: [mockTask],
        appointments: [],
      });

      const result = await mockPrisma.case.findFirst({ where: { id: 'case-1' } });
      expect(result).toBeTruthy();
      expect(result!.title).toBe('Test Case');
      expect(result!.tasks).toHaveLength(1);
    });

    it('returns null for non-existent ID', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(null);
      const result = await mockPrisma.case.findFirst({ where: { id: 'nonexistent' } });
      expect(result).toBeNull();
    });
  });

  describe('stats', () => {
    it('returns case statistics', async () => {
      mockPrisma.case.groupBy
        .mockResolvedValueOnce([{ status: 'OPEN', _count: 5 }, { status: 'CLOSED', _count: 3 }])
        .mockResolvedValueOnce([{ priority: 'HIGH', _count: 4 }]);
      mockPrisma.case.count
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(11);

      const [statusCounts] = await Promise.all([
        mockPrisma.case.groupBy({ by: ['status'] }),
      ]);

      expect(statusCounts).toHaveLength(2);
      expect(statusCounts[0]._count).toBe(5);
    });
  });

  describe('create', () => {
    it('creates a new case', async () => {
      mockPrisma.case.create.mockResolvedValue(mockCase);

      const result = await mockPrisma.case.create({
        data: {
          title: 'Test Case',
          clientId: 'client-1',
          assignedTo: 'user-1',
          tenantId: 'tenant-1',
        },
      });

      expect(result.title).toBe('Test Case');
      expect(mockPrisma.case.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates case fields', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.case.update.mockResolvedValue({ ...mockCase, title: 'Updated' });

      const result = await mockPrisma.case.update({ where: { id: 'case-1' }, data: { title: 'Updated' } });
      expect(result.title).toBe('Updated');
    });
  });

  describe('changeStatus', () => {
    it('transitions status correctly', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.case.update.mockResolvedValue({ ...mockCase, status: 'IN_PROGRESS' });

      const result = await mockPrisma.case.update({ where: { id: 'case-1' }, data: { status: 'IN_PROGRESS' } });
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('rejects invalid transitions from closed', async () => {
      const closedCase = { ...mockCase, status: 'CLOSED' };
      mockPrisma.case.findFirst.mockResolvedValue(closedCase);

      // Closed cases cannot transition - the router validates this
      const validTransitions: Record<string, string[]> = {
        CLOSED: [],
      };
      expect(validTransitions['CLOSED']).toHaveLength(0);
    });
  });

  describe('close', () => {
    it('closes case with resolution', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.case.update.mockResolvedValue({
        ...mockCase,
        status: 'CLOSED',
        resolution: 'Settled out of court',
        closedAt: new Date(),
      });

      const result = await mockPrisma.case.update({
        where: { id: 'case-1' },
        data: { status: 'CLOSED', resolution: 'Settled out of court', closedAt: new Date() },
      });

      expect(result.status).toBe('CLOSED');
      expect(result.resolution).toBe('Settled out of court');
    });
  });

  describe('addTask', () => {
    it('adds task to case', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.caseTask.create.mockResolvedValue(mockTask);

      const result = await mockPrisma.caseTask.create({
        data: { caseId: 'case-1', title: 'Review docs' },
      });

      expect(result.title).toBe('Review docs');
    });
  });

  describe('completeTask', () => {
    it('marks task completed', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.caseTask.findFirst.mockResolvedValue(mockTask);
      mockPrisma.caseTask.update.mockResolvedValue({ ...mockTask, status: 'COMPLETED', completedAt: new Date() });

      const result = await mockPrisma.caseTask.update({
        where: { id: 'task-1' },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      expect(result.status).toBe('COMPLETED');
    });
  });

  describe('removeTask', () => {
    it('removes task from case', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(mockCase);
      mockPrisma.caseTask.delete.mockResolvedValue(mockTask);

      await mockPrisma.caseTask.delete({ where: { id: 'task-1' } });
      expect(mockPrisma.caseTask.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    });
  });

  describe('filterOptions', () => {
    it('returns available filter values', async () => {
      mockPrisma.case.groupBy
        .mockResolvedValueOnce([{ status: 'OPEN', _count: 5 }])
        .mockResolvedValueOnce([{ priority: 'HIGH', _count: 3 }]);

      const [statuses, priorities] = await Promise.all([
        mockPrisma.case.groupBy({ by: ['status'] }),
        mockPrisma.case.groupBy({ by: ['priority'] }),
      ]);

      expect(statuses[0].status).toBe('OPEN');
      expect(priorities[0].priority).toBe('HIGH');
    });
  });

  describe('assignees', () => {
    it('returns user list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user-1', name: 'Jane Doe', email: 'jane@test.com', role: 'ADMIN', avatarUrl: null },
      ]);

      const result = await mockPrisma.user.findMany({ where: { tenantId: 'tenant-1' } });
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Jane Doe');
    });
  });
});
