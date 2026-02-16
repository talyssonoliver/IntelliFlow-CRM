/**
 * AB Rollout Tests (IFC-086)
 *
 * Tests for the A/B testing and rollout strategy integration
 * within the VersionLoader chain versioning system.
 *
 * Covers:
 * - Version selection by rollout strategy (direct, rollout, experiment)
 * - Feature flag-driven percentage-based rollout via version service
 * - Fallback to default config when version service is unavailable
 * - Version loader caching with rollout-aware keys
 * - Experiment-based variant selection pass-through
 * - Preloading multiple chain types
 *
 * @module ab-rollout-tests
 * @implements IFC-086
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VersionLoader, createVersionLoader, createStandaloneVersionLoader } from '../version-loader';
import type { LoadedVersion, ExecutionContext } from '../version-loader';
import type { ChainType } from '@intelliflow/domain';

const TENANT_ID = 'tenant-ab-test';
const USER_ID = 'user-ab-1';
const SESSION_ID = 'session-ab-1';

/**
 * Create a mock version service that simulates ChainVersionService.getActiveVersion
 */
function createMockVersionService(
  response?: {
    version: Record<string, unknown>;
    selectedBy: 'direct' | 'rollout' | 'experiment';
  },
  shouldThrow?: boolean
) {
  return {
    getActiveVersion: vi.fn().mockImplementation(async () => {
      if (shouldThrow) {
        throw new Error('Version service unavailable');
      }
      return response ?? {
        version: {
          id: 'v-active-1',
          chainType: 'SCORING',
          status: 'ACTIVE',
          prompt: 'Score this lead.',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'direct',
      };
    }),
  };
}

const defaultContext: ExecutionContext = {
  tenantId: TENANT_ID,
  userId: USER_ID,
  sessionId: SESSION_ID,
};

describe('AB Rollout Strategy (IFC-086)', () => {
  // ======================================================================
  // IMMEDIATE / Direct Rollout
  // ======================================================================
  describe('IMMEDIATE rollout (selectedBy: direct)', () => {
    it('should return version from service with direct selection', async () => {
      const mockService = createMockVersionService({
        version: {
          id: 'v-scoring-1',
          chainType: 'SCORING',
          status: 'ACTIVE',
          prompt: 'Score leads accurately.',
          model: 'gpt-4o',
          temperature: 0.5,
          maxTokens: 1500,
          additionalParams: null,
        },
        selectedBy: 'direct',
      });

      const loader = new VersionLoader(mockService, { enableCache: false });
      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.versionId).toBe('v-scoring-1');
      expect(result.selectedBy).toBe('direct');
      expect(result.config.model).toBe('gpt-4o');
      expect(result.config.temperature).toBe(0.5);
    });

    it('should pass execution context to version service', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { enableCache: false });

      await loader.loadVersionedChain('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
        leadId: 'lead-123',
        experimentId: 'exp-001',
      });

      expect(mockService.getActiveVersion).toHaveBeenCalledWith('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
        leadId: 'lead-123',
        experimentId: 'exp-001',
      });
    });
  });

  // ======================================================================
  // PERCENTAGE Rollout
  // ======================================================================
  describe('PERCENTAGE rollout (selectedBy: rollout)', () => {
    it('should return version with rollout selection when in percentage group', async () => {
      const mockService = createMockVersionService({
        version: {
          id: 'v-scoring-new',
          chainType: 'SCORING',
          status: 'ACTIVE',
          prompt: 'New scoring prompt.',
          model: 'gpt-4o',
          temperature: 0.5,
          maxTokens: 1500,
          additionalParams: { topP: 0.95 },
        },
        selectedBy: 'rollout',
      });

      const loader = new VersionLoader(mockService, { enableCache: false });
      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.selectedBy).toBe('rollout');
      expect(result.config.additionalParams).toEqual({ topP: 0.95 });
    });

    it('should return deprecated fallback version when not in rollout group', async () => {
      const mockService = createMockVersionService({
        version: {
          id: 'v-scoring-old',
          chainType: 'SCORING',
          status: 'DEPRECATED',
          prompt: 'Old scoring prompt.',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 2000,
          additionalParams: null,
        },
        selectedBy: 'rollout',
      });

      const loader = new VersionLoader(mockService, { enableCache: false });
      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.selectedBy).toBe('rollout');
      expect(result.status).toBe('DEPRECATED');
      expect(result.versionId).toBe('v-scoring-old');
    });
  });

  // ======================================================================
  // AB_TEST Rollout
  // ======================================================================
  describe('AB_TEST rollout (selectedBy: experiment)', () => {
    it('should return version with experiment selection', async () => {
      const mockService = createMockVersionService({
        version: {
          id: 'v-scoring-experiment',
          chainType: 'SCORING',
          status: 'ACTIVE',
          prompt: 'Experimental scoring prompt.',
          model: 'gpt-4o',
          temperature: 0.3,
          maxTokens: 2500,
          additionalParams: null,
        },
        selectedBy: 'experiment',
      });

      const loader = new VersionLoader(mockService, { enableCache: false });
      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.selectedBy).toBe('experiment');
      expect(result.versionId).toBe('v-scoring-experiment');
      expect(result.config.temperature).toBe(0.3);
    });

    it('should pass experimentId from context to version service', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { enableCache: false });

      await loader.loadVersionedChain('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        experimentId: 'exp-scoring-v2',
      });

      expect(mockService.getActiveVersion).toHaveBeenCalledWith(
        'SCORING',
        expect.objectContaining({ experimentId: 'exp-scoring-v2' })
      );
    });
  });

  // ======================================================================
  // Fallback to Default Config
  // ======================================================================
  describe('fallback behavior', () => {
    it('should use default config when no version service is provided', async () => {
      const loader = new VersionLoader(null);
      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.versionId).toBe('fallback-scoring');
      expect(result.selectedBy).toBe('direct');
      expect(result.status).toBe('ACTIVE');
      expect(result.config.model).toBe('gpt-4-turbo-preview');
    });

    it('should fall back to default config when version service throws', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mockService = createMockVersionService(undefined, true);
      const loader = new VersionLoader(mockService, { enableCache: false });

      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.versionId).toBe('fallback-scoring');
      expect(result.selectedBy).toBe('direct');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[VersionLoader]'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should provide default configs for all chain types', async () => {
      const loader = createStandaloneVersionLoader();
      const chainTypes: ChainType[] = ['SCORING', 'QUALIFICATION', 'EMAIL_WRITER', 'FOLLOWUP'];

      for (const chainType of chainTypes) {
        const result = await loader.loadVersionedChain(chainType, defaultContext);
        expect(result.versionId).toBe(`fallback-${chainType.toLowerCase()}`);
        expect(result.config.prompt.length).toBeGreaterThan(0);
        expect(result.config.model).toBeTruthy();
      }
    });

    it('should use custom fallback configs when provided', async () => {
      const loader = createStandaloneVersionLoader({
        SCORING: {
          prompt: 'Custom scoring prompt.',
          model: 'custom-model',
          temperature: 0.1,
          maxTokens: 500,
        },
      });

      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.config.prompt).toBe('Custom scoring prompt.');
      expect(result.config.model).toBe('custom-model');
    });
  });

  // ======================================================================
  // Caching Behavior
  // ======================================================================
  describe('caching', () => {
    it('should cache version and return from cache on second call', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { cacheTtlMs: 60000 });

      await loader.loadVersionedChain('SCORING', defaultContext);
      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(1);
    });

    it('should not cache when cache is disabled', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { enableCache: false });

      await loader.loadVersionedChain('SCORING', defaultContext);
      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });

    it('should evict expired cache entries', async () => {
      const mockService = createMockVersionService();
      // Very short TTL
      const loader = new VersionLoader(mockService, { cacheTtlMs: 1 });

      await loader.loadVersionedChain('SCORING', defaultContext);

      // Wait for cache to expire
      await new Promise((r) => setTimeout(r, 10));

      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });

    it('should invalidate cache for specific chain type', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { cacheTtlMs: 60000 });

      await loader.loadVersionedChain('SCORING', defaultContext);
      loader.invalidateCache('SCORING');
      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });

    it('should invalidate all cache entries', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { cacheTtlMs: 60000 });

      await loader.loadVersionedChain('SCORING', defaultContext);
      loader.invalidateCache();
      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });

    it('should cache per tenant', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { cacheTtlMs: 60000 });

      await loader.loadVersionedChain('SCORING', { tenantId: 'tenant-a' });
      await loader.loadVersionedChain('SCORING', { tenantId: 'tenant-b' });

      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });
  });

  // ======================================================================
  // getChainConfig
  // ======================================================================
  describe('getChainConfig', () => {
    it('should return only config without version metadata', async () => {
      const mockService = createMockVersionService({
        version: {
          id: 'v-1',
          chainType: 'SCORING',
          status: 'ACTIVE',
          prompt: 'Score leads.',
          model: 'gpt-4o',
          temperature: 0.5,
          maxTokens: 1000,
          additionalParams: null,
        },
        selectedBy: 'direct',
      });
      const loader = new VersionLoader(mockService, { enableCache: false });

      const config = await loader.getChainConfig('SCORING', defaultContext);

      expect(config).toEqual({
        prompt: 'Score leads.',
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 1000,
        additionalParams: undefined,
      });
    });
  });

  // ======================================================================
  // Preloading
  // ======================================================================
  describe('preloadVersions', () => {
    it('should preload multiple chain types in parallel', async () => {
      const mockService = {
        getActiveVersion: vi.fn().mockImplementation(async (chainType: string) => ({
          version: {
            id: `v-${chainType}`,
            chainType,
            status: 'ACTIVE',
            prompt: `Prompt for ${chainType}`,
            model: 'gpt-4-turbo-preview',
            temperature: 0.7,
            maxTokens: 2000,
            additionalParams: null,
          },
          selectedBy: 'direct',
        })),
      };

      const loader = new VersionLoader(mockService, { enableCache: false });
      const results = await loader.preloadVersions(
        ['SCORING', 'QUALIFICATION'] as ChainType[],
        defaultContext
      );

      expect(results.size).toBe(2);
      expect(results.get('SCORING' as ChainType)!.versionId).toBe('v-SCORING');
      expect(results.get('QUALIFICATION' as ChainType)!.versionId).toBe('v-QUALIFICATION');
      expect(mockService.getActiveVersion).toHaveBeenCalledTimes(2);
    });
  });

  // ======================================================================
  // Cache Statistics
  // ======================================================================
  describe('getCacheStats', () => {
    it('should report cache size', async () => {
      const mockService = createMockVersionService();
      const loader = new VersionLoader(mockService, { cacheTtlMs: 60000 });

      expect(loader.getCacheStats().size).toBe(0);

      await loader.loadVersionedChain('SCORING', defaultContext);

      expect(loader.getCacheStats().size).toBe(1);
    });
  });

  // ======================================================================
  // Factory Functions
  // ======================================================================
  describe('factory functions', () => {
    it('createVersionLoader should create loader with service', async () => {
      const mockService = createMockVersionService();
      const loader = createVersionLoader(mockService);

      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.versionId).toBe('v-active-1');
    });

    it('createStandaloneVersionLoader should create loader without service', async () => {
      const loader = createStandaloneVersionLoader();

      const result = await loader.loadVersionedChain('SCORING', defaultContext);

      expect(result.versionId).toBe('fallback-scoring');
    });
  });
});
