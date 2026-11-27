import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cli = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../lib/backfill-cli', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/backfill-cli')>()),
  connect: cli.connect,
}));

import {
  AUTOMATED_SENDER_TAG,
  main,
  parseArgs,
  planLead,
  run,
  type LeadFacts,
  type Totals,
} from '../clean-automated-leads';

const lead = (over: Partial<LeadFacts> = {}): LeadFacts => ({
  id: 'lead-1',
  email: 'dmarcreport@microsoft.com',
  status: 'NEW',
  tags: [],
  notes: [],
  activities: [{ type: 'EMAIL', userId: null, metadata: { direction: 'inbound' } }],
  ...over,
});

describe('parseArgs', () => {
  it('is a dry run unless --apply is given, and reads the tenant', () => {
    expect(parseArgs(['node', 'x', '--tenant', 't1'])).toEqual({
      isApply: false,
      tenantFilter: 't1',
    });
    expect(parseArgs(['node', 'x', '--tenant', 't1', '--apply']).isApply).toBe(true);
    expect(parseArgs(['node', 'x', '--tenant', '--apply']).tenantFilter).toBeUndefined();
  });
});

describe('planLead', () => {
  it('archives the DMARC report lead that started this', () => {
    expect(planLead(lead())).toEqual({ action: 'archive', reason: 'automated-sender' });
  });

  it.each([
    'noreply@x.example.invalid',
    'bounce-9@x.example.invalid',
    'postmaster@x.example.invalid',
  ])('archives %s', (email) => expect(planLead(lead({ email }))?.action).toBe('archive'));

  it('archives a lead whose first note is a DMARC report subject, whatever the address', () => {
    const plan = planLead(
      lead({
        email: 'reports@vendor.example.invalid',
        notes: [
          { content: 'Email enquiry: Report Domain: a.invalid Submitter: b.invalid Report-ID: 1' },
        ],
      })
    );
    expect(plan).toEqual({ action: 'archive', reason: 'dmarc-report' });
  });

  it('leaves a real person alone', () => {
    expect(planLead(lead({ email: 'sam@customer.example.invalid' }))).toBeNull();
  });

  it('keeps an automated-looking lead somebody worked, and says why', () => {
    expect(planLead(lead({ status: 'CONTACTED' }))?.action).toBe('keep');
    expect(
      planLead(lead({ activities: [{ type: 'NOTE', userId: 'u1', metadata: null }] }))?.action
    ).toBe('keep');
    expect(
      planLead(
        lead({ activities: [{ type: 'EMAIL', userId: null, metadata: { direction: 'outbound' } }] })
      )?.action
    ).toBe('keep');
  });

  it('does not count the scoring entry as work', () => {
    expect(
      planLead(lead({ activities: [{ type: 'SCORE_UPDATE', userId: 'u1', metadata: null }] }))
        ?.action
    ).toBe('archive');
  });

  it('skips a lead archived on an earlier run (idempotent)', () => {
    expect(planLead(lead({ status: 'LOST', tags: [AUTOMATED_SENDER_TAG] }))).toBeNull();
  });
});

describe('run', () => {
  let log: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  function db(leads: LeadFacts[]) {
    const tx = {
      lead: { update: vi.fn(async () => ({})) },
      leadActivity: { create: vi.fn(async () => ({})) },
      emailRecord: { update: vi.fn(async () => ({})) },
    };
    const prisma = {
      lead: { findMany: vi.fn(async () => leads) },
      emailRecord: {
        findMany: vi.fn(async () => [
          { id: 'rec-1', subject: 'Report Domain', metadata: { leadId: 'lead-1' } },
        ]),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<void>) => fn(tx)),
    };
    return { prisma: prisma as never, tx, raw: prisma };
  }
  const totals = (): Totals => ({ archived: 0, kept: 0, scanned: 0, records: 0 });

  it('dry run lists the lead and its records and writes nothing', async () => {
    const { prisma, raw } = db([lead(), lead({ id: 'lead-2', email: 'sam@c.example.invalid' })]);
    const t = totals();
    await run(prisma, { isApply: false, tenantFilter: 't1' }, t);
    expect(t).toEqual({ archived: 1, kept: 0, scanned: 2, records: 1 });
    expect(raw.$transaction).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('would archive lead=lead-1'));
    expect(raw.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', source: 'EMAIL' } })
    );
  });

  it('apply archives the lead (LOST, tagged), logs the activity and marks the records, tenant-scoped', async () => {
    const { prisma, tx } = db([lead()]);
    await run(prisma, { isApply: true, tenantFilter: 't1' }, totals());
    expect(tx.lead.update).toHaveBeenCalledWith({
      where: { id: 'lead-1', tenantId: 't1', status: 'NEW' },
      data: { status: 'LOST', tags: { push: AUTOMATED_SENDER_TAG } },
    });
    expect(tx.leadActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: 'STATUS_CHANGE',
          title: 'Lead Archived',
          tenantId: 't1',
        }),
      })
    );
    expect(tx.emailRecord.update).toHaveBeenCalledWith({
      where: { id: 'rec-1', tenantId: 't1' },
      data: { metadata: { leadId: 'lead-1', automatedSender: true } },
    });
  });

  it('never writes for a kept lead, even with --apply', async () => {
    const { prisma, raw } = db([lead({ status: 'QUALIFIED' })]);
    const t = totals();
    await run(prisma, { isApply: true, tenantFilter: 't1' }, t);
    expect(t.kept).toBe(1);
    expect(raw.$transaction).not.toHaveBeenCalled();
  });
});

describe('main', () => {
  const realArgv = process.argv;
  afterEach(() => {
    process.argv = realArgv;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('refuses to run without --tenant', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    process.argv = ['node', 'x'];
    await main();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('--tenant'));
    expect(exit).toHaveBeenCalledWith(1);
    expect(cli.connect).not.toHaveBeenCalled();
  });
});
