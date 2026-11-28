import { describe, it, expect } from 'vitest';
import { calendarTypeItems, createCalendarSidebarConfig } from '../calendar';

describe('calendar By Type follows the business type (owner 26/11)', () => {
  it('offers the general types to an agency, a trade or an unknown business', () => {
    for (const type of ['AGENCY', 'TRADES_HOME_SERVICES', null] as const) {
      const labels = calendarTypeItems(type).map((i) => i.label);
      expect(labels).toEqual(['Meetings', 'Calls', 'Consultations']);
    }
  });

  it('adds hearings and depositions only for a law firm', () => {
    const labels = calendarTypeItems('LAW_FIRM').map((i) => i.label);
    expect(labels).toEqual(['Hearings', 'Depositions', 'Meetings', 'Calls', 'Consultations']);
  });

  it('builds the sidebar section from it, linking each type to the calendar filter', () => {
    const config = createCalendarSidebarConfig(() => {}, 'AGENCY');
    const section = config.sections.find((s) => s.id === 'type');
    expect(section?.items.map((i) => i.href)).toEqual([
      '/calendar?type=MEETING',
      '/calendar?type=CALL',
      '/calendar?type=CONSULTATION',
    ]);
  });
});
