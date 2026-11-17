import { describe, it, expect } from 'vitest';
import { emailRowLabel, leadEmailRows, type EmailActivityLike } from '../lead-emails';

const activity = (overrides: Partial<EmailActivityLike> = {}): EmailActivityLike => ({
  id: 'act-1',
  type: 'email',
  title: 'Re: Proposal',
  timestamp: '2026-11-14T09:00:00.000Z',
  metadata: null,
  ...overrides,
});

describe('leadEmailRows', () => {
  it('lists only the email activities', () => {
    const rows = leadEmailRows([
      activity(),
      activity({ id: 'act-2', type: 'call', title: 'Call' }),
      activity({ id: 'act-3', type: 'note', title: 'Note' }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(['act-1']);
  });

  it('reads the direction the mail sync recorded', () => {
    const rows = leadEmailRows([
      activity({ id: 'in', metadata: { direction: 'inbound' } }),
      activity({ id: 'out', metadata: { direction: 'outbound' } }),
    ]);
    expect(rows.map((row) => [row.id, row.direction])).toEqual([
      ['in', 'inbound'],
      ['out', 'outbound'],
    ]);
  });

  it('has no direction for mail logged before it was recorded, or for an unknown value', () => {
    const rows = leadEmailRows([
      activity({ id: 'old', metadata: { subject: 'Outreach' } }),
      activity({ id: 'none', metadata: null }),
      activity({ id: 'odd', metadata: { direction: 'sideways' } }),
    ]);
    expect(rows.map((row) => row.direction)).toEqual([null, null, null]);
  });

  it('takes the subject from the metadata, else the title, with the open tracking as before', () => {
    const [a, b] = leadEmailRows([
      activity({ metadata: { subject: 'Your proposal', opened: true, openCount: 3 } }),
      activity({ id: 'act-2' }),
    ]);
    expect(a).toMatchObject({ subject: 'Your proposal', status: 'opened', openCount: 3 });
    expect(b).toMatchObject({ subject: 'Re: Proposal', status: 'sent', openCount: 0 });
  });
});

describe('emailRowLabel', () => {
  it('says "Received" for mail received from the lead, whatever its status', () => {
    expect(emailRowLabel({ direction: 'inbound', status: 'sent', openCount: 0 })).toBe('Received');
    expect(emailRowLabel({ direction: 'inbound', status: 'opened', openCount: 2 })).toBe(
      'Received'
    );
  });

  it('reads as it always did for the rest', () => {
    expect(emailRowLabel({ direction: 'outbound', status: 'sent', openCount: 0 })).toBe('Sent');
    expect(emailRowLabel({ direction: null, status: 'sent', openCount: 0 })).toBe('Sent');
    expect(emailRowLabel({ direction: 'outbound', status: 'opened', openCount: 2 })).toBe(
      'Opened 2x'
    );
  });
});
