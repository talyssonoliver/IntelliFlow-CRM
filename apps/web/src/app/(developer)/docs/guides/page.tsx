import type { Metadata } from 'next';
import { GuidesList } from '@/components/developer/guides-list';

export const metadata: Metadata = {
  title: 'Developer Guides | IntelliFlow CRM',
  description:
    'Developer guides for IntelliFlow CRM — getting started, development workflows, testing strategies, AI development, deployment, and best practices',
};

export default function GuidesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Developer Guides</h1>
          <p className="text-muted-foreground mt-1">
            Browse developer guides for building, testing, and deploying with IntelliFlow CRM
          </p>
        </div>
        <GuidesList />
      </div>
    </div>
  );
}
