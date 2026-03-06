/**
 * Contact Router Coverage Tests
 *
 * Targeted tests to improve coverage from 62% to 80%+
 * Focuses on uncovered branches in:
 * - getTimeline (cursor pagination, date filtering, raw SQL fallbacks, slow query warnings)
 * - search (performance warning path when query > 1000ms)
 * - filterOptions (null handling when all departments are null)
 * - bulkExport (CSV formatting with null optional fields)
 */

import { TEST_UUIDS } from '../../../test/setup';
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { contactRouter } from '../contact.router';
import {
  prismaMock,
  createTestContext,
  mockContact,
  mockTask,
  delayedPrismaResult,
} from '../../../test/setup';

describe('Contact Router - Coverage Tests', () => {
  beforeEach(() => {
    // Reset is handled by setup.ts
  });

  describe('getTimeline - cursor pagination and date filtering', () => {
    it('should handle both fromDate and toDate filters', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Task within date range',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: new Date('2024-06-15'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
        limit: 20,
      });

      expect(result.events).toHaveLength(1);
      expect(prismaMock.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: expect.any(Date),
              lte: expect.any(Date),
            },
          }),
        })
      );
    });

    it('should use cursor for descending pagination', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      const cursorDate = new Date('2024-06-01T10:00:00.000Z');
      const cursorId = 'task-100';
      const cursorString = `${cursorDate.toISOString()}:${cursorId}`;
      const encodedCursor = Buffer.from(cursorString).toString('base64');

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-99',
          contactId: TEST_UUIDS.contact1,
          title: 'Earlier task',
          description: null,
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: null,
          createdAt: new Date('2024-05-15'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        cursor: encodedCursor,
        sortOrder: 'desc',
        limit: 20,
      });

      expect(result.events).toHaveLength(1);
      // Just verify the call was made with cursor-based where clause
      const callArgs = (prismaMock.task.findMany as any).mock.calls[0][0];
      expect(callArgs.where.contactId).toBe(TEST_UUIDS.contact1);
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.orderBy.createdAt).toBe('desc');
    });

    it('should use cursor for ascending pagination', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      const cursorDate = new Date('2024-06-01T10:00:00.000Z');
      const cursorId = 'task-100';
      const cursorString = `${cursorDate.toISOString()}:${cursorId}`;
      const encodedCursor = Buffer.from(cursorString).toString('base64');

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-101',
          contactId: TEST_UUIDS.contact1,
          title: 'Later task',
          description: null,
          status: 'PENDING',
          priority: 'LOW',
          dueDate: null,
          createdAt: new Date('2024-06-15'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        cursor: encodedCursor,
        sortOrder: 'asc',
        limit: 20,
      });

      expect(result.events).toHaveLength(1);
      // Just verify the call was made with cursor-based where clause
      const callArgs = (prismaMock.task.findMany as any).mock.calls[0][0];
      expect(callArgs.where.contactId).toBe(TEST_UUIDS.contact1);
      expect(callArgs.where.OR).toBeDefined();
      expect(callArgs.orderBy.createdAt).toBe('asc');
    });

    it('should handle raw query throwing error (catch block)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([]);

      // Raw query throws error - should be caught and return empty array
      prismaMock.$queryRaw.mockRejectedValue(new Error('Table "notes" does not exist'));

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 20,
      });

      expect(result.events).toHaveLength(0);
      expect(result.nextCursor).toBeNull();
    });

    it('should log warning when query exceeds 1000ms target', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      // Simulate slow queries by delaying response
      prismaMock.task.findMany.mockImplementation(() => delayedPrismaResult([] as any[], 1100));

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 20,
      });

      expect(result.meetsKpi).toBe(false);
      expect(result.durationMs).toBeGreaterThan(1000);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[contact.getTimeline] SLOW QUERY')
      );

      consoleSpy.mockRestore();
    });

    it('should handle events.length === limit with no hasMore', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      // Return exactly the limit (no extra event)
      const tasks = [
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Task 1',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: new Date('2024-01-15'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
        {
          id: 'task-2',
          contactId: TEST_UUIDS.contact1,
          title: 'Task 2',
          description: null,
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: null,
          createdAt: new Date('2024-01-16'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ];

      prismaMock.task.findMany.mockResolvedValue(tasks);
      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 2,
      });

      // events.length === limit, but we fetched limit+1 and got only limit, so no more
      expect(result.events).toHaveLength(2);
      expect(result.nextCursor).toBeNull();
    });

    it('should handle task with null owner (no actor)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Task with no owner',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: new Date('2024-01-15'),
          owner: null, // No owner
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 20,
      });

      expect(result.events).toHaveLength(1);
      expect(result.events[0].actor).toBeUndefined();
    });
  });

  describe('search - slow query warning', () => {
    it('should log warning when search exceeds 200ms target', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Simulate slow query by delaying response
      prismaMock.contact.findMany.mockImplementation(() => delayedPrismaResult([] as any[], 250));

      const result = await caller.search({ query: 'test' });

      expect(result.meetsKpi).toBe(false);
      expect(result.durationMs).toBeGreaterThan(200);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[contact.search] SLOW QUERY')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('filterOptions - null handling', () => {
    it('should handle when all departments are null', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department'))
          return Promise.resolve([
            { department: null, _count: 10 },
            { department: null, _count: 5 },
          ]);
        if (args.by?.includes('accountId'))
          return Promise.resolve([{ accountId: TEST_UUIDS.account1, _count: 8 }]);
        return Promise.resolve([]);
      });

      prismaMock.account.findMany.mockResolvedValue([
        { id: TEST_UUIDS.account1, name: 'Acme Corp' },
      ] as any);

      const result = await caller.filterOptions();

      // All departments are null, so should be filtered out
      expect(result.departments).toHaveLength(0);
      expect(result.accounts).toHaveLength(1);
    });

    it('should handle when all accounts are null', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department'))
          return Promise.resolve([{ department: 'Engineering', _count: 5 }]);
        if (args.by?.includes('accountId'))
          return Promise.resolve([
            { accountId: null, _count: 10 },
            { accountId: null, _count: 5 },
          ]);
        return Promise.resolve([]);
      });

      const result = await caller.filterOptions();

      expect(result.departments).toHaveLength(1);
      // All accounts are null, so should be filtered out
      expect(result.accounts).toHaveLength(0);
      // account.findMany should not be called when there are no non-null accountIds
      expect(prismaMock.account.findMany).not.toHaveBeenCalled();
    });

    it('should handle partial account name results (some accounts not found)', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      (prismaMock.contact.groupBy as any).mockImplementation((args: { by: string[] }) => {
        if (args.by?.includes('department')) return Promise.resolve([]);
        if (args.by?.includes('accountId'))
          return Promise.resolve([
            { accountId: TEST_UUIDS.account1, _count: 5 },
            { accountId: TEST_UUIDS.account2, _count: 3 },
          ]);
        return Promise.resolve([]);
      });

      // Only return one account (account2 is missing)
      prismaMock.account.findMany.mockResolvedValue([
        { id: TEST_UUIDS.account1, name: 'Acme Corp' },
      ] as any);

      const result = await caller.filterOptions();

      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0]).toEqual({
        value: TEST_UUIDS.account1,
        label: 'Acme Corp',
        count: 5,
      });
      // account2 not found in DB, should fallback to accountId
      expect(result.accounts[1]).toEqual({
        value: TEST_UUIDS.account2,
        label: TEST_UUIDS.account2,
        count: 3,
      });
    });
  });

  describe('bulkExport - CSV with null fields', () => {
    it('should export CSV with all optional fields as null', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.contact1,
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: null,
          phone: null,
          department: null,
          account: null,
        },
      ] as any);

      const result = await caller.bulkExport({
        ids: [TEST_UUIDS.contact1],
        format: 'csv',
      });

      expect(result.successful).toHaveLength(1);
      expect(result.count).toBe(1);
      expect(result.data).toContain('Email,First Name,Last Name,Title,Phone,Department,Account');
      expect(result.data).toContain('"jane@example.com","Jane","Smith","","","",""');
    });

    it('should export CSV with mixed null and non-null fields', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findMany.mockResolvedValue([
        {
          id: TEST_UUIDS.contact1,
          email: 'john@example.com',
          firstName: 'John',
          lastName: 'Doe',
          title: 'Engineer',
          phone: null,
          department: 'Tech',
          account: null,
        },
        {
          id: TEST_UUIDS.contact2,
          email: 'jane@example.com',
          firstName: 'Jane',
          lastName: 'Smith',
          title: null,
          phone: '+1234567890',
          department: null,
          account: { name: 'TechCorp' },
        },
      ] as any);

      const result = await caller.bulkExport({
        ids: [TEST_UUIDS.contact1, TEST_UUIDS.contact2],
        format: 'csv',
      });

      expect(result.count).toBe(2);
      expect(result.data).toContain('"john@example.com","John","Doe","Engineer","","Tech",""');
      expect(result.data).toContain(
        '"jane@example.com","Jane","Smith","","+1234567890","","TechCorp"'
      );
    });
  });

  describe('getTimeline - edge cases for cursor and sorting', () => {
    it('should handle cursor with same timestamp but different IDs', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      const sameTimestamp = new Date('2024-06-01T10:00:00Z');

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Task 1',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: sameTimestamp,
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
        {
          id: 'task-2',
          contactId: TEST_UUIDS.contact1,
          title: 'Task 2',
          description: null,
          status: 'PENDING',
          priority: 'MEDIUM',
          dueDate: null,
          createdAt: sameTimestamp,
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 10,
      });

      // Both events have same timestamp, should be sorted by id (localeCompare)
      expect(result.events).toHaveLength(2);
      expect(result.events[0].id).toBe('task-task-1');
      expect(result.events[1].id).toBe('task-task-2');
    });

    it('should not set nextCursor when events.length < limit', async () => {
      const ctx = createTestContext();
      const caller = contactRouter.createCaller(ctx);

      prismaMock.contact.findUnique.mockResolvedValue({
        ...mockContact,
        id: TEST_UUIDS.contact1,
        leadId: null,
        tenantId: TEST_UUIDS.tenant,
      });

      prismaMock.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          contactId: TEST_UUIDS.contact1,
          title: 'Only task',
          description: null,
          status: 'PENDING',
          priority: 'HIGH',
          dueDate: null,
          createdAt: new Date('2024-01-15'),
          owner: { id: TEST_UUIDS.user1, name: 'User' },
        } as any,
      ]);

      prismaMock.$queryRaw.mockResolvedValue([]);

      const result = await caller.getTimeline({
        contactId: TEST_UUIDS.contact1,
        limit: 20,
      });

      expect(result.events).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });
  });
});
