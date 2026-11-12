/**
 * The lead AI job planner and run claim, shared by the API and the events-worker (AI agents
 * epic, PR 1a). Both producers go through queueLeadAiRun, so a lead is queued once per change of
 * what the agents read, and again when it changes back (A -> B -> A).
 */
import { describe, it, expect, vi } from 'vitest';
import {
  LEAD_AI_DEDUPE_DAYS,
  STORED_LEAD_FOR_AI_SELECT,
  claimLeadAiRun,
  claimStoreFromRedis,
  leadAiClaimKey,
  leadAiFingerprint,
  leadAiJobFromStoredLead,
  leadAiJobId,
  newLeadAiRunId,
  plannedLeadAiJobs,
  queueLeadAiRun,
  releaseLeadAiRun,
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

/**
 * An in-memory stand-in for Redis that runs the two scripts' logic: GET+SET returning whether
 * the value changed, and compare-and-delete. Keyed on the script text it receives.
 */
function memoryStore() {
  const values = new Map<string, string>();
  const ttls = new Map<string, number>();
  const store: LeadAiClaimStore = {
    eval: vi.fn(async (script: string, _numKeys: number, ...args: (string | number)[]) => {
      const [key, value, ttl] = args.map(String);
      if (script.includes("'SET'")) {
        const prev = values.get(key!);
        values.set(key!, value!);
        ttls.set(key!, Number(ttl));
        return prev === value ? 0 : 1;
      }
      if (values.get(key!) === value) {
        values.delete(key!);
        return 1;
      }
      return 0;
    }),
  };
  return { store, values, ttls };
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

  it('retries predictions, not scoring, and keeps finished jobs for a week', () => {
    const [score, qualification] = plannedLeadAiJobs(job, RUN);

    expect(score?.options.attempts).toBeUndefined();
    expect(qualification?.options).toMatchObject({
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * 60 * 60 },
      removeOnFail: { age: 7 * 24 * 60 * 60 },
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

describe('claimLeadAiRun / releaseLeadAiRun', () => {
  it('claims new data, refuses the same data again, and keeps the claim for the dedupe window', async () => {
    const { store, ttls } = memoryStore();

    await expect(claimLeadAiRun(store, job)).resolves.toBe(true);
    await expect(claimLeadAiRun(store, job)).resolves.toBe(false);
    expect(ttls.get(leadAiClaimKey(job))).toBe(LEAD_AI_DEDUPE_DAYS * 24 * 60 * 60);
  });

  it('claims again when the lead changes back: A -> B -> A (codex)', async () => {
    const { store } = memoryStore();
    const b = { ...job, lead: { ...job.lead, company: 'Difference Engines' } };

    await expect(claimLeadAiRun(store, job)).resolves.toBe(true);
    await expect(claimLeadAiRun(store, b)).resolves.toBe(true);
    await expect(claimLeadAiRun(store, job)).resolves.toBe(true);
  });

  it('keys the claim per tenant and lead, outside BullMQ job ids', () => {
    expect(leadAiClaimKey(job)).toBe('lead-ai:last:tenant-1:lead-1');
  });

  it('releases only its own claim, and never throws', async () => {
    const { store, values } = memoryStore();
    const b = { ...job, lead: { ...job.lead, company: 'Difference Engines' } };
    await claimLeadAiRun(store, b);

    await releaseLeadAiRun(store, job); // not the current claim: kept
    expect(values.get(leadAiClaimKey(job))).toBe(leadAiFingerprint(b));

    await releaseLeadAiRun(store, b);
    expect(values.has(leadAiClaimKey(job))).toBe(false);

    const broken: LeadAiClaimStore = { eval: vi.fn().mockRejectedValue(new Error('down')) };
    await expect(releaseLeadAiRun(broken, job)).resolves.toBeUndefined();
  });
});

describe('claimStoreFromRedis', () => {
  it('registers each script once per client and runs it by name, keys first', async () => {
    const defineCommand = vi.fn();
    const runCommand = vi.fn(async () => 1);
    const store = claimStoreFromRedis({ defineCommand, runCommand });

    await claimLeadAiRun(store, job);
    await claimLeadAiRun(store, job);
    await releaseLeadAiRun(store, job);

    // Two scripts (claim, release), each defined once despite three calls.
    expect(defineCommand).toHaveBeenCalledTimes(2);
    const [claimName, claimDef] = defineCommand.mock.calls[0]!;
    expect(claimDef).toMatchObject({ numberOfKeys: 1, lua: expect.stringContaining("'SET'") });
    expect(runCommand).toHaveBeenNthCalledWith(1, claimName, [
      leadAiClaimKey(job),
      leadAiFingerprint(job),
      LEAD_AI_DEDUPE_DAYS * 24 * 60 * 60,
    ]);
    expect(runCommand).toHaveBeenCalledTimes(3);
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
    const { store } = memoryStore();
    const api = deps(store);
    const worker = deps(store);

    await expect(queueLeadAiRun(job, api.deps, 'r1')).resolves.toBe('queued');
    await expect(queueLeadAiRun(leadAiJobFromStoredLead(ref, stored), worker.deps)).resolves.toBe(
      'unchanged'
    );

    expect(api.added).toHaveLength(3);
    expect(worker.added).toHaveLength(0);
  });

  it('keeps adding the other jobs when one fails, then gives the claim back for a retry', async () => {
    const { store } = memoryStore();
    const flaky = deps(store, (p) => p.queue === 'AI_SCORING');

    await expect(queueLeadAiRun(job, flaky.deps, 'r1')).resolves.toBe('partial');
    expect(flaky.added).toHaveLength(2);
    expect(flaky.errors.map((p) => p.queue)).toEqual(['AI_SCORING']);

    const retry = deps(store);
    await expect(queueLeadAiRun(job, retry.deps, 'r2')).resolves.toBe('queued');
    expect(retry.added).toHaveLength(3);
  });

  it('throws when the claim itself fails, and adds nothing', async () => {
    const broken: LeadAiClaimStore = { eval: vi.fn().mockRejectedValue(new Error('down')) };
    const run = deps(broken);

    await expect(queueLeadAiRun(job, run.deps)).rejects.toThrow('down');
    expect(run.added).toHaveLength(0);
  });

  it('gives back a claim that timed out on our side but still ran on the server (codex)', async () => {
    const { store, values } = memoryStore();
    // The swap runs on the server, but the caller's timeout rejects before the reply arrives.
    const slow: LeadAiClaimStore = {
      eval: vi.fn(async (script: string, n: number, ...args: (string | number)[]) => {
        const result = await store.eval(script, n, ...args);
        if (script.includes("'SET'")) throw new Error('enqueue timed out after 5000ms');
        return result;
      }),
    };

    await expect(queueLeadAiRun(job, deps(slow).deps)).rejects.toThrow('timed out');
    expect(values.has(leadAiClaimKey(job))).toBe(false);

    // So the next sync of the same data queues it.
    const retry = deps(store);
    await expect(queueLeadAiRun(job, retry.deps)).resolves.toBe('queued');
  });
});
