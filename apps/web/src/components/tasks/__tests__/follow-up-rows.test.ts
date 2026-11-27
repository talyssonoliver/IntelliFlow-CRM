import { describe, it, expect } from 'vitest';
import { FOLLOW_UP_ROW_PREFIX, followUpTaskRows } from '../follow-up-rows';

const base = {
  id: 'lead-1',
  firstName: 'Jane',
  lastName: 'Example',
  company: 'Example Corp',
  email: 'jane@example.invalid',
  lastContactedAt: '2026-11-13T09:00:00.000Z',
};

describe('followUpTaskRows (owner 21/11: follow-ups in the task table)', () => {
  it('makes a marked task row: due 7 days after the last contact, linked to the lead', () => {
    const [row] = followUpTaskRows([base]);
    expect(row.id).toBe(`${FOLLOW_UP_ROW_PREFIX}lead-1`);
    expect(row.followUp).toBe(true);
    expect(row.status).toBe('PENDING');
    // Owner 21/11: a due follow-up is priority one.
    expect(row.priority).toBe('URGENT');
    expect(row.title).toBe('Follow up with Jane Example');
    expect(row.description).toBe('Last contacted 13 Nov');
    expect(row.dueDate).toBe('2026-11-20T09:00:00.000Z');
    expect(row.lead).toEqual({ id: 'lead-1', firstName: 'Jane Example', lastName: null });
  });

  it('names a lead that has only a company by the company', () => {
    const [row] = followUpTaskRows([{ ...base, firstName: null, lastName: null }]);
    expect(row.title).toBe('Follow up with Example Corp');
    expect(row.lead?.firstName).toBe('Example Corp');
  });

  it('gives a never-contacted lead no due date', () => {
    const [row] = followUpTaskRows([{ ...base, lastContactedAt: null }]);
    expect(row.dueDate).toBeNull();
    expect(row.description).toBe('Never contacted');
  });
});
