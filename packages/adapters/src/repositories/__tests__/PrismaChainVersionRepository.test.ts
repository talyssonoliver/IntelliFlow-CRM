/**
 * PrismaChainVersionRepository Tests (IFC-086)
 *
 * Unit tests for the Chain Version repository implementation.
 * Tests cover all 8 interface methods with tenant isolation,
 * version auto-generation, and status lifecycle management.
 *
 * @module chain-version-repository-tests
 * @implements IFC-086
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PrismaClient, Prisma } from '@intelliflow/db';
import { PrismaChainVersionRepository } from '../PrismaChainVersionRepository';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const VERSION_ID_1 = randomUUID();
const VERSION_ID_2 = randomUUID();
const TENANT_ID = 'tenant-chain-123';
const OTHER_TENANT_ID = 'tenant-other-456';

// Mock Prisma client
const mockPrisma = {
  chainVersion: {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as PrismaClient;

/**
 * Factory: Create mock Prisma ChainVersion row
 */
const createMockRow = (overrides: Record<string, unknown> = {}) => ({
  id: VERSION_ID_1,
  tenantId: TENANT_ID,
  chainType: 'SCORING',
  version: '1.0.0',
  prompt: 'You are a lead scoring assistant.',
  promptHash: createHash('sha256').update('You are a lead scoring assistant.').digest('hex'),
  model: 'gpt-4-turbo-preview',
  temperature: 0.7,
  maxTokens: 2000,
  config: null,
  description: 'Initial scoring prompt',
  parentVersionId: null,
  status: 'DRAFT',
  rolloutStrategy: 'IMMEDIATE',
  rolloutPercent: 100,
  experimentId: null,
  createdBy: 'user-1',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
  activatedAt: null,
  deprecatedAt: null,
  archivedAt: null,
  ...overrides,
});

describe('PrismaChainVersionRepository', () => {
  let repository: PrismaChainVersionRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = new PrismaChainVersionRepository(mockPrisma);
  });

  // ======================================================================
  // create Tests
  // ======================================================================
  describe('create', () => {
    it('should create a new chain version with auto-generated version 1.0.0', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.chainVersion.create).mockResolvedValue(createMockRow() as any);

      const result = await repository.create({
        chainType: 'SCORING',
        prompt: 'You are a lead scoring assistant.',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        additionalParams: null,
        description: 'Initial scoring prompt',
        parentVersionId: null,
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
        experimentId: null,
        createdBy: 'user-1',
        tenantId: TENANT_ID,
      });

      expect(result.id).toBe(VERSION_ID_1);
      expect(result.chainType).toBe('SCORING');
      expect(result.status).toBe('DRAFT');

      expect(mockPrisma.chainVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: '1.0.0',
          status: 'DRAFT',
          tenantId: TENANT_ID,
        }),
      });
    });

    it('should auto-increment version when existing versions exist', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([
        { version: '1.0.2' } as any,
      ]);
      vi.mocked(mockPrisma.chainVersion.create).mockResolvedValue(
        createMockRow({ version: '1.0.3' }) as any
      );

      await repository.create({
        chainType: 'SCORING',
        prompt: 'Updated prompt',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        additionalParams: null,
        description: null,
        parentVersionId: null,
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
        experimentId: null,
        createdBy: 'user-1',
        tenantId: TENANT_ID,
      });

      expect(mockPrisma.chainVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version: '1.0.3',
        }),
      });
    });

    it('should compute SHA-256 prompt hash', async () => {
      const prompt = 'Test prompt for hashing';
      const expectedHash = createHash('sha256').update(prompt).digest('hex');

      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.chainVersion.create).mockResolvedValue(
        createMockRow({ prompt, promptHash: expectedHash }) as any
      );

      await repository.create({
        chainType: 'SCORING',
        prompt,
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        additionalParams: null,
        description: null,
        parentVersionId: null,
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
        experimentId: null,
        createdBy: 'user-1',
        tenantId: TENANT_ID,
      });

      expect(mockPrisma.chainVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          promptHash: expectedHash,
        }),
      });
    });

    it('should store additionalParams as Prisma JSON', async () => {
      const params = { topP: 0.9, frequencyPenalty: 0.2 };
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.chainVersion.create).mockResolvedValue(
        createMockRow({ config: params }) as any
      );

      await repository.create({
        chainType: 'SCORING',
        prompt: 'test',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        additionalParams: params,
        description: null,
        parentVersionId: null,
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
        experimentId: null,
        createdBy: 'user-1',
        tenantId: TENANT_ID,
      });

      expect(mockPrisma.chainVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          config: params,
        }),
      });
    });

    it('should store null additionalParams as Prisma.JsonNull', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);
      vi.mocked(mockPrisma.chainVersion.create).mockResolvedValue(createMockRow() as any);

      await repository.create({
        chainType: 'SCORING',
        prompt: 'test',
        model: 'gpt-4-turbo-preview',
        temperature: 0.7,
        maxTokens: 2000,
        additionalParams: null,
        description: null,
        parentVersionId: null,
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
        experimentId: null,
        createdBy: 'user-1',
        tenantId: TENANT_ID,
      });

      expect(mockPrisma.chainVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          config: Prisma.JsonNull,
        }),
      });
    });
  });

  // ======================================================================
  // findById Tests
  // ======================================================================
  describe('findById', () => {
    it('should return record when found', async () => {
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(createMockRow() as any);

      const result = await repository.findById(VERSION_ID_1);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(VERSION_ID_1);
      expect(result!.chainType).toBe('SCORING');
      expect(mockPrisma.chainVersion.findUnique).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
      });
    });

    it('should return null when not found', async () => {
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(null);

      const result = await repository.findById(randomUUID());

      expect(result).toBeNull();
    });

    it('should map all fields correctly', async () => {
      const row = createMockRow({
        config: { topP: 0.9 },
        description: 'Test description',
        parentVersionId: 'parent-123',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
        experimentId: 'exp-abc',
      });
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(row as any);

      const result = await repository.findById(VERSION_ID_1);

      expect(result!.additionalParams).toEqual({ topP: 0.9 });
      expect(result!.description).toBe('Test description');
      expect(result!.parentVersionId).toBe('parent-123');
      expect(result!.rolloutStrategy).toBe('PERCENTAGE');
      expect(result!.rolloutPercent).toBe(50);
      expect(result!.experimentId).toBe('exp-abc');
      expect(result!.tenantId).toBe(TENANT_ID);
    });
  });

  // ======================================================================
  // findByTenantId Tests
  // ======================================================================
  describe('findByTenantId', () => {
    it('should return all versions for tenant', async () => {
      const rows = [
        createMockRow({ id: VERSION_ID_1 }),
        createMockRow({ id: VERSION_ID_2, chainType: 'QUALIFICATION' }),
      ];
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue(rows as any);

      const results = await repository.findByTenantId(TENANT_ID);

      expect(results).toHaveLength(2);
      expect(mockPrisma.chainVersion.findMany).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no versions exist', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);

      const results = await repository.findByTenantId(OTHER_TENANT_ID);

      expect(results).toHaveLength(0);
    });
  });

  // ======================================================================
  // findByChainType Tests
  // ======================================================================
  describe('findByChainType', () => {
    it('should filter by chain type and tenant', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([createMockRow()] as any);

      await repository.findByChainType('SCORING', TENANT_ID);

      expect(mockPrisma.chainVersion.findMany).toHaveBeenCalledWith({
        where: { chainType: 'SCORING', tenantId: TENANT_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ======================================================================
  // findActive Tests
  // ======================================================================
  describe('findActive', () => {
    it('should find active version for chain type', async () => {
      const activeRow = createMockRow({ status: 'ACTIVE' });
      vi.mocked(mockPrisma.chainVersion.findFirst).mockResolvedValue(activeRow as any);

      const result = await repository.findActive('SCORING', TENANT_ID);

      expect(result).not.toBeNull();
      expect(result!.status).toBe('ACTIVE');
      expect(mockPrisma.chainVersion.findFirst).toHaveBeenCalledWith({
        where: { chainType: 'SCORING', tenantId: TENANT_ID, status: 'ACTIVE' },
      });
    });

    it('should return null when no active version exists', async () => {
      vi.mocked(mockPrisma.chainVersion.findFirst).mockResolvedValue(null);

      const result = await repository.findActive('SCORING', TENANT_ID);

      expect(result).toBeNull();
    });
  });

  // ======================================================================
  // findByStatus Tests
  // ======================================================================
  describe('findByStatus', () => {
    it('should filter by status, chain type, and tenant', async () => {
      vi.mocked(mockPrisma.chainVersion.findMany).mockResolvedValue([]);

      await repository.findByStatus('SCORING', 'DEPRECATED', TENANT_ID);

      expect(mockPrisma.chainVersion.findMany).toHaveBeenCalledWith({
        where: { chainType: 'SCORING', status: 'DEPRECATED', tenantId: TENANT_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ======================================================================
  // update Tests
  // ======================================================================
  describe('update', () => {
    it('should update prompt and recompute hash', async () => {
      const newPrompt = 'Updated scoring prompt';
      const expectedHash = createHash('sha256').update(newPrompt).digest('hex');

      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ prompt: newPrompt, promptHash: expectedHash }) as any
      );

      const result = await repository.update(VERSION_ID_1, { prompt: newPrompt });

      expect(result.prompt).toBe(newPrompt);
      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          prompt: newPrompt,
          promptHash: expectedHash,
        }),
      });
    });

    it('should set activatedAt when status changes to ACTIVE', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ status: 'ACTIVE', activatedAt: new Date() }) as any
      );

      await repository.update(VERSION_ID_1, { status: 'ACTIVE' });

      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          status: 'ACTIVE',
          activatedAt: expect.any(Date),
        }),
      });
    });

    it('should set deprecatedAt when status changes to DEPRECATED', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ status: 'DEPRECATED', deprecatedAt: new Date() }) as any
      );

      await repository.update(VERSION_ID_1, { status: 'DEPRECATED' });

      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          status: 'DEPRECATED',
          deprecatedAt: expect.any(Date),
        }),
      });
    });

    it('should set archivedAt when status changes to ARCHIVED', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ status: 'ARCHIVED', archivedAt: new Date() }) as any
      );

      await repository.update(VERSION_ID_1, { status: 'ARCHIVED' });

      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          status: 'ARCHIVED',
          archivedAt: expect.any(Date),
        }),
      });
    });

    it('should update model and temperature fields', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ model: 'gpt-4o', temperature: 0.5 }) as any
      );

      await repository.update(VERSION_ID_1, { model: 'gpt-4o', temperature: 0.5 });

      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          model: 'gpt-4o',
          temperature: 0.5,
        }),
      });
    });

    it('should update rollout strategy and percent', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(
        createMockRow({ rolloutStrategy: 'PERCENTAGE', rolloutPercent: 25 }) as any
      );

      await repository.update(VERSION_ID_1, {
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 25,
      });

      expect(mockPrisma.chainVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
        data: expect.objectContaining({
          rolloutStrategy: 'PERCENTAGE',
          rolloutPercent: 25,
        }),
      });
    });

    it('should not include unchanged fields in update data', async () => {
      vi.mocked(mockPrisma.chainVersion.update).mockResolvedValue(createMockRow() as any);

      await repository.update(VERSION_ID_1, { description: 'New description' });

      const callData = vi.mocked(mockPrisma.chainVersion.update).mock.calls[0][0].data as Record<string, unknown>;
      expect(callData).toHaveProperty('description', 'New description');
      expect(callData).not.toHaveProperty('prompt');
      expect(callData).not.toHaveProperty('model');
    });
  });

  // ======================================================================
  // delete Tests
  // ======================================================================
  describe('delete', () => {
    it('should delete version by id', async () => {
      vi.mocked(mockPrisma.chainVersion.delete).mockResolvedValue(createMockRow() as any);

      await repository.delete(VERSION_ID_1);

      expect(mockPrisma.chainVersion.delete).toHaveBeenCalledWith({
        where: { id: VERSION_ID_1 },
      });
    });
  });

  // ======================================================================
  // toRecord Mapping Tests
  // ======================================================================
  describe('field mapping', () => {
    it('should map config to additionalParams', async () => {
      const config = { topP: 0.9, stop: ['\n'] };
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(
        createMockRow({ config }) as any
      );

      const result = await repository.findById(VERSION_ID_1);

      expect(result!.additionalParams).toEqual(config);
    });

    it('should map null config to null additionalParams', async () => {
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(
        createMockRow({ config: null }) as any
      );

      const result = await repository.findById(VERSION_ID_1);

      expect(result!.additionalParams).toBeNull();
    });

    it('should default maxTokens to 0 when null', async () => {
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(
        createMockRow({ maxTokens: null }) as any
      );

      const result = await repository.findById(VERSION_ID_1);

      expect(result!.maxTokens).toBe(0);
    });

    it('should preserve Date types for createdAt', async () => {
      const date = new Date('2026-01-15T10:00:00Z');
      vi.mocked(mockPrisma.chainVersion.findUnique).mockResolvedValue(
        createMockRow({ createdAt: date }) as any
      );

      const result = await repository.findById(VERSION_ID_1);

      expect(result!.createdAt).toEqual(date);
    });
  });
});
