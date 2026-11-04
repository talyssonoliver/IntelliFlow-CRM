import type { Metadata } from 'next';
import { EmailPage } from '@/components/email/EmailPage';

export const metadata: Metadata = {
  title: { absolute: 'Email | Aurora' },
  description: 'Email thread view',
};

interface EmailDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function EmailDetailPage({ params }: Readonly<EmailDetailPageProps>) {
  const { id } = await params;
  return <EmailPage initialEmailId={id} />;
}
