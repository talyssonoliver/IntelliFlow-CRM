/**
 * Report Templates Router Tests - PG-200
 *
 * Tests for /analytics/report-templates tRPC procedures:
 * - list (tenant-scoped, visibility: own + non-private)
 * - get (by id)
 * - create (with duplicate-name pre-check)
 * - update ($transaction)
 * - delete ($transaction)
 * - Multi-tenant isolation + cross-user private-template isolation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TRPCError } from '@trpc/server';
import { reportTemplatesRouter } from '../report-templates.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = TEST_UUIDS.tenant;
const userId = TEST_UUIDS.user1;

const mockTemplate = {
  id: 'cjld2cjxh0000qzrmn831i7rn',
  tenantId,
  createdBy: userId,
  name: 'Revenue Report',
  description: 'Monthly revenue summary',
  filterSet: {},
  selectedColumns: ['revenue', 'deal_count'],
  chartType: 'bar',
  defaultPeriod: '30d',
  sharingScope: 'private',
  isDefault: false,
  createdAt: new Date('2026-06-29'),
  updatedAt: new Date('2026-06-29'),
};

const mockTeamTemplate = {
  ...mockTemplate,
  id: 'cjld2cjxh0001qzrmn831i7rn',
  createdBy: TEST_UUIDS.user2,
  name: 'Team Pipeline',
  sharingScope: 'team',
};

describe('Report Templates Router (PG-200)', () => {
  let caller: ReturnType<typeof reportTemplatesRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = reportTemplatesRouter.createCaller(ctx);
  });

  // ─── list ─────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns own templates + non-private tenant templates', async () => {
      const templates = [mockTemplate, mockTeamTemplate];
      (prismaMock.reportTemplate.findMany as any).mockResolvedValueOnce(templates);

      const result = await caller.list();

      expect(prismaMock.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId,
            OR: [{ createdBy: userId }, { sharingScope: { not: 'private' } }],
          },
        })
      );
      expect(result).toHaveLength(2);
    });

    it('does not return private templates created by another user', async () => {
      // The router must filter with OR: [own OR non-private]
      // A private template from another user should NOT appear
      const ownOnly = [mockTemplate];
      (prismaMock.reportTemplate.findMany as any).mockResolvedValueOnce(ownOnly);

      const result = await caller.list();

      // Verify the WHERE clause includes the visibility filter
      expect(prismaMock.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { createdBy: userId },
              { sharingScope: { not: 'private' } },
            ]),
          }),
        })
      );
      expect(result).toHaveLength(1);
    });

    it('returns empty array when no templates exist', async () => {
      (prismaMock.reportTemplate.findMany as any).mockResolvedValueOnce([]);

      const result = await caller.list();

      expect(result).toEqual([]);
    });

    it('scopes to caller tenantId (cross-tenant negative)', async () => {
      (prismaMock.reportTemplate.findMany as any).mockResolvedValueOnce([]);

      await caller.list();

      expect(prismaMock.reportTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        })
      );
    });
  });

  // ─── get ──────────────────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the template by id with visibility predicate', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);

      const result = await caller.get({ id: mockTemplate.id });

      expect(prismaMock.reportTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: mockTemplate.id,
            tenantId,
            OR: expect.arrayContaining([
              { createdBy: userId },
              { sharingScope: { not: 'private' } },
            ]),
          },
        })
      );
      expect(result).toEqual(mockTemplate);
    });

    it('throws NOT_FOUND when template does not exist', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);

      await expect(caller.get({ id: mockTemplate.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it("throws NOT_FOUND for another tenant's template", async () => {
      // findFirst returns null when tenantId filter excludes cross-tenant rows
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);

      await expect(caller.get({ id: mockTemplate.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND for a private template owned by another user (IDOR guard)', async () => {
      // Visibility predicate excludes private templates from other users
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);

      await expect(caller.get({ id: mockTeamTemplate.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });
  });

  // ─── create ───────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates a template with defaults', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null); // no conflict
      (prismaMock.reportTemplate.create as any).mockResolvedValueOnce(mockTemplate);

      const result = await caller.create({
        name: 'Revenue Report',
        selectedColumns: ['revenue', 'deal_count'],
      });

      expect(prismaMock.reportTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId,
            createdBy: userId,
            name: 'Revenue Report',
            chartType: 'table',
            defaultPeriod: '30d',
            sharingScope: 'private',
          }),
        })
      );
      expect(result).toEqual(mockTemplate);
    });

    it('throws CONFLICT when template name already exists in tenant', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate); // conflict

      await expect(
        caller.create({
          name: 'Revenue Report',
          selectedColumns: ['col'],
        })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('allows same name across different tenants', async () => {
      // findFirst returns null because the tenantId filter scopes it
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      (prismaMock.reportTemplate.create as any).mockResolvedValueOnce(mockTemplate);

      await expect(
        caller.create({ name: 'Revenue Report', selectedColumns: ['col'] })
      ).resolves.toBeDefined();
    });

    it('rejects invalid input (empty name)', async () => {
      await expect(caller.create({ name: '', selectedColumns: ['col'] } as any)).rejects.toThrow();
    });

    it('rejects empty selectedColumns', async () => {
      await expect(caller.create({ name: 'T', selectedColumns: [] } as any)).rejects.toThrow();
    });

    it('sets createdBy from context user id (not from input)', async () => {
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      (prismaMock.reportTemplate.create as any).mockResolvedValueOnce(mockTemplate);

      await caller.create({ name: 'T', selectedColumns: ['col'] });

      expect(prismaMock.reportTemplate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ createdBy: userId }),
        })
      );
    });
  });

  // ─── update ───────────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates template fields via $transaction', async () => {
      const updated = { ...mockTemplate, chartType: 'line' };
      // Visibility guard (findFirst call 1): caller owns it → proceed
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);
      // No name change → no uniqueness pre-check (no second findFirst)
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: { update: vi.fn().mockResolvedValue(updated) },
        };
        return fn(mockTx);
      });

      const result = await caller.update({ id: mockTemplate.id, chartType: 'line' });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toMatchObject({ chartType: 'line' });
    });

    it('throws NOT_FOUND when caller cannot see the template', async () => {
      // Visibility guard returns null (private template from another user)
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);

      await expect(caller.update({ id: mockTemplate.id, chartType: 'bar' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws NOT_FOUND when template not in tenant (P2025)', async () => {
      // Visibility guard passes but update fails with P2025
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: {
            update: vi.fn().mockRejectedValue(Object.assign(new Error('P2025'), { code: 'P2025' })),
          },
        };
        return fn(mockTx);
      });

      await expect(caller.update({ id: mockTemplate.id, chartType: 'bar' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('throws CONFLICT when renaming to an existing name', async () => {
      // Visibility guard (findFirst call 1): passes
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);
      // Name-change triggers uniqueness pre-check (findFirst call 2): returns collision
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTeamTemplate);

      await expect(
        caller.update({ id: mockTemplate.id, name: 'Team Pipeline' })
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('allows rename when no collision exists', async () => {
      const updated = { ...mockTemplate, name: 'New Name' };
      // Visibility guard (findFirst call 1): passes
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);
      // Uniqueness pre-check (findFirst call 2): no collision
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(null);
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: { update: vi.fn().mockResolvedValue(updated) },
        };
        return fn(mockTx);
      });

      const result = await caller.update({ id: mockTemplate.id, name: 'New Name' });

      expect(result).toMatchObject({ name: 'New Name' });
    });

    it('scopes update to caller tenantId', async () => {
      const updated = { ...mockTemplate, chartType: 'line' };
      let capturedWhere: any;
      // Visibility guard passes; no name change
      (prismaMock.reportTemplate.findFirst as any).mockResolvedValueOnce(mockTemplate);
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: {
            update: vi.fn().mockImplementation(({ where }: any) => {
              capturedWhere = where;
              return Promise.resolve(updated);
            }),
          },
        };
        return fn(mockTx);
      });

      await caller.update({ id: mockTemplate.id, chartType: 'line' });

      expect(capturedWhere).toMatchObject({ id: mockTemplate.id, tenantId });
    });
  });

  // ─── delete ───────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('deletes template via $transaction', async () => {
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: {
            deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return fn(mockTx);
      });

      const result = await caller.delete({ id: mockTemplate.id });

      expect(prismaMock.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ deleted: true });
    });

    it('throws NOT_FOUND when caller is not the creator', async () => {
      // Creator-only delete: count 0 when the caller didn't create the template
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: {
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return fn(mockTx);
      });

      await expect(caller.delete({ id: mockTemplate.id })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('scopes deleteMany to caller tenantId and createdBy (creator-only)', async () => {
      let capturedWhere: any;
      (prismaMock.$transaction as any).mockImplementation(async (fn: (tx: any) => Promise<any>) => {
        const mockTx = {
          reportTemplate: {
            deleteMany: vi.fn().mockImplementation(({ where }: any) => {
              capturedWhere = where;
              return Promise.resolve({ count: 1 });
            }),
          },
        };
        return fn(mockTx);
      });

      await caller.delete({ id: mockTemplate.id });

      expect(capturedWhere).toMatchObject({
        id: mockTemplate.id,
        tenantId,
        createdBy: userId,
      });
    });
  });
});
