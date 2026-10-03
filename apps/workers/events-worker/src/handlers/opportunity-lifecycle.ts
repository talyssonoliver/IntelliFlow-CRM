/**
 * Opportunity Lifecycle Event Handlers
 *
 * Handlers for the opportunity domain events that previously had no worker
 * coverage: `opportunity.created`, `opportunity.stage_changed`,
 * `opportunity.lost`, and `opportunity.description_updated`. Only
 * `opportunity.won` had a registered handler before this (W-01); the global
 * wildcard (`*`) caught the rest for audit logging only.
 *
 * Extracted from the worker bootstrap (matching the `portal-delivery-sync` /
 * `opportunity-customers` handlers already in this directory) so each handler
 * is unit-testable without constructing the full `EventsWorker`.
 *
 * Each handler is deliberately a logging stub — mirroring the existing
 * `opportunity.won` handler in `main.ts`, which logs the analytics-update and
 * celebration-notification intent rather than calling a concrete downstream
 * system. Wiring a real analytics/notification sink is out of scope here
 * (IFC-283 W-01/W-02 only asks that the 4 missing event types have handlers).
 *
 * @task IFC-283
 */

import type pino from 'pino';
import type { OutboxEvent } from '../outbox/event-dispatcher';

export interface OpportunityLifecycleHandlers {
  handleCreated(event: OutboxEvent): Promise<void>;
  handleStageChanged(event: OutboxEvent): Promise<void>;
  handleLost(event: OutboxEvent): Promise<void>;
  handleDescriptionUpdated(event: OutboxEvent): Promise<void>;
}

/** Structural slice of `OpportunityCreatedEvent.toPayload()`. */
interface OpportunityCreatedPayload {
  opportunityId?: string;
  name?: string;
  value?: number;
  accountId?: string;
  ownerId?: string;
  sourceLeadId?: string | null;
}

/** Structural slice of `OpportunityStageChangedEvent.toPayload()`. */
interface OpportunityStageChangedPayload {
  opportunityId?: string;
  previousStage?: string;
  newStage?: string;
  changedBy?: string;
}

/** Structural slice of `OpportunityLostEvent.toPayload()`. */
interface OpportunityLostPayload {
  opportunityId?: string;
  reason?: string;
  closedBy?: string;
}

/** Structural slice of `OpportunityDescriptionUpdatedEvent.toPayload()`. */
interface OpportunityDescriptionUpdatedPayload {
  opportunityId?: string;
  previousDescription?: string | null;
  newDescription?: string;
  updatedBy?: string;
}

export function createOpportunityLifecycleHandlers(
  logger: pino.Logger
): OpportunityLifecycleHandlers {
  return {
    async handleCreated(event) {
      const opportunityId = event.aggregateId;
      const { name, value, accountId, ownerId, sourceLeadId } =
        event.payload as OpportunityCreatedPayload;

      // Seed pipeline analytics with the new opportunity.
      logger.info(
        { opportunityId, name, value, accountId, ownerId, sourceLeadId },
        'Seeding pipeline analytics for new opportunity'
      );

      // Notify the assigned owner a deal has been created.
      logger.info({ opportunityId, ownerId }, 'Notifying owner of new opportunity');

      logger.info({ opportunityId }, 'Opportunity created event handled');
    },

    async handleStageChanged(event) {
      const opportunityId = event.aggregateId;
      const { previousStage, newStage, changedBy } =
        event.payload as OpportunityStageChangedPayload;

      // Update pipeline stage analytics (conversion funnel, stage duration).
      logger.info(
        { opportunityId, previousStage, newStage, changedBy },
        'Updating pipeline stage analytics'
      );

      logger.info({ opportunityId }, 'Opportunity stage changed event handled');
    },

    async handleLost(event) {
      const opportunityId = event.aggregateId;
      const { reason, closedBy } = event.payload as OpportunityLostPayload;

      // Update analytics with lost opportunity data (loss-reason breakdown).
      logger.info(
        { opportunityId, reason, closedAt: new Date().toISOString(), closedBy },
        'Updating analytics with lost opportunity'
      );

      // Notify the team a deal was lost.
      logger.info({ opportunityId, closedBy, reason }, 'Notifying team of lost deal');

      logger.info({ opportunityId }, 'Opportunity lost event handled');
    },

    async handleDescriptionUpdated(event) {
      const opportunityId = event.aggregateId;
      const { previousDescription, newDescription, updatedBy } =
        event.payload as OpportunityDescriptionUpdatedPayload;

      // Signal search re-index / audit trail that description text changed.
      logger.info(
        { opportunityId, previousDescription, newDescription, updatedBy },
        'Opportunity description changed'
      );

      logger.info({ opportunityId }, 'Opportunity description updated event handled');
    },
  };
}
