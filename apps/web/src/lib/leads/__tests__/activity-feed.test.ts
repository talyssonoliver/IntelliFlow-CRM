import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPE_FILTERS,
  activityCountLabel,
  isSystemActivity,
  showPeopleFilter,
  splitActivityFeed,
} from '../activity-feed';

const at = (h: number) => `2026-03-03T${String(h).padStart(2, '0')}:00:00.000Z`;
const act = (id: string, type: string, user: string, h: number) => ({
  id,
  type,
  user,
  timestamp: at(h),
});

const feed = [
  act('e1', 'email', 'Alex Owner', 9),
  act('c1', 'call', 'Alex Owner', 11),
  act('n1', 'note', 'System (COA sync)', 12),
  act('s1', 'score_update', 'AI Scoring Agent', 10),
  act('m1', 'meeting', 'Sam Rep', 8),
  act('st', 'status_change', 'Alex Owner', 13),
];
const all = () => true;

describe('ACTIVITY_TYPE_FILTERS', () => {
  it('offers only All, Emails, Calls, Notes and Meetings', () => {
    expect(ACTIVITY_TYPE_FILTERS.map((f) => f.label)).toEqual([
      'All',
      'Emails',
      'Calls',
      'Notes',
      'Meetings',
    ]);
  });
});

describe('isSystemActivity', () => {
  it('treats score and status changes and "System (...)" authors as system', () => {
    expect(isSystemActivity({ type: 'score_update', user: 'AI Scoring Agent' })).toBe(true);
    expect(isSystemActivity({ type: 'status_change', user: 'Alex Owner' })).toBe(true);
    expect(isSystemActivity({ type: 'note', user: 'System (COA sync)' })).toBe(true);
    expect(isSystemActivity({ type: 'note', user: ' System (portal)' })).toBe(true);
  });

  it('keeps a person-written note, call or email as personal', () => {
    expect(isSystemActivity({ type: 'note', user: 'Alex Owner' })).toBe(false);
    expect(isSystemActivity({ type: 'call', user: 'Systema Ltd rep' })).toBe(false);
    // A person whose email starts with "system" is still a person.
    expect(isSystemActivity({ type: 'note', user: 'system@example.com' })).toBe(false);
    expect(isSystemActivity({ type: 'note', user: 'System admin' })).toBe(false);
    expect(isSystemActivity({ type: 'note', user: 'System' })).toBe(true);
  });
});

describe('splitActivityFeed', () => {
  it('puts person-written activity newest first and folds the rest, also newest first', () => {
    const { personal, system } = splitActivityFeed(feed, 'all', all);
    expect(personal.map((a) => a.id)).toEqual(['c1', 'e1', 'm1']);
    expect(system.map((a) => a.id)).toEqual(['st', 'n1', 's1']);
  });

  it('shows only that type for a type filter, with no system group', () => {
    const { personal, system } = splitActivityFeed(feed, 'call', all);
    expect(personal.map((a) => a.id)).toEqual(['c1']);
    expect(system).toEqual([]);
  });

  it('applies the person and search predicate to both lists', () => {
    const { personal, system } = splitActivityFeed(feed, 'all', (a) => a.user === 'Alex Owner');
    expect(personal.map((a) => a.id)).toEqual(['c1', 'e1']);
    expect(system.map((a) => a.id)).toEqual(['st']);
  });
});

describe('showPeopleFilter', () => {
  it('shows the people box only with more than one workspace member', () => {
    expect(showPeopleFilter(0)).toBe(false);
    expect(showPeopleFilter(1)).toBe(false);
    expect(showPeopleFilter(2)).toBe(true);
  });
});

describe('activityCountLabel', () => {
  it('counts the person-written activity shown out of the total', () => {
    expect(activityCountLabel(5, 8, 3)).toBe('Showing 5 of 8 activities');
    expect(activityCountLabel(1, 1, 0)).toBe('Showing 1 of 1 activity');
  });

  it('says only system updates exist instead of "Showing 0 of 0 activities"', () => {
    expect(activityCountLabel(0, 0, 4)).toBe(
      'No emails, calls, notes or meetings yet. Only system updates so far.'
    );
  });

  it('is null when there is no activity at all, leaving the empty state alone', () => {
    expect(activityCountLabel(0, 0, 0)).toBeNull();
  });
});
