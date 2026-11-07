import { describe, it, expect, vi } from 'vitest';

import {
  parseArgs,
  parseTitleDate,
  planTitleDateFix,
  planCoaFix,
  readStatuses,
  runImports,
  runCoa,
} from '../backfill-activity-event-times';

const IMPORT_TIME = new Date('2026-11-06T18:40:00.000Z');

describe('parseArgs', () => {
  it('defaults to a dry run over everything', () => {
    expect(parseArgs(['node', 'x.ts'])).toEqual({
      isApply: false,
      tenantFilter: undefined,
      leadFilter: undefined,
      only: undefined,
    });
  });

  it('reads --apply, --tenant, --lead and --only', () => {
    expect(
      parseArgs(['node', 'x.ts', '--tenant', 't1', '--lead', 'l1', '--only', 'coa', '--apply'])
    ).toEqual({ isApply: true, tenantFilter: 't1', leadFilter: 'l1', only: 'coa' });
    expect(parseArgs(['node', 'x.ts', '--tenant', '--apply']).tenantFilter).toBeUndefined();
    expect(() => parseArgs(['node', 'x.ts', '--only', 'all'])).toThrow(/--only/);
  });
});

describe('parseTitleDate', () => {
  it('takes the date out of the title', () => {
    expect(parseTitleDate('Outreach email sent 27/09/2026')).toEqual({
      title: 'Outreach email sent',
      timestamp: new Date('2026-09-27T12:00:00.000Z'),
    });
    expect(parseTitleDate('Reply received 14/10/2026: "Sure also cost"')?.title).toBe(
      'Reply received: "Sure also cost"'
    );
    expect(parseTitleDate('Price follow-up sent 06/11/2026 from Zoho (offer)')?.title).toBe(
      'Price follow-up sent from Zoho (offer)'
    );
    expect(parseTitleDate('Call on 01/10/2026')?.title).toBe('Call');
  });

  it('ignores titles with no date, two dates or an impossible date', () => {
    expect(parseTitleDate('Email sent')).toBeNull();
    expect(parseTitleDate('From 01/10/2026 to 02/10/2026')).toBeNull();
    expect(parseTitleDate('Sent 31/02/2026')).toBeNull();
  });
});

describe('planTitleDateFix', () => {
  it('fixes a row stamped after its title date', () => {
    expect(
      planTitleDateFix({ title: 'Follow-up email sent 07/10/2026', timestamp: IMPORT_TIME })
    ).toEqual({ title: 'Follow-up email sent', timestamp: new Date('2026-10-07T12:00:00.000Z') });
  });

  it('leaves a row whose timestamp is on or before its title date', () => {
    expect(
      planTitleDateFix({
        title: 'Price follow-up sent 06/11/2026',
        timestamp: new Date('2026-11-06T09:00:00.000Z'),
      })
    ).toBeNull();
    expect(
      planTitleDateFix({
        title: 'Meeting booked for 20/11/2026',
        timestamp: new Date('2026-11-06T09:00:00.000Z'),
      })
    ).toBeNull();
    // A title that is only a date would be left empty.
    expect(planTitleDateFix({ title: '27/09/2026', timestamp: IMPORT_TIME })).toBeNull();
  });
});

const COA_META = {
  source: 'coa-pipeline-sync',
  coaLeadId: 'coa_1',
  coaStage: 'CONTACTED',
  status: 'CONTACTED',
  stageChangedAt: '2026-11-03T10:28:00.000Z',
  syncKey: 'k',
};

function coaRow(overrides: Record<string, unknown> = {}) {
  return {
    title: 'COA pipeline: CONTACTED → CONTACTED',
    description:
      'COA lead coa_1 moved to CONTACTED at 2026-11-03T10:28:00.000Z; CRM status NEW → CONTACTED',
    timestamp: IMPORT_TIME,
    metadata: COA_META,
    lead: { firstName: null, lastName: null, company: 'Bakery Ltd', email: 'b@b.example' },
    ...overrides,
  };
}

describe('readStatuses', () => {
  it('prefers metadata, falls back to the old body', () => {
    expect(readStatuses({ fromStatus: 'QUALIFIED', toStatus: 'NEGOTIATING' }, '')).toEqual({
      from: 'QUALIFIED',
      to: 'NEGOTIATING',
    });
    expect(readStatuses({}, 'x; CRM status NEW → CONTACTED')).toEqual({
      from: 'NEW',
      to: 'CONTACTED',
    });
    expect(readStatuses({}, 'no statuses')).toBeNull();
  });
});

describe('planCoaFix', () => {
  it('rewrites an old COA note with the new copy and the event time', () => {
    expect(planCoaFix(coaRow(), new Date('2026-11-07T00:00:00.000Z'))).toEqual({
      title: 'Lead contacted — Bakery Ltd',
      description: 'Moved from New to Contacted by the COA sync · 3 Nov, 10:28',
      timestamp: new Date('2026-11-03T10:28:00.000Z'),
    });
  });

  it('keeps the win and refusal facts', () => {
    const won = planCoaFix(
      coaRow({
        metadata: {
          ...COA_META,
          conversionPending: true,
          fromStatus: 'NEW',
          toStatus: 'NEGOTIATING',
        },
      })
    );
    expect(won?.description).toContain('COA reported it WON');
    const refused = planCoaFix(
      coaRow({
        metadata: {
          ...COA_META,
          qualificationPending: true,
          qualificationScore: 12,
          qualificationMinScore: 40,
        },
      })
    );
    expect(refused?.description).toContain('(score 12, minimum 40)');
  });

  it('keeps the old timestamp when the event time is in the future', () => {
    const fix = planCoaFix(
      coaRow({ metadata: { ...COA_META, stageChangedAt: '2030-01-01T00:00:00.000Z' } }),
      new Date('2026-11-07T00:00:00.000Z')
    );
    expect(fix?.timestamp).toEqual(IMPORT_TIME);
  });

  it('skips rows that are already rewritten or not COA notes', () => {
    expect(planCoaFix(coaRow({ title: 'Lead contacted — Bakery Ltd' }))).toBeNull();
    expect(planCoaFix(coaRow({ metadata: { ...COA_META, source: 'other' } }))).toBeNull();
    expect(planCoaFix(coaRow({ metadata: { source: 'coa-pipeline-sync' } }))).toBeNull();
    expect(planCoaFix(coaRow({ description: 'no statuses', metadata: COA_META }))).toBeNull();
    expect(planCoaFix(coaRow({ metadata: null }))).toBeNull();
  });
});

function fakePrisma(rows: unknown[]) {
  return {
    leadActivity: {
      findMany: vi.fn().mockResolvedValueOnce(rows).mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({}),
    },
  } as never as Parameters<typeof runImports>[0];
}

describe('runners', () => {
  it('dry run writes nothing; apply writes each row scoped by id and tenant', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const importRows = [
      { id: 'a1', tenantId: 't1', title: 'Outreach email sent 27/09/2026', timestamp: IMPORT_TIME },
      { id: 'a2', tenantId: 't1', title: 'Email sent', timestamp: IMPORT_TIME },
    ];
    const base = { tenantFilter: 't1', leadFilter: undefined, only: undefined };

    const dry = fakePrisma(importRows);
    const dryTotals = { imports: 0, coa: 0, skipped: 0 };
    await runImports(dry, { ...base, isApply: false }, dryTotals);
    expect(dryTotals).toEqual({ imports: 1, coa: 0, skipped: 1 });
    expect((dry as any).leadActivity.update).not.toHaveBeenCalled();
    expect((dry as any).leadActivity.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
    });

    const wet = fakePrisma(importRows);
    await runImports(wet, { ...base, isApply: true }, { imports: 0, coa: 0, skipped: 0 });
    expect((wet as any).leadActivity.update).toHaveBeenCalledWith({
      where: { id: 'a1', tenantId: 't1' },
      data: { title: 'Outreach email sent', timestamp: new Date('2026-09-27T12:00:00.000Z') },
    });

    const coa = fakePrisma([{ id: 'c1', tenantId: 't1', ...coaRow() }]);
    const coaTotals = { imports: 0, coa: 0, skipped: 0 };
    await runCoa(coa, { ...base, isApply: true, leadFilter: 'l1' }, coaTotals);
    expect(coaTotals.coa).toBe(1);
    expect((coa as any).leadActivity.findMany.mock.calls[0][0].where).toMatchObject({
      tenantId: 't1',
      leadId: 'l1',
      title: { startsWith: 'COA pipeline:' },
    });
    expect((coa as any).leadActivity.update.mock.calls[0][0].where).toEqual({
      id: 'c1',
      tenantId: 't1',
    });
  });
});
