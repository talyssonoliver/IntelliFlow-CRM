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
      row('3', 'Pitshanger is engaged but still at CONTACTED stage', 'lead-p'),
      row('2', 'Pitshanger has engaged but not yet qualified', 'lead-p'),
      row('1', 'Pitshanger has a strong score but has not progressed', 'lead-p'),
      row('5', 'West London Handyman is qualified and ready to move', 'lead-w'),
      row('4', 'West London Handyman is a qualified lead close to hot', 'lead-w'),
    ];
    expect(deduplicateInsights(rows).map((r) => r.id)).toEqual(['3', '5']);
  });

  it('keeps insights of different types about the same record', () => {
    const rows = [row('2', 'Risk', 'lead-p', 'anomaly'), row('1', 'Opportunity', 'lead-p')];
    expect(deduplicateInsights(rows)).toHaveLength(2);
  });

  it('still removes same-title copies of insights that are not about one record', () => {
    const rows = [row('2', '3 overdue tasks', null), row('1', '3 overdue tasks', null)];
    expect(deduplicateInsights(rows).map((r) => r.id)).toEqual(['2']);
  });
});
