import type { Metadata } from 'next';
import { IntegrationList } from '@/components/developer/integration-list';

export const metadata: Metadata = {
  title: 'Integration Resources | Aurora',
  description: 'Webhooks, SDK guides, authentication, and third-party connector documentation',
};

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Integration Resources</h1>
          <p className="text-muted-foreground mt-1">
            Connect Aurora with your tools using webhooks, SDKs, and pre-built connectors
          </p>
        </div>
        <IntegrationList />
      </div>
    </div>
  );
}
