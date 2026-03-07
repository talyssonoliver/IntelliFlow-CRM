import type { Metadata } from 'next';
import { findAppById } from '@/lib/developer/demo-data';
import { AppDashboard } from '@/components/developer/app-dashboard';

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 64;

function isValidId(id: string): boolean {
  return id.length <= MAX_ID_LENGTH && VALID_ID_PATTERN.test(id);
}

export async function generateMetadata({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>): Promise<Metadata> {
  const { id } = await params;

  if (!isValidId(id)) {
    return { title: 'App Not Found | IntelliFlow CRM' };
  }

  const app = findAppById(id);
  return {
    title: app
      ? `${app.name} | Developer Apps | IntelliFlow CRM`
      : 'App Not Found | IntelliFlow CRM',
  };
}

export default async function DeveloperAppDetailPage({
  params,
}: Readonly<{
  params: Promise<{ id: string }>;
}>) {
  const { id } = await params;

  if (!isValidId(id)) {
    return <AppDashboard appId="" />;
  }

  return <AppDashboard appId={id} />;
}
