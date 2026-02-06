/**
 * ChainVersionService Tests
 *
 * Tests the ChainVersionService application service which orchestrates
 * chain/prompt versioning, A/B testing integration, and rollback
 * capabilities for AI chains.
 *
 * Coverage target: >90% for application layer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ChainVersionService,
  ChainVersionRecord,
  ChainVersionAuditRecord,
  ChainVersionRepositoryPort,
  ChainVersionAuditRepositoryPort,
  FeatureFlagProviderPort,
} from '../ChainVersionService';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockVersionRepo(): Record<string, any> {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    findByTenantId: vi.fn(),
    findByChainType: vi.fn(),
    findActive: vi.fn(),
    findByStatus: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
}

function createMockAuditRepo(): Record<string, any> {
  return {
    create: vi.fn().mockResolvedValue({} as ChainVersionAuditRecord),
    findByVersionId: vi.fn(),
    findByAction: vi.fn(),
  };
}

function createMockFeatureFlags(): Record<string, any> {
  return {
    isEnabled: vi.fn(),
    getVariant: vi.fn(),
    getRolloutPercent: vi.fn(),
  };
}

function createMockEventBus(): Record<string, any> {
  return {
    publish: vi.fn().mockResolvedValue(undefined),
    publishAll: vi.fn().mockResolvedValue(undefined),
    subscribe: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVersion(overrides: Partial<ChainVersionRecord> = {}): ChainVersionRecord {
  return {
    id: 'ver-1',
    chainType: 'LEAD_SCORING',
    status: 'DRAFT',
    prompt: 'Score this lead based on...',
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
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    tenantId: 'tenant-1',
    ...overrides,
  };
}

function makeAuditRecord(overrides: Partial<ChainVersionAuditRecord> = {}): ChainVersionAuditRecord {
  return {
    id: 'audit-1',
    versionId: 'ver-1',
    action: 'CREATED',
    previousState: null,
    newState: null,
    performedBy: 'user-1',
    performedAt: new Date('2025-01-01'),
    reason: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChainVersionService', () => {
  let service: ChainVersionService;
  let versionRepo: Record<string, any>;
  let auditRepo: Record<string, any>;
  let featureFlags: Record<string, any>;
  let eventBus: Record<string, any>;

  beforeEach(() => {
    versionRepo = createMockVersionRepo();
    auditRepo = createMockAuditRepo();
    featureFlags = createMockFeatureFlags();
    eventBus = createMockEventBus();

    service = new ChainVersionService(
      versionRepo as ChainVersionRepositoryPort,
      auditRepo as ChainVersionAuditRepositoryPort,
      featureFlags as FeatureFlagProviderPort,
      eventBus as any,
    );
  });

  // =========================================================================
  // createVersion
  // =========================================================================

  describe('createVersion', () => {
    it('should create a new chain version with provided values', async () => {
      const created = makeVersion();
      versionRepo.create.mockResolvedValue(created);

      const result = await service.createVersion(
        {
          chainType: 'LEAD_SCORING',
          prompt: 'Score this lead based on...',
          model: 'gpt-4-turbo-preview',
          temperature: 0.7,
          maxTokens: 2000,
        } as any,
        'user-1',
        'tenant-1',
      );

      expect(result).toEqual(created);
      expect(versionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          chainType: 'LEAD_SCORING',
          prompt: 'Score this lead based on...',
          createdBy: 'user-1',
          tenantId: 'tenant-1',
        }),
      );
    });

    it('should apply defaults for optional fields', async () => {
      versionRepo.create.mockResolvedValue(makeVersion());

      await service.createVersion(
        {
          chainType: 'LEAD_SCORING',
          prompt: 'Score this lead',
        } as any,
        'user-1',
        'tenant-1',
      );

      const call = versionRepo.create.mock.calls[0][0];
      expect(call.model).toBe('gpt-4-turbo-preview');
      expect(call.temperature).toBe(0.7);
      expect(call.maxTokens).toBe(2000);
      expect(call.rolloutStrategy).toBe('IMMEDIATE');
      expect(call.rolloutPercent).toBe(100);
    });

    it('should create audit entry', async () => {
      versionRepo.create.mockResolvedValue(makeVersion());

      await service.createVersion(
        { chainType: 'LEAD_SCORING', prompt: 'test' } as any,
        'user-1',
        'tenant-1',
      );

      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          versionId: 'ver-1',
          action: 'CREATED',
          performedBy: 'user-1',
        }),
      );
    });

    it('should publish ChainVersionCreatedEvent', async () => {
      versionRepo.create.mockResolvedValue(makeVersion());

      await service.createVersion(
        { chainType: 'LEAD_SCORING', prompt: 'test' } as any,
        'user-1',
        'tenant-1',
      );

      const event = eventBus.publish.mock.calls[0][0];
      expect(event.eventType).toBe('chain_version.created');
      expect(event.versionId).toBe('ver-1');
      expect(event.chainType).toBe('LEAD_SCORING');
      expect(event.createdBy).toBe('user-1');
      expect(event.tenantId).toBe('tenant-1');
    });
  });

  // =========================================================================
  // updateVersion
  // =========================================================================

  describe('updateVersion', () => {
    it('should update a DRAFT version', async () => {
      const existing = makeVersion({ status: 'DRAFT' });
      versionRepo.findById.mockResolvedValue(existing);
      versionRepo.update.mockResolvedValue({ ...existing, prompt: 'Updated prompt' });

      const result = await service.updateVersion(
        'ver-1',
        { prompt: 'Updated prompt' } as any,
        'user-1',
      );

      expect(result.prompt).toBe('Updated prompt');
      expect(auditRepo.create).toHaveBeenCalled();
    });

    it('should throw if version not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateVersion('missing', { prompt: 'test' } as any, 'user-1'),
      ).rejects.toThrow('Chain version not found: missing');
    });

    it('should throw if version is not DRAFT', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));

      await expect(
        service.updateVersion('ver-1', { prompt: 'test' } as any, 'user-1'),
      ).rejects.toThrow('Only DRAFT versions can be updated');
    });

    it('should preserve existing values for unspecified fields', async () => {
      const existing = makeVersion({ status: 'DRAFT', prompt: 'original', model: 'gpt-4' });
      versionRepo.findById.mockResolvedValue(existing);
      versionRepo.update.mockImplementation((_id: string, data: any) => ({ ...existing, ...data }));

      await service.updateVersion('ver-1', { prompt: 'new prompt' } as any, 'user-1');

      const updateCall = versionRepo.update.mock.calls[0][1];
      expect(updateCall.model).toBe('gpt-4');
      expect(updateCall.prompt).toBe('new prompt');
    });

    it('should set experimentId to null when explicitly passed as null', async () => {
      const existing = makeVersion({ status: 'DRAFT', experimentId: 'exp-1' });
      versionRepo.findById.mockResolvedValue(existing);
      versionRepo.update.mockImplementation((_id: string, data: any) => ({ ...existing, ...data }));

      await service.updateVersion('ver-1', { experimentId: null } as any, 'user-1');

      const updateCall = versionRepo.update.mock.calls[0][1];
      expect(updateCall.experimentId).toBeNull();
    });
  });

  // =========================================================================
  // activateVersion
  // =========================================================================

  describe('activateVersion', () => {
    it('should activate a DRAFT version', async () => {
      const draftVersion = makeVersion({ status: 'DRAFT' });
      versionRepo.findById.mockResolvedValue(draftVersion);
      versionRepo.findActive.mockResolvedValue(null);
      versionRepo.update.mockResolvedValue({ ...draftVersion, status: 'ACTIVE' });

      const result = await service.activateVersion('ver-1', 'user-1');

      expect(result.status).toBe('ACTIVE');
      expect(versionRepo.update).toHaveBeenCalledWith('ver-1', { status: 'ACTIVE' });
    });

    it('should deprecate current active version when activating new one', async () => {
      const draftVersion = makeVersion({ id: 'ver-2', status: 'DRAFT' });
      const currentActive = makeVersion({ id: 'ver-1', status: 'ACTIVE' });

      versionRepo.findById.mockResolvedValue(draftVersion);
      versionRepo.findActive.mockResolvedValue(currentActive);
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      await service.activateVersion('ver-2', 'user-1');

      // Should deprecate old version
      expect(versionRepo.update).toHaveBeenCalledWith('ver-1', { status: 'DEPRECATED' });
      // Should activate new version
      expect(versionRepo.update).toHaveBeenCalledWith('ver-2', { status: 'ACTIVE' });

      // Should create audit for deprecation
      const deprecationAudit = auditRepo.create.mock.calls.find(
        (call: any[]) => call[0].action === 'DEPRECATED',
      );
      expect(deprecationAudit).toBeDefined();

      // Should publish deprecation event
      const deprecationEvent = eventBus.publish.mock.calls.find(
        (call: any[]) => call[0].eventType === 'chain_version.deprecated',
      );
      expect(deprecationEvent).toBeDefined();
    });

    it('should throw if version not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      await expect(service.activateVersion('missing', 'user-1')).rejects.toThrow(
        'Chain version not found: missing',
      );
    });

    it('should throw if version is not DRAFT', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));

      await expect(service.activateVersion('ver-1', 'user-1')).rejects.toThrow(
        'Only DRAFT versions can be activated',
      );
    });

    it('should publish ChainVersionActivatedEvent', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'DRAFT' }));
      versionRepo.findActive.mockResolvedValue(null);
      versionRepo.update.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));

      await service.activateVersion('ver-1', 'user-1');

      const activatedEvent = eventBus.publish.mock.calls.find(
        (call: any[]) => call[0].eventType === 'chain_version.activated',
      );
      expect(activatedEvent).toBeDefined();
      expect(activatedEvent![0].versionId).toBe('ver-1');
      expect(activatedEvent![0].previousVersionId).toBeNull();
    });

    it('should include previousVersionId in event when replacing active', async () => {
      const currentActive = makeVersion({ id: 'ver-old', status: 'ACTIVE' });
      versionRepo.findById.mockResolvedValue(makeVersion({ id: 'ver-new', status: 'DRAFT' }));
      versionRepo.findActive.mockResolvedValue(currentActive);
      versionRepo.update.mockImplementation((id: string, data: any) => ({ ...makeVersion({ id }), ...data }));

      await service.activateVersion('ver-new', 'user-1');

      const activatedEvent = eventBus.publish.mock.calls.find(
        (call: any[]) => call[0].eventType === 'chain_version.activated',
      );
      expect(activatedEvent![0].previousVersionId).toBe('ver-old');
    });
  });

  // =========================================================================
  // deprecateVersion
  // =========================================================================

  describe('deprecateVersion', () => {
    it('should deprecate an active version', async () => {
      const version = makeVersion({ status: 'ACTIVE' });
      versionRepo.findById.mockResolvedValue(version);
      versionRepo.update.mockResolvedValue({ ...version, status: 'DEPRECATED' });

      const result = await service.deprecateVersion('ver-1', 'user-1', 'No longer needed');

      expect(result.status).toBe('DEPRECATED');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'DEPRECATED',
          reason: 'No longer needed',
        }),
      );
    });

    it('should deprecate a DRAFT version', async () => {
      const version = makeVersion({ status: 'DRAFT' });
      versionRepo.findById.mockResolvedValue(version);
      versionRepo.update.mockResolvedValue({ ...version, status: 'DEPRECATED' });

      const result = await service.deprecateVersion('ver-1', 'user-1');

      expect(result.status).toBe('DEPRECATED');
    });

    it('should throw if version not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      await expect(service.deprecateVersion('missing', 'user-1')).rejects.toThrow(
        'Chain version not found: missing',
      );
    });

    it('should throw if version is ARCHIVED', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ARCHIVED' }));

      await expect(service.deprecateVersion('ver-1', 'user-1')).rejects.toThrow(
        'Archived versions cannot be deprecated',
      );
    });

    it('should publish ChainVersionDeprecatedEvent', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));
      versionRepo.update.mockResolvedValue(makeVersion({ status: 'DEPRECATED' }));

      await service.deprecateVersion('ver-1', 'user-1');

      const event = eventBus.publish.mock.calls[0][0];
      expect(event.eventType).toBe('chain_version.deprecated');
    });

    it('should pass null reason when not provided', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));
      versionRepo.update.mockResolvedValue(makeVersion({ status: 'DEPRECATED' }));

      await service.deprecateVersion('ver-1', 'user-1');

      const auditCall = auditRepo.create.mock.calls[0][0];
      expect(auditCall.reason).toBeNull();
    });
  });

  // =========================================================================
  // archiveVersion
  // =========================================================================

  describe('archiveVersion', () => {
    it('should archive a DEPRECATED version', async () => {
      const version = makeVersion({ status: 'DEPRECATED' });
      versionRepo.findById.mockResolvedValue(version);
      versionRepo.update.mockResolvedValue({ ...version, status: 'ARCHIVED' });

      const result = await service.archiveVersion('ver-1', 'user-1');

      expect(result.status).toBe('ARCHIVED');
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ARCHIVED',
          previousState: { status: 'DEPRECATED' },
          newState: { status: 'ARCHIVED' },
        }),
      );
    });

    it('should archive a DRAFT version', async () => {
      const version = makeVersion({ status: 'DRAFT' });
      versionRepo.findById.mockResolvedValue(version);
      versionRepo.update.mockResolvedValue({ ...version, status: 'ARCHIVED' });

      const result = await service.archiveVersion('ver-1', 'user-1');

      expect(result.status).toBe('ARCHIVED');
    });

    it('should throw if version not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      await expect(service.archiveVersion('missing', 'user-1')).rejects.toThrow(
        'Chain version not found: missing',
      );
    });

    it('should throw if version is ACTIVE', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'ACTIVE' }));

      await expect(service.archiveVersion('ver-1', 'user-1')).rejects.toThrow(
        'Active versions cannot be archived directly. Deprecate first.',
      );
    });
  });

  // =========================================================================
  // rollbackToVersion
  // =========================================================================

  describe('rollbackToVersion', () => {
    it('should rollback to a DEPRECATED version by creating a new one', async () => {
      const targetVersion = makeVersion({ id: 'ver-old', status: 'DEPRECATED' });
      const currentActive = makeVersion({ id: 'ver-current', status: 'ACTIVE' });
      const newVersion = makeVersion({ id: 'ver-new', parentVersionId: 'ver-old' });

      versionRepo.findById.mockResolvedValue(targetVersion);
      versionRepo.findActive.mockResolvedValue(currentActive);
      versionRepo.create.mockResolvedValue(newVersion);
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      const result = await service.rollbackToVersion('ver-old', 'Performance regression', 'user-1');

      expect(result.success).toBe(true);
      expect(result.previousVersionId).toBe('ver-current');
      expect(result.rolledBackVersionId).toBe('ver-new');

      // Should deprecate current
      expect(versionRepo.update).toHaveBeenCalledWith('ver-current', { status: 'DEPRECATED' });
      // Should create new version based on target
      expect(versionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: targetVersion.prompt,
          model: targetVersion.model,
          parentVersionId: 'ver-old',
        }),
      );
      // Should activate new version
      expect(versionRepo.update).toHaveBeenCalledWith('ver-new', { status: 'ACTIVE' });
    });

    it('should rollback to a DRAFT version by activating it directly', async () => {
      const targetVersion = makeVersion({ id: 'ver-old', status: 'DRAFT' });
      const currentActive = makeVersion({ id: 'ver-current', status: 'ACTIVE' });

      versionRepo.findById.mockResolvedValue(targetVersion);
      versionRepo.findActive.mockResolvedValue(currentActive);
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      const result = await service.rollbackToVersion('ver-old', 'Reason', 'user-1');

      expect(result.success).toBe(true);
      expect(result.rolledBackVersionId).toBe('ver-old');
      expect(versionRepo.create).not.toHaveBeenCalled();
      expect(versionRepo.update).toHaveBeenCalledWith('ver-old', { status: 'ACTIVE' });
    });

    it('should rollback to an ARCHIVED version by creating a new one', async () => {
      const targetVersion = makeVersion({ id: 'ver-archived', status: 'ARCHIVED' });
      const currentActive = makeVersion({ id: 'ver-current', status: 'ACTIVE' });
      const newVersion = makeVersion({ id: 'ver-new' });

      versionRepo.findById.mockResolvedValue(targetVersion);
      versionRepo.findActive.mockResolvedValue(currentActive);
      versionRepo.create.mockResolvedValue(newVersion);
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      const result = await service.rollbackToVersion('ver-archived', 'Need old version', 'user-1');

      expect(result.success).toBe(true);
      expect(versionRepo.create).toHaveBeenCalled();
    });

    it('should throw if target version not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      await expect(
        service.rollbackToVersion('missing', 'reason', 'user-1'),
      ).rejects.toThrow('Target version not found: missing');
    });

    it('should throw if no active version exists', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ status: 'DEPRECATED' }));
      versionRepo.findActive.mockResolvedValue(null);

      await expect(
        service.rollbackToVersion('ver-1', 'reason', 'user-1'),
      ).rejects.toThrow('No active version to rollback from');
    });

    it('should throw if rolling back to the same active version', async () => {
      const version = makeVersion({ id: 'ver-1', status: 'ACTIVE' });
      versionRepo.findById.mockResolvedValue(version);
      versionRepo.findActive.mockResolvedValue(version);

      await expect(
        service.rollbackToVersion('ver-1', 'reason', 'user-1'),
      ).rejects.toThrow('Cannot rollback to the same version');
    });

    it('should publish ChainVersionRolledBackEvent', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ id: 'ver-old', status: 'DRAFT' }));
      versionRepo.findActive.mockResolvedValue(makeVersion({ id: 'ver-current', status: 'ACTIVE' }));
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      await service.rollbackToVersion('ver-old', 'Performance regression', 'user-1');

      const rollbackEvent = eventBus.publish.mock.calls.find(
        (call: any[]) => call[0].eventType === 'chain_version.rolled_back',
      );
      expect(rollbackEvent).toBeDefined();
      expect(rollbackEvent![0].fromVersionId).toBe('ver-current');
      expect(rollbackEvent![0].reason).toBe('Performance regression');
    });

    it('should create audit entries for both deprecation and activation', async () => {
      versionRepo.findById.mockResolvedValue(makeVersion({ id: 'ver-old', status: 'DRAFT' }));
      versionRepo.findActive.mockResolvedValue(makeVersion({ id: 'ver-current', status: 'ACTIVE' }));
      versionRepo.update.mockImplementation((id: string, data: any) => ({
        ...makeVersion({ id }),
        ...data,
      }));

      await service.rollbackToVersion('ver-old', 'reason', 'user-1');

      const rollbackAudit = auditRepo.create.mock.calls.find(
        (call: any[]) => call[0].action === 'ROLLED_BACK',
      );
      const activationAudit = auditRepo.create.mock.calls.find(
        (call: any[]) => call[0].action === 'ACTIVATED',
      );
      expect(rollbackAudit).toBeDefined();
      expect(activationAudit).toBeDefined();
    });
  });

  // =========================================================================
  // getActiveVersion
  // =========================================================================

  describe('getActiveVersion', () => {
    const context = { tenantId: 'tenant-1', userId: 'user-1', sessionId: 'sess-1', leadId: 'lead-1' };

    it('should return active version with direct selection', async () => {
      const activeVersion = makeVersion({ status: 'ACTIVE', rolloutStrategy: 'IMMEDIATE' });
      versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.version).toEqual(activeVersion);
      expect(result.selectedBy).toBe('direct');
    });

    it('should return experiment selection for AB_TEST strategy', async () => {
      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'AB_TEST',
        experimentId: 'exp-1',
      });
      versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.selectedBy).toBe('experiment');
    });

    it('should check feature flags for PERCENTAGE rollout', async () => {
      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      versionRepo.findActive.mockResolvedValue(activeVersion);
      featureFlags.isEnabled.mockResolvedValue(true);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.selectedBy).toBe('rollout');
      expect(featureFlags.isEnabled).toHaveBeenCalled();
    });

    it('should fall back to deprecated version when feature flag disabled', async () => {
      const activeVersion = makeVersion({
        id: 'ver-new',
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      const deprecatedVersion = makeVersion({
        id: 'ver-old',
        status: 'DEPRECATED',
        createdAt: new Date('2025-01-01'),
      });

      versionRepo.findActive.mockResolvedValue(activeVersion);
      featureFlags.isEnabled.mockResolvedValue(false);
      versionRepo.findByStatus.mockResolvedValue([deprecatedVersion]);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.version).toEqual(deprecatedVersion);
      expect(result.selectedBy).toBe('rollout');
    });

    it('should return active version when feature flag disabled but no deprecated versions', async () => {
      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      versionRepo.findActive.mockResolvedValue(activeVersion);
      featureFlags.isEnabled.mockResolvedValue(false);
      versionRepo.findByStatus.mockResolvedValue([]);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.version).toEqual(activeVersion);
      expect(result.selectedBy).toBe('rollout');
    });

    it('should not use feature flags when rolloutPercent is 100', async () => {
      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 100,
      });
      versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.selectedBy).toBe('direct');
      expect(featureFlags.isEnabled).not.toHaveBeenCalled();
    });

    it('should throw if no active version exists', async () => {
      versionRepo.findActive.mockResolvedValue(null);

      await expect(
        service.getActiveVersion('LEAD_SCORING' as any, context),
      ).rejects.toThrow('No active version found for chain type: LEAD_SCORING');
    });

    it('should handle null feature flags gracefully', async () => {
      const serviceNoFlags = new ChainVersionService(
        versionRepo as ChainVersionRepositoryPort,
        auditRepo as ChainVersionAuditRepositoryPort,
        null,
        eventBus as any,
      );

      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      versionRepo.findActive.mockResolvedValue(activeVersion);

      const result = await serviceNoFlags.getActiveVersion('LEAD_SCORING' as any, context);

      // Without feature flags, PERCENTAGE strategy should fall through to direct
      expect(result.selectedBy).toBe('direct');
    });

    it('should sort deprecated versions by createdAt descending when falling back', async () => {
      const activeVersion = makeVersion({
        status: 'ACTIVE',
        rolloutStrategy: 'PERCENTAGE',
        rolloutPercent: 50,
      });
      const olderVersion = makeVersion({ id: 'old', createdAt: new Date('2024-01-01') });
      const newerVersion = makeVersion({ id: 'newer', createdAt: new Date('2025-06-01') });

      versionRepo.findActive.mockResolvedValue(activeVersion);
      featureFlags.isEnabled.mockResolvedValue(false);
      versionRepo.findByStatus.mockResolvedValue([olderVersion, newerVersion]);

      const result = await service.getActiveVersion('LEAD_SCORING' as any, context);

      expect(result.version.id).toBe('newer');
    });
  });

  // =========================================================================
  // getVersion
  // =========================================================================

  describe('getVersion', () => {
    it('should return version by id', async () => {
      const version = makeVersion();
      versionRepo.findById.mockResolvedValue(version);

      const result = await service.getVersion('ver-1');

      expect(result).toEqual(version);
    });

    it('should return null if not found', async () => {
      versionRepo.findById.mockResolvedValue(null);

      const result = await service.getVersion('missing');

      expect(result).toBeNull();
    });
  });

  // =========================================================================
  // listVersions
  // =========================================================================

  describe('listVersions', () => {
    it('should list versions for a chain type', async () => {
      const versions = [
        makeVersion({ id: 'ver-1', createdAt: new Date('2025-01-01') }),
        makeVersion({ id: 'ver-2', createdAt: new Date('2025-02-01') }),
      ];
      versionRepo.findByChainType.mockResolvedValue(versions);

      const result = await service.listVersions('LEAD_SCORING' as any, 'tenant-1');

      expect(result).toHaveLength(2);
      // Should be sorted descending by createdAt
      expect(result[0].id).toBe('ver-2');
      expect(result[1].id).toBe('ver-1');
    });

    it('should filter by status when provided', async () => {
      versionRepo.findByStatus.mockResolvedValue([makeVersion({ status: 'ACTIVE' })]);

      const result = await service.listVersions('LEAD_SCORING' as any, 'tenant-1', {
        status: 'ACTIVE' as any,
      });

      expect(versionRepo.findByStatus).toHaveBeenCalledWith('LEAD_SCORING', 'ACTIVE', 'tenant-1');
      expect(result).toHaveLength(1);
    });

    it('should apply pagination', async () => {
      const versions = Array.from({ length: 50 }, (_, i) =>
        makeVersion({ id: `ver-${i}`, createdAt: new Date(`2025-01-${String(i + 1).padStart(2, '0')}`) }),
      );
      versionRepo.findByChainType.mockResolvedValue(versions);

      const result = await service.listVersions('LEAD_SCORING' as any, 'tenant-1', {
        offset: 10,
        limit: 5,
      });

      expect(result).toHaveLength(5);
    });

    it('should use default pagination of 20 items', async () => {
      const versions = Array.from({ length: 30 }, (_, i) =>
        makeVersion({ id: `ver-${i}`, createdAt: new Date(2025, 0, i + 1) }),
      );
      versionRepo.findByChainType.mockResolvedValue(versions);

      const result = await service.listVersions('LEAD_SCORING' as any, 'tenant-1');

      expect(result).toHaveLength(20);
    });
  });

  // =========================================================================
  // getVersionHistory
  // =========================================================================

  describe('getVersionHistory', () => {
    it('should return audit records for a version', async () => {
      const audits = [makeAuditRecord(), makeAuditRecord({ id: 'audit-2', action: 'ACTIVATED' })];
      auditRepo.findByVersionId.mockResolvedValue(audits);

      const result = await service.getVersionHistory('ver-1');

      expect(result).toEqual(audits);
      expect(auditRepo.findByVersionId).toHaveBeenCalledWith('ver-1');
    });
  });

  // =========================================================================
  // getChainConfig
  // =========================================================================

  describe('getChainConfig', () => {
    it('should return config for execution', async () => {
      const version = makeVersion({
        status: 'ACTIVE',
        prompt: 'Score this lead',
        model: 'gpt-4',
        temperature: 0.5,
        maxTokens: 1000,
        additionalParams: { topP: 0.9 },
      });
      versionRepo.findActive.mockResolvedValue(version);

      const context = { tenantId: 'tenant-1', userId: 'user-1', sessionId: 'sess-1', leadId: 'lead-1' };
      const config = await service.getChainConfig('LEAD_SCORING' as any, context);

      expect(config.prompt).toBe('Score this lead');
      expect(config.model).toBe('gpt-4');
      expect(config.temperature).toBe(0.5);
      expect(config.maxTokens).toBe(1000);
      expect(config.additionalParams).toEqual({ topP: 0.9 });
    });

    it('should return undefined additionalParams when null', async () => {
      const version = makeVersion({ status: 'ACTIVE', additionalParams: null });
      versionRepo.findActive.mockResolvedValue(version);

      const context = { tenantId: 'tenant-1', userId: 'user-1', sessionId: 'sess-1', leadId: 'lead-1' };
      const config = await service.getChainConfig('LEAD_SCORING' as any, context);

      expect(config.additionalParams).toBeUndefined();
    });
  });
});
