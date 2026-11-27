import { describe, it, expect } from 'vitest';
import { calendarSyncLine, CALENDAR_SYNC_SCOPE_NOTE } from '../calendar-sync-status';

describe('calendarSyncLine (MVP-013)', () => {
  it('says what syncs and that the first sync has not run yet', () => {
    expect(calendarSyncLine(null)).toBe(`${CALENDAR_SYNC_SCOPE_NOTE} Waiting for the first sync.`);
    expect(calendarSyncLine(undefined)).toContain('Waiting for the first sync.');
  });

  it('shows when the last round finished', () => {
    const line = calendarSyncLine('2026-11-20T10:30:00.000Z', 'en-GB');

    expect(line.startsWith(`${CALENDAR_SYNC_SCOPE_NOTE} Last synced `)).toBe(true);
    expect(line).toContain('2026');
  });

  it('says when it has not synced for a while', () => {
    const at = '2026-11-20T10:30:00.000Z';
    const later = new Date(at).getTime() + 3 * 60 * 60_000;
    const soon = new Date(at).getTime() + 10 * 60_000;

    expect(calendarSyncLine(at, 'en-GB', later)).toContain('It has not synced for a while.');
    expect(calendarSyncLine(at, 'en-GB', soon)).not.toContain('not synced for a while');
  });

  it('treats an unreadable time as not synced yet', () => {
    expect(calendarSyncLine('not a date')).toContain('Waiting for the first sync.');
  });
});
