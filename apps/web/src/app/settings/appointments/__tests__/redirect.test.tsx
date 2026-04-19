import { describe, it, expect, vi } from 'vitest';

const { mockRedirect } = vi.hoisted(() => ({ mockRedirect: vi.fn() }));

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

import AppointmentsSettingsPage from '../page';

describe('AppointmentsSettingsPage redirect', () => {
  it('redirects to /calendar/calendar-settings', () => {
    try {
      AppointmentsSettingsPage();
    } catch {
      // redirect() throws in tests — expected
    }
    expect(mockRedirect).toHaveBeenCalledWith('/calendar/calendar-settings');
  });
});
