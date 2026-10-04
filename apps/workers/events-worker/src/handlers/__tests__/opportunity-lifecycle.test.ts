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
    it('logs that the description changed, without copying the text into logs', async () => {
      const logger = makeLogger();
      const handlers = createOpportunityLifecycleHandlers(logger);
      const event = makeEvent({
        eventType: 'opportunity.description_updated',
        aggregateId: 'opp_4',
        payload: {
          opportunityId: 'opp_4',
          previousDescription: 'SENTINEL-PREV-a91f',
          newDescription: 'SENTINEL-NEW-77c2',
          updatedBy: 'user_3',
        },
      });

      await handlers.handleDescriptionUpdated(event);

      expect(logger.info).toHaveBeenCalledWith(
        {
          opportunityId: 'opp_4',
          updatedBy: 'user_3',
          hadPreviousDescription: true,
          previousLength: 18,
          newLength: 17,
        },
        'Opportunity description changed'
      );
      // A deal description can carry personal data; it must never reach the logs.
      // Every logger method, not only info: no path may carry the text.
      const logged = JSON.stringify(
        (['info', 'warn', 'error'] as const).map(
          (m) => (logger[m] as unknown as ReturnType<typeof vi.fn>).mock.calls
        )
      );
      expect(logged).not.toContain('SENTINEL-PREV-a91f');
      expect(logged).not.toContain('SENTINEL-NEW-77c2');
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
        expect.objectContaining({
          hadPreviousDescription: false,
          previousLength: 0,
          newLength: 17,
        }),
        'Opportunity description changed'
      );
    });
  });
});
