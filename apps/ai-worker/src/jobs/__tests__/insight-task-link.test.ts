import { describe, it, expect, vi } from 'vitest';

vi.mock('@intelliflow/db', () => ({ prisma: {} }));

import { taskLinkFor } from '../insight-generation.job';

describe('AI tasks link the record the insight is about (owner 27/11: Linked entity was "—")', () => {
  it('links a lead, a contact or a deal', () => {
    expect(taskLinkFor({ entityType: 'lead', entityId: 'l1' })).toEqual({ leadId: 'l1' });
    expect(taskLinkFor({ entityType: 'contact', entityId: 'c1' })).toEqual({ contactId: 'c1' });
    expect(taskLinkFor({ entityType: 'opportunity', entityId: 'o1' })).toEqual({
      opportunityId: 'o1',
    });
    expect(taskLinkFor({ entityType: 'deal', entityId: 'o2' })).toEqual({ opportunityId: 'o2' });
  });

  it('links nothing for an insight with no record', () => {
    expect(taskLinkFor({ entityType: 'lead', entityId: null })).toEqual({});
    expect(taskLinkFor({ entityType: 'task', entityId: 't1' })).toEqual({});
  });
});
