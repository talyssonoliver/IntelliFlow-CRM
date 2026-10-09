import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const revalidateCalendar = vi.hoisted(() => vi.fn());
vi.mock('@/app/calendar/actions', () => ({ revalidateCalendar }));

import { revalidateCalendarCache } from '../revalidate-calendar-cache';

describe('revalidateCalendarCache', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    revalidateCalendar.mockReset();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('forwards the user id to the server action', async () => {
    revalidateCalendar.mockResolvedValue(undefined);
    await revalidateCalendarCache('user-1');
    expect(revalidateCalendar).toHaveBeenCalledWith('user-1');
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('reports a failed revalidation to the console and still resolves', async () => {
    const failure = new Error('cache unavailable');
    revalidateCalendar.mockRejectedValue(failure);
    await expect(revalidateCalendarCache('user-1')).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('Failed to revalidate the calendar cache:', failure);
  });
});
