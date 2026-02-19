import type { Metadata } from 'next';
import { EmailPage } from '@/components/email/EmailPage';

export const metadata: Metadata = {
  title: 'Email | IntelliFlow CRM',
  description: 'Email compose and history',
};

export default function EmailPageRoute() {
  return <EmailPage />;
}
