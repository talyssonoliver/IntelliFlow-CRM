'use client';

import Link from 'next/link';
import { useCallback } from 'react';
import { Card, Badge, Button } from '@intelliflow/ui';
import { PageHeader } from '@/components/shared/page-header';
import { useAuth } from '@/lib/auth/AuthContext';
import { revalidateModuleAccess, revalidateAllDashboardCaches } from '@/app/settings/actions';

const integrations = [
  { name: 'Slack', description: 'Team communication and notifications', icon: 'chat', connected: true, category: 'communication' },
  { name: 'Google Calendar', description: 'Calendar sync and scheduling', icon: 'calendar_today', connected: true, category: 'productivity' },
  { name: 'Salesforce', description: 'CRM data synchronization', icon: 'cloud', connected: false, category: 'crm' },
  { name: 'HubSpot', description: 'Marketing automation platform', icon: 'hub', connected: false, category: 'marketing' },
  { name: 'Mailchimp', description: 'Email campaigns and newsletters', icon: 'mail', connected: false, category: 'marketing' },
  { name: 'Zapier', description: 'Workflow automation and triggers', icon: 'bolt', connected: true, category: 'automation' },
];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const connected = integrations.filter((i) => i.connected);
  const available = integrations.filter((i) => !i.connected);

  const handleDisconnect = useCallback(
    (name: string) => {
      // Disconnecting an integration may revoke module access entitlements.
      // Invalidate MODULE_ACCESS + DASHBOARD so cached feature flags refresh.
      if (user?.id) {
        revalidateModuleAccess(user.id).catch(() => {});
        revalidateAllDashboardCaches(user.id).catch(() => {});
      }
      // TODO: wire to real trpc.integrations.disconnect mutation when available.
      console.info(`[integrations] disconnect requested for: ${name}`);
    },
    [user]
  );

  const handleConnect = useCallback(
    (name: string) => {
      // Connecting an integration may grant new module access entitlements.
      if (user?.id) {
        revalidateModuleAccess(user.id).catch(() => {});
        revalidateAllDashboardCaches(user.id).catch(() => {});
      }
      console.info(`[integrations] connect requested for: ${name}`);
    },
    [user]
  );

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
                <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[18px]">check_circle</span>
              </div>
              <h3 className="text-lg font-semibold text-foreground">Connected</h3>
              <Badge variant="secondary">{connected.length}</Badge>
            </div>
          </div>

          <div className="space-y-4">
            {connected.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center justify-between p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-slate-600 dark:text-slate-300 text-[24px]">
                      {integration.icon}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{integration.name}</h4>
                      <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">
                        Connected
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{integration.description}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleDisconnect(integration.name)}>
                  Disconnect
                </Button>
              </div>
            ))}
          </div>
        </Card>

        {/* ─── Integration Stats Sidebar ─────────────────────────────── */}
        <div className="lg:col-span-4 space-y-5">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-[18px]">extension</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Overview</h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-foreground">{integrations.length}</p>
                <p className="text-xs text-muted-foreground">Available</p>
              </div>
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{connected.length}</p>
                <p className="text-xs text-muted-foreground">Connected</p>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700">
              <Link
                href="/developers/apps"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
              >
                <span className="material-symbols-outlined text-[16px]" aria-hidden="true">code</span>
                <span className="underline-offset-4 hover:underline">Developer Portal</span>
              </Link>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px]">category</span>
              </div>
              <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider">Categories</h3>
            </div>

            <div className="space-y-3">
              {[
                { label: 'Communication', icon: 'chat', count: integrations.filter(i => i.category === 'communication').length },
                { label: 'Productivity', icon: 'schedule', count: integrations.filter(i => i.category === 'productivity').length },
                { label: 'CRM', icon: 'contacts', count: integrations.filter(i => i.category === 'crm').length },
                { label: 'Marketing', icon: 'campaign', count: integrations.filter(i => i.category === 'marketing').length },
                { label: 'Automation', icon: 'bolt', count: integrations.filter(i => i.category === 'automation').length },
              ].map((cat) => (
                <div key={cat.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-slate-400 text-[16px]">{cat.icon}</span>
                    <span className="text-sm text-muted-foreground">{cat.label}</span>
                  </div>
                  <Badge variant="secondary">{cat.count}</Badge>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ─── Available Integrations ────────────────────────────────── */}
        <Card className="lg:col-span-12 p-6 md:p-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-[18px]">add_circle</span>
            </div>
            <h3 className="text-lg font-semibold text-foreground">Available Integrations</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {available.map((integration) => (
              <div
                key={integration.name}
                className="flex items-center gap-3 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700"
              >
                <div className="w-10 h-10 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-slate-500 dark:text-slate-400 text-[20px]">
                    {integration.icon}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm">{integration.name}</p>
                  <p className="text-xs text-muted-foreground">{integration.description}</p>
                </div>
                <Button size="sm" onClick={() => handleConnect(integration.name)}>
                  Connect
                </Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
