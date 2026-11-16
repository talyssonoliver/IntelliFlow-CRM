/**
 * MVP-001: the Microsoft reader the sync engine uses, through Graph's delta query.
 */
import { describe, it, expect, vi } from 'vitest';
import { PRODUCTION_READERS, graphReader, hasMailRead } from '../mail-sync-reader';

const NOW = new Date('2026-11-16T10:00:00.000Z');

describe('hasMailRead', () => {
  it('accepts the bare and the resource-URI scope, nothing else', () => {
    expect(hasMailRead(['Mail.Read'])).toBe(true);
    expect(hasMailRead(['https://graph.microsoft.com/Mail.Read'])).toBe(true);
    expect(hasMailRead(['Mail.ReadWrite', 'Mail.Send'])).toBe(false);
  });
});

describe('graphReader', () => {
  it('reads a folder from the cursor with the 30-day start and the budget left', async () => {
    const round = { messages: [], removedIds: [], cursor: 'c2', complete: true, expired: false };
    const readDelta = vi.fn(async () => round);
    const reader = graphReader(readDelta as never);

    const result = await reader.read({
      accessToken: 'access-for-tests',
      folder: 'sentitems',
      cursor: 'c1',
      now: NOW,
      budgetMs: 12_345,
    });

    expect(readDelta).toHaveBeenCalledWith('access-for-tests', 'c1', {
      folder: 'sentitems',
      maxPages: 10,
      pageSize: 50,
      initialDays: 30,
      maxBodyChars: 100_000,
      now: NOW,
      budgetMs: 12_345,
    });
    expect(result).toBe(round);
    expect(reader.provider).toBe('MICROSOFT');
    expect(reader.canRead(['Mail.Read'])).toBe(true);
  });

  it('is the reader production registers for Microsoft mailboxes', () => {
    expect(PRODUCTION_READERS.MICROSOFT?.provider).toBe('MICROSOFT');
    expect(Object.keys(PRODUCTION_READERS)).toEqual(['MICROSOFT']);
  });
});
