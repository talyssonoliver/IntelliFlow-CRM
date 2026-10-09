/**
 * @vitest-environment jsdom
 *
 * NewAppointmentPage: creating an appointment navigates back to the list and
 * returns the refresh of the list, stats and the calendar server cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

const h = vi.hoisted(() => ({
  push: vi.fn(),
  revalidateCalendarCache: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true, user: h.user }),
}));
vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@/lib/calendar/revalidate-calendar-cache', () => ({
  revalidateCalendarCache: h.revalidateCalendarCache,
}));
vi.mock('@intelliflow/ui', () => ({ Skeleton: () => null }));
vi.mock('@/components/shared', () => ({ PageHeader: () => null }));
vi.mock('@/components/appointments', () => ({ AppointmentForm: () => null }));

import NewAppointmentPage from '../page';

describe('NewAppointmentPage create onSuccess', () => {
  beforeEach(() => {
    capture.reset();
    h.push.mockReset();
    h.revalidateCalendarCache.mockReset().mockResolvedValue(undefined);
    h.user = { id: 'user-1' };
  });

  it('navigates to the list and returns the list, stats and calendar refresh', async () => {
    render(<NewAppointmentPage />);
    const result = capture.mutations['appointments.create'].onSuccess?.();
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(h.push).toHaveBeenCalledWith('/appointments');
    expect(capture.invalidations).toEqual(['appointments.list', 'appointments.stats']);
    expect(h.revalidateCalendarCache).toHaveBeenCalledWith('user-1');
  });

  it('skips the calendar cache flush when there is no signed-in user id', async () => {
    h.user = null;
    render(<NewAppointmentPage />);
    await capture.mutations['appointments.create'].onSuccess?.();
    expect(h.push).toHaveBeenCalledWith('/appointments');
    expect(h.revalidateCalendarCache).not.toHaveBeenCalled();
  });
});
