import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BillingSettings } from '@/components/billing/billing-settings';
import BillingSettingsLoading from './loading';

export const metadata: Metadata = {
  title: 'Billing Settings — IntelliFlow',
  description: 'Manage your billing information, tax ID, and invoice contact.',
};

export default function BillingSettingsPage() {
  return (
    <Suspense fallback={<BillingSettingsLoading />}>
      <BillingSettings />
    </Suspense>
  );
}
