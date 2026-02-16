/**
 * AB Rollout Tests (IFC-086)
 *
 * Tests for A/B testing and rollout strategy integration
 * within the ChainVersionService.
 *
 * Covers:
 * - Version selection by rollout strategy (IMMEDIATE, PERCENTAGE, AB_TEST)
 * - Feature flag integration for percentage-based rollout
 * - Fallback to deprecated version when not in rollout group
 * - Experiment-based variant selection
 * - Null feature flag provider handling
 *
 * @module ab-rollout-tests
 * @implements IFC-086
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChainVersionService,
  type ChainVersionRecord,
  type ChainVersionRepositoryPort,
  type ChainVersionAuditRepositoryPort,
  type FeatureFlagProviderPort,
} from '../ChainVersionService';
import type { EventBusPort } from '../../../../ports/external';
import { randomUUID } from 'crypto';

const TENANT_ID = 'tenant-ab-test';
const USER_ID = 'user-ab-1';
const SESSION_ID = 'session-ab-1';

/**
 * Factory: Create a mock ChainVersionRecord
 */
function createMockVersion(overrides: Partial<ChainVersionRecord> = {}): ChainVersionRecord {
  return {
    id: randomUUID(),
    chainType: 'SCORING',
    status: 'ACTIVE',
    prompt: 'Score this lead based on engagement signals.',
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
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    tenantId: TENANT_ID,
    ...overrides,
  };
}

/**
 * Create mock repositories and services
 */
function createMocks() {
  const versionRepo: Record<string, any> = {
    create: vi.fn(),
    findById: vi.fn(),
    findByTenantId: vi.fn(),
    findByChainType: vi.fn(),
    findActive: vi.fn(),
    findByStatus: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const auditRepo: Record<string, any> = {
    create: vi.fn(),
    findByVersionId: vi.fn(),
    findByAction: vi.fn(),
  };

  const featureFlags: Record<string, any> = {
    isEnabled: vi.fn(),
    getVariant: vi.fn(),
    getRolloutPercent: vi.fn(),
  };

  const eventBus: Record<string, any> = {
    publish: vi.fn(),
    publishAll: vi.fn(),
    subscribe: vi.fn(),
  };

  const service = new ChainVersionService(
    versionRepo as ChainVersionRepositoryPort,
    auditRepo as ChainVersionAuditRepositoryPort,
    featureFlags as FeatureFlagProviderPort,
    eventBus as EventBusPort
  );

  return { versionRepo, auditRepo, featureFlags, eventBus, service };
}

describe('AB Rollout Strategy (IFC-086)', () => {
  let mocks: ReturnType<typeof createMocks>;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks = createMocks();
  });

  // ======================================================================
  // IMMEDIATE Rollout Strategy
  // ======================================================================
  describe('IMMEDIATE rollout strategy', () => {
    it('should return active version directly', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
      });

      expect(result.version.id).toBe(activeVersion.id);
      expect(result.selectedBy).toBe('direct');
    });

    it('should not consult feature flags for IMMEDIATE strategy', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'IMMEDIATE',
        rolloutPercent: 100,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(mocks.featureFlags.isEnabled).not.toHaveBeenCalled();
    });

    it('should throw when no active version exists', async () => {
      mocks.versionRepo.findActive.mockResolvedValue(null);

      await expect(
        mocks.service.getActiveVersion('SCORING', { tenantId: TENANT_ID })
      ).rejects.toThrow('No active version found for chain type: SCORING');
    });
  });

  // ======================================================================
  // PERCENTAGE Rollout Strategy
  // ======================================================================
  describe('PERCENTAGE rollout strategy', () => {
    it('should use feature flags for percentage-based rollout', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(true);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
      });

      expect(result.selectedBy).toBe('rollout');
      expect(mocks.featureFlags.isEnabled).toHaveBeenCalledWith(
        expect.stringContaining('chain_version_SCORING_'),
        expect.objectContaining({ userId: USER_ID, sessionId: SESSION_ID })
      );
    });

    it('should fall back to deprecated version when not in rollout group', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 10,
      });
      const deprecatedVersion = createMockVersion({
        id: randomUUID(),
        status: 'DEPRECATED',
        createdAt: new Date('2026-01-10T10:00:00Z'),
      });

      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(false);
      mocks.versionRepo.findByStatus.mockResolvedValue([deprecatedVersion]);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.version.id).toBe(deprecatedVersion.id);
      expect(result.selectedBy).toBe('rollout');
    });

    it('should return active version when user is in rollout group', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(true);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.version.id).toBe(activeVersion.id);
      expect(result.selectedBy).toBe('rollout');
    });

    it('should return active version when no deprecated fallback exists', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 10,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(false);
      mocks.versionRepo.findByStatus.mockResolvedValue([]);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.version.id).toBe(activeVersion.id);
      expect(result.selectedBy).toBe('rollout');
    });

    it('should skip feature flag check when rollout is 100%', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 100,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.selectedBy).toBe('direct');
      expect(mocks.featureFlags.isEnabled).not.toHaveBeenCalled();
    });

    it('should pass leadId context to feature flags', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(true);

      await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
        sessionId: SESSION_ID,
        leadId: 'lead-123',
      });

      expect(mocks.featureFlags.isEnabled).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ leadId: 'lead-123' })
      );
    });
  });

  // ======================================================================
  // AB_TEST Rollout Strategy
  // ======================================================================
  describe('AB_TEST rollout strategy', () => {
    it('should return experiment selection mode', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'AB_TEST',
        experimentId: 'exp-scoring-v2',
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.selectedBy).toBe('experiment');
      expect(result.version.experimentId).toBe('exp-scoring-v2');
    });

    it('should not consult feature flags for AB_TEST strategy', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'AB_TEST',
        experimentId: 'exp-123',
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(mocks.featureFlags.isEnabled).not.toHaveBeenCalled();
    });

    it('should treat AB_TEST without experimentId as direct selection', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'AB_TEST',
        experimentId: null,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.selectedBy).toBe('direct');
    });
  });

  // ======================================================================
  // Null Feature Flag Provider
  // ======================================================================
  describe('null feature flag provider', () => {
    it('should return active version directly when no feature flags', async () => {
      const noFfService = new ChainVersionService(
        mocks.versionRepo as ChainVersionRepositoryPort,
        mocks.auditRepo as ChainVersionAuditRepositoryPort,
        null,
        mocks.eventBus as EventBusPort
      );

      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await noFfService.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.selectedBy).toBe('direct');
    });
  });

  // ======================================================================
  // Chain Config Retrieval
  // ======================================================================
  describe('getChainConfig', () => {
    it('should return chain config from active version', async () => {
      const activeVersion = createMockVersion({
        prompt: 'Score leads accurately.',
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 1500,
        additionalParams: { topP: 0.95 },
      });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const config = await mocks.service.getChainConfig('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(config.prompt).toBe('Score leads accurately.');
      expect(config.model).toBe('gpt-4o');
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(1500);
      expect(config.additionalParams).toEqual({ topP: 0.95 });
    });

    it('should omit undefined additionalParams', async () => {
      const activeVersion = createMockVersion({ additionalParams: null });
      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);

      const config = await mocks.service.getChainConfig('SCORING', {
        tenantId: TENANT_ID,
      });

      expect(config.additionalParams).toBeUndefined();
    });
  });

  // ======================================================================
  // Multiple Deprecated Version Fallback
  // ======================================================================
  describe('deprecated version fallback ordering', () => {
    it('should select the most recently created deprecated version', async () => {
      const activeVersion = createMockVersion({
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 10,
      });
      const olderDeprecated = createMockVersion({
        id: 'older-dep',
        status: 'DEPRECATED',
        createdAt: new Date('2026-01-01T10:00:00Z'),
      });
      const newerDeprecated = createMockVersion({
        id: 'newer-dep',
        status: 'DEPRECATED',
        createdAt: new Date('2026-01-14T10:00:00Z'),
      });

      mocks.versionRepo.findActive.mockResolvedValue(activeVersion);
      mocks.featureFlags.isEnabled.mockResolvedValue(false);
      mocks.versionRepo.findByStatus.mockResolvedValue([olderDeprecated, newerDeprecated]);

      const result = await mocks.service.getActiveVersion('SCORING', {
        tenantId: TENANT_ID,
        userId: USER_ID,
      });

      expect(result.version.id).toBe('newer-dep');
    });
  });
});
