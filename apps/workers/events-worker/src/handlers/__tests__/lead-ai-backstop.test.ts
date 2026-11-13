/**
 * lead.created backstop (AI agents epic, PR 1a): queues the same jobs as the API's own enqueue,
 * through the same per-lead claim, so it is a no-op when the API's enqueue went through.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  claimLeadAiRun,
  inMemoryLeadAiClaimStore,
  leadAiClaimKey,
  leadAiFingerprint,
  leadAiJobFromStoredLead,
  plannedLeadAiJobs,
  type LeadAiClaimStore,
  type PlannedLeadAiJob,
  type StoredLeadForAi,
} from '@intelliflow/platform';
import { queueLeadAiForCreatedLead, type LeadAiBackstopDeps } from '../lead-ai-backstop';

const stored: StoredLeadForAi = {
  email: 'ada@example.invalid',
  source: 'WEBSITE',
  firstName: 'Ada',
  lastName: 'Lovelace',
  company: null,
  title: null,
  phone: null,
  ownerId: 'user-1',
};

function event(metadata: { tenantId?: string } = { tenantId: 'tenant-1' }, payload = {}) {
  return {
    aggregateId: 'lead-1',
    payload: { email: 'ada@example.invalid', source: 'WEBSITE', ...payload },
    metadata: {
      correlationId: 'corr-1',
      timestamp: '2026-11-12T00:00:00.000Z',
      version: '1',
      ...metadata,
    },
  };
}

function deps(
  overrides: Partial<LeadAiBackstopDeps> = {},
  store: LeadAiClaimStore = inMemoryLeadAiClaimStore()
) {
  const added: PlannedLeadAiJob[] = [];
  const logger = { info: vi.fn(), warn: vi.fn() };
  const all: LeadAiBackstopDeps = {
    readLead: vi.fn(async () => stored),
    addJob: vi.fn(async (planned: PlannedLeadAiJob) => {
      added.push(planned);
    }),
    claimStore: vi.fn(async () => store),
    logger,
    ...overrides,
  };
  return { all, added, logger, store };
}

/** Ids without their per-run suffix: kind, lead and data hash. */
const withoutRun = (id: string) => id.split('.').slice(0, 4).join('.');

describe('queueLeadAiForCreatedLead', () => {
  it('queues what the API plans for the same stored lead', async () => {
    const { all, added } = deps();

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('queued');

    const apiPlan = plannedLeadAiJobs(
      leadAiJobFromStoredLead(
        { leadId: 'lead-1', tenantId: 'tenant-1', correlationId: 'corr-1' },
        stored
      ),
      'run'
    );
    expect(added.map((p) => withoutRun(p.options.jobId))).toEqual(
      apiPlan.map((p) => withoutRun(p.options.jobId))
    );
    expect(added.map((p) => p.data['predictionType'])).toEqual([
      undefined,
      'QUALIFICATION',
      'NEXT_BEST_ACTION',
    ]);
    expect(all.readLead).toHaveBeenCalledWith('lead-1', 'tenant-1');
  });

  it('takes the tenant from the payload when the metadata has none', async () => {
    const { all } = deps();

    await queueLeadAiForCreatedLead(event({}, { tenantId: 'tenant-2' }), all);

    expect(all.readLead).toHaveBeenCalledWith('lead-1', 'tenant-2');
  });

  it('reads nothing and queues nothing without a tenant', async () => {
    const { all, added, logger } = deps();

    await expect(queueLeadAiForCreatedLead(event({}), all)).resolves.toBe('no-tenant');

    expect(all.readLead).not.toHaveBeenCalled();
    expect(added).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('queues nothing for a lead that no longer exists', async () => {
    const { all, added } = deps({ readLead: vi.fn(async () => null) });

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('lead-missing');
    expect(added).toHaveLength(0);
  });

  it('does not throw when the lead cannot be read', async () => {
    const { all, added } = deps({
      readLead: vi.fn(async () => {
        throw new Error('db down');
      }),
    });

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('read-failed');
    expect(added).toHaveLength(0);
  });

  it('keeps adding the other jobs when one add fails, and logs no personal data', async () => {
    const added: string[] = [];
    const { all, logger } = deps({
      addJob: vi.fn(async (planned: PlannedLeadAiJob) => {
        if (planned.queue === 'AI_SCORING') throw new Error('redis down');
        added.push(planned.options.jobId);
      }),
    });

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('partial');

    expect(added).toHaveLength(2);
    const logged = JSON.stringify(logger.warn.mock.calls);
    expect(logged).toContain('SCORE');
    expect(logged).not.toContain('ada@example.invalid');
    expect(logged).not.toContain('Lovelace');
  });

  it('plans no next best action for a lead without an owner', async () => {
    const { all, added } = deps({ readLead: vi.fn(async () => ({ ...stored, ownerId: null })) });

    await queueLeadAiForCreatedLead(event(), all);

    expect(added.map((p) => p.data['predictionType'])).toEqual([undefined, 'QUALIFICATION']);
  });

  it('adds nothing when the API already queued this exact data', async () => {
    const store = inMemoryLeadAiClaimStore();
    const apiJob = leadAiJobFromStoredLead(
      { leadId: 'lead-1', tenantId: 'tenant-1', correlationId: 'lead-create-lead-1' },
      stored
    );
    // What the API's enqueue did: claimed and queued this data in full.
    const runId = await claimLeadAiRun(store, apiJob, 'api-run');
    await store.complete(leadAiClaimKey(apiJob), leadAiFingerprint(apiJob), runId!, 60);
    const { all, added } = deps({}, store);

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('unchanged');
    expect(added).toHaveLength(0);
  });

  it('adds nothing and does not throw when the claim cannot reach Redis', async () => {
    const broken: LeadAiClaimStore = {
      claim: vi.fn().mockRejectedValue(new Error('down')),
      complete: vi.fn(),
    };
    const { all, added, logger } = deps({}, broken);

    await expect(queueLeadAiForCreatedLead(event(), all)).resolves.toBe('claim-failed');
    expect(added).toHaveLength(0);
    expect(JSON.stringify(logger.warn.mock.calls)).toContain('could not claim');
  });
});
