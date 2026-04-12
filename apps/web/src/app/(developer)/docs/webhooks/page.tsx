import type { Metadata } from 'next';
import { WebhookDocs } from '@/components/developer/webhook-docs';

export const metadata: Metadata = {
  title: 'Webhooks | IntelliFlow CRM',
  description:
    'Webhook documentation for IntelliFlow CRM — event types, signature verification, retry policies, and interactive endpoint testing',
};

export default function WebhooksPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-5xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">Webhooks</h1>
          <p className="text-muted-foreground mt-1">
            Configure and test webhook integrations for real-time event notifications between
            IntelliFlow CRM and your applications
          </p>
        </div>
        <WebhookDocs />
      </div>
    </div>
  );
}
