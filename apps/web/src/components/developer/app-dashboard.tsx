'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardHeader,
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  EmptyState,
} from '@intelliflow/ui';
import { generateApiKey } from '@/lib/developer/api-key-generator';
import { findAppById, type DeveloperApp, type ApiKey } from '@/lib/developer/demo-data';
import { AppMetrics } from '@/components/developer/app-metrics';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface RequestLogEntry {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  endpoint: string;
  statusCode: number;
  latencyMs: number;
  apiKeyId: string;
}

const DEMO_LOGS: Record<string, RequestLogEntry[]> = {
  'app-001': [
    {
      id: 'log-001',
      timestamp: '2026-02-24T10:15:32Z',
      method: 'GET',
      endpoint: '/api/v1/contacts',
      statusCode: 200,
      latencyMs: 45,
      apiKeyId: 'key-001',
    },
    {
      id: 'log-002',
      timestamp: '2026-02-24T10:14:21Z',
      method: 'POST',
      endpoint: '/api/v1/deals',
      statusCode: 201,
      latencyMs: 120,
      apiKeyId: 'key-001',
    },
    {
      id: 'log-003',
      timestamp: '2026-02-24T10:12:05Z',
      method: 'GET',
      endpoint: '/api/v1/analytics/revenue',
      statusCode: 200,
      latencyMs: 230,
      apiKeyId: 'key-002',
    },
    {
      id: 'log-004',
      timestamp: '2026-02-24T10:10:55Z',
      method: 'PUT',
      endpoint: '/api/v1/contacts/123',
      statusCode: 200,
      latencyMs: 85,
      apiKeyId: 'key-001',
    },
    {
      id: 'log-005',
      timestamp: '2026-02-24T10:08:30Z',
      method: 'DELETE',
      endpoint: '/api/v1/tasks/456',
      statusCode: 204,
      latencyMs: 60,
      apiKeyId: 'key-001',
    },
    {
      id: 'log-006',
      timestamp: '2026-02-24T10:05:12Z',
      method: 'GET',
      endpoint: '/api/v1/leads',
      statusCode: 200,
      latencyMs: 55,
      apiKeyId: 'key-002',
    },
    {
      id: 'log-007',
      timestamp: '2026-02-24T09:58:44Z',
      method: 'PATCH',
      endpoint: '/api/v1/deals/789',
      statusCode: 200,
      latencyMs: 95,
      apiKeyId: 'key-001',
    },
    {
      id: 'log-008',
      timestamp: '2026-02-24T09:55:10Z',
      method: 'POST',
      endpoint: '/api/v1/contacts',
      statusCode: 400,
      latencyMs: 30,
      apiKeyId: 'key-001',
    },
  ],
  'app-003': [
    {
      id: 'log-009',
      timestamp: '2026-01-10T11:00:00Z',
      method: 'GET',
      endpoint: '/api/v1/legacy/sync',
      statusCode: 200,
      latencyMs: 340,
      apiKeyId: 'key-003',
    },
    {
      id: 'log-010',
      timestamp: '2026-01-10T10:45:00Z',
      method: 'POST',
      endpoint: '/api/v1/legacy/import',
      statusCode: 500,
      latencyMs: 1200,
      apiKeyId: 'key-003',
    },
  ],
};

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

function formatDate(isoString: string, timezone: string = 'Europe/London'): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: timezone,
  });
}

function formatTimestamp(isoString: string, timezone: string = 'Europe/London'): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone,
  });
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-blue-100 text-blue-800',
  POST: 'bg-green-100 text-green-800',
  PUT: 'bg-yellow-100 text-yellow-800',
  PATCH: 'bg-orange-100 text-orange-800',
  DELETE: 'bg-red-100 text-red-800',
};

export interface AppDashboardProps {
  appId: string;
}

export function AppDashboard({ appId }: Readonly<AppDashboardProps>) {
  const { timezone } = useTimezoneContext();
  const app = findAppById(appId);
  const [keys, setKeys] = useState<ApiKey[]>(app?.apiKeys ?? []);
  const [revealedKeyId, setRevealedKeyId] = useState<string | null>(null);
  const [newlyGeneratedKeyId, setNewlyGeneratedKeyId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  if (!app) {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="pt-6 text-center">
          <span
            className="material-symbols-outlined text-4xl text-muted-foreground"
            aria-hidden="true"
          >
            error
          </span>
          <h1 className="mt-2 text-lg font-semibold">App Not Found</h1>
          <p className="text-sm text-muted-foreground mt-1">
            The application you&apos;re looking for doesn&apos;t exist.
          </p>
          <Link
            href="/developers/apps"
            className="mt-4 inline-block text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
          >
            Back to Developer Apps
          </Link>
        </CardContent>
      </Card>
    );
  }

  const logs = DEMO_LOGS[app.id] ?? [];

  const handleGenerateKey = () => {
    const newKey = generateApiKey({
      name: `${app.name} Key`,
      environment: app.environment,
      scopes: app.scopes,
    });
    setKeys((prev) => [...prev, newKey]);
    setNewlyGeneratedKeyId(newKey.id);
    setRevealedKeyId(newKey.id);
  };

  const handleCopy = async (text: string, fieldId: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRevealToggle = (keyId: string) => {
    setRevealedKeyId((prev) => (prev === keyId ? null : keyId));
  };

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link
          href="/developers/apps"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          Developer Apps
        </Link>
        <span
          className="material-symbols-outlined text-sm text-muted-foreground"
          aria-hidden="true"
        >
          chevron_right
        </span>
        <span aria-current="page" className="font-medium">
          {app.name}
        </span>
      </nav>

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">{app.name}</h1>
        <StatusBadge status={app.status} />
        <EnvironmentBadge environment={app.environment} />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid gap-6 md:grid-cols-2">
            {/* App Info Card */}
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">App Information</h2>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Description
                  </span>
                  <p className="text-sm mt-1">{app.description}</p>
                </div>
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
                      onClick={() => handleCopy(app.clientId, 'clientId')}
                      aria-label={`Copy client ID for ${app.name}`}
                      className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="material-symbols-outlined text-sm" aria-hidden="true">
                        {copiedField === 'clientId' ? 'check' : 'content_copy'}
                      </span>
                    </Button>
                  </div>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Created
                  </span>
                  <p className="text-sm mt-1">{formatDate(app.createdAt, timezone)}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Environment
                  </span>
                  <p className="text-sm mt-1">
                    {app.environment === 'production' ? 'Production' : 'Sandbox'}
                  </p>
                </div>

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

                {/* Webhook URL */}
                {app.webhookUrl && (
                  <div>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Webhook URL
                    </span>
                    <p className="text-sm font-mono mt-1 truncate">{app.webhookUrl}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* API Keys Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">API Keys ({keys.length})</h2>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateKey}
                    aria-label={`Generate API key for ${app.name}`}
                    className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <span className="material-symbols-outlined text-sm mr-1" aria-hidden="true">
                      add
                    </span>{' '}
                    Generate API Key
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {keys.length === 0 ? (
                  <EmptyState entity="insights" phase="passive" className="py-4" />
                ) : (
                  <div className="space-y-3">
                    {keys.map((apiKey) => (
                      <div key={apiKey.id} className="p-3 bg-muted/50 rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="material-symbols-outlined text-sm text-muted-foreground"
                              aria-hidden="true"
                            >
                              key
                            </span>
                            <span className="font-medium text-sm">{apiKey.name}</span>
                          </div>
                          <div className="flex items-center gap-1">
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
                              <span
                                className="material-symbols-outlined text-sm"
                                aria-hidden="true"
                              >
                                {revealedKeyId === apiKey.id ? 'visibility_off' : 'visibility'}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(apiKey.maskedKey, `key-${apiKey.id}`)}
                              aria-label={`Copy API key ${apiKey.name}`}
                              className="focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                            >
                              <span
                                className="material-symbols-outlined text-sm"
                                aria-hidden="true"
                              >
                                content_copy
                              </span>
                            </Button>
                          </div>
                        </div>
                        <code className="font-mono text-xs block truncate">
                          {revealedKeyId === apiKey.id && newlyGeneratedKeyId === apiKey.id
                            ? apiKey.key
                            : apiKey.maskedKey}
                        </code>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Created: {formatDate(apiKey.createdAt, timezone)}</span>
                          <span data-testid={`last-used-${apiKey.id}`}>
                            Last used:{' '}
                            {apiKey.lastUsed ? formatDate(apiKey.lastUsed, timezone) : 'Never'}
                          </span>
                        </div>
                        <div className="flex gap-1">
                          {apiKey.scopes.map((scope) => (
                            <Badge key={scope} variant="outline" className="text-xs">
                              {scope}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Edit App Link */}
          <div className="mt-6">
            <Link
              href={`/developers/apps/${app.id}/edit`}
              className="text-sm text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
            >
              Edit App
            </Link>
          </div>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics">
          <AppMetrics app={app} />
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Request Logs</h2>
            </CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <EmptyState entity="insights" phase="passive" className="py-4" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-3 font-medium">Timestamp</th>
                        <th className="text-left py-2 px-3 font-medium">Method</th>
                        <th className="text-left py-2 px-3 font-medium">Endpoint</th>
                        <th className="text-left py-2 px-3 font-medium">Status</th>
                        <th className="text-left py-2 px-3 font-medium">Latency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-b last:border-0">
                          <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                            {formatTimestamp(log.timestamp, timezone)}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${METHOD_COLORS[log.method] ?? ''}`}
                            >
                              {log.method}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-xs">{log.endpoint}</td>
                          <td className="py-2 px-3">
                            <span
                              className={log.statusCode >= 400 ? 'text-red-600' : 'text-green-600'}
                            >
                              {log.statusCode}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-muted-foreground">{log.latencyMs}ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
