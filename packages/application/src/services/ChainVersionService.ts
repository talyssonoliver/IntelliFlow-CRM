/**
 * Chain Version Service - IFC-086: Model Versioning with Zep
 *
 * Orchestrates chain/prompt versioning, A/B testing integration,
 * and rollback capabilities for AI chains.
 *
 * @module @intelliflow/application/services/ChainVersionService
 */

import {
  CHAIN_VERSION_DEFAULTS,
  DomainEvent,
} from '@intelliflow/domain';
import type {
  ChainType,
  ChainVersionStatus,
  VersionRolloutStrategy,
  ChainVersionAuditAction,
} from '@intelliflow/domain';
import type {
  CreateChainVersionInput,
  UpdateChainVersionInput,
  RollbackResult,
  VersionContext,
  ChainConfig,
} from '@intelliflow/validators';
import { EventBusPort } from '../ports/external';

// =============================================================================
// Types
// =============================================================================

export interface ChainVersionRecord {
  id: string;
  chainType: ChainType;
  status: ChainVersionStatus;
  prompt: string;
  model: string;
  temperature: number;
  maxTokens: number;
  additionalParams: Record<string, unknown> | null;
  description: string | null;
  parentVersionId: string | null;
  rolloutStrategy: VersionRolloutStrategy;
  rolloutPercent: number | null;
  experimentId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
}

export interface ChainVersionAuditRecord {
  id: string;
  versionId: string;
  action: ChainVersionAuditAction;
  previousState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  performedBy: string;
  performedAt: Date;
  reason: string | null;
}

// =============================================================================
// Repository Ports
// =============================================================================

/**
 * Chain version repository port (to be implemented in adapters layer)
 */
export interface ChainVersionRepositoryPort {
  create(data: {
    chainType: ChainType;
    prompt: string;
    model: string;
    temperature: number;
    maxTokens: number;
    additionalParams: Record<string, unknown> | null;
    description: string | null;
    parentVersionId: string | null;
    rolloutStrategy: VersionRolloutStrategy;
    rolloutPercent: number | null;
    experimentId: string | null;
    createdBy: string;
    tenantId: string;
  }): Promise<ChainVersionRecord>;

  findById(id: string): Promise<ChainVersionRecord | null>;
  findByTenantId(tenantId: string): Promise<ChainVersionRecord[]>;
  findByChainType(chainType: ChainType, tenantId: string): Promise<ChainVersionRecord[]>;
  findActive(chainType: ChainType, tenantId: string): Promise<ChainVersionRecord | null>;
  findByStatus(chainType: ChainType, status: ChainVersionStatus, tenantId: string): Promise<ChainVersionRecord[]>;
  update(id: string, data: Partial<ChainVersionRecord>): Promise<ChainVersionRecord>;
  delete(id: string): Promise<void>;
}

/**
 * Chain version audit repository port
 */
export interface ChainVersionAuditRepositoryPort {
  create(data: {
    versionId: string;
    action: ChainVersionAuditAction;
    previousState: Record<string, unknown> | null;
    newState: Record<string, unknown> | null;
    performedBy: string;
    reason: string | null;
  }): Promise<ChainVersionAuditRecord>;

  findByVersionId(versionId: string): Promise<ChainVersionAuditRecord[]>;
  findByAction(action: ChainVersionAuditAction, limit?: number): Promise<ChainVersionAuditRecord[]>;
}

/**
 * Feature flag provider port for rollout strategies
 */
export interface FeatureFlagProviderPort {
  isEnabled(flagKey: string, context: Record<string, unknown>): Promise<boolean>;
  getVariant(flagKey: string, context: Record<string, unknown>): Promise<string | null>;
  getRolloutPercent(flagKey: string): Promise<number>;
}

// =============================================================================
// Domain Events
// =============================================================================

export class ChainVersionCreatedEvent extends DomainEvent {
  readonly eventType = 'chain_version.created';
  constructor(
    public readonly versionId: string,
    public readonly chainType: ChainType,
    public readonly createdBy: string,
    public readonly tenantId: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      versionId: this.versionId,
      chainType: this.chainType,
      createdBy: this.createdBy,
      tenantId: this.tenantId,
    };
  }
}

export class ChainVersionActivatedEvent extends DomainEvent {
  readonly eventType = 'chain_version.activated';
  constructor(
    public readonly versionId: string,
    public readonly chainType: ChainType,
    public readonly previousVersionId: string | null,
    public readonly activatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      versionId: this.versionId,
      chainType: this.chainType,
      previousVersionId: this.previousVersionId,
      activatedBy: this.activatedBy,
    };
  }
}

export class ChainVersionDeprecatedEvent extends DomainEvent {
  readonly eventType = 'chain_version.deprecated';
  constructor(
    public readonly versionId: string,
    public readonly chainType: ChainType,
    public readonly deprecatedBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      versionId: this.versionId,
      chainType: this.chainType,
      deprecatedBy: this.deprecatedBy,
    };
  }
}

export class ChainVersionRolledBackEvent extends DomainEvent {
  readonly eventType = 'chain_version.rolled_back';
  constructor(
    public readonly fromVersionId: string,
    public readonly toVersionId: string,
    public readonly chainType: ChainType,
    public readonly reason: string,
    public readonly rolledBackBy: string
  ) {
    super();
  }

  toPayload(): Record<string, unknown> {
    return {
      fromVersionId: this.fromVersionId,
      toVersionId: this.toVersionId,
      chainType: this.chainType,
      reason: this.reason,
      rolledBackBy: this.rolledBackBy,
    };
  }
}

// =============================================================================
// Chain Version Service
// =============================================================================

/**
 * Chain Version Service
 *
 * Manages chain/prompt versioning:
 * - Creates and manages chain versions
 * - Handles version activation and deprecation
 * - Integrates with A/B testing (via experiment IDs)
 * - Supports rollback with audit trails
 */
export class ChainVersionService {
  constructor(
    private readonly versionRepo: ChainVersionRepositoryPort,
    private readonly auditRepo: ChainVersionAuditRepositoryPort,
    private readonly featureFlags: FeatureFlagProviderPort | null,
    private readonly eventBus: EventBusPort
  ) {}

  // ===========================================================================
  // Version Lifecycle
  // ===========================================================================

  /**
   * Create a new chain version
   */
  async createVersion(
    input: CreateChainVersionInput,
    createdBy: string,
    tenantId: string
  ): Promise<ChainVersionRecord> {
    const version = await this.versionRepo.create({
      chainType: input.chainType,
      prompt: input.prompt,
      model: input.model ?? CHAIN_VERSION_DEFAULTS.DEFAULT_MODEL,
      temperature: input.temperature ?? CHAIN_VERSION_DEFAULTS.DEFAULT_TEMPERATURE,
      maxTokens: input.maxTokens ?? CHAIN_VERSION_DEFAULTS.DEFAULT_MAX_TOKENS,
      additionalParams: input.additionalParams ?? null,
      description: input.description ?? null,
      parentVersionId: input.parentVersionId ?? null,
      rolloutStrategy: input.rolloutStrategy ?? CHAIN_VERSION_DEFAULTS.DEFAULT_ROLLOUT_STRATEGY,
      rolloutPercent: input.rolloutPercent ?? CHAIN_VERSION_DEFAULTS.DEFAULT_ROLLOUT_PERCENT,
      experimentId: input.experimentId ?? null,
      createdBy,
      tenantId,
    });

    // Create audit entry
    await this.auditRepo.create({
      versionId: version.id,
      action: 'CREATED',
      previousState: null,
      newState: this.versionToState(version),
      performedBy: createdBy,
      reason: null,
    });

    // Publish event
    await this.eventBus.publish(
      new ChainVersionCreatedEvent(version.id, version.chainType, createdBy, tenantId)
    );

    return version;
  }

  /**
   * Update a chain version (only in DRAFT status)
   */
  async updateVersion(
    versionId: string,
    input: UpdateChainVersionInput,
    updatedBy: string
  ): Promise<ChainVersionRecord> {
    const version = await this.versionRepo.findById(versionId);
    if (!version) {
      throw new Error(`Chain version not found: ${versionId}`);
    }

    if (version.status !== 'DRAFT') {
      throw new Error('Only DRAFT versions can be updated');
    }

    const previousState = this.versionToState(version);

    const updated = await this.versionRepo.update(versionId, {
      prompt: input.prompt ?? version.prompt,
      model: input.model ?? version.model,
      temperature: input.temperature ?? version.temperature,
      maxTokens: input.maxTokens ?? version.maxTokens,
      additionalParams: input.additionalParams ?? version.additionalParams,
      description: input.description ?? version.description,
      rolloutStrategy: input.rolloutStrategy ?? version.rolloutStrategy,
      rolloutPercent: input.rolloutPercent ?? version.rolloutPercent,
      experimentId: input.experimentId === null ? null : (input.experimentId ?? version.experimentId),
    });

    // Create audit entry
    await this.auditRepo.create({
      versionId,
      action: 'CREATED', // Using CREATED for updates to draft
      previousState,
      newState: this.versionToState(updated),
      performedBy: updatedBy,
      reason: 'Updated draft version',
    });

    return updated;
  }

  /**
   * Activate a chain version (marks as ACTIVE, deprecates previous active)
   */
  async activateVersion(
    versionId: string,
    activatedBy: string
  ): Promise<ChainVersionRecord> {
    const version = await this.versionRepo.findById(versionId);
    if (!version) {
      throw new Error(`Chain version not found: ${versionId}`);
    }

    if (version.status !== 'DRAFT') {
      throw new Error('Only DRAFT versions can be activated');
    }

    // Find and deprecate current active version
    const currentActive = await this.versionRepo.findActive(version.chainType, version.tenantId);
    let previousVersionId: string | null = null;

    if (currentActive) {
      previousVersionId = currentActive.id;
      await this.versionRepo.update(currentActive.id, { status: 'DEPRECATED' });

      await this.auditRepo.create({
        versionId: currentActive.id,
        action: 'DEPRECATED',
        previousState: { status: 'ACTIVE' },
        newState: { status: 'DEPRECATED' },
        performedBy: activatedBy,
        reason: `Replaced by version ${versionId}`,
      });

      await this.eventBus.publish(
        new ChainVersionDeprecatedEvent(currentActive.id, currentActive.chainType, activatedBy)
      );
    }

    // Activate new version
    const activated = await this.versionRepo.update(versionId, { status: 'ACTIVE' });

    await this.auditRepo.create({
      versionId,
      action: 'ACTIVATED',
      previousState: { status: 'DRAFT' },
      newState: { status: 'ACTIVE' },
      performedBy: activatedBy,
      reason: null,
    });

    await this.eventBus.publish(
      new ChainVersionActivatedEvent(versionId, version.chainType, previousVersionId, activatedBy)
    );

    return activated;
  }

  /**
   * Deprecate a chain version
   */
  async deprecateVersion(
    versionId: string,
    deprecatedBy: string,
    reason?: string
  ): Promise<ChainVersionRecord> {
    const version = await this.versionRepo.findById(versionId);
    if (!version) {
      throw new Error(`Chain version not found: ${versionId}`);
    }

    if (version.status === 'ARCHIVED') {
      throw new Error('Archived versions cannot be deprecated');
    }

    const deprecated = await this.versionRepo.update(versionId, { status: 'DEPRECATED' });

    await this.auditRepo.create({
      versionId,
      action: 'DEPRECATED',
      previousState: { status: version.status },
      newState: { status: 'DEPRECATED' },
      performedBy: deprecatedBy,
      reason: reason ?? null,
    });

    await this.eventBus.publish(
      new ChainVersionDeprecatedEvent(versionId, version.chainType, deprecatedBy)
    );

    return deprecated;
  }

  /**
   * Archive a chain version
   */
  async archiveVersion(
    versionId: string,
    archivedBy: string
  ): Promise<ChainVersionRecord> {
    const version = await this.versionRepo.findById(versionId);
    if (!version) {
      throw new Error(`Chain version not found: ${versionId}`);
    }

    if (version.status === 'ACTIVE') {
      throw new Error('Active versions cannot be archived directly. Deprecate first.');
    }

    const archived = await this.versionRepo.update(versionId, { status: 'ARCHIVED' });

    await this.auditRepo.create({
      versionId,
      action: 'ARCHIVED',
      previousState: { status: version.status },
      newState: { status: 'ARCHIVED' },
      performedBy: archivedBy,
      reason: null,
    });

    return archived;
  }

  /**
   * Rollback to a previous version
   */
  async rollbackToVersion(
    versionId: string,
    reason: string,
    rolledBackBy: string
  ): Promise<RollbackResult> {
    const targetVersion = await this.versionRepo.findById(versionId);
    if (!targetVersion) {
      throw new Error(`Target version not found: ${versionId}`);
    }

    // Find current active version
    const currentActive = await this.versionRepo.findActive(
      targetVersion.chainType,
      targetVersion.tenantId
    );

    if (!currentActive) {
      throw new Error('No active version to rollback from');
    }

    if (currentActive.id === versionId) {
      throw new Error('Cannot rollback to the same version');
    }

    // Deprecate current active
    await this.versionRepo.update(currentActive.id, { status: 'DEPRECATED' });

    await this.auditRepo.create({
      versionId: currentActive.id,
      action: 'ROLLED_BACK',
      previousState: { status: 'ACTIVE' },
      newState: { status: 'DEPRECATED' },
      performedBy: rolledBackBy,
      reason: `Rolled back to version ${versionId}: ${reason}`,
    });

    // Activate target version (create new version based on it if it was deprecated/archived)
    let activatedVersionId: string;

    if (targetVersion.status === 'DEPRECATED' || targetVersion.status === 'ARCHIVED') {
      // Create new version based on the target
      const newVersion = await this.versionRepo.create({
        chainType: targetVersion.chainType,
        prompt: targetVersion.prompt,
        model: targetVersion.model,
        temperature: targetVersion.temperature,
        maxTokens: targetVersion.maxTokens,
        additionalParams: targetVersion.additionalParams,
        description: `Rollback from ${currentActive.id}: ${reason}`,
        parentVersionId: targetVersion.id,
        rolloutStrategy: targetVersion.rolloutStrategy,
        rolloutPercent: targetVersion.rolloutPercent,
        experimentId: null,
        createdBy: rolledBackBy,
        tenantId: targetVersion.tenantId,
      });

      await this.versionRepo.update(newVersion.id, { status: 'ACTIVE' });
      activatedVersionId = newVersion.id;

      await this.auditRepo.create({
        versionId: newVersion.id,
        action: 'ACTIVATED',
        previousState: null,
        newState: { status: 'ACTIVE' },
        performedBy: rolledBackBy,
        reason: `Created from rollback of ${currentActive.id} to ${versionId}`,
      });
    } else {
      // Activate the target version directly (if it's still DRAFT)
      await this.versionRepo.update(versionId, { status: 'ACTIVE' });
      activatedVersionId = versionId;

      await this.auditRepo.create({
        versionId,
        action: 'ACTIVATED',
        previousState: { status: targetVersion.status },
        newState: { status: 'ACTIVE' },
        performedBy: rolledBackBy,
        reason: `Rollback from ${currentActive.id}: ${reason}`,
      });
    }

    await this.eventBus.publish(
      new ChainVersionRolledBackEvent(
        currentActive.id,
        activatedVersionId,
        targetVersion.chainType,
        reason,
        rolledBackBy
      )
    );

    return {
      success: true,
      previousVersionId: currentActive.id,
      rolledBackVersionId: activatedVersionId,
      auditId: activatedVersionId, // Simplified: using version ID as audit reference
      rolledBackAt: new Date(),
    };
  }

  // ===========================================================================
  // Version Retrieval
  // ===========================================================================

  /**
   * Get the active version for a chain type, considering rollout strategy
   */
  async getActiveVersion(
    chainType: ChainType,
    context: VersionContext
  ): Promise<{ version: ChainVersionRecord; selectedBy: 'direct' | 'rollout' | 'experiment' }> {
    // Find active version
    const activeVersion = await this.versionRepo.findActive(chainType, context.tenantId);

    if (!activeVersion) {
      throw new Error(`No active version found for chain type: ${chainType}`);
    }

    // Check rollout strategy
    if (activeVersion.rolloutStrategy === 'AB_TEST' && activeVersion.experimentId) {
      // Let experiment service handle variant selection
      return { version: activeVersion, selectedBy: 'experiment' };
    }

    if (activeVersion.rolloutStrategy === 'PERCENTAGE' && activeVersion.rolloutPercent !== null) {
      // Use feature flags for percentage rollout
      if (this.featureFlags && activeVersion.rolloutPercent < 100) {
        const flagKey = `chain_version_${chainType}_${activeVersion.id}`;
        const isEnabled = await this.featureFlags.isEnabled(flagKey, {
          userId: context.userId,
          sessionId: context.sessionId,
          leadId: context.leadId,
        });

        if (!isEnabled) {
          // Fall back to previous version or return null
          const previousVersions = await this.versionRepo.findByStatus(
            chainType,
            'DEPRECATED',
            context.tenantId
          );

          if (previousVersions.length > 0) {
            // Sort by createdAt descending to get most recent
            const sortedVersions = previousVersions.sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
            );
            return { version: sortedVersions[0], selectedBy: 'rollout' };
          }
        }

        return { version: activeVersion, selectedBy: 'rollout' };
      }
    }

    return { version: activeVersion, selectedBy: 'direct' };
  }

  /**
   * Get a specific version by ID
   */
  async getVersion(versionId: string): Promise<ChainVersionRecord | null> {
    return this.versionRepo.findById(versionId);
  }

  /**
   * List versions for a chain type
   */
  async listVersions(
    chainType: ChainType,
    tenantId: string,
    options?: { status?: ChainVersionStatus; limit?: number; offset?: number }
  ): Promise<ChainVersionRecord[]> {
    let versions: ChainVersionRecord[];

    if (options?.status) {
      versions = await this.versionRepo.findByStatus(chainType, options.status, tenantId);
    } else {
      versions = await this.versionRepo.findByChainType(chainType, tenantId);
    }

    // Sort by createdAt descending
    versions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    // Apply pagination
    const offset = options?.offset ?? 0;
    const limit = options?.limit ?? 20;

    return versions.slice(offset, offset + limit);
  }

  /**
   * Get version history (audit log) for a version
   */
  async getVersionHistory(versionId: string): Promise<ChainVersionAuditRecord[]> {
    return this.auditRepo.findByVersionId(versionId);
  }

  /**
   * Get chain config for execution
   */
  async getChainConfig(chainType: ChainType, context: VersionContext): Promise<ChainConfig> {
    const { version } = await this.getActiveVersion(chainType, context);

    return {
      prompt: version.prompt,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      additionalParams: version.additionalParams ?? undefined,
    };
  }

  // ===========================================================================
  // Private Helpers
  // ===========================================================================

  private versionToState(version: ChainVersionRecord): Record<string, unknown> {
    return {
      id: version.id,
      chainType: version.chainType,
      status: version.status,
      model: version.model,
      temperature: version.temperature,
      maxTokens: version.maxTokens,
      rolloutStrategy: version.rolloutStrategy,
      rolloutPercent: version.rolloutPercent,
    };
  }
}
