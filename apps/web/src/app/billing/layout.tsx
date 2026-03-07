import type { Metadata } from 'next';
import BillingLayoutShell from './_layout-shell';

export const metadata: Metadata = {
  title: 'Billing',
};

export default function BillingLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <BillingLayoutShell>{children}</BillingLayoutShell>;
}
