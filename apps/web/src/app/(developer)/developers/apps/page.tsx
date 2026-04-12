import type { Metadata } from 'next';
import { AppList } from '@/components/developer/app-list';

export const metadata: Metadata = {
  title: 'Developer Apps | IntelliFlow CRM',
  description: 'Manage your developer applications, API keys, and webhook configurations',
};

export default function DeveloperAppsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Developer Apps</h1>
          <p className="text-muted-foreground mt-1">
            Manage your registered applications, API keys, and webhook endpoints
          </p>
        </div>
        <AppList />
      </div>
    </div>
  );
}
