/**
 * @vitest-environment jsdom
 *
 * AppointmentDetailPage: each mutation's onSuccess returns the refresh of the
 * appointment, list, stats and the calendar server cache.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { capture } from '@/test/trpc-capture';

const h = vi.hoisted(() => ({
  revalidateCalendarCache: vi.fn(),
  user: { id: 'user-1' } as { id: string } | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: 'appt-1' }),
}));
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true, user: h.user }),
}));
vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'Europe/London' }),
}));
vi.mock('@/lib/api', async () => {
  const { trpcCaptureClient } = await import('@/test/trpc-capture');
  return { api: trpcCaptureClient };
});
vi.mock('@/lib/calendar/revalidate-calendar-cache', () => ({
  revalidateCalendarCache: h.revalidateCalendarCache,
}));
vi.mock('@intelliflow/ui', () => ({ Card: () => null, Skeleton: () => null }));
vi.mock('@/components/shared', () => ({ PageHeader: () => null }));
vi.mock('@/components/appointments', () => ({ AppointmentDetail: () => null }));

import AppointmentDetailPage from '../page';

const PROCEDURES = [
  'appointments.confirm',
  'appointments.complete',
  'appointments.cancel',
  'appointments.markNoShow',
  'appointments.reschedule',
  'appointments.addAttendee',
  'appointments.removeAttendee',
  'appointments.linkToCase',
  'appointments.unlinkFromCase',
];

describe('AppointmentDetailPage mutation onSuccess handlers', () => {
  beforeEach(() => {
    capture.reset();
    h.revalidateCalendarCache.mockReset().mockResolvedValue(undefined);
    h.user = { id: 'user-1' };
  });

  it.each(PROCEDURES)(
    '%s returns the refresh of appointment, list, stats and calendar',
    async (name) => {
      render(<AppointmentDetailPage />);
      const result = capture.mutations[name].onSuccess?.();
      expect(result).toBeInstanceOf(Promise);
      await result;
      expect(capture.invalidations).toEqual([
        'appointments.getById',
        'appointments.list',
        'appointments.stats',
      ]);
      expect(h.revalidateCalendarCache).toHaveBeenCalledWith('user-1');
    }
  );

  it('skips the calendar cache flush when there is no signed-in user id', async () => {
    h.user = null;
    render(<AppointmentDetailPage />);
    await capture.mutations['appointments.confirm'].onSuccess?.();
    expect(capture.invalidations).toHaveLength(3);
    expect(h.revalidateCalendarCache).not.toHaveBeenCalled();
  });
});
