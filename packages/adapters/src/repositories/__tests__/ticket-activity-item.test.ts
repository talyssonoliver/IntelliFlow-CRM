import { describe, it, expect } from 'vitest';
import { toTicketActivityItem, type TicketActivityRow } from '../ticket-activity-item';

const NOW = new Date('2026-11-20T10:00:00.000Z');

function row(overrides: Partial<TicketActivityRow> = {}): TicketActivityRow {
  return {
    id: 'a1',
    type: 'AGENT_REPLY',
    content: 'Thanks, we are on it',
    isInternal: false,
    timestamp: NOW,
    authorId: 'user-1',
    authorName: 'Sam Agent',
    systemEventData: null,
    ticket: { id: 't1', subject: 'Printer', ticketNumber: 'TCK-1' },
    ...overrides,
  };
}

describe('toTicketActivityItem', () => {
  it('maps a reply with the author user id as the actor id', () => {
    const item = toTicketActivityItem(row());
    expect(item.id).toBe('ticket_a1');
    expect(item.source).toBe('TICKET_ACTIVITY');
    expect(item.type).toBe('SYSTEM');
    expect(item.actor).toEqual({ id: 'user-1', name: 'Sam Agent' });
    expect(item.entity).toEqual({ id: 't1', type: 'TICKET', name: 'TCK-1: Printer' });
    expect(item.description).toBeNull();
  });

  it('leaves the actor id null for a customer or system entry', () => {
    expect(toTicketActivityItem(row({ authorId: null })).actor).toEqual({
      id: null,
      name: 'Sam Agent',
    });
  });

  it('marks an internal note and maps its type', () => {
    const item = toTicketActivityItem(row({ type: 'INTERNAL_NOTE', isInternal: true }));
    expect(item.type).toBe('NOTE');
    expect(item.description).toBe('[Internal note]');
  });

  it('falls back to SYSTEM for an unknown activity type', () => {
    expect(toTicketActivityItem(row({ type: 'SOMETHING_NEW' })).type).toBe('SYSTEM');
  });

  it('cuts a long title at 100 characters and keeps a short one whole', () => {
    const long = toTicketActivityItem(row({ content: 'x'.repeat(150) }));
    expect(long.title).toBe('x'.repeat(100) + '...');
    expect(toTicketActivityItem(row({ content: 'short' })).title).toBe('short');
  });

  it('has no entity when the ticket is gone, and passes the event data through', () => {
    const item = toTicketActivityItem(row({ ticket: null, systemEventData: { a: 1 } }));
    expect(item.entity).toBeNull();
    expect(item.metadata).toEqual({ a: 1 });
  });
});
