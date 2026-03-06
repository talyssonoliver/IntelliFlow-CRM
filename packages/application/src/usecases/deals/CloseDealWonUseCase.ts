/**
 * CloseDealWonUseCase
 *
 * FLOW-009: Deal Won Closure Workflow
 * Task: IFC-065
 *
 * Orchestrates the deal won closure process:
 * - Delegates to OpportunityService.markAsWon() for domain transition
 * - Publishes DealWonEnrichedEvent for downstream consumers (analytics, notifications)
 * - Dispatches deal-won notification (fire-and-forget)
 * - Returns Result<Opportunity> for the caller
 *
 * Constructor Dependencies (3):
 * - OpportunityService: domain transition + persistence
 * - EventBusPort: enriched event publishing
 * - NotificationServicePort: deal-won email notification
 */

import { Result, DomainError, Opportunity, DealWonEnrichedEvent } from '@intelliflow/domain';
import { OpportunityService } from '../../services/OpportunityService';
import { EventBusPort } from '../../ports/external';
import { NotificationServicePort } from '../../ports/external/NotificationServicePort';

/**
 * Input for closing a deal as won
 */
export interface CloseDealWonInput {
  opportunityId: string;
  closedBy: string;
  tenantId: string;
}

/**
 * CloseDealWonUseCase
 *
 * Wraps OpportunityService.markAsWon() with enriched event publishing
 * and notification dispatch for the deal won closure workflow.
 */
export class CloseDealWonUseCase {
  constructor(
    private readonly opportunityService: OpportunityService,
    private readonly eventBus: EventBusPort,
    private readonly notificationService: NotificationServicePort
  ) {}

  async execute(input: CloseDealWonInput): Promise<Result<Opportunity, DomainError>> {
    // 1. Delegate domain transition to OpportunityService.markAsWon()
    // This handles: validation, stage change, persistence, and base domain events
    const result = await this.opportunityService.markAsWon(input.opportunityId, input.closedBy);

    if (result.isFailure) {
      return result;
    }

    const opportunity = result.value;

    // 2. Calculate sales cycle days
    const closedAt = opportunity.closedAt ?? new Date();
    const salesCycleDays = Math.floor(
      (closedAt.getTime() - opportunity.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // 3. Fire-and-forget: Publish enriched event for downstream consumers (analytics, etc.)
    const enrichedEvent = new DealWonEnrichedEvent(
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
      opportunity.name
    );

    Promise.resolve().then(async () => {
      try {
        await this.eventBus.publish(enrichedEvent);
      } catch (err) {
        console.error('[CloseDealWon] Failed to publish enriched event:', err);
      }
    });

    // 4. Fire-and-forget: Dispatch deal-won notification
    Promise.resolve().then(async () => {
      try {
        await this.notificationService.sendEmail({
          to: [input.closedBy],
          subject: `Deal Won: ${opportunity.name}`,
          textBody: `Congratulations! The deal "${opportunity.name}" has been closed as won with a value of ${opportunity.value.currency} ${opportunity.value.amount}.`,
        });
      } catch (err) {
        console.error('[CloseDealWon] Failed to send notification:', err);
      }
    });

    // 5. Return success with the updated opportunity
    return Result.ok(opportunity);
  }
}
