import { describe, it, expect } from 'vitest';
import { historyImportLine, inboxSyncLine, INBOX_SYNC_SCOPE_NOTE } from '../inbox-sync-status';

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

describe('historyImportLine (register #58)', () => {
  it('shows the real stored counts, and that a pause resumes by itself', () => {
    expect(historyImportLine({ done: 40, total: 163, paused: false }, 'GMAIL')).toBe(
      'Importing email history: 40 of 163 contacts.'
    );
    expect(historyImportLine({ done: 40, total: 163, paused: true }, 'GMAIL')).toBe(
      "Importing email history: 40 of 163 contacts. Paused by Gmail's limits, resumes automatically."
    );
    expect(historyImportLine({ done: 1, total: 2, paused: true }, 'MICROSOFT')).toContain(
      "Outlook's limits"
    );
  });

  it('shows nothing when no import is running (no invented numbers)', () => {
    expect(historyImportLine(null, 'GMAIL')).toBeNull();
    expect(historyImportLine(undefined, 'GMAIL')).toBeNull();
    expect(historyImportLine({ done: 0, total: 0, paused: false }, 'GMAIL')).toBeNull();
  });
});
