/**
 * Ticket Config Router Tests - PG-173
 *
 * Tests for SLA policy and ticket category CRUD procedures.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ticketConfigRouter } from '../ticket-config.router';
import { prismaMock, createTestContext, TEST_UUIDS } from '../../../test/setup';

const tenantId = 'test-tenant-id';

const mockSlaPolicy = {
  id: 'sla-1',
  name: 'Standard SLA',
  description: 'Default policy',
  criticalResponseMinutes: 15,
  highResponseMinutes: 60,
  mediumResponseMinutes: 240,
  lowResponseMinutes: 480,
  criticalResolutionMinutes: 120,
  highResolutionMinutes: 480,
  mediumResolutionMinutes: 1440,
  lowResolutionMinutes: 4320,
  warningThresholdPercent: 25,
  isDefault: true,
  isActive: true,
  tenantId,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockSlaPolicy2 = {
  ...mockSlaPolicy,
  id: 'sla-2',
  name: 'Premium SLA',
  isDefault: false,
  criticalResponseMinutes: 5,
  highResponseMinutes: 30,
};

const mockCategory = {
  id: 'cat-1',
  name: 'Billing',
  description: 'Billing issues',
  parentId: null,
  color: '#FF5733',
  icon: 'credit-card',
  slaPolicyId: 'sla-1',
  isActive: true,
  sortOrder: 0,
  tenantId,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockChildCategory = {
  ...mockCategory,
  id: 'cat-2',
  name: 'Refunds',
  parentId: 'cat-1',
  sortOrder: 1,
};

describe('Ticket Config Router', () => {
  let caller: ReturnType<typeof ticketConfigRouter.createCaller>;

  beforeEach(() => {
    const ctx = createTestContext();
    caller = ticketConfigRouter.createCaller(ctx);
  });

  // ── SLA Policy ──────────────────────────────────────────

  describe('slaPolicy.list', () => {
    it('returns empty array when no policies exist', async () => {
      (prismaMock.sLAPolicy.findMany as any).mockResolvedValue([]);
      const result = await caller.slaPolicy.list();
      expect(result).toEqual([]);
    });

    it('returns policies ordered by name', async () => {
      (prismaMock.sLAPolicy.findMany as any).mockResolvedValue([mockSlaPolicy, mockSlaPolicy2]);
      const result = await caller.slaPolicy.list();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Standard SLA');
    });
  });

  describe('slaPolicy.getById', () => {
    it('returns a single policy', async () => {
      (prismaMock.sLAPolicy.findFirst as any).mockResolvedValue(mockSlaPolicy);
      const result = await caller.slaPolicy.getById({ id: 'sla-1' });
      expect(result?.name).toBe('Standard SLA');
    });

    it('returns null for non-existent policy', async () => {
      (prismaMock.sLAPolicy.findFirst as any).mockResolvedValue(null);
      const result = await caller.slaPolicy.getById({ id: 'non-existent' });
      expect(result).toBeNull();
    });
  });

  describe('slaPolicy.create', () => {
    it('creates a policy with valid input', async () => {
      (prismaMock.sLAPolicy.create as any).mockResolvedValue(mockSlaPolicy);
      const result = await caller.slaPolicy.create({
        name: 'Standard SLA',
        criticalResponseMinutes: 15,
        highResponseMinutes: 60,
        mediumResponseMinutes: 240,
        lowResponseMinutes: 480,
        criticalResolutionMinutes: 120,
        highResolutionMinutes: 480,
        mediumResolutionMinutes: 1440,
        lowResolutionMinutes: 4320,
      });
      expect(result.name).toBe('Standard SLA');
      expect(prismaMock.sLAPolicy.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, name: 'Standard SLA' }),
        })
      );
    });
  });

  describe('slaPolicy.update', () => {
    it('updates policy fields', async () => {
      (prismaMock.sLAPolicy.findFirst as any).mockResolvedValue(mockSlaPolicy);
      (prismaMock.sLAPolicy.update as any).mockResolvedValue({
        ...mockSlaPolicy,
        name: 'Updated SLA',
      });

      const result = await caller.slaPolicy.update({ id: 'sla-1', name: 'Updated SLA' });
      expect(result.name).toBe('Updated SLA');
    });

    it('throws NOT_FOUND for non-existent policy', async () => {
      (prismaMock.sLAPolicy.findFirst as any).mockResolvedValue(null);
      await expect(
        caller.slaPolicy.update({ id: 'non-existent', name: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('slaPolicy.delete', () => {
    it('soft-deletes by setting isActive=false', async () => {
      (prismaMock.sLAPolicy.findFirst as any).mockResolvedValue(mockSlaPolicy);
      (prismaMock.sLAPolicy.update as any).mockResolvedValue({
        ...mockSlaPolicy,
        isActive: false,
      });

      const result = await caller.slaPolicy.delete({ id: 'sla-1' });
      expect(prismaMock.sLAPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        })
      );
      expect(result.isActive).toBe(false);
    });
  });

  describe('slaPolicy.setDefault', () => {
    it('unsets all defaults then sets target as default', async () => {
      const tx = {
        sLAPolicy: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({ ...mockSlaPolicy, isDefault: true }),
        },
      };
      (prismaMock.$transaction as any).mockImplementation(async (fn: any) => fn(tx));

      const result = await caller.slaPolicy.setDefault({ id: 'sla-1' });
      expect(tx.sLAPolicy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
          data: { isDefault: false },
        })
      );
      expect(tx.sLAPolicy.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sla-1' },
          data: { isDefault: true },
        })
      );
    });
  });

  // ── Ticket Category ─────────────────────────────────────

  describe('category.list', () => {
    it('returns categories ordered by sortOrder', async () => {
      (prismaMock.ticketCategory.findMany as any).mockResolvedValue([
        mockCategory,
        mockChildCategory,
      ]);
      const result = await caller.category.list();
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Billing');
    });
  });

  describe('category.create', () => {
    it('creates a category with valid input', async () => {
      (prismaMock.ticketCategory.create as any).mockResolvedValue(mockCategory);
      const result = await caller.category.create({
        name: 'Billing',
        color: '#FF5733',
        icon: 'credit-card',
      });
      expect(result.name).toBe('Billing');
      expect(prismaMock.ticketCategory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tenantId, name: 'Billing' }),
        })
      );
    });
  });

  describe('category.update', () => {
    it('updates category fields', async () => {
      (prismaMock.ticketCategory.findFirst as any).mockResolvedValue(mockCategory);
      (prismaMock.ticketCategory.update as any).mockResolvedValue({
        ...mockCategory,
        name: 'Updated',
      });

      const result = await caller.category.update({ id: 'cat-1', name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws NOT_FOUND for non-existent category', async () => {
      (prismaMock.ticketCategory.findFirst as any).mockResolvedValue(null);
      await expect(
        caller.category.update({ id: 'non-existent', name: 'Test' })
      ).rejects.toThrow();
    });
  });

  describe('category.delete', () => {
    it('soft-deletes when no active children', async () => {
      (prismaMock.ticketCategory.findFirst as any).mockResolvedValue(mockCategory);
      (prismaMock.ticketCategory.count as any).mockResolvedValue(0);
      (prismaMock.ticketCategory.update as any).mockResolvedValue({
        ...mockCategory,
        isActive: false,
      });

      const result = await caller.category.delete({ id: 'cat-1' });
      expect(result.isActive).toBe(false);
    });

    it('blocks deletion when active children exist', async () => {
      (prismaMock.ticketCategory.findFirst as any).mockResolvedValue(mockCategory);
      (prismaMock.ticketCategory.count as any).mockResolvedValue(2);

      await expect(caller.category.delete({ id: 'cat-1' })).rejects.toThrow(
        /active child/i
      );
    });
  });

  describe('category.reorder', () => {
    it('updates sort order for items', async () => {
      (prismaMock.ticketCategory.count as any).mockResolvedValue(2);
      (prismaMock.$transaction as any).mockResolvedValue([
        { ...mockCategory, sortOrder: 1 },
        { ...mockChildCategory, sortOrder: 0 },
      ]);

      const result = await caller.category.reorder({
        items: [
          { id: 'cat-1', sortOrder: 1 },
          { id: 'cat-2', sortOrder: 0 },
        ],
      });
      expect(result).toEqual({ success: true });
    });
  });
});
