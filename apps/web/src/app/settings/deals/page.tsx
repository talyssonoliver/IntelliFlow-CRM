'use client';

/**
 * Deals Settings Page (Legacy — redirects to /deals/deal-settings)
 * @deprecated Use /deals/deal-settings instead
 */

import { redirect } from 'next/navigation';

export default function DealsSettingsPage() {
  redirect('/deals/deal-settings');
}
