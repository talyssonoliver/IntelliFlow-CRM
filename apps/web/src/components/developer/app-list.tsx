'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, Badge, Button, EmptyState } from '@intelliflow/ui';
import { generateApiKey } from '@/lib/developer/api-key-generator';
import { DEMO_APPS, type DeveloperApp } from '@/lib/developer/demo-data';

export type { DeveloperApp } from '@/lib/developer/demo-data';

function StatusBadge({ status }: Readonly<{ status: DeveloperApp['status'] }>) {
  switch (status) {
    case 'active':
      return <Badge variant="default">Active</Badge>;
    case 'inactive':
      return <Badge variant="outline">Inactive</Badge>;
    case 'pending':
      return <Badge variant="warning">Pending</Badge>;
  }
}

function EnvironmentBadge({ environment }: Readonly<{ environment: DeveloperApp['environment'] }>) {
  return (
    <Badge variant="secondary">{environment === 'production' ? 'Production' : 'Sandbox'}</Badge>
  );
}

export function AppList() {
  const [apps, setApps] = useState<DeveloperApp[]>(DEMO_APPS);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [newlyGeneratedKeyId, setNewlyGeneratedKeyId] = useState<string | null>(null);

  const handleGenerateKey = (appId: string) => {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;

    const newKey = generateApiKey({
      name: `${app.name} Key`,
      environment: app.environment,
      scopes: app.scopes,
    });

    setApps((prev) =>
      prev.map((a) => (a.id === appId ? { ...a, apiKeys: [...a.apiKeys, newKey] } : a))
    );
    setNewlyGeneratedKeyId(newKey.id);
    setRevealedKeyId(newKey.id);
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
  };

  const handleRevealToggle = (keyId: string) => {
    setRevealedKeyId((prev) => (prev === keyId ? null : keyId));
  };

  if (apps.length === 0) {
    return (
      <div>
        <EmptyState entity="insights" phase="passive" />
        <Link
          href="/developers/apps/new"
          className="mt-4 inline-block text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          Create your first app
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {apps.map((app) => (
        <section key={app.id} aria-labelledby={`app-${app.id}`}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2
                  id={`app-${app.id}`}
                  className="text-lg font-semibold leading-none tracking-tight"
                >
                  {app.name}
                </h2>
                <div className="flex gap-2">
                  <StatusBadge status={app.status} />
                  <EnvironmentBadge environment={app.environment} />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{app.description}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Client ID */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Client ID
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="text-sm bg-muted px-2 py-1 rounded font-mono">
                      {app.clientId}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCopy(app.clientId)}
                      aria-label={`Copy client ID for ${app.name}`}
                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        content_copy
                      </span>
                    </Button>
                  </div>
                </div>

                {/* API Keys */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      API Keys ({app.apiKeys.length})
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleGenerateKey(app.id)}
                      aria-label={`Generate API key for ${app.name}`}
                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                        add
                      </span>{' '}
                      Generate API Key
                    </Button>
                  </div>

                  {app.apiKeys.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {app.apiKeys.map((apiKey) => (
                        <div
                          key={apiKey.id}
                          className="flex items-center gap-2 p-2 bg-muted/50 rounded text-sm"
                        >
                          <span
                            className="material-symbols-outlined text-sm text-muted-foreground"
                            aria-hidden="true"
                          >
                            key
                          </span>
                          <span className="font-medium text-xs">{apiKey.name}</span>
                          <code className="font-mono text-xs flex-1 truncate">
                            {revealedKeyId === apiKey.id && newlyGeneratedKeyId === apiKey.id
                              ? apiKey.key
                              : apiKey.maskedKey}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevealToggle(apiKey.id)}
                            aria-label={
                              revealedKeyId === apiKey.id
                                ? `Hide API key ${apiKey.name}`
                                : `Reveal API key ${apiKey.name}`
                            }
                            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                              {revealedKeyId === apiKey.id ? 'visibility_off' : 'visibility'}
                            </span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCopy(apiKey.maskedKey)}
                            aria-label={`Copy API key ${apiKey.name}`}
                            className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                              content_copy
                            </span>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Webhook URL */}
                {app.webhookUrl && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Webhook URL
                    </span>
                    <p className="text-sm font-mono mt-1 truncate">{app.webhookUrl}</p>
                  </div>
                )}

                {/* Scopes */}
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Scopes
                  </span>
                  <div className="flex gap-1 mt-1">
                    {app.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="text-xs">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2 border-t">
                  <Link
                    href={`/developers/apps/${app.id}`}
                    className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                  >
                    View Details
                  </Link>
                  <Link
                    href="/developers/apps/new"
                    className="text-sm text-muted-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
                  >
                    Create New App
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  );
}
