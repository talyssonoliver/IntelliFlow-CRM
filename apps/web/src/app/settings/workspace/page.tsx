'use client';

/**
 * Workspace settings — the business type.
 * Owner ruling 23/11/2026: vertical modules (Cases, Tickets, Commerce) follow the business type.
 * An admin can change it here. Changing it never deletes data; explicit module overrides are kept.
 */

import { useEffect, useState } from 'react';
import { Button, Card, toast } from '@intelliflow/ui';
import { MODULE_METADATA, type TenantBusinessType } from '@intelliflow/domain';
import { PageHeader } from '@/components/shared/page-header';
import { BusinessTypePicker } from '@/components/workspace/BusinessTypePicker';
import { BusinessTypeBanner } from '@/components/workspace/BusinessTypeBanner';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { trpc } from '@/lib/trpc';

export default function WorkspaceSettingsPage() {
  const { user } = useRequireAuth();
  // The server accepts the tenant ADMIN role only (setBusinessType), so the page offers the same.
  const isAdmin = user?.role === 'ADMIN';
  const utils = trpc.useUtils();
  const { businessType, enabledModules, isLoading } = useEnabledModules();
  const [selected, setSelected] = useState<TenantBusinessType | null>(null);

  useEffect(() => {
    setSelected(businessType);
  }, [businessType]);

  const mutation = trpc.moduleAccess.setBusinessType.useMutation({
    onSuccess: async () => {
      await utils.moduleAccess.getEnabledModules.invalidate();
      toast({ title: 'Business type saved', variant: 'default' });
    },
    onError: (error) => {
      toast({
        title: 'Could not save the business type',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const unchanged = selected === null || selected === businessType;

  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Settings', href: '/settings' },
          { label: 'Workspace' },
        ]}
        title="Workspace"
        description="What kind of business this workspace is. It decides which tools you get."
      />

      <BusinessTypeBanner />

      <Card className="max-w-2xl p-6">
        <BusinessTypePicker
          value={selected}
          onChange={setSelected}
          disabled={!isAdmin || isLoading || mutation.isPending}
          idPrefix="workspace-business-type"
          legend="Business type"
        />
        <p className="mt-4 text-xs text-muted-foreground">
          Only a workspace admin can change this. Changing it never deletes anything: a tool that
          already holds your data stays available.{' '}
          {!isAdmin && 'Ask an admin if this is not right for your business.'}
        </p>
        <div className="mt-4 flex justify-end">
          <Button
            onClick={() => selected && mutation.mutate({ businessType: selected })}
            disabled={!isAdmin || unchanged || mutation.isPending}
          >
            Save
          </Button>
        </div>
      </Card>

      <Card className="max-w-2xl p-6">
        <h2 className="text-sm font-semibold">Tools in this workspace</h2>
        <ul className="mt-3 flex flex-wrap gap-2" aria-label="Enabled modules">
          {enabledModules.map((moduleId) => (
            <li
              key={moduleId}
              className="rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium"
            >
              {MODULE_METADATA[moduleId].label}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
