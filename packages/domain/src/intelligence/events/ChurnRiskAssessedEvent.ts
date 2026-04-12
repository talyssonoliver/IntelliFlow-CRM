/**
 * ChurnRiskAssessedEvent Domain Event (IFC-095)
 *
 * Emitted when a churn risk assessment is completed for an entity.
 * Used for event-driven workflows and audit trails.
 *
 * @module @intelliflow/domain/intelligence/events
 */

import { DomainEvent } from '../../shared/DomainEvent';
import type { ChurnRiskLevel, NBAActionType } from '../../ai/AIConstants';

/**
 * Event emitted when churn risk is assessed for an account/contact
 */
export class ChurnRiskAssessedEvent extends DomainEvent {
  public readonly eventType = 'CHURN_RISK_ASSESSED';

  constructor(
    public readonly accountId: string,
    public readonly tenantId: string,
    public readonly previousScore: number | null,
    public readonly newScore: number,
    public readonly riskLevel: ChurnRiskLevel,
    public readonly confidence: number,
    public readonly recommendedActions: NBAActionType[],
    public readonly assessedAt: Date
  ) {
    super();
  }

  /**
   * Check if risk increased from previous assessment
   */
  get riskIncreased(): boolean {
    if (this.previousScore === null) return false;
    return this.newScore > this.previousScore;
  }

  /**
   * Check if risk decreased from previous assessment
   */
  get riskDecreased(): boolean {
    if (this.previousScore === null) return false;
    return this.newScore < this.previousScore;
  }

  /**
   * Calculate the score change from previous assessment
   */
  get scoreChange(): number | null {
    if (this.previousScore === null) return null;
    return this.newScore - this.previousScore;
  }

  /**
   * Check if this is the first assessment (no previous score)
   */
  get isFirstAssessment(): boolean {
    return this.previousScore === null;
  }

  /**
   * Serialize event for storage/publishing
   */
  toPayload(): Record<string, unknown> {
    return {
      eventId: this.eventId,
      eventType: this.eventType,
      occurredAt: this.occurredAt.toISOString(),
      accountId: this.accountId,
      tenantId: this.tenantId,
      previousScore: this.previousScore,
      newScore: this.newScore,
      riskLevel: this.riskLevel,
      confidence: this.confidence,
      recommendedActions: this.recommendedActions,
      assessedAt: this.assessedAt.toISOString(),
      riskIncreased: this.riskIncreased,
      riskDecreased: this.riskDecreased,
      scoreChange: this.scoreChange,
      isFirstAssessment: this.isFirstAssessment,
    };
  }
}
