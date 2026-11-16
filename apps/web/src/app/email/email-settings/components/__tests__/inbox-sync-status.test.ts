import { describe, it, expect } from 'vitest';
import { inboxSyncLine, INBOX_SYNC_SCOPE_NOTE } from '../inbox-sync-status';

describe('inboxSyncLine (#1177)', () => {
  it('says what is logged and that the first sync has not run yet', () => {
    expect(inboxSyncLine(null)).toBe(`${INBOX_SYNC_SCOPE_NOTE} Waiting for the first sync.`);
    expect(inboxSyncLine(undefined)).toContain('Waiting for the first sync.');
  });

  it('shows when the last round finished', () => {
    const line = inboxSyncLine('2026-11-15T10:30:00.000Z', 'en-GB');

    expect(line.startsWith(`${INBOX_SYNC_SCOPE_NOTE} Last synced `)).toBe(true);
    expect(line).toContain('2026');
  });

  it('treats an unreadable time as not synced yet', () => {
    expect(inboxSyncLine('not a date')).toContain('Waiting for the first sync.');
  });
});
