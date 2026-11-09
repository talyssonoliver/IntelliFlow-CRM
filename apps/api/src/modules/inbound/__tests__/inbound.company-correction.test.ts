/**
 * Inbound Router — syncPipelineLead trading-name correction (owner ruling 2026-11-09).
 *
 * COA used to send the Google listing name as `company`; it now sends the trading name
 * and the listing name beside it. An EXISTING lead's company is corrected only when:
 *  - the request opts in with `applyCompany: true` (the scheduled sync never does), and
 *  - the stored company is still exactly the listing name (a user edit is never overwritten),
 * and the write is a tenant-scoped compare-and-set. `dryRun` writes nothing at all.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { inboundRouter, planCompanyChange } from '../inbound.router';
import { createTestContext, prismaMock, mockServices } from '../../../test/setup';

const TENANT_ID = '00000000-0000-4000-8000-000000000900';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000901';
// Test-only constant; >= 16 chars to satisfy the router's secret check.
const SECRET = ['portal', 'test', 'fixture', 'value'].join('-');

const LEAD_ID = 'lead_company_fix_1';
const LISTING = 'Bakery Ltd - Coffee & Cakes';
const TRADING = 'Rise Bakery';

function caller() {
  const h = new Headers();
  h.set('Authorization', `Bearer ${SECRET}`);
  return inboundRouter.createCaller(
    createTestContext({ req: { headers: h } as unknown as Request }) as never
  );
}

function payload(extra: Record<string, unknown> = {}) {
  return {
    coaLeadId: 'coa_lead_77',
    email: 'Owner@Bakery.example',
    firstName: 'Sam',
    company: TRADING,
    listingName: LISTING,
    companySource: 'listing+domain',
    companyFlagged: false,
    status: 'CONTACTED',
    coaStage: 'CONTACTED',
    stageChangedAt: '2026-11-01T09:00:00.000Z',
    ...extra,
  } as never;
}

/** Existing lead: the upsert lookup returns its company, then the status/tag read. */
function existingLead(company: string | null, status = 'CONTACTED') {
  prismaMock.lead.findFirst
    .mockResolvedValueOnce({ id: LEAD_ID, company } as never)
    .mockResolvedValueOnce({ id: LEAD_ID, status, tags: ['coa-pipeline'] } as never);
}

const createLead = () => mockServices.lead.createLead as ReturnType<typeof vi.fn>;
const changeStatus = () => mockServices.lead.changeLeadStatus as ReturnType<typeof vi.fn>;
const qualify = () => mockServices.lead.qualifyLead as ReturnType<typeof vi.fn>;

/** Metadata of the sync's audit NOTE (the first leadActivity.create). */
function noteMetadata(index = 0) {
  const call = prismaMock.leadActivity.create.mock.calls[index]?.[0] as
    | { data: { metadata: Record<string, unknown> } }
    | undefined;
  return call?.data.metadata;
}

describe('planCompanyChange', () => {
  it('replaces an untouched listing name with the trading name', () => {
    expect(planCompanyChange(LISTING, { company: TRADING, listingName: LISTING })).toEqual({
      from: LISTING,
      to: TRADING,
    });
  });

  it('never touches a name that differs from the listing name (a user edit)', () => {
    expect(
      planCompanyChange('Rise (edited)', { company: TRADING, listingName: LISTING })
    ).toBeNull();
  });

  it('does nothing without a listing name, a company or a stored name', () => {
    expect(planCompanyChange(LISTING, { company: TRADING })).toBeNull();
    expect(planCompanyChange(LISTING, { listingName: LISTING })).toBeNull();
    expect(planCompanyChange(null, { company: TRADING, listingName: LISTING })).toBeNull();
    expect(planCompanyChange(undefined, { company: TRADING, listingName: LISTING })).toBeNull();
  });

  it('does nothing when the trading name is already stored', () => {
    expect(planCompanyChange(TRADING, { company: TRADING, listingName: TRADING })).toBeNull();
  });

  it('matches a stored listing name that carries stray whitespace', () => {
    expect(planCompanyChange(`${LISTING} `, { company: TRADING, listingName: LISTING })).toEqual({
      from: `${LISTING} `,
      to: TRADING,
    });
  });
});

describe('inboundRouter.syncPipelineLead — company correction', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
    prismaMock.leadActivity.findFirst.mockResolvedValue(null as never);
    prismaMock.leadActivity.create.mockResolvedValue({} as never);
    prismaMock.lead.updateMany.mockResolvedValue({ count: 1 } as never);
    prismaMock.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) =>
      fn(prismaMock)) as never);
    changeStatus().mockResolvedValue({ isFailure: false, value: {} });
    qualify().mockResolvedValue({ isFailure: false, value: {} });
  });

  it('corrects an existing lead that still has the old listing name', async () => {
    existingLead(LISTING);

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(prismaMock.lead.updateMany).toHaveBeenCalledWith({
      where: { id: LEAD_ID, tenantId: TENANT_ID, company: LISTING },
      data: { company: TRADING },
    });
    expect(result.companyChange).toEqual({ from: LISTING, to: TRADING, applied: true });
    expect(noteMetadata()).toMatchObject({
      source: 'coa-pipeline-sync',
      listingName: LISTING,
      companySource: 'listing+domain',
      companyFlagged: false,
      companyChange: { from: LISTING, to: TRADING, applied: true },
    });
  });

  it('leaves the company untouched when the same payload has no applyCompany', async () => {
    existingLead(LISTING);

    const result = await caller().syncPipelineLead(payload());

    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    expect(result.companyChange).toEqual({ from: LISTING, to: TRADING, applied: false });
    expect(noteMetadata()).toMatchObject({
      listingName: LISTING,
      companyChange: { from: LISTING, to: TRADING, applied: false },
    });
  });

  it('never overwrites a name a user edited, even with applyCompany', async () => {
    existingLead('Rise Bakery & Cafe (owner corrected)');

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    expect(result.companyChange).toBeUndefined();
    expect(noteMetadata()).not.toHaveProperty('companyChange');
    // The three COA fields are still recorded for the audit trail.
    expect(noteMetadata()).toMatchObject({ listingName: LISTING, companyFlagged: false });
  });

  it('reports applied: false when the name changed between the read and the write', async () => {
    existingLead(LISTING);
    prismaMock.lead.updateMany.mockResolvedValueOnce({ count: 0 } as never);

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(result.companyChange).toEqual({ from: LISTING, to: TRADING, applied: false });
  });

  it('creates a new lead with the trading name and considers no correction', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null as never);
    createLead().mockResolvedValueOnce({ isFailure: false, value: { id: { value: LEAD_ID } } });

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(createLead().mock.calls[0]?.[0]).toMatchObject({ company: TRADING });
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    expect(result.companyChange).toBeUndefined();
  });

  it('still corrects on a repeat sync, and notes the correction on its own', async () => {
    existingLead(LISTING);
    prismaMock.leadActivity.findFirst.mockResolvedValueOnce({
      id: 'act_prior',
      metadata: {},
    } as never);

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(prismaMock.lead.updateMany).toHaveBeenCalledTimes(1);
    expect(result.changed).toBe(false);
    expect(result.companyChange).toEqual({ from: LISTING, to: TRADING, applied: true });
    expect(prismaMock.leadActivity.create).toHaveBeenCalledTimes(1);
    expect(noteMetadata()).toMatchObject({
      source: 'coa-company-correction',
      companyChange: { from: LISTING, to: TRADING, applied: true },
    });
  });

  it('writes no correction note on a repeat sync that changed nothing', async () => {
    existingLead(LISTING);
    prismaMock.leadActivity.findFirst.mockResolvedValueOnce({
      id: 'act_prior',
      metadata: {},
    } as never);

    await caller().syncPipelineLead(payload());

    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
  });

  it('keeps the sync going when the correction note fails', async () => {
    existingLead(LISTING);
    prismaMock.leadActivity.findFirst.mockResolvedValueOnce({
      id: 'act_prior',
      metadata: {},
    } as never);
    prismaMock.leadActivity.create.mockRejectedValueOnce(new Error('db down'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await caller().syncPipelineLead(payload({ applyCompany: true }));

    expect(result.companyChange?.applied).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('company correction note failed'),
      expect.objectContaining({ leadId: LEAD_ID })
    );
    warn.mockRestore();
  });

  it('surfaces a failed correction write as a retryable 500', async () => {
    existingLead(LISTING);
    prismaMock.lead.updateMany.mockRejectedValueOnce(new Error('connection reset'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(caller().syncPipelineLead(payload({ applyCompany: true }))).rejects.toMatchObject({
      code: 'INTERNAL_SERVER_ERROR',
    });
    error.mockRestore();
  });

  it('omits the COA fields from the note when they are not sent', async () => {
    existingLead(LISTING);

    await caller().syncPipelineLead(
      payload({ listingName: undefined, companySource: undefined, companyFlagged: undefined })
    );

    const meta = noteMetadata();
    expect(meta).not.toHaveProperty('listingName');
    expect(meta).not.toHaveProperty('companySource');
    expect(meta).not.toHaveProperty('companyFlagged');
    expect(meta).not.toHaveProperty('companyChange');
  });

  it('rejects an unknown companySource', async () => {
    await expect(
      caller().syncPipelineLead(payload({ companySource: 'guess' }))
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('inboundRouter.syncPipelineLead — dryRun', () => {
  beforeEach(() => {
    vi.stubEnv('PORTAL_INTERNAL_SECRET', SECRET);
    vi.stubEnv('LEANGENCY_TENANT_ID', TENANT_ID);
    vi.stubEnv('LEANGENCY_SYSTEM_USER_ID', SYSTEM_USER_ID);
  });

  function expectNothingWritten() {
    expect(createLead()).not.toHaveBeenCalled();
    expect(changeStatus()).not.toHaveBeenCalled();
    expect(qualify()).not.toHaveBeenCalled();
    expect(prismaMock.lead.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.lead.update).not.toHaveBeenCalled();
    expect(prismaMock.leadActivity.create).not.toHaveBeenCalled();
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
    expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  }

  it('reports the correction it would make and writes nothing', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({
      id: LEAD_ID,
      company: LISTING,
      status: 'QUALIFIED',
    } as never);

    const result = await caller().syncPipelineLead(
      payload({ dryRun: true, applyCompany: true, outreachSlug: 'rise-bakery' })
    );

    expectNothingWritten();
    expect(prismaMock.lead.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID, email: 'owner@bakery.example' },
      select: { id: true, company: true, status: true },
    });
    expect(result).toEqual({
      dryRun: true,
      leadId: LEAD_ID,
      tenantId: TENANT_ID,
      created: false,
      previousStatus: 'QUALIFIED',
      status: 'QUALIFIED',
      changed: false,
      conversionPending: false,
      qualificationPending: false,
      companyChange: { from: LISTING, to: TRADING, applied: false },
      wouldApplyCompany: true,
    });
  });

  it('reports "would change" without applyCompany too', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce({
      id: LEAD_ID,
      company: LISTING,
      status: 'CONTACTED',
    } as never);

    const result = await caller().syncPipelineLead(payload({ dryRun: true }));

    expectNothingWritten();
    expect(result.companyChange).toEqual({ from: LISTING, to: TRADING, applied: false });
    expect(result.wouldApplyCompany).toBe(false);
  });

  it('reports a lead it would create, with no correction', async () => {
    prismaMock.lead.findFirst.mockResolvedValueOnce(null as never);

    const result = await caller().syncPipelineLead(payload({ dryRun: true }));

    expectNothingWritten();
    expect(result).toMatchObject({ dryRun: true, created: true, leadId: '', status: 'NEW' });
    expect(result.companyChange).toBeUndefined();
  });

  it('still requires the bearer', async () => {
    const h = new Headers();
    const anon = inboundRouter.createCaller(
      createTestContext({ req: { headers: h } as unknown as Request }) as never
    );
    await expect(anon.syncPipelineLead(payload({ dryRun: true }))).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
    expect(prismaMock.lead.findFirst).not.toHaveBeenCalled();
  });
});
