/**
 * Version Loader Tests - IFC-086
 *
 * Tests for the chain version loading and caching system
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  VersionLoader,
  createVersionLoader,
  createStandaloneVersionLoader,
  type ExecutionContext,
  type LoadedVersion,
} from '../version-loader';
import type { ChainVersionStatus } from '@intelliflow/domain';

// Mock version service
const createMockVersionService = () => ({
  getActiveVersion: vi.fn(),
});

describe('VersionLoader', () => {
  let mockVersionService: ReturnType<typeof createMockVersionService>;
  let loader: VersionLoader;

  beforeEach(() => {
    mockVersionService = createMockVersionService();
    loader = new VersionLoader(mockVersionService);
  });

  describe('loadVersionedChain', () => {
    it('should load version from service', async () => {
      const mockVersion = {
        version: {
          id: 'v1-test',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Test prompt',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = {
        tenantId: 'tenant-123',
        userId: 'user-456',
      };

      const result = await loader.loadVersionedChain('SCORING', context);

      expect(result.versionId).toBe('v1-test');
      expect(result.config.prompt).toBe('Test prompt');
      expect(result.config.model).toBe('gpt-4-turbo-preview');
      expect(result.selectedBy).toBe('direct');
      expect(mockVersionService.getActiveVersion).toHaveBeenCalledWith('SCORING', {
        tenantId: 'tenant-123',
        userId: 'user-456',
        sessionId: undefined,
        leadId: undefined,
        experimentId: undefined,
      });
    });

    it('should return cached version on subsequent calls', async () => {
      const mockVersion = {
        version: {
          id: 'v1-cached',
          chainType: 'QUALIFICATION' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Cached prompt',
          model: 'gpt-4',
          temperature: 0.5,
          maxTokens: 1500,
          additionalParams: null,
        },
        selectedBy: 'rollout' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };

      // First call
      await loader.loadVersionedChain('QUALIFICATION', context);
      // Second call
      await loader.loadVersionedChain('QUALIFICATION', context);

      expect(mockVersionService.getActiveVersion).toHaveBeenCalledTimes(1);
    });

    it('should fall back to default config when service fails', async () => {
      mockVersionService.getActiveVersion.mockRejectedValue(new Error('Service error'));

      const context: ExecutionContext = { tenantId: 'tenant-123' };
      const result = await loader.loadVersionedChain('SCORING', context);

      expect(result.versionId).toBe('fallback-scoring');
      expect(result.selectedBy).toBe('direct');
      expect(result.status).toBe('ACTIVE');
      expect(result.config.prompt).toContain('B2B lead scoring');
    });

    it('should fall back when no service is provided', async () => {
      const standaloneLoader = new VersionLoader(null);
      const context: ExecutionContext = { tenantId: 'tenant-123' };

      const result = await standaloneLoader.loadVersionedChain('EMAIL_WRITER', context);

      expect(result.versionId).toBe('fallback-email_writer');
      expect(result.config.temperature).toBe(0.8);
      expect(result.config.maxTokens).toBe(1500);
    });
  });

  describe('getChainConfig', () => {
    it('should return only config without metadata', async () => {
      const mockVersion = {
        version: {
          id: 'v1-config',
          chainType: 'FOLLOWUP' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Follow-up prompt',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'experiment' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };
      const config = await loader.getChainConfig('FOLLOWUP', context);

      expect(config.prompt).toBe('Follow-up prompt');
      expect(config.model).toBe('gpt-4-turbo-preview');
      expect((config as any).versionId).toBeUndefined();
      expect((config as any).selectedBy).toBeUndefined();
    });
  });

  describe('preloadVersions', () => {
    it('should preload multiple chain types', async () => {
      const mockScoringVersion = {
        version: {
          id: 'v1-scoring',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Scoring prompt',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      const mockQualVersion = {
        version: {
          id: 'v1-qual',
          chainType: 'QUALIFICATION' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Qual prompt',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      mockVersionService.getActiveVersion
        .mockResolvedValueOnce(mockScoringVersion)
        .mockResolvedValueOnce(mockQualVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };
      const results = await loader.preloadVersions(['SCORING', 'QUALIFICATION'], context);

      expect(results.size).toBe(2);
      expect(results.get('SCORING')?.versionId).toBe('v1-scoring');
      expect(results.get('QUALIFICATION')?.versionId).toBe('v1-qual');
    });
  });

  describe('invalidateCache', () => {
    it('should invalidate specific chain type', async () => {
      const mockVersion = {
        version: {
          id: 'v1-test',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Test',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };

      await loader.loadVersionedChain('SCORING', context);
      expect(mockVersionService.getActiveVersion).toHaveBeenCalledTimes(1);

      loader.invalidateCache('SCORING');
      await loader.loadVersionedChain('SCORING', context);

      expect(mockVersionService.getActiveVersion).toHaveBeenCalledTimes(2);
    });

    it('should invalidate all cache when no type specified', async () => {
      const mockVersion = {
        version: {
          id: 'v1-test',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Test',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };

      await loader.loadVersionedChain('SCORING', context);
      await loader.loadVersionedChain('QUALIFICATION', context);

      loader.invalidateCache();
      const stats = loader.getCacheStats();

      expect(stats.size).toBe(0);
    });
  });

  describe('getCacheStats', () => {
    it('should return correct cache size', async () => {
      const mockVersion = {
        version: {
          id: 'v1-test',
          chainType: 'SCORING' as const,
          status: 'ACTIVE' as ChainVersionStatus,
          prompt: 'Test',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct' as const,
      };

      mockVersionService.getActiveVersion.mockResolvedValue(mockVersion);

      const context: ExecutionContext = { tenantId: 'tenant-123' };

      await loader.loadVersionedChain('SCORING', context);

      const stats = loader.getCacheStats();
      expect(stats.size).toBe(1);
    });
  });
});

describe('createVersionLoader', () => {
  it('should create loader with service', () => {
    const mockService = createMockVersionService();
    const loader = createVersionLoader(mockService);

    expect(loader).toBeInstanceOf(VersionLoader);
  });

  it('should create loader with custom config', () => {
    const mockService = createMockVersionService();
    const loader = createVersionLoader(mockService, {
      cacheTtlMs: 10000,
      enableCache: false,
    });

    expect(loader).toBeInstanceOf(VersionLoader);
  });
});

describe('createStandaloneVersionLoader', () => {
  it('should create loader without service', () => {
    const loader = createStandaloneVersionLoader();
    expect(loader).toBeInstanceOf(VersionLoader);
  });

  it('should use custom configs when provided', async () => {
    const loader = createStandaloneVersionLoader({
      SCORING: {
        prompt: 'Custom scoring prompt',
        model: 'gpt-3.5-turbo',
        temperature: 0.5,
        maxTokens: 1000,
      },
    });

    const context: ExecutionContext = { tenantId: 'tenant-123' };
    const result = await loader.loadVersionedChain('SCORING', context);

    expect(result.config.prompt).toBe('Custom scoring prompt');
    expect(result.config.model).toBe('gpt-3.5-turbo');
  });
});
