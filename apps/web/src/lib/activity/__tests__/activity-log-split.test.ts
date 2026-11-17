import { describe, it, expect } from 'vitest';
import { emptyFeedMessage, isSystemFeedEntry, splitActivityLog } from '../activity-log-split';

const entry = (id: string, type: string, actor: { id: string | null; name: string } | null) => ({
  id,
  type,
  actor,
});

const me = { id: 'user-1', name: 'Talysson' };
const other = { id: 'user-2', name: 'Bob Wilson' };
const coa = { id: null, name: 'System (COA sync)' };

describe('isSystemFeedEntry', () => {
  it('is true for the system types whoever the author is', () => {
    expect(isSystemFeedEntry(entry('a', 'SCORE_UPDATE', me))).toBe(true);
    expect(isSystemFeedEntry(entry('b', 'STATUS_CHANGE', null))).toBe(true);
    expect(isSystemFeedEntry(entry('c', 'SYSTEM', me))).toBe(true);
  });

  it('is true for a "System (...)" author on any type', () => {
    expect(isSystemFeedEntry(entry('a', 'NOTE', coa))).toBe(true);
    expect(isSystemFeedEntry(entry('b', 'NOTE', { id: null, name: 'System' }))).toBe(true);
    expect(isSystemFeedEntry(entry('c', 'NOTE', { id: null, name: ' System (portal) ' }))).toBe(
      true
    );
  });

  it('is false for a person, even one whose name starts with System', () => {
    expect(isSystemFeedEntry(entry('a', 'EMAIL', me))).toBe(false);
    expect(isSystemFeedEntry(entry('b', 'NOTE', { id: 'u', name: 'System Admin' }))).toBe(false);
    expect(isSystemFeedEntry(entry('c', 'CALL', null))).toBe(false);
  });
});

describe('splitActivityLog', () => {
  const all = [
    entry('1', 'CALL', me),
    entry('2', 'STATUS_CHANGE', coa),
    entry('3', 'EMAIL', other),
    entry('4', 'NOTE', coa),
    entry('5', 'NOTE', me),
  ];

  it('puts what people did in the feed and what the system wrote in the group, in order', () => {
    const { personal, system } = splitActivityLog(all, {
      fold: true,
      mine: false,
      userId: 'user-1',
    });

    expect(personal.map((e) => e.id)).toEqual(['1', '3', '5']);
    expect(system.map((e) => e.id)).toEqual(['2', '4']);
  });

  it('keeps only his own entries for My activity, and no system group', () => {
    const { personal, system } = splitActivityLog(all, {
      fold: true,
      mine: true,
      userId: 'user-1',
    });

    expect(personal.map((e) => e.id)).toEqual(['1', '5']);
    expect(system).toEqual([]);
  });

  it('shows a chosen type as it is, with no group', () => {
    const { personal, system } = splitActivityLog(all, {
      fold: false,
      mine: false,
      userId: 'user-1',
    });

    expect(personal.map((e) => e.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(system).toEqual([]);
  });

  it('applies My activity to a chosen type too', () => {
    const { personal } = splitActivityLog(all, { fold: false, mine: true, userId: 'user-1' });

    expect(personal.map((e) => e.id)).toEqual(['1', '5']);
  });

  it('matches nothing for My activity until the signed-in person is known', () => {
    const noAuthor = [entry('1', 'CALL', null), ...all];
    const { personal } = splitActivityLog(noAuthor, { fold: true, mine: true, userId: null });

    expect(personal).toEqual([]);
  });

  it('handles an empty list', () => {
    expect(splitActivityLog([], { fold: true, mine: false, userId: null })).toEqual({
      personal: [],
      system: [],
    });
  });
});

describe('emptyFeedMessage', () => {
  const base = { mine: false, filtered: false, searching: false, systemCount: 0 };

  it('says only system updates exist when they are all there is', () => {
    expect(emptyFeedMessage({ ...base, systemCount: 3 })).toBe(
      'No emails, calls, notes or meetings yet. Only system updates so far.'
    );
  });

  it('says the right thing for search, filter, My activity and a truly empty log', () => {
    expect(emptyFeedMessage({ ...base, searching: true, systemCount: 3 })).toBe(
      'No activity matches your search'
    );
    expect(emptyFeedMessage({ ...base, mine: true, systemCount: 3 })).toBe(
      'You have no activity yet'
    );
    expect(emptyFeedMessage({ ...base, filtered: true })).toBe(
      'No activity matches the selected filter'
    );
    expect(emptyFeedMessage(base)).toBe('No activity recorded yet');
  });
});
