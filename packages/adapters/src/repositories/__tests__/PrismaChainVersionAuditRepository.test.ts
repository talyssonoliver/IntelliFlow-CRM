/**
 * PrismaChainVersionAuditRepository Tests (IFC-086)
 *
 * Unit tests for the Chain Version Audit repository implementation.
 * Tests cover all 3 interface methods with state decomposition/composition.
 *
 * @module chain-version-audit-repository-tests
 * @implements IFC-086
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient } from '@intelliflow/db';
import { PrismaChainVersionAuditRepository } from '../PrismaChainVersionAuditRepository';
import { randomUUID } from 'crypto';

const AUDIT_ID_1 = randomUUID();
const AUDIT_ID_2 = randomUUID();
const VERSION_ID = randomUUID();

// Mock Prisma client
const mockPrisma = {
  chainVersionAudit: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
} as PrismaClient;

/**
 * Factory: Create mock Prisma ChainVersionAudit row
 */
const createMockAuditRow = (overrides: Record<string, unknown> = {}) => ({
  id: AUDIT_ID_1,
  versionId: VERSION_ID,
  action: 'CREATED',
  previousStatus: null,
  newStatus: 'DRAFT',
  reason: null,
  performedBy: 'user-1',
  performedAt: new Date('2026-01-15T10:00:00Z'),
  metadata: {},
  ...overrides,
});

describe('PrismaChainVersionAuditRepository', () => {
  let repository: PrismaChainVersionAuditRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaChainVersionAuditRepository(mockPrisma);
  });

  // ======================================================================
  // create Tests
  // ======================================================================
  describe('create', () => {
    it('should create audit entry with null previous state', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.create).mockResolvedValue(createMockAuditRow() as any);

      const result = await repository.create({
        versionId: VERSION_ID,
        action: 'CREATED',
        previousState: null,
        newState: { status: 'DRAFT' },
        performedBy: 'user-1',
        reason: null,
      });

      expect(result.id).toBe(AUDIT_ID_1);
      expect(result.action).toBe('CREATED');
      expect(result.previousState).toBeNull();
      expect(mockPrisma.chainVersionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          versionId: VERSION_ID,
          action: 'CREATED',
          previousStatus: null,
          performedBy: 'user-1',
        }),
      });
    });

    it('should decompose previous state into status and metadata', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.create).mockResolvedValue(
        createMockAuditRow({
          previousStatus: 'ACTIVE',
          metadata: { model: 'gpt-4' },
        }) as any
      );

      await repository.create({
        versionId: VERSION_ID,
        action: 'DEPRECATED',
        previousState: { status: 'ACTIVE', model: 'gpt-4' },
        newState: { status: 'DEPRECATED' },
        performedBy: 'user-1',
        reason: 'Replaced by newer version',
      });

      expect(mockPrisma.chainVersionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          previousStatus: 'ACTIVE',
          reason: 'Replaced by newer version',
        }),
      });
    });

    it('should decompose new state into newStatus and metadata', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.create).mockResolvedValue(
        createMockAuditRow({ newStatus: 'ACTIVE' }) as any
      );

      await repository.create({
        versionId: VERSION_ID,
        action: 'ACTIVATED',
        previousState: { status: 'DRAFT' },
        newState: { status: 'ACTIVE', rolloutPercent: 50 },
        performedBy: 'user-1',
        reason: null,
      });

      expect(mockPrisma.chainVersionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          newStatus: 'ACTIVE',
        }),
      });
    });

    it('should use action as newStatus when newState is null', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.create).mockResolvedValue(
        createMockAuditRow({ newStatus: 'ROLLED_BACK' }) as any
      );

      await repository.create({
        versionId: VERSION_ID,
        action: 'ROLLED_BACK',
        previousState: { status: 'ACTIVE' },
        newState: null,
        performedBy: 'user-1',
        reason: 'Performance regression',
      });

      expect(mockPrisma.chainVersionAudit.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          newStatus: 'ROLLED_BACK',
        }),
      });
    });
  });

  // ======================================================================
  // findByVersionId Tests
  // ======================================================================
  describe('findByVersionId', () => {
    it('should return audit entries ordered by performedAt desc', async () => {
      const rows = [
        createMockAuditRow({ id: AUDIT_ID_1, action: 'ACTIVATED' }),
        createMockAuditRow({ id: AUDIT_ID_2, action: 'CREATED' }),
      ];
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue(rows as any);

      const results = await repository.findByVersionId(VERSION_ID);

      expect(results).toHaveLength(2);
      expect(results[0].action).toBe('ACTIVATED');
      expect(mockPrisma.chainVersionAudit.findMany).toHaveBeenCalledWith({
        where: { versionId: VERSION_ID },
        orderBy: { performedAt: 'desc' },
      });
    });

    it('should return empty array when no entries exist', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([]);

      const results = await repository.findByVersionId(randomUUID());

      expect(results).toHaveLength(0);
    });

    it('should compose state from previousStatus and metadata', async () => {
      const row = createMockAuditRow({
        previousStatus: 'DRAFT',
        newStatus: 'ACTIVE',
        metadata: { rolloutPercent: 100 },
      });
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([row] as any);

      const results = await repository.findByVersionId(VERSION_ID);

      expect(results[0].previousState).toEqual({ status: 'DRAFT', rolloutPercent: 100 });
      expect(results[0].newState).toEqual({ status: 'ACTIVE', rolloutPercent: 100 });
    });

    it('should return null previousState when previousStatus is null', async () => {
      const row = createMockAuditRow({ previousStatus: null, metadata: {} });
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([row] as any);

      const results = await repository.findByVersionId(VERSION_ID);

      expect(results[0].previousState).toBeNull();
    });
  });

  // ======================================================================
  // findByAction Tests
  // ======================================================================
  describe('findByAction', () => {
    it('should filter by action type', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([]);

      await repository.findByAction('ROLLED_BACK');

      expect(mockPrisma.chainVersionAudit.findMany).toHaveBeenCalledWith({
        where: { action: 'ROLLED_BACK' },
        orderBy: { performedAt: 'desc' },
        take: undefined,
      });
    });

    it('should apply limit when provided', async () => {
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([]);

      await repository.findByAction('ACTIVATED', 10);

      expect(mockPrisma.chainVersionAudit.findMany).toHaveBeenCalledWith({
        where: { action: 'ACTIVATED' },
        orderBy: { performedAt: 'desc' },
        take: 10,
      });
    });

    it('should map results to domain records', async () => {
      const rows = [
        createMockAuditRow({ id: AUDIT_ID_1, action: 'DEPRECATED', reason: 'Outdated' }),
      ];
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue(rows as any);

      const results = await repository.findByAction('DEPRECATED');

      expect(results).toHaveLength(1);
      expect(results[0].action).toBe('DEPRECATED');
      expect(results[0].reason).toBe('Outdated');
      expect(results[0].performedBy).toBe('user-1');
    });
  });

  // ======================================================================
  // State Decomposition/Composition Tests
  // ======================================================================
  describe('state mapping', () => {
    it('should handle metadata with multiple fields', async () => {
      const row = createMockAuditRow({
        previousStatus: 'ACTIVE',
        newStatus: 'DEPRECATED',
        metadata: { model: 'gpt-4', temperature: 0.7, maxTokens: 2000 },
      });
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([row] as any);

      const results = await repository.findByVersionId(VERSION_ID);

      expect(results[0].previousState).toEqual({
        status: 'ACTIVE',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 2000,
      });
    });

    it('should handle null metadata gracefully', async () => {
      const row = createMockAuditRow({
        previousStatus: 'DRAFT',
        metadata: null,
      });
      vi.mocked(mockPrisma.chainVersionAudit.findMany).mockResolvedValue([row] as any);

      const results = await repository.findByVersionId(VERSION_ID);

      // When metadata is null, should still compose with status
      expect(results[0].previousState).toEqual({ status: 'DRAFT' });
    });
  });
});
