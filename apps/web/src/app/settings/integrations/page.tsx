'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { Card, Badge, Button, Skeleton, toast } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { useAuth } from '@/lib/auth/AuthContext';
import { revalidateModuleAccess, revalidateAllDashboardCaches } from '@/app/settings/actions';
import { trpc } from '@/lib/trpc';

type ConnectorStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

function isConnected(status: ConnectorStatus): boolean {
  return status === 'healthy' || status === 'degraded';
}

function statusLabel(status: ConnectorStatus): string {
  if (status === 'unknown') return 'Not configured';
  if (status === 'unhealthy') return 'Disconnected';
  if (status === 'degraded') return 'Degraded';
  return 'Connected';
}

function getConnectorIcon(type: string): string {
  const iconMap: Record<string, string> = {
    messaging: 'chat',
    email: 'mail',
    payment: 'payments',
    erp: 'corporate_fare',
  };
  return iconMap[type] ?? 'extension';
}

export default function IntegrationsPage() {
  const { user } = useAuth();
  const healthQuery = trpc.integrations.getAllConnectorsHealth.useQuery();
  const connectors = healthQuery.data?.connectors ?? [];
  const summary = healthQuery.data?.summary;

  const connected = connectors.filter((c) => isConnected(c.status));
  const available = connectors.filter((c) => !isConnected(c.status));

  // Category counts derived from real connector type field
  const typeCounts = connectors.reduce<Record<string, number>>((acc, c) => {
    acc[c.type] = (acc[c.type] ?? 0) + 1;
    return acc;
  }, {});

  const handleIntegrationAction = useCallback(
    async (action: 'connect' | 'disconnect') => {
      // No connect/disconnect mutations exist yet — show coming soon
      if (user?.id) {
        await revalidateModuleAccess(user.id).catch(() => {});
        await revalidateAllDashboardCaches(user.id).catch(() => {});
      }
      toast({
        title: 'Integration management coming soon',
        description: `${action === 'connect' ? 'Connecting' : 'Disconnecting'} integrations will be available in a future update.`,
        variant: 'default',
      });
    },
    [user]
  );

  if (healthQuery.isLoading) {
    return (
      <div
        className="pb-10"
        data-testid="integrations-loading"
        aria-busy="true"
        aria-label="Loading integrations"
      >
        <div className="mb-6 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-80" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-8">
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-4 space-y-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
          <div className="lg:col-span-12">
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (healthQuery.isError) {
    return (
      <div className="pb-10">
        <PageHeader
          breadcrumbs={[
            { label: 'Dashboard', href: '/' },
            { label: 'Settings', href: '/settings' },
            { label: 'Integrations' },
          ]}
          title="Integrations"
          description="Connect third-party apps and services to extend your CRM."
          className="mb-6"
        />
        <Card className="p-8 text-center">
          <span className="material-symbols-outlined text-4xl text-muted-foreground mb-4 block">
            error
          </span>
          <p className="text-sm text-muted-foreground mb-4">Failed to load integration status.</p>
          <Button variant="outline" onClick={() => void healthQuery.refetch()}>
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Integrations' },
        ]}
        title="Integrations"
        description="Connect third-party apps and services to extend your CRM."
        className="mb-6"
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ─── Connected Integrations ────────────────────────────────── */}
        <Card className="lg:col-span-8 p-6 md:p-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">
                  check_circle
                </span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Connected</h3>
              <Badge variant="secondary">{connected.length}</Badge>
            </div>
          </div>

          {connected.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No integrations connected yet.
            </p>
          ) : (
            <div className="space-y-4">
              {connected.map((connector) => (
                <div
                  key={connector.id}
                  className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 text-[24px]">
                        {getConnectorIcon(connector.type)}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium text-foreground">{connector.name}</h4>
                        <Badge
                          variant="secondary"
                          className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"
                        >
                          {statusLabel(connector.status)}
                        </Badge>
                        {connector.latencyMs !== null && connector.latencyMs !== undefined && (
                          <Badge variant="outline" className="text-[10px]">
                            {connector.latencyMs} ms
                          </Badge>
                        )}
                      </div>
                      {connector.errorMessage && (
                        <p className="text-xs text-destructive mt-1">{connector.errorMessage}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleIntegrationAction('disconnect')}
                  >
                    Disconnect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ─── Integration Stats Sidebar ─────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">
                  extension
                </span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                Overview
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">
                  {summary?.total ?? connectors.length}
                </p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                  {summary?.healthy ?? connected.length}
                </p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Link
                href="/developers/apps"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                  code
                </span>
                <span className="underline-offset-4 hover:underline">Developer Portal</span>
              </Link>
            </div>
          </Card>

          {Object.keys(typeCounts).length > 0 && (
            <Card className="p-6">
              <div className="flex items-center gap-2 mb-5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">
                    category
                  </span>
                </div>
                <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">
                  Categories
                </h3>
              </div>

              <div className="space-y-3">
                {Object.entries(typeCounts).map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-slate-400 text-[16px]">
                        {getConnectorIcon(type)}
                      </span>
                      <span className="text-sm text-muted-foreground capitalize">{type}</span>
                    </div>
                    <Badge variant="secondary">{count}</Badge>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ─── Available Integrations ────────────────────────────────── */}
        <Card className="lg:col-span-12 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-[18px]">
                add_circle
              </span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Available Integrations</h3>
          </div>

          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              All integrations are connected.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {available.map((connector) => (
                <div
                  key={connector.id}
                  className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
                >
                  <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">
                      {getConnectorIcon(connector.type)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{connector.name}</p>
                    <p className="text-xs text-muted-foreground">{statusLabel(connector.status)}</p>
                  </div>
                  <Button size="sm" onClick={() => void handleIntegrationAction('connect')}>
                    Connect
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
