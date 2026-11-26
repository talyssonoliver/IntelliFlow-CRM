import { describe, it, expect } from 'vitest';
import { buildCalendarTypeItems, createCalendarSidebarConfig } from '../configs/calendar';

describe('buildCalendarTypeItems', () => {
  it('returns nothing when the tenant has no event types', () => {
    expect(buildCalendarTypeItems([])).toEqual([]);
  });

  it('uses the tenant event type name for a lone appointment type', () => {
    const items = buildCalendarTypeItems([
      { id: 'a', name: 'Discovery call', appointmentType: 'CALL' },
    ]);
    expect(items).toEqual([
      {
        id: 'type-call',
        label: 'Discovery call',
        icon: 'category',
        href: '/calendar?type=CALL',
      },
    ]);
  });

  it('collapses event types sharing an appointment type', () => {
    const items = buildCalendarTypeItems([
      { id: 'a', name: 'Kickoff', appointmentType: 'MEETING' },
      { id: 'b', name: 'Design review', appointmentType: 'MEETING' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('Meeting');
  });

  it('never lists another vertical when nothing is configured', () => {
    const labels = createCalendarSidebarConfig(() => undefined)
      .sections.flatMap((s) => s.items.map((i) => i.label))
      .join(' ');
    expect(labels).not.toMatch(/Hearings|Consultations|Depositions/);
  });

  it('adds a By Type section only when there are items', () => {
    const none = createCalendarSidebarConfig(() => undefined, []);
    const some = createCalendarSidebarConfig(
      () => undefined,
      buildCalendarTypeItems([{ id: 'a', name: 'Call', appointmentType: 'CALL' }])
    );
    expect(none.sections.map((s) => s.title)).toEqual(['Calendar Views']);
    expect(some.sections.map((s) => s.title)).toEqual(['Calendar Views', 'By Type']);
  });
});
