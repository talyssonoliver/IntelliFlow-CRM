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

import {
  Result,
  DomainError,
  Opportunity,
  DealWonEnrichedEvent,
  buildSetupInstalmentPlan,
} from '@intelliflow/domain';
import { OpportunityService } from '../../services/OpportunityService';
import { EventBusPort } from '../../ports/external';
import { NotificationServicePort } from '../../ports/external/NotificationServicePort';
import type {
  SetupInstalmentRepository,
  DeliveryTier,
} from '../../ports/repositories/SetupInstalmentRepositoryPort';

/**
 * Input for closing a deal as won
 */
export interface CloseDealWonInput {
  opportunityId: string;
  closedBy: string;
  tenantId: string;
  /**
   * IFC-314: present only for **portal-delivery** deals. When set, the close
   * seeds the 14-day setup-fee instalment plan (3 × £167 at day 0/7/14) for this
   * opportunity, which the events-worker then pushes to the portal. Omitted for
   * legacy / non-portal deals → no instalments, behaviour unchanged.
   */
  deliveryTier?: DeliveryTier;
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
    private readonly notificationService: NotificationServicePort,
    /**
     * IFC-314: optional. When provided AND the input carries a `deliveryTier`,
     * the setup-fee instalment plan is persisted on close. Left undefined in
     * contexts that don't run the portal-delivery flow.
     */
    private readonly setupInstalmentRepository?: SetupInstalmentRepository
  ) {}

  async execute(input: CloseDealWonInput): Promise<Result<Opportunity, DomainError>> {
    // 1. Delegate domain transition to OpportunityService.markAsWon()
    // This handles: validation, stage change, persistence, and base domain events
    const result = await this.opportunityService.markAsWon(
      input.opportunityId,
      input.closedBy,
      input.tenantId
    );

    if (result.isFailure) {
      return result;
    }

    const opportunity = result.value;

    // 2. Calculate sales cycle days
    const closedAt = opportunity.closedAt ?? new Date();

    // 2b. IFC-314: seed the setup-fee instalment plan for portal-delivery deals.
    // Awaited (so the instalments exist before the enriched event is dispatched
    // and the events-worker reads them) but non-fatal — a billing-side failure
    // must never roll back a won deal.
    await this.seedSetupInstalments(input, closedAt);
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

  /**
   * IFC-314: persist the 3-instalment setup-fee plan for a portal-delivery deal.
   * No-op unless a repository is wired AND the close carries a `deliveryTier`
   * (the close-time signal that this opportunity maps to a portal tenant).
   * Best-effort: failures are logged, never thrown — the deal stays won.
   */
  private async seedSetupInstalments(input: CloseDealWonInput, signedAt: Date): Promise<void> {
    if (!this.setupInstalmentRepository || !input.deliveryTier) return;

    try {
      const instalments = buildSetupInstalmentPlan({ signedAt, tier: input.deliveryTier });
      await this.setupInstalmentRepository.createForOpportunity({
        opportunityId: input.opportunityId,
        tenantId: input.tenantId,
        instalments,
      });
    } catch (err) {
      console.error('[CloseDealWon] Failed to seed setup instalments:', err);
    }
  }
}
