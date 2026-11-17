/**
 * Inbound Router — syncPipelineLead records the lead's last contact (MVP-010).
 *
 * The sync walked a lead to CONTACTED but never set lastContactedAt, so the dashboard's follow-ups
 * card read every synced lead as "Never contacted". The sync now dates the contact: COA's own
 * lastContactedAt when it sends one, else stageChangedAt for a stage that is itself a contact
 * (CONTACTED, or a reply). The write is tenant-scoped and forward-only.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// The lead AI enqueue is detached and reads the lead itself; it must not consume these mocks.
vi.mock('../../lead/lead-scoring-enqueue', () => ({
  enqueueLeadAiById: vi.fn(async () => undefined),
}));

import { inboundPipelineLeadSchema, inboundRouter } from '../inbound.router';
import { applyLastContact, isCoaReplyStage, lastContactTime } from '../pipeline-last-contact';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
// Test-only constant; >= 16 chars to satisfy the router's secret check.
const SECRET = ['portal', 'test', 'fixture', 'value'].join('-');

const LEAD_ID = 'lead_last_contact_1';
const SENT = '2026-11-03T09:30:00.000Z';
const NOW = new Date('2026-11-17T12:00:00.000Z');

const base = {
  coaLeadId: 'coa_lead_9',
  coaStage: 'CONTACTED',
  status: 'CONTACTED',
  stageChangedAt: SENT,
};

describe('isCoaReplyStage', () => {
  it('is true for the reply stages, in any case and with stray spaces', () => {
    for (const stage of ['RESPONDED', 'MEETING_BOOKED', 'WON', ' responded ']) {
      expect(isCoaReplyStage(stage)).toBe(true);
    }
  });

  it('is false for stages that can come before any contact', () => {
    for (const stage of ['CONTACTED', 'QUALIFIED', 'PROPOSAL_READY', 'AUDITED']) {
      expect(isCoaReplyStage(stage)).toBe(false);
    }
  });
});

describe('lastContactTime', () => {
  it('dates a CONTACTED lead by when it entered the stage (its first send)', () => {
    expect(lastContactTime(base, NOW)?.toISOString()).toBe(SENT);
  });

  it('dates a replied lead by the reply', () => {
    for (const coaStage of ['RESPONDED', 'MEETING_BOOKED', 'WON']) {
      expect(lastContactTime({ ...base, coaStage, status: 'QUALIFIED' }, NOW)?.toISOString()).toBe(
        SENT
      );
    }
  });

  it('says nothing for a stage that is not itself a contact', () => {
    for (const coaStage of ['PROPOSAL_READY', 'QUALIFIED', 'AUDITED', 'CONTACT_FOUND']) {
      expect(lastContactTime({ ...base, coaStage, status: 'NEGOTIATING' }, NOW)).toBeNull();
    }
  });

  it('says nothing for a lost lead: COA loses leads without contacting them', () => {
    expect(lastContactTime({ ...base, status: 'LOST' }, NOW)).toBeNull();
  });

  it('uses the time COA sends as its latest contact, even for a non-contact stage or a lost lead', () => {
    const sent = '2026-11-12T08:00:00.000Z';
    expect(lastContactTime({ ...base, lastContactedAt: sent }, NOW)?.toISOString()).toBe(sent);
    expect(
      lastContactTime({ ...base, coaStage: 'PROPOSAL_READY', lastContactedAt: sent }, NOW)
    ).toEqual(new Date(sent));
    expect(lastContactTime({ ...base, status: 'LOST', lastContactedAt: sent }, NOW)).toEqual(
      new Date(sent)
    );
  });

  it('ignores a time in the future (the write is forward-only, so a bad one would stick)', () => {
    const future = new Date(NOW.getTime() + 24 * 3600 * 1000).toISOString();
    // COA's own time is dropped, and the stage date is used instead.
    expect(lastContactTime({ ...base, lastContactedAt: future }, NOW)?.toISOString()).toBe(SENT);
    expect(lastContactTime({ ...base, stageChangedAt: future }, NOW)).toBeNull();
  });

  it('allows a few minutes of clock difference', () => {
    const soon = new Date(NOW.getTime() + 60 * 1000).toISOString();
    expect(lastContactTime({ ...base, lastContactedAt: soon }, NOW)?.toISOString()).toBe(soon);
  });

  it('ignores a value that is not a date', () => {
    expect(lastContactTime({ ...base, stageChangedAt: 'not a date' }, NOW)).toBeNull();
    expect(
      lastContactTime(
        { ...base, lastContactedAt: 'nope', stageChangedAt: SENT },
        NOW
      )?.toISOString()
    ).toBe(SENT);
  });
});

describe('applyLastContact', () => {
  const prisma = () => ({ lead: { updateMany: vi.fn(async () => ({ count: 1 })) } });

  it("fills a NULL and replaces an older time, in the lead's tenant, never a later one", async () => {
    const p = prisma();
    await applyLastContact(p as never, base, LEAD_ID, TENANT_ID, NOW);
    expect(p.lead.updateMany).toHaveBeenCalledWith({
      where: {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(SENT) } }],
      },
      data: { lastContactedAt: new Date(SENT) },
    });
  });

  it('writes nothing when the sync carries no contact', async () => {
    const p = prisma();
    await applyLastContact(
      p as never,
      { ...base, coaStage: 'PROPOSAL_READY' },
      LEAD_ID,
      TENANT_ID,
      NOW
    );
    expect(p.lead.updateMany).not.toHaveBeenCalled();
  });

  it('logs and carries on when the write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const p = {
      lead: { updateMany: vi.fn(async () => Promise.reject(new Error('connection reset'))) },
    };
    await expect(
      applyLastContact(p as never, base, LEAD_ID, TENANT_ID, NOW)
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      '[inbound.syncPipelineLead] last contact write failed:',
      expect.objectContaining({ leadId: LEAD_ID, error: 'connection reset' })
    );
    error.mockRestore();
  });
});

describe('inboundPipelineLeadSchema — lastContactedAt', () => {
  const valid = {
    coaLeadId: 'c1',
    email: 'owner@bakery.example',
    status: 'CONTACTED',
    coaStage: 'CONTACTED',
    stageChangedAt: SENT,
  };

  it('is optional', () => {
    expect(inboundPipelineLeadSchema.safeParse(valid).success).toBe(true);
  });

  it('takes an ISO date time and rejects anything else', () => {
    expect(inboundPipelineLeadSchema.safeParse({ ...valid, lastContactedAt: SENT }).success).toBe(
      true
    );
    expect(
      inboundPipelineLeadSchema.safeParse({ ...valid, lastContactedAt: 'yesterday' }).success
    ).toBe(false);
  });
});

describe('inboundRouter.syncPipelineLead — last contact', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
    prismaMock.leadActivity.findFirst.mockResolvedValue(null as never);
    prismaMock.leadActivity.create.mockResolvedValue({} as never);
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prismaMock)) as never);
    (mockServices.lead.changeLeadStatus as ReturnType<typeof vi.fn>).mockResolvedValue({
      isFailure: false,
      value: {},
    });
    (mockServices.lead.qualifyLead as ReturnType<typeof vi.fn>).mockResolvedValue({
      isFailure: false,
      value: {},
    });
  });

  function caller() {
    const h = new Headers();
    h.set('Authorization', `Bearer ${SECRET}`);
    return inboundRouter.createCaller(
      createTestContext({ req: { headers: h } as unknown as Request }) as never
    );
  }

  function payload(extra: Record<string, unknown> = {}) {
    return {
      coaLeadId: 'coa_lead_9',
      email: 'owner@bakery.example',
      company: 'Rise Bakery',
      status: 'CONTACTED',
      coaStage: 'CONTACTED',
      stageChangedAt: SENT,
      ...extra,
    } as never;
  }

  function existingLead(status = 'NEW') {
    prismaMock.lead.findFirst
      .mockResolvedValueOnce({ id: LEAD_ID, company: 'Rise Bakery' } as never)
      .mockResolvedValueOnce({ id: LEAD_ID, status, tags: ['coa-pipeline'] } as never);
  }

  const lastContactWrites = () =>
    prismaMock.lead.updateMany.mock.calls.filter(
      (c) => (c[0] as { data: Record<string, unknown> }).data.lastContactedAt !== undefined
    );

  it('dates an existing lead moved to CONTACTED by its first send', async () => {
    existingLead('NEW');

    await caller().syncPipelineLead(payload());

    expect(lastContactWrites()).toHaveLength(1);
    expect(lastContactWrites()[0]?.[0]).toEqual({
      where: {
        id: LEAD_ID,
        tenantId: TENANT_ID,
        OR: [{ lastContactedAt: null }, { lastContactedAt: { lt: new Date(SENT) } }],
      },
      data: { lastContactedAt: new Date(SENT) },
    });
  });

  it('dates a newly created lead too', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null as never);
    (mockServices.lead.createLead as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      isFailure: false,
      value: { id: { value: LEAD_ID } },
    });

    await caller().syncPipelineLead(payload());

    expect(lastContactWrites()).toHaveLength(1);
    expect((lastContactWrites()[0]?.[0] as { where: { id: string } }).where.id).toBe(LEAD_ID);
  });

  it('uses the latest send COA reports instead of the stage date', async () => {
    existingLead('CONTACTED');
    const latest = '2026-11-12T08:00:00.000Z';

    await caller().syncPipelineLead(payload({ lastContactedAt: latest }));

    expect((lastContactWrites()[0]?.[0] as { data: { lastContactedAt: Date } }).data).toEqual({
      lastContactedAt: new Date(latest),
    });
  });

  it('writes no contact for a stage that is not one', async () => {
    existingLead('CONTACTED');

    await caller().syncPipelineLead(payload({ coaStage: 'PROPOSAL_READY', status: 'NEGOTIATING' }));

    expect(lastContactWrites()).toHaveLength(0);
  });

  it('still dates the lead on a repeat sync, which is what makes a backfill a re-sync', async () => {
    existingLead('CONTACTED');
    prismaMock.leadActivity.findFirst.mockResolvedValueOnce({
      id: 'act_prior',
      metadata: {},
    } as never);

    const result = await caller().syncPipelineLead(payload());

    expect(result.changed).toBe(false);
    expect(lastContactWrites()).toHaveLength(1);
  });

  it('writes nothing on a dry run', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({ id: LEAD_ID, status: 'NEW' } as never);

    await caller().syncPipelineLead(payload({ dryRun: true }));

    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
  });

  it('does not fail the sync when the contact write fails', async () => {
    existingLead('NEW');
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.lead.updateMany.mockRejectedValueOnce(new Error('connection reset'));

    const result = await caller().syncPipelineLead(payload());

    expect(result.leadId).toBe(LEAD_ID);
    expect(result.status).toBe('CONTACTED');
    error.mockRestore();
  });
});
