/**
 * Chain Version Domain Events - IFC-086: Model Versioning with Zep
 *
 * Domain events for chain version lifecycle management.
 * These events are published when chain versions are created,
 * activated, deprecated, or rolled back.
 *
 * @module @intelliflow/domain/ai/ChainVersionEvents
 */

import { DomainEvent } from '../shared/DomainEvent';
import type { ChainType } from './ChainVersionConstants';

/**
 * Event: A new chain version was created
 */
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

/**
 * Event: A chain version was activated (set as current production version)
 */
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

/**
 * Event: A chain version was deprecated
 */
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

/**
 * Event: A chain version was rolled back to a previous version
 */
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
