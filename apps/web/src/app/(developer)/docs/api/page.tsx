import type { Metadata } from 'next';
import { ApiReferenceClient } from '@/components/shared/api-reference-client';

export const metadata: Metadata = {
  title: 'API Reference | IntelliFlow CRM',
  description: 'Interactive tRPC API documentation with 25 routers and 235+ typed procedures',
};

export default function ApiReferencePage() {
  return (
    <div className="flex flex-col h-[100dvh]">
      <div className="px-8 pt-8 pb-4 shrink-0">
        <h1 className="text-2xl font-bold text-foreground">API Reference</h1>
        <p className="text-muted-foreground mt-1">
          Interactive API documentation with code examples and playground
        </p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <ApiReferenceClient specUrl="/api/openapi" />
      </div>
    </div>
  );
}
