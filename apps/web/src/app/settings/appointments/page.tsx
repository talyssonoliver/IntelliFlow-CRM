'use client';

/**
 * Appointments Settings Page (Legacy — redirects to /calendar/calendar-settings)
 * @deprecated Use /calendar/calendar-settings instead
 */

import { redirect } from 'next/navigation';

export default function AppointmentsSettingsPage() {
  redirect('/calendar/calendar-settings');
}
