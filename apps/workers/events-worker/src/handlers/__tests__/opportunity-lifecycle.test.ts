import { describe, it, expect, vi } from 'vitest';
import { createOpportunityLifecycleHandlers } from '../opportunity-lifecycle';
import type { OutboxEvent } from '../../outbox/event-dispatcher';

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as import('pino').Logger;
}

function makeEvent(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 'evt_1',
    eventType: 'opportunity.created',
    aggregateType: 'Opportunity',
    aggregateId: 'opp_1',
    payload: {},
    metadata: {
      correlationId: 'corr_1',
      timestamp: new Date().toISOString(),
      version: '1',
    },
    status: 'pending',
    retryCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

describe('createOpportunityLifecycleHandlers', () => {
  describe('handleCreated', () => {
    it('logs the seeded analytics and owner notification without throwing', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.created',
        aggregateId: 'opp_1',
        payload: {
          opportunityId: 'opp_1',
          name: 'Acme Renewal',
          value: 50000,
          accountId: 'acct_1',
          ownerId: 'owner_1',
          sourceLeadId: 'lead_1',
        },
      });

      await expect(handlers.handleCreated(event)).resolves.toBeUndefined();

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ opportunityId: 'opp_1', name: 'Acme Renewal', value: 50000 }),
        'Seeding pipeline analytics for new opportunity'
      );
      expect(logger.info).toHaveBeenCalledWith(
        { opportunityId: 'opp_1' },
        'Opportunity created event handled'
      );
    });
  });

  describe('handleStageChanged', () => {
    it('logs the stage transition', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.stage_changed',
        aggregateId: 'opp_2',
        payload: {
          opportunityId: 'opp_2',
          previousStage: 'PROSPECTING',
          newStage: 'QUALIFICATION',
          changedBy: 'user_1',
        },
      });

      await handlers.handleStageChanged(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: 'opp_2',
          previousStage: 'PROSPECTING',
          newStage: 'QUALIFICATION',
          changedBy: 'user_1',
        }),
        'Updating pipeline stage analytics'
      );
    });
  });

  describe('handleLost', () => {
    it('logs the loss reason and team notification', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.lost',
        aggregateId: 'opp_3',
        payload: {
          opportunityId: 'opp_3',
          reason: 'Budget cut',
          closedBy: 'user_2',
        },
      });

      await handlers.handleLost(event);

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          opportunityId: 'opp_3',
          reason: 'Budget cut',
          closedBy: 'user_2',
        }),
        'Updating analytics with lost opportunity'
      );
      expect(logger.info).toHaveBeenCalledWith(
        { opportunityId: 'opp_3', closedBy: 'user_2', reason: 'Budget cut' },
        'Notifying team of lost deal'
      );
    });
  });

  describe('handleDescriptionUpdated', () => {
    it('logs the previous and new description', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.description_updated',
        aggregateId: 'opp_4',
        payload: {
          opportunityId: 'opp_4',
          previousDescription: 'Old text',
          newDescription: 'New text',
          updatedBy: 'user_3',
        },
      });

      await handlers.handleDescriptionUpdated(event);

      expect(logger.info).toHaveBeenCalledWith(
        {
          opportunityId: 'opp_4',
          previousDescription: 'Old text',
          newDescription: 'New text',
          updatedBy: 'user_3',
        },
        'Opportunity description changed'
      );
    });

    it('handles a null previous description (first description set)', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.description_updated',
        aggregateId: 'opp_5',
        payload: {
          opportunityId: 'opp_5',
          previousDescription: null,
          newDescription: 'First description',
          updatedBy: 'user_4',
        },
      });

      await expect(handlers.handleDescriptionUpdated(event)).resolves.toBeUndefined();
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ previousDescription: null, newDescription: 'First description' }),
        'Opportunity description changed'
      );
    });
  });
});
