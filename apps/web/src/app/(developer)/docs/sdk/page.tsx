import type { Metadata } from 'next';
import { SdkGuides } from '@/components/developer/sdk-guides';

export const metadata: Metadata = {
  title: 'SDK Guides | IntelliFlow CRM',
  description:
    'SDK documentation for IntelliFlow CRM — TypeScript client libraries, React hooks, installation guides, and quickstart examples',
};

export default function SdkGuidesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">SDK Guides</h1>
          <p className="text-muted-foreground mt-1">
            Client libraries and developer tools for integrating with the IntelliFlow CRM API
          </p>
        </div>
        <SdkGuides />
      </div>
    </div>
  );
}
