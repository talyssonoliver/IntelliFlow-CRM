import type { Metadata } from 'next';
import { findAppById } from '@/lib/developer/demo-data';
import { AppEditor } from '@/components/developer/app-editor';

const VALID_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const MAX_ID_LENGTH = 64;

function isValidId(id: string): boolean {
  return id.length <= MAX_ID_LENGTH && VALID_ID_PATTERN.test(id);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  if (!isValidId(id)) {
    return { title: 'App Not Found | IntelliFlow CRM' };
  }

  const app = findAppById(id);
  return {
    title: app
      ? `Edit ${app.name} | Developer Apps | IntelliFlow CRM`
      : 'App Not Found | IntelliFlow CRM',
  };
}

export default async function DeveloperAppEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isValidId(id)) {
    return (
      <div className="flex flex-col gap-6">
        <div className="max-w-2xl">
          <AppEditor appId="" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <AppEditor appId={id} />
      </div>
    </div>
  );
}
