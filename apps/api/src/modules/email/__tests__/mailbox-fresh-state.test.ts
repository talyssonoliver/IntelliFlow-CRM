import { describe, expect, it } from 'vitest';
import { freshSyncState } from '../mailbox-fresh-state';

describe('freshSyncState (MVP-013)', () => {
  it('clears a calendar reconnect request and makes the calendar sync due now', () => {
    expect(freshSyncState()).toMatchObject({
      calendarNextSyncAt: null,
      calendarFailureCount: 0,
      calendarStatus: 'ACTIVE',
    });
  });

  it('keeps the calendar sync token (it resumes for the same account; the sync starts over for another)', () => {
    expect(freshSyncState()).not.toHaveProperty('calendarSyncToken');
  });

  it('leaves the lease alone, so a round still running ends on its own', () => {
    expect(freshSyncState()).not.toHaveProperty('calendarLockedUntil');
  });
});
