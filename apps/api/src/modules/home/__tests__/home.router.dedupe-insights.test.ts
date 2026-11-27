import { describe, it, expect } from 'vitest';
import { deduplicateInsights } from '../home.router';

const row = (id: string, title: string, entityId: string | null, type = 'recommendation') => ({
  id,
  title,
  type,
  entityType: entityId ? 'lead' : null,
  entityId,
});

describe('deduplicateInsights (owner 21/11: same purpose, same lead)', () => {
  it('keeps one insight per record and type, the newest, whatever the wording', () => {
    // Newest first, as the queries order them.
    const rows = [
      row('3', 'Bramble Fitness is engaged but still at CONTACTED stage', 'lead-b'),
      row('2', 'Bramble Fitness has engaged but not yet qualified', 'lead-b'),
      row('1', 'Bramble Fitness has a strong score but has not progressed', 'lead-b'),
      row('5', 'Northfield Plumbing is qualified and ready to move', 'lead-n'),
      row('4', 'Northfield Plumbing is a qualified lead close to hot', 'lead-n'),
    ];
    expect(deduplicateInsights(rows).map((r) => r.id)).toEqual(['3', '5']);
  });

  it('keeps insights of different types about the same record', () => {
    const rows = [row('2', 'Risk', 'lead-b', 'anomaly'), row('1', 'Opportunity', 'lead-b')];
    expect(deduplicateInsights(rows)).toHaveLength(2);
  });

  it('still removes same-title copies of insights that are not about one record', () => {
    const rows = [row('2', '3 overdue tasks', null), row('1', '3 overdue tasks', null)];
    expect(deduplicateInsights(rows).map((r) => r.id)).toEqual(['2']);
  });
});
