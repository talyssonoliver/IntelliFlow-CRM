import { describe, it, expect } from 'vitest';

import {
  describePipelineSyncCopy,
  formatSyncTime,
  humanizeStage,
  leadDisplayLabel,
  statusLabel,
} from '../pipeline-sync-copy';

const BASE = {
  company: 'Bakery Ltd',
  email: 'hello@bakery.example',
  coaStage: 'CONTACTED',
  stageChangedAt: '2026-11-03T10:28:00.000Z',
  from: 'NEW',
  to: 'CONTACTED',
};

describe('leadDisplayLabel', () => {
  it('prefers the person, then the company, then the email', () => {
    expect(leadDisplayLabel({ firstName: 'Sam', lastName: 'Lee', company: 'Co' })).toBe('Sam Lee');
    expect(leadDisplayLabel({ firstName: '  ', company: 'Bakery Ltd', email: 'a@b.example' })).toBe(
      'Bakery Ltd'
    );
    expect(leadDisplayLabel({ company: null, email: 'a@b.example' })).toBe('a@b.example');
    expect(leadDisplayLabel({})).toBe('Unnamed lead');
  });
});

describe('formatters', () => {
  it('formats the time as day, month and 24h time in London', () => {
    // 10:28 UTC on 3 Nov is 10:28 GMT (no daylight saving in November).
    expect(formatSyncTime('2026-11-03T10:28:00.000Z')).toBe('3 Nov, 10:28');
    // 09:00 UTC on 2 Oct is 10:00 BST.
    expect(formatSyncTime('2026-10-02T09:00:00.000Z')).toBe('2 Oct, 10:00');
    expect(formatSyncTime('not a date')).toBe('not a date');
  });

  it('humanises stages and statuses', () => {
    expect(humanizeStage('MEETING_BOOKED')).toBe('Meeting booked');
    expect(humanizeStage('')).toBe('');
    expect(statusLabel('NEGOTIATING')).toBe('Negotiating');
    expect(statusLabel('ON_HOLD')).toBe('On hold');
  });
});

describe('describePipelineSyncCopy', () => {
  it('writes a move as "Lead contacted — <company>" with a plain body', () => {
    expect(describePipelineSyncCopy(BASE)).toEqual({
      title: 'Lead contacted — Bakery Ltd',
      description: 'Moved from New to Contacted by the COA sync · 3 Nov, 10:28',
    });
  });

  it('never shows the COA id or a raw ISO time', () => {
    const { title, description } = describePipelineSyncCopy(BASE);
    expect(`${title} ${description}`).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(`${title} ${description}`).not.toMatch(/→/);
  });

  it('names the COA stage when the status does not move', () => {
    const copy = describePipelineSyncCopy({
      ...BASE,
      coaStage: 'PROPOSAL_READY',
      from: 'NEGOTIATING',
      to: 'NEGOTIATING',
    });
    expect(copy.title).toBe('COA stage: Proposal ready — Bakery Ltd');
    expect(copy.description).toBe(
      'COA marked it Proposal ready; status stays Negotiating · 3 Nov, 10:28'
    );
  });

  it('falls back to a generic title for an unknown target status', () => {
    expect(describePipelineSyncCopy({ ...BASE, to: 'ON_HOLD' }).title).toBe(
      'Lead moved to On hold — Bakery Ltd'
    );
  });

  it('explains a capped win and a refused qualification', () => {
    const won = describePipelineSyncCopy({
      ...BASE,
      from: 'QUALIFIED',
      to: 'NEGOTIATING',
      conversionPending: true,
      wonTag: 'coa-won',
    });
    expect(won.description).toContain(
      'COA reported it WON. The sync does not convert leads, so it stays Negotiating and is tagged coa-won: convert it in the CRM'
    );

    const refused = describePipelineSyncCopy({
      ...BASE,
      refusal: { score: 12, minScore: 40 },
      qualifiedTag: 'coa-qualified',
    });
    expect(refused.description).toContain(
      'the score gate refused the qualification (score 12, minimum 40). Tagged coa-qualified'
    );
    const bare = describePipelineSyncCopy({ ...BASE, refusal: {}, conversionPending: true });
    expect(bare.description).toContain('refused the qualification: qualify it');
    expect(bare.description).toContain('stays Contacted: convert it');
  });
});
