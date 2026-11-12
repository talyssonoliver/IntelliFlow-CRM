/**
 * enqueueLeadAi: every lead path (in-app create/update, public booking, COA sync, the portal
 * form, call booking) queues the same AI agents: scoring, qualification and, with an owner,
 * the next best action (PG-203 owner Q8/Q9; owner complaint 2026-11-12, "only the score one
 * runs"). A per-lead claim of the last queued data makes an unchanged re-sync a no-op.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const add = vi.fn();
const on = vi.fn();
// The claim's named Redis commands, routed to the platform's in-memory claim store (same
// semantics as the Lua, which is checked against a real Redis separately).
let claimStore: ReturnType<typeof inMemoryLeadAiClaimStore>;
const claimRun = vi.fn(async (name: string, args: (string | number)[]) => {
  const [key, fingerprint, runId, ttl] = args.map(String) as [string, string, string, string];
  if (name === 'leadAiClaimRun') {
    return (await claimStore.claim(key, fingerprint, runId, Number(ttl))) ?? '';
  }
  await claimStore.complete(key, fingerprint, runId, Number(ttl));
  return 0;
});
const Queue = vi.fn(function (this: Record<string, unknown>, name: string, opts: unknown) {
  this.name = name;
  this.opts = opts;
  this.add = add;
  this.on = on;
  // BullMQ's IRedisClient runs Lua as named commands (defineCommand + runCommand).
  this.client = Promise.resolve({ defineCommand: vi.fn(), runCommand: claimRun });
});

vi.mock('../../../lib/load-bullmq', () => ({ loadBullMQ: vi.fn(async () => ({ Queue })) }));
const { getDefaultConnectionConfig } = vi.hoisted(() => ({
  getDefaultConnectionConfig: vi.fn(() => ({
    host: 'redis.example.invalid',
    port: 6380,
    db: 2,
    tls: true,
  })),
}));
// The job planner is the real one (shared with the events-worker); only Redis settings are stubbed.
vi.mock('@intelliflow/platform/queues', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/platform/queues')>()),
  getDefaultConnectionConfig,
}));

import { loadBullMQ } from '../../../lib/load-bullmq';
import { inMemoryLeadAiClaimStore, plannedLeadAiJobs } from '@intelliflow/platform/queues';

import type * as EnqueueModule from '../lead-scoring-enqueue';

let mod: typeof EnqueueModule;

const input = {
  leadId: 'lead-1',
  tenantId: 'tenant-1',
  lead: {
    email: 'ada@example.invalid',
    source: 'BOOKING',
    firstName: 'Ada',
    lastName: 'Lovelace',
    company: undefined,
    title: undefined,
    phone: undefined,
  },
  correlationId: 'lead-create-lead-1',
};

const allowAll = {
  status: vi.fn(async () => ({ restricted: false, blocksMarketing: false, since: null })),
};

/** BullMQ 5's own rule for a custom job id (classes/job.js): no ':' unless exactly 3 parts. */
function bullmqAcceptsJobId(jobId: string): boolean {
  if (`${Number.parseInt(jobId, 10)}` === jobId) return false;
  return !jobId.includes(':') || jobId.split(':').length === 3;
}

const addsTo = (name: string) => add.mock.calls.filter((c) => c[0] === name);

describe('enqueueLeadAi', () => {
  beforeEach(async () => {
    claimStore = inMemoryLeadAiClaimStore();
    claimRun.mockClear();
    add.mockReset().mockResolvedValue(undefined);
    on.mockReset();
    Queue.mockClear();
    // A fresh module per test: the queues are process-wide by design.
    vi.resetModules();
    mod = await import('../lead-scoring-enqueue.js');
  });

  it('queues scoring and qualification, on the shared worker connection', async () => {
    await mod.enqueueLeadAi(input, allowAll);
    const connection = {
      host: 'redis.example.invalid',
      port: 6380,
      password: undefined,
      db: 2,
      tls: {},
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    };
    expect(Queue).toHaveBeenCalledWith('ai-scoring', { connection });
    expect(Queue).toHaveBeenCalledWith('ai-prediction', { connection });
    expect(add).toHaveBeenCalledWith(
      'score-lead',
      {
        leadId: 'lead-1',
        tenantId: 'tenant-1',
        lead: input.lead,
        correlationId: 'lead-create-lead-1',
        _otelCarrier: expect.any(Object),
      },
      expect.objectContaining({ jobId: expect.stringMatching(/^lead-ai\.SCORE\.lead-1\./) })
    );
    expect(add).toHaveBeenCalledWith(
      'predict',
      {
        entityType: 'lead',
        entityId: 'lead-1',
        predictionType: 'QUALIFICATION',
        // tenantId at the top level: the prediction worker's schema requires it there.
        tenantId: 'tenant-1',
        context: input.lead,
        correlationId: 'lead-create-lead-1',
        _otelCarrier: expect.any(Object),
      },
      expect.objectContaining({
        jobId: expect.stringMatching(/^lead-ai\.QUALIFICATION\.lead-1\./),
        attempts: 3,
      })
    );
    expect(addsTo('predict')).toHaveLength(1);
  });

  it('queues the next best action too when the lead has an owner, as that user', async () => {
    await mod.enqueueLeadAi({ ...input, ownerId: 'owner-1' }, allowAll);
    const nba = addsTo('predict').find(
      (c) => (c[1] as { predictionType: string }).predictionType === 'NEXT_BEST_ACTION'
    );
    // The NBA worker throws without a user (prediction.job requires context.userId).
    expect(nba?.[1]).toMatchObject({ context: { userId: 'owner-1', email: input.lead.email } });
    expect(nba?.[2]).toMatchObject({
      jobId: expect.stringMatching(/^lead-ai\.NEXT_BEST_ACTION\./),
    });
  });

  it('gives every job an id BullMQ accepts, and keeps finished jobs for a week', async () => {
    await mod.enqueueLeadAi({ ...input, ownerId: 'owner-1' }, allowAll);
    expect(add).toHaveBeenCalledTimes(3);
    for (const call of add.mock.calls) {
      const options = call[2] as { jobId: string; removeOnComplete: { age: number } };
      expect(bullmqAcceptsJobId(options.jobId)).toBe(true);
      expect(options.removeOnComplete.age).toBe(7 * 24 * 60 * 60);
    }
  });

  it('queues nothing for an unchanged re-sync, and again when data changes or changes back', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const moved = { ...input, lead: { ...input.lead, company: 'Analytical Engines' } };
    const sameFromCoa = {
      ...input,
      correlationId: 'coa-sync-lead-1',
      // Email case is not a change.
      lead: { ...input.lead, email: 'ADA@example.invalid' },
    };

    await mod.enqueueLeadAi(input, allowAll); // A: queued
    await mod.enqueueLeadAi(sameFromCoa, allowAll); // A again: nothing
    expect(add).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(info.mock.calls)).toContain('unchanged since last queued');

    await mod.enqueueLeadAi(moved, allowAll); // B: queued
    await mod.enqueueLeadAi(input, allowAll); // back to A: queued again (codex)
    expect(add).toHaveBeenCalledTimes(6);
    info.mockRestore();
  });

  it('queues nothing, and says so, when the claim cannot reach Redis', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    claimRun.mockRejectedValueOnce(new Error('redis down'));
    await expect(mod.enqueueLeadAi(input, allowAll)).resolves.toBeUndefined();
    expect(add).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).toContain('Could not queue AI work');
    warn.mockRestore();
  });

  it('adds each job on its own: one failed add does not stop the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    add.mockRejectedValueOnce(new Error('redis down'));
    await mod.enqueueLeadAi({ ...input, ownerId: 'owner-1' }, allowAll);
    expect(add).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).toContain('SCORE');
    // The run stayed open, so the next sync of the same data retries it (same run id).
    add.mockClear();
    await mod.enqueueLeadAi({ ...input, ownerId: 'owner-1' }, allowAll);
    expect(add).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it('reuses one queue per name across calls (codex: no leaked clients)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mod.enqueueLeadAi(input, allowAll);
    await mod.enqueueLeadAi(input, allowAll);
    expect(Queue).toHaveBeenCalledTimes(2);
    // Connection errors are logged by class only, at most once a minute.
    const onError = on.mock.calls[0]![1] as (e: Error) => void;
    warn.mockClear();
    onError(new Error('ECONNREFUSED 127.0.0.1'));
    onError(new Error('ECONNREFUSED 127.0.0.1'));
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls[0])).not.toContain('127.0.0.1');
    warn.mockRestore();
  });

  it('refuses new adds while 50 earlier ones are still unsettled (bounded during an outage)', async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      let release: () => void = () => {};
      const stuck = new Promise<void>((resolve) => {
        release = resolve;
      });
      add.mockReturnValue(stuck);
      // 25 leads x 2 jobs = 50 adds in flight (distinct leads: one lead is queued once).
      const lead = (id: string) => ({ ...input, leadId: id });
      const calls = Array.from({ length: 25 }, (_, i) =>
        mod.enqueueLeadAi(lead(`l${i}`), allowAll)
      );
      await vi.advanceTimersByTimeAsync(20_000);
      await Promise.all(calls);
      expect(add).toHaveBeenCalledTimes(50);
      await mod.enqueueLeadAi(lead('late'), allowAll);
      expect(add).toHaveBeenCalledTimes(50);
      expect(JSON.stringify(warn.mock.calls.at(-1))).toContain('still waiting on Redis');
      release();
      await vi.advanceTimersByTimeAsync(0);
      add.mockResolvedValue(undefined);
      await mod.enqueueLeadAi(lead('after'), allowAll);
      expect(add).toHaveBeenCalledTimes(52);
    } finally {
      warn.mockRestore();
      vi.useRealTimers();
    }
  });

  it('gives up on an add that never settles instead of waiting forever', async () => {
    vi.useFakeTimers();
    try {
      add.mockReturnValueOnce(new Promise(() => {}));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pending = mod.enqueueLeadAi(input, allowAll);
      await vi.advanceTimersByTimeAsync(10_000);
      await expect(pending).resolves.toBeUndefined();
      expect(JSON.stringify(warn.mock.calls[0])).toContain('timed out');
      warn.mockRestore();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never throws: a queue failure is logged without PII and swallowed', async () => {
    add.mockRejectedValue(new Error('redis down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mod.enqueueLeadAi(input, allowAll)).resolves.toBeUndefined();
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain('lead-1');
    expect(logged).not.toContain('ada@example.invalid');
    warn.mockRestore();
  });

  it('swallows a failure to load BullMQ too, and tries again on the next call', async () => {
    vi.mocked(loadBullMQ).mockRejectedValueOnce(new Error('no bullmq'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(mod.enqueueLeadAi(input, allowAll)).resolves.toBeUndefined();
    add.mockClear();
    await mod.enqueueLeadAi(input, allowAll);
    expect(add).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('never queues a person with an active processing restriction (PG-203, owner Q18)', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const restricted = {
      status: vi.fn(async () => ({ restricted: true, blocksMarketing: false, since: new Date() })),
    };
    await mod.enqueueLeadAi(input, restricted);
    expect(restricted.status).toHaveBeenCalledWith('tenant-1', 'ada@example.invalid');
    expect(Queue).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(JSON.stringify(info.mock.calls)).not.toContain('ada@example.invalid');
    info.mockRestore();
  });

  it('does not queue when the restriction check itself fails (fails closed)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    await mod.enqueueLeadAi(input, { status: vi.fn().mockRejectedValue(new Error('db down')) });
    expect(Queue).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('[lead-ai] Restriction check failed; not queuing AI work', {
      leadId: 'lead-1',
      error: 'Error',
    });
    warn.mockRestore();
    info.mockRestore();
  });
});

describe('enqueueLeadAiById', () => {
  beforeEach(async () => {
    claimStore = inMemoryLeadAiClaimStore();
    add.mockReset().mockResolvedValue(undefined);
    Queue.mockClear();
    vi.resetModules();
    mod = await import('../lead-scoring-enqueue.js');
  });

  const stored = {
    email: 'grace@example.invalid',
    source: 'EMAIL',
    firstName: 'Grace',
    lastName: null,
    company: 'Navy',
    title: null,
    phone: null,
    ownerId: 'owner-9',
  };

  it('reads the lead tenant-scoped and queues its AI work from the stored fields', async () => {
    const findFirst = vi.fn(async () => stored);
    await mod.enqueueLeadAiById({ lead: { findFirst } } as never, allowAll, {
      leadId: 'lead-9',
      tenantId: 'tenant-9',
      correlationId: 'coa-sync-lead-9',
    });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'lead-9', tenantId: 'tenant-9' } })
    );
    // Same hash as an in-app update of the same lead: a re-sync of unchanged data is a no-op.
    const expected = plannedLeadAiJobs(
      {
        leadId: 'lead-9',
        tenantId: 'tenant-9',
        correlationId: 'anything',
        ownerId: 'owner-9',
        lead: { email: stored.email, source: stored.source, firstName: 'Grace', company: 'Navy' },
      },
      'run'
    );
    // Ids without their per-run suffix: kind, lead and data hash.
    const withoutRun = (id: string) => id.split('.').slice(0, 4).join('.');
    expect(add.mock.calls.map((c) => withoutRun((c[2] as { jobId: string }).jobId))).toEqual(
      expected.map((j) => withoutRun(j.options.jobId))
    );
  });

  it('queues nothing for a lead it cannot find in that tenant', async () => {
    await mod.enqueueLeadAiById(
      { lead: { findFirst: vi.fn(async () => null) } } as never,
      allowAll,
      {
        leadId: 'lead-x',
        tenantId: 'tenant-9',
        correlationId: 'c',
      }
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('never throws when the read fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(
      mod.enqueueLeadAiById(
        { lead: { findFirst: vi.fn().mockRejectedValue(new Error('db down')) } } as never,
        allowAll,
        { leadId: 'lead-9', tenantId: 'tenant-9', correlationId: 'c' }
      )
    ).resolves.toBeUndefined();
    expect(add).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
