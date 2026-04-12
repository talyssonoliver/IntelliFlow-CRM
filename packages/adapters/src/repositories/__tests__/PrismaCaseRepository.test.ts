import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PrismaCaseRepository } from '../PrismaCaseRepository';
import { Case, CaseId } from '@intelliflow/domain';

const mockPrisma = {
  case: {
    upsert: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    count: vi.fn(),
    delete: vi.fn(),
    groupBy: vi.fn(),
  },
} as any;

// Generate real CaseIds for testing
const testCaseId = CaseId.generate();
const testCaseIdValue = testCaseId.value;

const mockRecord = {
  id: testCaseIdValue,
  title: 'Test Case',
  description: 'Description',
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
  tasks: [
    {
      id: 'task-1',
      caseId: testCaseIdValue,
      title: 'Review docs',
      description: null,
      dueDate: new Date('2026-02-20'),
      status: 'PENDING',
      assignee: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe('PrismaCaseRepository', () => {
  let repo: PrismaCaseRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new PrismaCaseRepository(mockPrisma);
  });

  describe('save', () => {
    it('upserts a case', async () => {
      mockPrisma.case.upsert.mockResolvedValue(mockRecord);

      const legalCase = Case.reconstitute(testCaseId, {
        title: 'Test Case',
        description: 'Description',
        status: 'OPEN',
        priority: 'HIGH',
        deadline: new Date('2026-03-01'),
        clientId: 'client-1',
        assignedTo: 'user-1',
        tasks: [],
        documentIds: [],
        createdAt: new Date('2026-01-15'),
        updatedAt: new Date('2026-02-01'),
      });

      await repo.save(legalCase);
      expect(mockPrisma.case.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: testCaseIdValue },
        })
      );
    });
  });

  describe('findById', () => {
    it('returns case with tasks', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(mockRecord);

      const result = await repo.findById(testCaseId);
      expect(result).not.toBeNull();
      expect(result!.title).toBe('Test Case');
    });

    it('returns null for non-existent ID', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);

      const otherId = CaseId.generate();
      const result = await repo.findById(otherId);
      expect(result).toBeNull();
    });
  });

  describe('findByClientId', () => {
    it('returns cases for a client', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockRecord]);

      const result = await repo.findByClientId('client-1');
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Test Case');
    });
  });

  describe('findByStatus', () => {
    it('filters by status', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockRecord]);

      const result = await repo.findByStatus('OPEN');
      expect(result).toHaveLength(1);
      expect(mockPrisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'OPEN' }),
        })
      );
    });
  });

  describe('search', () => {
    it('returns paginated results', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockRecord]);
      mockPrisma.case.count.mockResolvedValue(1);

      const result = await repo.search({ page: 1, limit: 20 });
      expect(result.cases).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('applies search query', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);
      mockPrisma.case.count.mockResolvedValue(0);

      await repo.search({ query: 'test' });
      expect(mockPrisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ title: expect.objectContaining({ contains: 'test' }) }),
            ]),
          }),
        })
      );
    });
  });

  describe('getStatistics', () => {
    it('returns counts by status and priority', async () => {
      mockPrisma.case.groupBy
        .mockResolvedValueOnce([{ status: 'OPEN', _count: 5 }])
        .mockResolvedValueOnce([{ priority: 'HIGH', _count: 3 }]);
      mockPrisma.case.count
        .mockResolvedValueOnce(1) // overdue
        .mockResolvedValueOnce(2) // closedThisMonth
        .mockResolvedValueOnce(8); // total

      const result = await repo.getStatistics();
      expect(result.total).toBe(8);
      expect(result.byStatus.OPEN).toBe(5);
      expect(result.byPriority.HIGH).toBe(3);
      expect(result.overdue).toBe(1);
      expect(result.closedThisMonth).toBe(2);
    });
  });

  describe('countByStatus', () => {
    it('returns record of counts', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([
        { status: 'OPEN', _count: 5 },
        { status: 'CLOSED', _count: 3 },
      ]);

      const result = await repo.countByStatus();
      expect(result.OPEN).toBe(5);
      expect(result.CLOSED).toBe(3);
    });
  });

  describe('findOverdue', () => {
    it('returns cases past deadline', async () => {
      mockPrisma.case.findMany.mockResolvedValue([mockRecord]);

      const result = await repo.findOverdue();
      expect(result).toHaveLength(1);
      expect(mockPrisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            deadline: expect.objectContaining({ lt: expect.any(Date) }),
            status: expect.objectContaining({ notIn: ['CLOSED', 'CANCELLED'] }),
          }),
        })
      );
    });
  });

  describe('exists', () => {
    it('returns true when case exists', async () => {
      mockPrisma.case.count.mockResolvedValue(1);
      const result = await repo.exists(testCaseId);
      expect(result).toBe(true);
    });

    it('returns false when case does not exist', async () => {
      mockPrisma.case.count.mockResolvedValue(0);
      const otherId = CaseId.generate();
      const result = await repo.exists(otherId);
      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('deletes a case', async () => {
      mockPrisma.case.delete.mockResolvedValue(mockRecord);
      await repo.delete(testCaseId);
      expect(mockPrisma.case.delete).toHaveBeenCalledWith({ where: { id: testCaseIdValue } });
    });
  });
});
