import type { Metadata } from 'next';
import { AppCreator } from '@/components/developer/app-creator';

export const metadata: Metadata = {
  title: 'Create New App | Developer Apps | IntelliFlow CRM',
  description:
    'Register a new developer application with OAuth credentials, API scope selection, and optional webhook configuration.',
};

export default function CreateNewAppPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-2xl">
        <AppCreator />
      </div>
    </div>
  );
}
