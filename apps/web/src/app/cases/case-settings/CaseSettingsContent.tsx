'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { Card, ConfirmationDialog, toast } from '@intelliflow/ui';
import { PageHeader, type PageAction } from '@/components/shared/page-header';
import type { CaseSettingsInput } from '@intelliflow/validators';

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export default function CaseSettingsContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const utils = trpc.useUtils();

  const query = trpc.caseSettings.get.useQuery(undefined, { enabled: isAuthenticated });
  const updateMutation = trpc.caseSettings.update.useMutation({
    onSuccess: () => {
      utils.caseSettings.get.invalidate();
      setIsDirty(false);
      toast({ title: 'Settings saved', variant: 'success' });
    },
    onError: (err) => {
      toast({ title: 'Failed to save settings', description: err.message, variant: 'destructive' });
    },
  });
  const resetMutation = trpc.caseSettings.resetToDefaults.useMutation({
    onSuccess: () => {
      utils.caseSettings.get.invalidate();
      setIsDirty(false);
      toast({ title: 'Settings reset to defaults' });
    },
    onError: (err) => {
      toast({
        title: 'Failed to reset settings',
        description: err.message,
        variant: 'destructive',
      });
    },
  });

  const [local, setLocal] = useState<CaseSettingsInput>({
    casePrefix: 'CASE-',
    defaultPriority: 'MEDIUM',
    autoAssignEnabled: false,
    autoAssignUserId: null,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  const usersQuery = trpc.user.list.useQuery(
    { search: userSearch },
    { enabled: isAuthenticated && local.autoAssignEnabled }
  );

  useEffect(() => {
    if (query.data) {
      setLocal({
        casePrefix: query.data.casePrefix,
        defaultPriority: query.data.defaultPriority as CaseSettingsInput['defaultPriority'],
        autoAssignEnabled: query.data.autoAssignEnabled,
        autoAssignUserId: query.data.autoAssignUserId ?? null,
      });
      setIsDirty(false);
    }
  }, [query.data]);

  const handleChange = useCallback(
    <K extends keyof CaseSettingsInput>(key: K, value: CaseSettingsInput[K]) => {
      setLocal((prev) => ({ ...prev, [key]: value }));
      setIsDirty(true);
    },
    []
  );

  const handleSave = useCallback(async () => {
    await updateMutation.mutateAsync(local);
  }, [local, updateMutation]);

  const handleReset = useCallback(async () => {
    await resetMutation.mutateAsync();
    setShowResetDialog(false);
  }, [resetMutation]);

  const actions = useMemo<PageAction[]>(
    () => [
      {
        label: 'Reset to Defaults',
        variant: 'secondary' as const,
        onClick: () => setShowResetDialog(true),
      },
      {
        label: 'Save Changes',
        variant: 'primary' as const,
        onClick: () => void handleSave(),
        disabled: !isDirty || updateMutation.isPending,
      },
    ],
    [handleSave, isDirty, updateMutation.isPending]
  );

  if (authLoading || query.isLoading) {
    return (
      <div className="w-full animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {[7, 5, 12, 12].map((span, i) => (
            <div key={i} className={`lg:col-span-${span} h-40 bg-muted rounded`} />
          ))}
        </div>
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
        <p className="text-sm text-destructive">{query.error.message}</p>
        <button
          onClick={() => query.refetch()}
          className="px-4 py-2 text-sm rounded border border-border hover:bg-muted"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Cases', href: '/cases' },
          { label: 'Case Settings' },
        ]}
        title="Case Settings"
        description="Configure case prefix, default priority, and auto-assign behaviour."
        actions={actions}
        className="mb-6"
      />

      <ConfirmationDialog
        open={showResetDialog}
        onOpenChange={setShowResetDialog}
        title="Reset Case Settings?"
        description="This will restore all case settings to their factory defaults. Your current configuration will be lost."
        confirmLabel="Reset to Defaults"
        variant="destructive"
        onConfirm={handleReset}
      />

      {/* BENTO GRID
          Row 1: Case Prefix (7) + Default Priority (5)
          Row 2: Auto-Assign Config (12)
          Row 3: Configuration Summary (12) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Case Prefix */}
        <Card className="lg:col-span-7 p-4 sm:p-6">
          <SectionHeader
            icon="badge"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Case Prefix"
            description="Prefix added to case identifiers (e.g. CASE-0001)."
          />
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground" htmlFor="case-prefix">
              Case Prefix
            </label>
            <input
              id="case-prefix"
              type="text"
              value={local.casePrefix}
              onChange={(e) => handleChange('casePrefix', e.target.value.toUpperCase())}
              placeholder="CASE-"
              maxLength={20}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <p className="text-xs text-muted-foreground">
              Uppercase letters, digits, and hyphens only. Max 20 characters.
            </p>
          </div>
        </Card>

        {/* Default Priority */}
        <Card className="lg:col-span-5 p-4 sm:p-6">
          <SectionHeader
            icon="priority_high"
            iconBg="bg-amber-100 dark:bg-amber-900/30"
            iconFg="text-amber-600 dark:text-amber-400"
            title="Default Priority"
            description="Priority assigned to new cases when not explicitly set."
          />
          <div className="space-y-3">
            <label className="block text-sm font-medium text-foreground" htmlFor="default-priority">
              Default Priority
            </label>
            <select
              id="default-priority"
              value={local.defaultPriority}
              onChange={(e) =>
                handleChange(
                  'defaultPriority',
                  e.target.value as CaseSettingsInput['defaultPriority']
                )
              }
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0) + p.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>
        </Card>

        {/* Auto-Assign Config */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="person_add"
            iconBg="bg-green-100 dark:bg-green-900/30"
            iconFg="text-green-600 dark:text-green-400"
            title="Auto-Assign"
            description="Automatically assign new cases to a specific team member."
          />
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                role="switch"
                aria-checked={local.autoAssignEnabled}
                aria-label="Enable auto-assign"
                onClick={() => {
                  const next = !local.autoAssignEnabled;
                  handleChange('autoAssignEnabled', next);
                  if (!next) handleChange('autoAssignUserId', null);
                }}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  local.autoAssignEnabled ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    local.autoAssignEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
              <span className="text-sm font-medium text-foreground">Enable Auto-Assign</span>
            </div>

            {local.autoAssignEnabled && (
              <div className="space-y-2">
                <label
                  className="block text-sm font-medium text-foreground"
                  htmlFor="auto-assign-user"
                >
                  Assign To
                </label>
                <input
                  id="auto-assign-user-search"
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search team members…"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
                {usersQuery.data &&
                  'users' in usersQuery.data &&
                  (usersQuery.data as { users: unknown[] }).users.length > 0 && (
                    <ul className="rounded-md border border-border bg-popover shadow-md mt-1 max-h-48 overflow-y-auto">
                      {(
                        usersQuery.data as {
                          users: { id: string; name?: string | null; email: string }[];
                        }
                      ).users.map((u) => (
                        <li key={u.id}>
                          <button
                            type="button"
                            onClick={() => {
                              handleChange('autoAssignUserId', u.id);
                              setUserSearch(u.name ?? u.email);
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                              local.autoAssignUserId === u.id ? 'bg-accent font-medium' : ''
                            }`}
                          >
                            {u.name ?? u.email}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                {query.data?.autoAssignUserId && !query.data.autoAssignUser && (
                  <p className="text-xs text-muted-foreground">(user removed)</p>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Configuration Summary */}
        <Card className="lg:col-span-12 p-4 sm:p-6">
          <SectionHeader
            icon="summarize"
            iconBg="bg-slate-100 dark:bg-slate-800"
            iconFg="text-slate-600 dark:text-slate-400"
            title="Configuration Summary"
            description="Current active case settings at a glance."
          />
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <dt className="text-muted-foreground">Case Prefix</dt>
              <dd className="font-medium">{query.data?.casePrefix ?? local.casePrefix}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Default Priority</dt>
              <dd className="font-medium capitalize">
                {(query.data?.defaultPriority ?? local.defaultPriority).toLowerCase()}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Auto-Assign</dt>
              <dd className="font-medium">
                {query.data?.autoAssignEnabled
                  ? query.data.autoAssignUser
                    ? (query.data.autoAssignUser.name ?? query.data.autoAssignUser.email)
                    : 'Enabled (no user)'
                  : 'Disabled'}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
