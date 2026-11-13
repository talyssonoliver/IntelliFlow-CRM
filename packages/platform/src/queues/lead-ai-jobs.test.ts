/**
 * The lead AI job planner and run claim, shared by the API and the events-worker (AI agents
 * epic, PR 1a). Both producers go through queueLeadAiRun, so a lead is queued once per change of
 * what the agents read, and again when it changes back (A -> B -> A).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  STORED_LEAD_FOR_AI_SELECT,
  claimLeadAiRun,
  claimStoreFromRedis,
  inMemoryLeadAiClaimStore,
  leadAiClaimKey,
  leadAiFingerprint,
  leadAiJobFromStoredLead,
  leadAiJobId,
  newLeadAiRunId,
  plannedLeadAiJobs,
  queueLeadAiRun,
  type LeadAiClaimStore,
  type LeadAiJob,
  type PlannedLeadAiJob,
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

const RUN = 'run1';

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
    expect(leadAiJobFromStoredLead(ref, { ...stored, ownerId: null })).not.toHaveProperty(
      'ownerId'
    );
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
    const planned = plannedLeadAiJobs(job, RUN);

    expect(planned.map((p) => [p.queue, p.name, p.data['predictionType']])).toEqual([
      ['AI_SCORING', 'score-lead', undefined],
      ['AI_PREDICTION', 'predict', 'QUALIFICATION'],
      ['AI_PREDICTION', 'predict', 'NEXT_BEST_ACTION'],
    ]);
  });

  it('skips the next best action without an owner', () => {
    const { ownerId: _owner, ...unowned } = job;

    expect(plannedLeadAiJobs(unowned, RUN).map((p) => p.data['predictionType'])).toEqual([
      undefined,
      'QUALIFICATION',
    ]);
  });

  it('gives prediction jobs a top-level tenant and the owner as the context user', () => {
    expect(plannedLeadAiJobs(job, RUN)[2]?.data).toMatchObject({
      entityType: 'lead',
      entityId: 'lead-1',
      tenantId: 'tenant-1',
      correlationId: 'corr-1',
      context: { email: 'Ada@Example.invalid', userId: 'user-1' },
    });
  });

  it('retries predictions, not scoring, and keeps finished jobs as long as a run can stay open', () => {
    const [score, qualification] = plannedLeadAiJobs(job, RUN);

    expect(score?.options.attempts).toBeUndefined();
    expect(qualification?.options).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 30 * 24 * 60 * 60 },
      removeOnFail: { age: 30 * 24 * 60 * 60 },
    });
  });

  it('gives each run its own BullMQ-safe ids, so an earlier run never blocks a later one', () => {
    const first = plannedLeadAiJobs(job, 'a1').map((p) => p.options.jobId);
    const second = plannedLeadAiJobs(job, 'b2').map((p) => p.options.jobId);

    expect(first[0]).toBe(leadAiJobId('SCORE', 'lead-1', leadAiFingerprint(job), 'a1'));
    expect(second.some((id) => first.includes(id))).toBe(false);
    expect([...first, ...second].every(bullmqAcceptsJobId)).toBe(true);
  });

  it('makes run ids from the time, in base 36', () => {
    expect(newLeadAiRunId(new Date(36))).toBe('10');
  });
});

describe('claimLeadAiRun', () => {
  it('claims new data under a fresh run id, then refuses it once the run is done', async () => {
    const store = inMemoryLeadAiClaimStore();

    await expect(claimLeadAiRun(store, job, 'r1')).resolves.toBe('r1');
    await store.complete(leadAiClaimKey(job), leadAiFingerprint(job), 'r1', 60);
    await expect(claimLeadAiRun(store, job, 'r2')).resolves.toBeNull();
  });

  it('hands back the same run id while that data is still open (retry, or the other producer)', async () => {
    const store = inMemoryLeadAiClaimStore();

    await expect(claimLeadAiRun(store, job, 'r1')).resolves.toBe('r1');
    await expect(claimLeadAiRun(store, job, 'r2')).resolves.toBe('r1');
  });

  it('claims again when the lead changes back: A -> B -> A (codex)', async () => {
    const store = inMemoryLeadAiClaimStore();
    const b = { ...job, lead: { ...job.lead, company: 'Difference Engines' } };

    await claimLeadAiRun(store, job, 'r1');
    await store.complete(leadAiClaimKey(job), leadAiFingerprint(job), 'r1', 60);
    await expect(claimLeadAiRun(store, b, 'r2')).resolves.toBe('r2');
    await store.complete(leadAiClaimKey(b), leadAiFingerprint(b), 'r2', 60);
    await expect(claimLeadAiRun(store, job, 'r3')).resolves.toBe('r3');
  });

  it('keys the claim per tenant and lead, outside BullMQ job ids', () => {
    expect(leadAiClaimKey(job)).toBe('lead-ai:last:tenant-1:lead-1');
  });

  it('does not let an old run complete over a newer claim', async () => {
    const store = inMemoryLeadAiClaimStore();
    const b = { ...job, lead: { ...job.lead, company: 'Difference Engines' } };
    await claimLeadAiRun(store, job, 'r1');
    await claimLeadAiRun(store, b, 'r2');

    await store.complete(leadAiClaimKey(job), leadAiFingerprint(job), 'r1', 60);

    expect(store.peek(leadAiClaimKey(job))).toBe(`${leadAiFingerprint(b)}|r2|open`);
  });
});

describe('claimStoreFromRedis', () => {
  it('runs the claim and complete scripts as named commands, each defined once per client', async () => {
    const defineCommand = vi.fn();
    const runCommand = vi.fn(async (name: string) => (name === 'leadAiClaimRun' ? 'r1' : 0));
    const store = claimStoreFromRedis({ defineCommand, runCommand });

    await expect(store.claim('k', 'fp', 'r1', 60)).resolves.toBe('r1');
    await store.claim('k', 'fp', 'r2', 60);
    await store.complete('k', 'fp', 'r1', 60);

    expect(defineCommand.mock.calls.map((c) => c[0])).toEqual([
      'leadAiClaimRun',
      'leadAiCompleteRun',
    ]);
    expect(defineCommand.mock.calls[0]![1]).toMatchObject({
      numberOfKeys: 1,
      lua: expect.stringContaining("'|open'"),
    });
    expect(runCommand).toHaveBeenNthCalledWith(1, 'leadAiClaimRun', ['k', 'fp', 'r1', 60]);
    expect(runCommand).toHaveBeenLastCalledWith('leadAiCompleteRun', ['k', 'fp', 'r1', 60]);
  });

  it('reads an empty script result as "already done"', async () => {
    const store = claimStoreFromRedis({
      defineCommand: vi.fn(),
      runCommand: vi.fn(async () => ''),
    });

    await expect(store.claim('k', 'fp', 'r1', 60)).resolves.toBeNull();
  });
});

describe('queueLeadAiRun', () => {
  function deps(store: LeadAiClaimStore, fail?: (p: PlannedLeadAiJob) => boolean) {
    const added: PlannedLeadAiJob[] = [];
    const errors: PlannedLeadAiJob[] = [];
    return {
      added,
      errors,
      deps: {
        store,
        addJob: vi.fn(async (planned: PlannedLeadAiJob) => {
          if (fail?.(planned)) throw new Error('redis down');
          added.push(planned);
        }),
        onAddError: vi.fn((planned: PlannedLeadAiJob) => {
          errors.push(planned);
        }),
      },
    };
  }

  it('queues every job for new data, then nothing for the same data from the other producer', async () => {
    const store = inMemoryLeadAiClaimStore();
    const api = deps(store);
    const worker = deps(store);

    await expect(queueLeadAiRun(job, api.deps, 'r1')).resolves.toBe('queued');
    await expect(
      queueLeadAiRun(leadAiJobFromStoredLead(ref, stored), worker.deps, 'r2')
    ).resolves.toBe('unchanged');

    expect(api.added).toHaveLength(3);
    expect(worker.added).toHaveLength(0);
  });

  it('retries a partial run under the same run id, so landed jobs are deduped by their ids', async () => {
    const store = inMemoryLeadAiClaimStore();
    const flaky = deps(store, (p) => p.queue === 'AI_SCORING');

    await expect(queueLeadAiRun(job, flaky.deps, 'r1')).resolves.toBe('partial');
    expect(flaky.added).toHaveLength(2);
    expect(flaky.errors.map((p) => p.queue)).toEqual(['AI_SCORING']);

    const retry = deps(store);
    await expect(queueLeadAiRun(job, retry.deps, 'r2')).resolves.toBe('queued');
    // Same ids as the first attempt: BullMQ ignores the two that already landed.
    expect(retry.added.map((p) => p.options.jobId)).toEqual(
      plannedLeadAiJobs(job, 'r1').map((p) => p.options.jobId)
    );

    const again = deps(store);
    await expect(queueLeadAiRun(job, again.deps, 'r3')).resolves.toBe('unchanged');
  });

  it('retries, under the same run id, a claim that timed out on our side but landed (codex)', async () => {
    const store = inMemoryLeadAiClaimStore();
    // The claim lands on the server, but the caller's timeout rejects before the reply arrives.
    const slow: LeadAiClaimStore = {
      claim: vi.fn(async (...args: Parameters<LeadAiClaimStore['claim']>) => {
        await store.claim(...args);
        throw new Error('enqueue timed out after 5000ms');
      }),
      complete: store.complete,
    };

    await expect(queueLeadAiRun(job, deps(slow).deps, 'r1')).rejects.toThrow('timed out');

    const retry = deps(store);
    await expect(queueLeadAiRun(job, retry.deps, 'r2')).resolves.toBe('queued');
    expect(retry.added[0]?.options.jobId).toBe(plannedLeadAiJobs(job, 'r1')[0]?.options.jobId);
  });

  it('throws when the claim itself fails, and adds nothing', async () => {
    const broken: LeadAiClaimStore = {
      claim: vi.fn().mockRejectedValue(new Error('down')),
      complete: vi.fn(),
    };
    const run = deps(broken);

    await expect(queueLeadAiRun(job, run.deps)).rejects.toThrow('down');
    expect(run.added).toHaveLength(0);
  });
});
