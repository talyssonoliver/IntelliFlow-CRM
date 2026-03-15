'use client';

/**
 * Cases Settings Page (Legacy — redirects to /cases/case-settings)
 * @deprecated Use /cases/case-settings instead
 */

import { redirect } from 'next/navigation';

export default function CasesSettingsPage() {
  redirect('/cases/case-settings');
}
