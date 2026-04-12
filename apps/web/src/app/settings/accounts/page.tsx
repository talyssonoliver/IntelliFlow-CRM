'use client';

/**
 * Accounts Settings Page (Legacy — redirects to /accounts/account-settings)
 * @deprecated Use /accounts/account-settings instead
 */

import { redirect } from 'next/navigation';

export default function AccountsSettingsPage() {
  redirect('/accounts/account-settings');
}
