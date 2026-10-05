/**
 * Inbound Router — syncPipelineLead tests (S-0204: COA -> IntelliFlow funnel).
 *
 * Covers:
 *  - 401 without / with wrong bearer
 *  - new email -> lead created with source EMAIL + coa tags, walked NEW -> CONTACTED
 *  - existing website lead (same email) is reused, not duplicated, and gets tags
 *  - NEW -> NEGOTIATING walks CONTACTED, QUALIFIED, NEGOTIATING in order
 *  - forward-only: downgrade is a no-op
 *  - CONVERTED / LOST current status is never moved
 *  - target LOST from CONTACTED
 *  - repeat syncKey is a no-op and makes no status calls
 *  - a refused step surfaces as BAD_REQUEST
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { inboundRouter } from '../inbound.router';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
// Test-only constant; >= 16 chars to satisfy the router's secret check.
const SECRET = ['portal', 'test', 'fixture', 'value'].join('-');

const LEAD_ID = 'lead_pipeline_test_1';
const COA_LEAD_ID = 'coa_lead_42';
const COA_TAGS = ['coa-pipeline', `coa-lead:${COA_LEAD_ID}`];

function buildCtx(authHeader: string | undefined) {
  const h = new Headers();
  if (authHeader !== undefined) h.set('Authorization', authHeader);
  return createTestContext({ req: { headers: h } as unknown as Request });
}

function input(status: string, coaStage = 'CONTACTED') {
  return {
    coaLeadId: COA_LEAD_ID,
    email: 'owner@bakery.example',
    firstName: 'Sam',
    company: 'Bakery Ltd',
    status,
    coaStage,
    stageChangedAt: '2026-10-02T09:00:00.000Z',
  } as never;
}

const createLead = () => mockServices.lead.createLead as ReturnType<typeof vi.fn>;
const changeStatus = () => mockServices.lead.changeLeadStatus as ReturnType<typeof vi.fn>;

function statusCalls(): string[] {
  return changeStatus().mock.calls.map((c) => c[1] as string);
}

/** Existing lead: upsert lookup finds it, then the status read returns `status`. */
function existingLead(status: string, tags: string[] = ['portal-discover']) {
  prismaMock.lead.findFirst
    .mockResolvedValueOnce({ id: LEAD_ID } as never)
    .mockResolvedValueOnce({ id: LEAD_ID, status, tags } as never);
}

describe('inboundRouter — syncPipelineLead', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
    prismaMock.leadActivity.findFirst.mockResolvedValue(null as never);
    prismaMock.leadActivity.create.mockResolvedValue({} as never);
    changeStatus().mockResolvedValue({ isFailure: false, value: {} });
  });

  it('returns 401 without a bearer', async () => {
    const caller = inboundRouter.createCaller(buildCtx(undefined) as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(changeStatus()).not.toHaveBeenCalled();
  });

  it('returns 401 with a wrong bearer', async () => {
    const caller = inboundRouter.createCaller(buildCtx('Bearer nope') as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('creates a new lead with source EMAIL + coa tags and walks NEW -> CONTACTED', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null as never);
    createLead().mockResolvedValueOnce({ isFailure: false, value: { id: { value: LEAD_ID } } });

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));

    expect(result).toEqual({
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      created: true,
      previousStatus: 'NEW',
      status: 'CONTACTED',
      changed: true,
    });
    expect(createLead().mock.calls[0]?.[0]).toMatchObject({
      email: 'owner@bakery.example',
      source: 'EMAIL',
      tags: COA_TAGS,
      ownerId: SYSTEM_USER_ID,
      tenantId: TENANT_ID,
    });
    expect(changeStatus()).toHaveBeenCalledTimes(1);
    expect(changeStatus()).toHaveBeenCalledWith(LEAD_ID, 'CONTACTED', 'System (COA sync)');

    const activity = prismaMock.leadActivity.create.mock.calls[0]?.[0] as {
      data: { type: string; title: string; metadata: Record<string, unknown> };
    };
    expect(activity.data.type).toBe('NOTE');
    expect(activity.data.title).toBe('COA pipeline: CONTACTED → CONTACTED');
    expect(activity.data.metadata).toMatchObject({
      source: 'coa-pipeline-sync',
      coaLeadId: COA_LEAD_ID,
      coaStage: 'CONTACTED',
      status: 'CONTACTED',
      stageChangedAt: '2026-10-02T09:00:00.000Z',
      syncKey: `coa-sync:${COA_LEAD_ID}:CONTACTED:CONTACTED`,
    });
  });

  it('reuses an existing website lead (no second lead) and adds the coa tags', async () => {
    existingLead('NEW');

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));

    expect(createLead()).not.toHaveBeenCalled();
    expect(result).toMatchObject({ leadId: LEAD_ID, created: false, status: 'CONTACTED' });
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('appends tags with a tenant-scoped, de-duplicating UPDATE (not a blind push)', async () => {
    existingLead('NEW');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.syncPipelineLead(input('CONTACTED'));

    // A blind `push` stores a tag twice when two syncs both read it as missing;
    // the merge must be idempotent in the write itself.
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    const call = prismaMock.$executeRaw.mock.calls[0] as unknown as [
      TemplateStringsArray,
      ...unknown[],
    ];
    const sql = call[0].join('?');
    expect(sql).toMatch(/UPDATE "leads"/);
    expect(sql).toMatch(/GROUP BY u\.tag/); // collapses duplicates, order-preserving
    expect(sql).toMatch(/"id" = \? AND "tenantId" = \?/); // scoped by id AND tenant
    expect(call.slice(1)).toEqual([COA_TAGS, LEAD_ID, TENANT_ID]);
  });

  it('does not touch tags that are already present', async () => {
    existingLead('NEW', ['portal-discover', ...COA_TAGS]);
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.syncPipelineLead(input('CONTACTED'));
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('walks NEW -> NEGOTIATING through CONTACTED and QUALIFIED in order', async () => {
    existingLead('NEW');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('NEGOTIATING', 'MEETING'));

    expect(statusCalls()).toEqual(['CONTACTED', 'QUALIFIED', 'NEGOTIATING']);
    expect(result).toMatchObject({
      previousStatus: 'NEW',
      status: 'NEGOTIATING',
      changed: true,
    });
  });

  it('walks UNQUALIFIED -> CONVERTED through the whole ladder', async () => {
    existingLead('UNQUALIFIED');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await caller.syncPipelineLead(input('CONVERTED', 'WON'));
    expect(statusCalls()).toEqual(['CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'CONVERTED']);
  });

  it('never downgrades: current QUALIFIED, target CONTACTED is a no-op', async () => {
    existingLead('QUALIFIED');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));

    expect(changeStatus()).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      previousStatus: 'QUALIFIED',
      status: 'QUALIFIED',
      changed: false,
    });
  });

  it('does not move a CONVERTED lead', async () => {
    existingLead('CONVERTED');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('LOST', 'LOST'));
    expect(changeStatus()).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'CONVERTED', changed: false });
  });

  it('does not resurrect a LOST lead', async () => {
    existingLead('LOST');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('QUALIFIED'));
    expect(changeStatus()).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'LOST', changed: false });
  });

  it('moves CONTACTED -> LOST when COA marks the lead lost', async () => {
    existingLead('CONTACTED');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('LOST', 'LOST'));
    expect(statusCalls()).toEqual(['LOST']);
    expect(result).toMatchObject({ previousStatus: 'CONTACTED', status: 'LOST', changed: true });
  });

  it('repeat of the same syncKey is a no-op and makes no status calls', async () => {
    existingLead('NEW');
    prismaMock.leadActivity.findFirst.mockResolvedValueOnce({ id: 'act_1' } as never);

    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));

    expect(result.changed).toBe(false);
    expect(changeStatus()).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          leadId: LEAD_ID,
          metadata: { path: ['syncKey'], equals: `coa-sync:${COA_LEAD_ID}:CONTACTED:CONTACTED` },
        }),
      })
    );
  });

  it('surfaces a refused status step as BAD_REQUEST and writes no audit note', async () => {
    existingLead('NEW');
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Invalid status transition' },
    });
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
      message: 'Invalid status transition',
    });
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('audit note failure is logged, not thrown', async () => {
    existingLead('NEW');
    prismaMock.leadActivity.create.mockRejectedValueOnce(new Error('db down') as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));
    expect(result.changed).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('matches a stored lead whatever the casing COA sends (emails are stored lowercased)', async () => {
    existingLead('NEW');
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead({
      ...(input('CONTACTED') as object),
      email: 'Owner@Bakery.EXAMPLE',
    } as never);
    expect(result.leadId).toBe(LEAD_ID);
    expect(createLead()).not.toHaveBeenCalled();
    const lookup = prismaMock.lead.findFirst.mock.calls[0]?.[0] as { where: { email: string } };
    expect(lookup.where.email).toBe('owner@bakery.example');
  });

  it('treats a step refused because a concurrent sync already moved the lead as a no-op', async () => {
    existingLead('NEW');
    // The concurrent request got there first: the re-read shows CONTACTED.
    prismaMock.lead.findFirst.mockResolvedValueOnce({ status: 'CONTACTED' } as never);
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Invalid status transition from CONTACTED to CONTACTED' },
    });
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));
    expect(result).toMatchObject({ leadId: LEAD_ID, status: 'CONTACTED', changed: false });
  });

  it('still writes this request audit note and syncKey when another writer moved the lead', async () => {
    existingLead('NEW');
    prismaMock.lead.findFirst.mockResolvedValueOnce({ status: 'CONTACTED' } as never);
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { message: 'Invalid status transition from CONTACTED to CONTACTED' },
    });
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('CONTACTED'));
    expect(result.changed).toBe(false);
    expect(prismaMock.leadActivity.create).toHaveBeenCalledTimes(1);
    const data = (
      prismaMock.leadActivity.create.mock.calls[0]?.[0] as unknown as {
        data: { metadata: { syncKey: string }; description: string };
      }
    ).data;
    expect(data.metadata.syncKey).toBe(`coa-sync:${COA_LEAD_ID}:CONTACTED:CONTACTED`);
    expect(data.description).toContain('NEW → CONTACTED');
  });

  it('maps a PersistenceError the re-read cannot explain to INTERNAL_SERVER_ERROR', async () => {
    existingLead('NEW');
    prismaMock.lead.findFirst.mockResolvedValueOnce({ status: 'NEW' } as never);
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { code: 'PERSISTENCE_ERROR', message: 'Failed to save lead' },
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('keeps BAD_REQUEST for a validation refusal the re-read cannot explain', async () => {
    existingLead('NEW');
    prismaMock.lead.findFirst.mockResolvedValueOnce({ status: 'NEW' } as never);
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { code: 'VALIDATION_ERROR', message: 'Invalid status transition' },
    });
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('maps a throwing re-read to INTERNAL_SERVER_ERROR and logs the cause', async () => {
    existingLead('NEW');
    prismaMock.lead.findFirst.mockRejectedValueOnce(new Error('connection reset') as never);
    changeStatus().mockResolvedValueOnce({
      isFailure: true,
      error: { code: 'PERSISTENCE_ERROR', message: 'Failed to save lead' },
    });
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    await expect(caller.syncPipelineLead(input('CONTACTED'))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('re-read failed'),
      expect.objectContaining({ error: 'connection reset' })
    );
    logged.mockRestore();
  });
  it('replans when a concurrent sync moved the lead part of the way, then finishes the walk', async () => {
    existingLead('NEW');
    // Planned NEW -> CONTACTED -> QUALIFIED; a concurrent sync took it to CONTACTED.
    prismaMock.lead.findFirst.mockResolvedValueOnce({ status: 'CONTACTED' } as never);
    changeStatus()
      .mockResolvedValueOnce({ isFailure: true, error: { message: 'Invalid status transition' } })
      .mockResolvedValueOnce({ isFailure: false, value: {} });
    const caller = inboundRouter.createCaller(buildCtx(`Bearer ${SECRET}`) as never);
    const result = await caller.syncPipelineLead(input('QUALIFIED', 'RESPONDED'));
    expect(result).toMatchObject({ status: 'QUALIFIED', changed: true });
    expect(statusCalls()).toEqual(['CONTACTED', 'QUALIFIED']);
    expect(prismaMock.leadActivity.create).toHaveBeenCalledTimes(1);
  });
});
