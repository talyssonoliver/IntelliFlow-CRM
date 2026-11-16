import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPE_FILTERS,
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
    expect(isSystemActivity({ type: 'note', user: ' system (portal)' })).toBe(true);
  });

  it('keeps a person-written note, call or email as personal', () => {
    expect(isSystemActivity({ type: 'note', user: 'Alex Owner' })).toBe(false);
    expect(isSystemActivity({ type: 'call', user: 'Systema Ltd rep' })).toBe(false);
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
