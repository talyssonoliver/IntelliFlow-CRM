/**
 * CloseDealLostUseCase
 *
 * FLOW-009: Deal Lost Closure Workflow
 * Task: IFC-066
 *
 * Orchestrates the deal lost closure process:
 * - Reads pre-loss stage for analytics (stageAtLoss)
 * - Delegates to OpportunityService.markAsLost() for domain transition
 * - Publishes DealLostEnrichedEvent for downstream consumers (analytics, etc.)
 * - Dispatches deal-lost notification (fire-and-forget)
 * - Returns Result<Opportunity> for the caller
 *
 * Constructor Dependencies (3):
 * - OpportunityService: domain transition + persistence
 * - EventBusPort: enriched event publishing
 * - NotificationServicePort: deal-lost email notification
 */

import { Result, DomainError, Opportunity, DealLostEnrichedEvent } from '@intelliflow/domain';
import { OpportunityService } from '../../services/OpportunityService';
import { EventBusPort } from '../../ports/external';
import { NotificationServicePort } from '../../ports/external/NotificationServicePort';

/**
 * Input for closing a deal as lost
 */
export interface CloseDealLostInput {
  opportunityId: string;
  reason: string;
  closedBy: string;
  tenantId: string;
}

/**
 * CloseDealLostUseCase
 *
 * Wraps OpportunityService.markAsLost() with enriched event publishing
 * and notification dispatch for the deal lost closure workflow.
 */
export class CloseDealLostUseCase {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly eventBus: EventBusPort,
    private readonly notificationService: NotificationServicePort
  ) {}

  async execute(input: CloseDealLostInput): Promise<Result<Opportunity, DomainError>> {
    // 1. Read pre-loss stage BEFORE mutation (for stageAtLoss in enriched event)
    const findResult = await this.opportunityService.getOpportunityById(input.opportunityId);
    const stageAtLoss = findResult.isSuccess ? findResult.value.stage : 'PROSPECTING';

    // 2. Delegate domain transition to OpportunityService.markAsLost()
    // This handles: validation, stage change, persistence, and base domain events
    const result = await this.opportunityService.markAsLost(
      input.opportunityId,
      input.reason,
      input.closedBy
    );

    if (result.isFailure) {
      return result;
    }

    const opportunity = result.value;

    // 3. Calculate sales cycle days
    const closedAt = opportunity.closedAt ?? new Date();
    const salesCycleDays = Math.floor(
      (closedAt.getTime() - opportunity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 4. Fire-and-forget: Publish enriched event for downstream consumers (analytics, etc.)
    const enrichedEvent = new DealLostEnrichedEvent(
      opportunity.id,
      opportunity.value.amount,
      opportunity.value.currency,
      opportunity.accountId,
      opportunity.contactId,
      opportunity.ownerId,
      input.tenantId,
      input.closedBy,
      closedAt,
      salesCycleDays,
      opportunity.name,
      input.reason,
      stageAtLoss
    );

    Promise.resolve().then(async () => {
      try {
        await this.eventBus.publish(enrichedEvent);
      } catch (err) {
        console.error('[CloseDealLost] Failed to publish enriched event:', err);
      }
    });

    // 5. Fire-and-forget: Dispatch deal-lost notification
    Promise.resolve().then(async () => {
      try {
        await this.notificationService.sendEmail({
          to: [input.closedBy],
          subject: `Deal Lost: ${opportunity.name}`,
          textBody: `The deal "${opportunity.name}" has been closed as lost. Reason: ${input.reason}`,
        });
      } catch (err) {
        console.error('[CloseDealLost] Failed to send notification:', err);
      }
    });

    // 6. Return success with the updated opportunity
    return Result.ok(opportunity);
  }
}
