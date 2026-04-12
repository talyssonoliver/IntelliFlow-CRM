'use client';

/**
 * Reports Settings Page (Legacy — redirects to /analytics/report-settings)
 * @deprecated Use /analytics/report-settings instead
 */

import { redirect } from 'next/navigation';

export default function ReportsSettingsPage() {
  redirect('/analytics/report-settings');
}
