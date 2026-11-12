/**
 * The lead AI job planner, shared by the API and the events-worker (AI agents epic, PR 1a).
 * Both producers must plan the same jobIds for the same lead, or the backstop double-runs.
 */
import { describe, it, expect } from 'vitest';
import {
  LEAD_AI_DEDUPE_DAYS,
  STORED_LEAD_FOR_AI_SELECT,
  leadAiFingerprint,
  leadAiJobFromStoredLead,
  leadAiJobId,
  plannedLeadAiJobs,
  type LeadAiJob,
  type StoredLeadForAi,
} from './lead-ai-jobs';

const ref = { leadId: 'lead-1', tenantId: 'tenant-1', correlationId: 'corr-1' };

const stored: StoredLeadForAi = {
  email: 'Ada@Example.invalid',
  source: 'WEBSITE',
  firstName: 'Ada',
  lastName: null,
  company: 'Analytical Engines',
  title: null,
  phone: null,
  ownerId: 'user-1',
};

const job: LeadAiJob = {
  ...ref,
  lead: {
    email: 'Ada@Example.invalid',
    source: 'WEBSITE',
    firstName: 'Ada',
    company: 'Analytical Engines',
  },
  ownerId: 'user-1',
};

/** BullMQ 5's own rule for a custom job id (classes/job.js): no ':' unless exactly 3 parts. */
function bullmqAcceptsJobId(jobId: string): boolean {
  if (`${Number.parseInt(jobId, 10)}` === jobId) return false;
  return !jobId.includes(':') || jobId.split(':').length === 3;
}

describe('leadAiJobFromStoredLead', () => {
  it('turns stored nulls into absent fields, so its hash matches an in-app job', () => {
    const fromRow = leadAiJobFromStoredLead(ref, stored);

    expect(fromRow).toEqual(job);
    expect(leadAiFingerprint(fromRow)).toBe(leadAiFingerprint(job));
  });

  it('leaves the owner out when the lead has none', () => {
    const fromRow = leadAiJobFromStoredLead(ref, { ...stored, ownerId: null });

    expect(fromRow).not.toHaveProperty('ownerId');
  });

  it('selects exactly the stored fields the planner reads', () => {
    expect(Object.keys(STORED_LEAD_FOR_AI_SELECT).sort()).toEqual(Object.keys(stored).sort());
  });
});

describe('leadAiFingerprint', () => {
  it('ignores email case and surrounding spaces', () => {
    const shouted = { ...job, lead: { ...job.lead, email: '  ADA@EXAMPLE.INVALID ' } };

    expect(leadAiFingerprint(shouted)).toBe(leadAiFingerprint(job));
  });

  it('changes when a field the agents read changes', () => {
    const moved = { ...job, lead: { ...job.lead, company: 'Difference Engines' } };
    const reassigned = { ...job, ownerId: 'user-2' };

    expect(leadAiFingerprint(moved)).not.toBe(leadAiFingerprint(job));
    expect(leadAiFingerprint(reassigned)).not.toBe(leadAiFingerprint(job));
  });

  it('is 16 hex characters', () => {
    expect(leadAiFingerprint(job)).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('plannedLeadAiJobs', () => {
  it('plans scoring, qualification and the next best action for an owned lead', () => {
    const planned = plannedLeadAiJobs(job);

    expect(planned.map((p) => [p.queue, p.name, p.data['predictionType']])).toEqual([
      ['AI_SCORING', 'score-lead', undefined],
      ['AI_PREDICTION', 'predict', 'QUALIFICATION'],
      ['AI_PREDICTION', 'predict', 'NEXT_BEST_ACTION'],
    ]);
  });

  it('skips the next best action without an owner', () => {
    const { ownerId: _owner, ...unowned } = job;

    expect(plannedLeadAiJobs(unowned).map((p) => p.data['predictionType'])).toEqual([
      undefined,
      'QUALIFICATION',
    ]);
  });

  it('gives prediction jobs a top-level tenant and the owner as the context user', () => {
    const nba = plannedLeadAiJobs(job)[2];

    expect(nba?.data).toMatchObject({
      entityType: 'lead',
      entityId: 'lead-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      context: { email: 'Ada@Example.invalid', userId: 'user-1' },
    });
  });

  it('retries predictions, not scoring, and keeps finished jobs for the dedupe window', () => {
    const [score, qualification] = plannedLeadAiJobs(job);

    expect(score?.options.attempts).toBeUndefined();
    expect(qualification?.options).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: LEAD_AI_DEDUPE_DAYS * 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
    });
  });

  it('plans the same BullMQ-safe jobIds for the same lead, from either producer', () => {
    const ids = plannedLeadAiJobs(job).map((p) => p.options.jobId);
    const fromRow = plannedLeadAiJobs(leadAiJobFromStoredLead(ref, stored)).map(
      (p) => p.options.jobId
    );

    expect(fromRow).toEqual(ids);
    expect(ids[0]).toBe(leadAiJobId('SCORE', 'lead-1', leadAiFingerprint(job)));
    expect(ids.every(bullmqAcceptsJobId)).toBe(true);
  });
});
