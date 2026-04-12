'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent, Card, Badge } from '@intelliflow/ui';
import { SDK_REGISTRY, type SdkPackage } from '@/lib/developer/sdk-downloads';

function CodeBlock({ code, label }: Readonly<{ code: string; label?: string }>) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      {label && <div className="text-xs text-muted-foreground mb-1 font-medium">{label}</div>}
      <pre className="font-mono bg-muted rounded-lg p-4 text-sm overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 border border-border text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label={`Copy ${label || 'code'} to clipboard`}
      >
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {copied ? 'check' : 'content_copy'}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </div>
  );
}

function StatusBadge({ status }: Readonly<{ status: SdkPackage['status'] }>) {
  switch (status) {
    case 'beta':
      return <Badge variant="secondary">Beta</Badge>;
    case 'coming-soon':
      return <Badge variant="warning">Coming Soon</Badge>;
    default:
      return null;
  }
}

function SdkCard({ sdk }: Readonly<{ sdk: SdkPackage }>) {
  const isDisabled = sdk.status === 'coming-soon';

  return (
    <div aria-disabled={isDisabled || undefined}>
      <Card
        className={`p-4 h-full transition-all ${
          isDisabled ? 'opacity-70 cursor-not-allowed' : 'hover:border-primary hover:shadow-md'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
            <span className="material-symbols-outlined text-xl text-white" aria-hidden="true">
              code
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-foreground">{sdk.name}</span>
              <StatusBadge status={sdk.status} />
            </div>
            <p className="text-sm text-muted-foreground">{sdk.description}</p>
            {!isDisabled && (
              <p className="text-xs text-muted-foreground mt-1">
                v{sdk.version} &middot; {sdk.packageName}
              </p>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

function OverviewTab() {
  const availableSdks = SDK_REGISTRY.filter((sdk) => sdk.status !== 'coming-soon');
  const comingSoonSdks = SDK_REGISTRY.filter((sdk) => sdk.status === 'coming-soon');

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="overview-about">
        <h2 id="overview-about" className="text-lg font-semibold text-foreground mb-3">
          About the SDK
        </h2>
        <p className="text-muted-foreground">
          The IntelliFlow CRM SDK provides typed client libraries for integrating with the
          IntelliFlow CRM API. The primary SDK is{' '}
          <code className="text-sm bg-muted px-1 py-0.5 rounded">@intelliflow/api-client</code>{' '}
          (v0.1.0), offering both React hooks and a vanilla TypeScript client.
        </p>
      </section>

      <section aria-labelledby="overview-available">
        <h2 id="overview-available" className="text-lg font-semibold text-foreground mb-3">
          Available SDKs
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {availableSdks.map((sdk) => (
            <SdkCard key={sdk.id} sdk={sdk} />
          ))}
        </div>
      </section>

      {comingSoonSdks.length > 0 && (
        <section aria-labelledby="overview-coming-soon">
          <h2 id="overview-coming-soon" className="text-lg font-semibold text-foreground mb-3">
            Coming Soon
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {comingSoonSdks.map((sdk) => (
              <SdkCard key={sdk.id} sdk={sdk} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="overview-prereqs">
        <h2 id="overview-prereqs" className="text-lg font-semibold text-foreground mb-3">
          Prerequisites
        </h2>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li>Node.js 18 or later</li>
          <li>npm, pnpm, or yarn package manager</li>
          <li>
            {'IntelliFlow CRM API key ('}
            <code className="text-sm bg-muted px-1 py-0.5 rounded">ifc_live_*</code>
            {' or '}
            <code className="text-sm bg-muted px-1 py-0.5 rounded">ifc_test_*</code>
            {')'}
          </li>
        </ul>
      </section>
    </div>
  );
}

function InstallationTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="install-package">
        <h2 id="install-package" className="text-lg font-semibold text-foreground mb-3">
          Install the Package
        </h2>
        <div className="flex flex-col gap-3">
          <CodeBlock code="npm install @intelliflow/api-client" label="npm" />
          <CodeBlock code="pnpm add @intelliflow/api-client" label="pnpm" />
          <CodeBlock code="yarn add @intelliflow/api-client" label="yarn" />
        </div>
      </section>

      <section aria-labelledby="install-env">
        <h2 id="install-env" className="text-lg font-semibold text-foreground mb-3">
          Environment Setup
        </h2>
        <CodeBlock
          code={`# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
INTELLIFLOW_API_KEY=ifc_test_your_key_here`}
          label=".env.local"
        />
      </section>
    </div>
  );
}

function QuickstartTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="quickstart-react">
        <h2 id="quickstart-react" className="text-lg font-semibold text-foreground mb-3">
          React Client
        </h2>
        <p className="text-muted-foreground mb-3">
          Wrap your app with{' '}
          <code className="text-sm bg-muted px-1 py-0.5 rounded">TRPCProvider</code>
          {', then use the'}
          typed <code className="text-sm bg-muted px-1 py-0.5 rounded">trpc</code> hooks.
        </p>
        <CodeBlock
          code={`import { TRPCProvider } from '@intelliflow/api-client';

function App({ children }) {
  return (
    <TRPCProvider url="http://localhost:3001">
      {children}
    </TRPCProvider>
  );
}`}
          label="Provider Setup"
        />
        <div className="mt-3">
          <CodeBlock
            code={`import { trpc } from '@intelliflow/api-client';

function LeadsList() {
  const { data, isLoading } = trpc.lead.list.useQuery({
    limit: 10,
    offset: 0,
  });

  if (isLoading) return <div>Loading...</div>;
  return <ul>{data?.items.map(l => <li key={l.id}>{l.name}</li>)}</ul>;
}`}
            label="Using Hooks"
          />
        </div>
      </section>

      <section aria-labelledby="quickstart-vanilla">
        <h2 id="quickstart-vanilla" className="text-lg font-semibold text-foreground mb-3">
          Vanilla Client
        </h2>
        <p className="text-muted-foreground mb-3">
          For server-side or non-React usage, use the vanilla tRPC client.
        </p>
        <CodeBlock
          code={`import { createTRPCClient } from '@intelliflow/api-client';

const client = createTRPCClient({
  url: 'http://localhost:3001',
  headers: { Authorization: 'Bearer ifc_live_your_key' },
});

const leads = await client.lead.list.query({ limit: 10 });
console.log(leads.items);`}
          label="Vanilla Client"
        />
      </section>
    </div>
  );
}

function DownloadsTab() {
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="downloads-packages">
        <h2 id="downloads-packages" className="text-lg font-semibold text-foreground mb-3">
          SDK Packages
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {SDK_REGISTRY.map((sdk) => (
            <SdkCard key={sdk.id} sdk={sdk} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function SdkGuides() {
  return (
    <div data-testid="sdk-guides">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="installation">Installation</TabsTrigger>
          <TabsTrigger value="quickstart">Quickstart</TabsTrigger>
          <TabsTrigger value="downloads">Downloads</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab />
        </TabsContent>

        <TabsContent value="installation">
          <InstallationTab />
        </TabsContent>

        <TabsContent value="quickstart">
          <QuickstartTab />
        </TabsContent>

        <TabsContent value="downloads">
          <DownloadsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
