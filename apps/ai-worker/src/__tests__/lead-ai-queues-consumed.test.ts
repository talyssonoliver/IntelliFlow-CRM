/**
 * AI agents epic, PR 1a: every queue the lead fan-out produces to has a consumer here.
 *
 * The API and the events-worker add lead jobs to QUEUE_NAMES[planned.queue] from
 * @intelliflow/platform. If a planned queue were missing from AI_WORKER_QUEUES, or named
 * differently from the job module the worker's switch dispatches on, the jobs would sit in
 * Redis and no agent would run (the owner's "only the score one runs" complaint, 2026-11-12).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { QUEUE_NAMES, plannedLeadAiJobs } from '@intelliflow/platform';
import { AI_WORKER_QUEUES } from '../jobs';
import { SCORING_QUEUE } from '../jobs/scoring.job';
import { PREDICTION_QUEUE } from '../jobs/prediction.job';

const ownedLead = {
  leadId: 'lead-1',
  tenantId: 'tenant-1',
  lead: { email: 'ada@example.invalid', source: 'WEBSITE' },
  correlationId: 'corr-1',
  ownerId: 'user-1',
};

const producedQueues = [
  ...new Set(plannedLeadAiJobs(ownedLead).map((planned) => QUEUE_NAMES[planned.queue])),
];

describe('lead AI queues have a consumer', () => {
  it('produces to ai-scoring and ai-prediction', () => {
    expect(producedQueues.sort()).toEqual(['ai-prediction', 'ai-scoring']);
  });

  it('lists every produced queue in AI_WORKER_QUEUES', () => {
    for (const queue of producedQueues) {
      expect(AI_WORKER_QUEUES).toContain(queue);
    }
  });

  it('names them as the job modules the worker dispatches on', () => {
    expect(QUEUE_NAMES.AI_SCORING).toBe(SCORING_QUEUE);
    expect(QUEUE_NAMES.AI_PREDICTION).toBe(PREDICTION_QUEUE);
  });

  it('dispatches both queues to their processors in the worker switch', () => {
    // Whitespace collapsed, so formatting changes do not matter.
    const source = readFileSync(join(__dirname, '..', 'ai-worker.ts'), 'utf8')
      .split(/\s+/)
      .join(' ');

    expect(source).toContain('case SCORING_QUEUE: result = await processScoringJob(');
    expect(source).toContain('case PREDICTION_QUEUE: result = await processPredictionJob(');
  });
});
