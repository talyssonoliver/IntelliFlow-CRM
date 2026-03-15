'use client';

/**
 * Billing Settings Page (Legacy — redirects to /billing/settings)
 * @deprecated Use /billing/settings instead
 */

import { redirect } from 'next/navigation';

export default function BillingSettingsPage() {
  redirect('/billing/settings');
}
