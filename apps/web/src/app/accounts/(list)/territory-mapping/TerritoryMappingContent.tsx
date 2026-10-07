'use client';

/**
 * Territory Mapping — Module Settings (PG-197).
 *
 * Territories decide who owns new accounts when Auto-assign owner is on
 * (ADR-074). Reads are open to every tenant user; changes are limited to
 * admins and managers — the server is authoritative, the UI only explains.
 */
import { useMemo, useRef, useState } from 'react';
import {
  Button,
  Card,
  ConfirmationDialog,
  Label,
  RadioGroup,
  RadioGroupItem,
  toast,
} from '@intelliflow/ui';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '@intelliflow/domain';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from './components/SectionHeader';
import {
  TerritoryList,
  type TerritoryListHandle,
  type TerritoryRow,
} from './components/TerritoryList';
import type { TerritorySaveInput } from './components/TerritoryDialog';
import { CoverageSummary } from './components/CoverageSummary';
import { TerritoryMappingLoading } from './TerritoryMappingLoading';

const ADMIN_ROLES: ReadonlySet<string> = new Set(ACCOUNT_OWNER_ADMIN_ROLES);
const NO_DEFAULT = '__none__';

function showError(title: string, error: { message: string }) {
  toast({ title, description: error.message, variant: 'destructive' });
}

export default function TerritoryMappingContent() {
  const { isLoading: authLoading, isAuthenticated, user } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const canEdit = ADMIN_ROLES.has(user?.role ?? '');
  const utils = trpc.useUtils();
  const listRef = useRef<TerritoryListHandle>(null);

  const listQuery = trpc.accountTerritories.list.useQuery(undefined, { enabled });
  const membersQuery = trpc.account.assignees.useQuery(undefined, { enabled });

  const refresh = () => utils.accountTerritories.list.invalidate();
  const createMutation = trpc.accountTerritories.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.accountTerritories.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.accountTerritories.delete.useMutation({
    onSuccess: refresh,
    onError: (error) => showError('Could not delete territory', error),
  });
  const reorderMutation = trpc.accountTerritories.reorder.useMutation({
    onSuccess: refresh,
    onError: (error) => {
      showError('Could not reorder territories', error);
      refresh().catch((err: unknown) => console.error('Failed to reload territories:', err));
    },
  });
  const setDefaultMutation = trpc.accountTerritories.setDefault.useMutation({
    onSuccess: refresh,
    onError: (error) => showError('Could not change the default territory', error),
  });
  const resetMutation = trpc.accountTerritories.resetToDefaults.useMutation({
    onSuccess: async () => {
      await refresh();
      toast({ title: 'Territories reset', description: 'All territories were deleted.' });
    },
    onError: (error) => showError('Could not reset territories', error),
  });

  const [pendingDelete, setPendingDelete] = useState<TerritoryRow | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

  const territories = useMemo<TerritoryRow[]>(() => {
    const rows = listQuery.data?.territories ?? [];
    if (!optimisticOrder) return rows;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ordered = optimisticOrder.flatMap((id) => byId.get(id) ?? []);
    return ordered.length === rows.length ? ordered : rows;
  }, [listQuery.data, optimisticOrder]);

  const counts = useMemo(
    () => ({
      rules: territories.reduce((sum, t) => sum + t.rules.length, 0),
      members: new Set(territories.flatMap((t) => t.members.map((m) => m.userId))).size,
    }),
    [territories]
  );

  const isBusy =
    reorderMutation.isPending ||
    deleteMutation.isPending ||
    setDefaultMutation.isPending ||
    resetMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (
    input: TerritorySaveInput,
    id: string | null
  ): Promise<TerritoryRow | undefined> => {
    try {
      const saved = id
        ? await updateMutation.mutateAsync({ ...input, id })
        : await createMutation.mutateAsync(input);
      toast({ title: id ? 'Territory updated' : 'Territory created', description: saved.name });
      return saved;
    } catch (error) {
      showError(
        'Could not save territory',
        error instanceof Error ? error : { message: 'Please try again.' }
      );
      return undefined;
    }
  };

  const handleReorder = (ids: string[]) => {
    setOptimisticOrder(ids);
    reorderMutation.mutate({ ids }, { onSettled: () => setOptimisticOrder(null) });
  };

  const defaultId = territories.find((t) => t.isDefault)?.id ?? NO_DEFAULT;

  const actions = useMemo(
    () => [
      {
        label: 'Reset to Defaults',
        onClick: () => setResetOpen(true),
        variant: 'secondary' as const,
        icon: 'restart_alt',
        disabled: !canEdit || isBusy,
      },
    ],
    [canEdit, isBusy]
  );

  if (authLoading || listQuery.isLoading) return <TerritoryMappingLoading />;

  if (listQuery.error || !listQuery.data) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4">
          Failed to load territories{listQuery.error ? `: ${listQuery.error.message}` : '.'}
        </p>
        <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Accounts', href: '/accounts' },
          { label: 'Territory Mapping' },
        ]}
        title="Territory Mapping"
        description="Assign new accounts to owners by country, region and postcode."
        actions={actions}
        className="mb-6"
      />

      {!canEdit && (
        <p className="mb-4 text-sm text-muted-foreground" role="note">
          Only admins and managers can change territories. You can view them and test an address.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5">
          <SectionHeader
            icon="map"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Territories"
            description="Evaluated top to bottom; the first active territory whose rule matches wins."
            action={
              <Button
                type="button"
                size="sm"
                onClick={() => listRef.current?.openCreate()}
                disabled={!canEdit || isBusy}
              >
                New Territory
              </Button>
            }
          />
          <TerritoryList
            ref={listRef}
            territories={territories}
            members={membersQuery.data ?? []}
            membersLoading={membersQuery.isLoading}
            membersError={!!membersQuery.error}
            canEdit={canEdit}
            isBusy={isBusy}
            isSaving={isSaving}
            onSave={handleSave}
            onDelete={setPendingDelete}
            onReorder={handleReorder}
          />
        </Card>

        <Card className="lg:col-span-4 p-4 sm:p-5">
          <SectionHeader
            icon="location_on"
            iconBg="bg-emerald-100 dark:bg-emerald-900/30"
            iconFg="text-emerald-600 dark:text-emerald-400"
            title="Coverage"
            description="What happens to a new account."
          />
          <CoverageSummary
            autoAssignOwner={listQuery.data.autoAssignOwner}
            territoryCount={territories.length}
            ruleCount={counts.rules}
            memberCount={counts.members}
            onPreview={(input) => utils.accountTerritories.preview.fetch(input)}
          />
        </Card>

        <Card className="lg:col-span-12 p-4 sm:p-5">
          <SectionHeader
            icon="flag"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Default territory"
            titleId="default-territory-heading"
            description="Used when no rule matches, including accounts with no location. It must be active."
          />
          <RadioGroup
            value={defaultId}
            onValueChange={(value) =>
              setDefaultMutation.mutate({ id: value === NO_DEFAULT ? null : value })
            }
            aria-labelledby="default-territory-heading"
            className="flex flex-wrap gap-x-6 gap-y-3"
            disabled={!canEdit || isBusy}
          >
            <div className="flex items-center gap-2">
              <RadioGroupItem id="default-none" value={NO_DEFAULT} />
              <Label htmlFor="default-none">No default</Label>
            </div>
            {territories.map((territory) => (
              <div key={territory.id} className="flex items-center gap-2">
                <RadioGroupItem id={`default-${territory.id}`} value={territory.id} />
                <Label htmlFor={`default-${territory.id}`}>
                  {territory.name}
                  {territory.isActive ? '' : ' (inactive)'}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </Card>
      </div>

      <ConfirmationDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => (open ? null : setPendingDelete(null))}
        title={`Delete ${pendingDelete?.name ?? 'territory'}?`}
        description="Its rules and members are removed. Accounts it already assigned keep their owners."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!pendingDelete) return;
          await deleteMutation.mutateAsync({ id: pendingDelete.id }).catch(() => undefined);
          setPendingDelete(null);
        }}
      />
      <ConfirmationDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset territories?"
        description="This deletes all territories, their rules and members. Account owners and the Auto-assign owner setting are not changed."
        confirmLabel="Reset"
        variant="destructive"
        isLoading={resetMutation.isPending}
        onConfirm={async () => {
          await resetMutation.mutateAsync().catch(() => undefined);
          setResetOpen(false);
        }}
      />
    </div>
  );
}
