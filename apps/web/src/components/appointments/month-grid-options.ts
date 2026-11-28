/**
 * Desktop month cells are taller but not unlimited: three chips plus "+N more" read cleanly.
 * Phones (< 1024px) keep Schedule-X's own default, so nothing changes there.
 */
export const DESKTOP_MONTH_EVENTS_PER_DAY = 3;

export function desktopMonthGridOptions(): { monthGridOptions?: { nEventsPerDay: number } } {
  const mq = globalThis.window?.matchMedia?.('(min-width: 1024px)');
  return mq?.matches ? { monthGridOptions: { nEventsPerDay: DESKTOP_MONTH_EVENTS_PER_DAY } } : {};
}
