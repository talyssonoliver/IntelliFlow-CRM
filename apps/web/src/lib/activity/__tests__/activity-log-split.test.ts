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
  it('is true for score updates and system events whoever the author is', () => {
    expect(isSystemFeedEntry(entry('a', 'SCORE_UPDATE', me))).toBe(true);
    expect(isSystemFeedEntry(entry('c', 'SYSTEM', me))).toBe(true);
  });

  it('is true for a status change with no person behind it', () => {
    expect(isSystemFeedEntry(entry('a', 'STATUS_CHANGE', null))).toBe(true);
    expect(isSystemFeedEntry(entry('b', 'STATUS_CHANGE', { id: null, name: 'Import' }))).toBe(true);
  });

  it('is false for a status change a person made, such as converting a lead', () => {
    expect(isSystemFeedEntry(entry('a', 'STATUS_CHANGE', me))).toBe(false);
  });

  it('keeps a status change he made in My activity', () => {
    const mine = [entry('1', 'STATUS_CHANGE', me), entry('2', 'STATUS_CHANGE', coa)];

    const { personal } = splitActivityLog(mine, { fold: true, mine: true, userId: 'user-1' });

    expect(personal.map((e) => e.id)).toEqual(['1']);
  });

  it('never folds a ticket entry, whose human replies are typed SYSTEM and carry no author id', () => {
    const reply = { id: null, name: 'Jane Agent' };

    expect(isSystemFeedEntry({ ...entry('a', 'SYSTEM', reply), source: 'TICKET_ACTIVITY' })).toBe(
      false
    );
    expect(isSystemFeedEntry({ ...entry('b', 'SYSTEM', coa), source: 'TICKET_ACTIVITY' })).toBe(
      true
    );
  });

  it('matches My activity on the author name or email when the entry has no author id', () => {
    const entries = [
      entry('1', 'NOTE', { id: null, name: 'talysson@example.invalid' }),
      entry('2', 'NOTE', { id: null, name: ' TALYSSON ' }),
      entry('3', 'NOTE', { id: null, name: 'Bob Wilson' }),
      entry('4', 'NOTE', { id: 'user-2', name: 'Talysson' }),
    ];

    const { personal } = splitActivityLog(entries, {
      fold: true,
      mine: true,
      userId: 'user-1',
      userNames: ['Talysson', 'talysson@example.invalid', null],
    });

    expect(personal.map((e) => e.id)).toEqual(['1', '2']);
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
