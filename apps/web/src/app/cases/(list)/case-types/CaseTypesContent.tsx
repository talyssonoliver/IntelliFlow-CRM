'use client';

/**
 * Case Types — Module Settings (PG-204, ADR-076).
 *
 * A case type's defaults (priority, SLA deadline, required fields, resolution
 * checklist) are applied when a case is created. Reads are open to every user;
 * changes are limited to admins and managers — the server is authoritative,
 * the UI only explains.
 */
import { useMemo, useRef, useState } from 'react';
import { Button, Card, Label, RadioGroup, RadioGroupItem, toast } from '@intelliflow/ui';
import type { CaseTypeDto } from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { CaseTypeList, type CaseTypeListHandle } from './components/CaseTypeList';
import type { CaseTypeSaveInput, CaseTypeSaveResult } from './components/CaseTypeDialog';
import { DeleteCaseTypeDialog } from './components/DeleteCaseTypeDialog';
import { CaseTypesLoading } from './CaseTypesLoading';

const NO_DEFAULT = '__none__';
const READ_ONLY_NOTE_ID = 'case-types-read-only-note';

/** The tRPC error code of a failed mutation, if any. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

export default function CaseTypesContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const listRef = useRef<CaseTypeListHandle>(null);

  const listQuery = trpc.caseTypes.list.useQuery(undefined, { enabled });
  // Router-wide: also refreshes caseTypes.listActive, which the New Case picker caches for 5 min.
  const refresh = () => utils.caseTypes.invalidate();
  const createMutation = trpc.caseTypes.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.caseTypes.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.caseTypes.delete.useMutation({ onSuccess: refresh });
  const setDefaultMutation = trpc.caseTypes.setDefault.useMutation({ onSuccess: refresh });

  const [pendingDelete, setPendingDelete] = useState<CaseTypeDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const deletedRef = useRef(false);

  const types = useMemo(() => listQuery.data?.types ?? [], [listQuery.data]);
  const canEdit = listQuery.data?.canEdit ?? false;
  const isBusy = deleteMutation.isPending || setDefaultMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (
    input: CaseTypeSaveInput,
    id: string | null
  ): Promise<CaseTypeSaveResult> => {
    try {
      const saved = id
        ? await updateMutation.mutateAsync({ ...input, id })
        : await createMutation.mutateAsync(input);
      toast({ title: id ? 'Case type updated' : 'Case type created', description: saved.name });
      setAnnouncement(`${saved.name} saved.`);
      return { ok: true };
    } catch (error) {
      if (errorCode(error) === 'CONFLICT') return { ok: false, error: errorMessage(error) };
      toast({
        title: 'Could not save case type',
        description: errorMessage(error),
        variant: 'destructive',
      });
      return { ok: false };
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const name = pendingDelete.name;
    try {
      await deleteMutation.mutateAsync({ id: pendingDelete.id });
      setPendingDelete(null);
      setDeleteError(null);
      setAnnouncement(`${name} deleted.`);
      toast({ title: 'Case type deleted', description: name });
      deletedRef.current = true;
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  };

  const changeDefault = (value: string) => {
    const id = value === NO_DEFAULT ? null : value;
    setDefaultMutation.mutate(
      { id },
      {
        onSuccess: () => {
          const name = types.find((t) => t.id === id)?.name;
          setAnnouncement(
            name ? `Default case type set to ${name}.` : 'Default case type cleared.'
          );
        },
        onError: (error) =>
          toast({
            title: 'Could not change the default case type',
            description: error.message,
            variant: 'destructive',
          }),
      }
    );
  };

  if (authLoading || listQuery.isLoading) return <CaseTypesLoading />;

  if (listQuery.error || !listQuery.data) {
    return (
      <div className="w-full text-center py-12">
        <p className="text-destructive mb-4" role="alert">
          Failed to load case types{listQuery.error ? `: ${listQuery.error.message}` : '.'}
        </p>
        <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const defaultId = types.find((t) => t.isDefault)?.id ?? NO_DEFAULT;
  const describedBy = canEdit ? undefined : READ_ONLY_NOTE_ID;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Cases', href: '/cases' },
          { label: 'Case Types' },
        ]}
        title="Case Types"
        description="Defaults applied when a case is created: priority, deadline, required fields and a resolution checklist."
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      {!canEdit && (
        <p id={READ_ONLY_NOTE_ID} className="mb-4 text-sm text-muted-foreground">
          Only administrators and managers can change case types. You can view them here.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5">
          <SectionHeader
            icon="category"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Case types"
            description="Shown in the New Case form. Inactive types are hidden there but kept on existing cases."
            action={
              <Button
                id="new-case-type-button"
                type="button"
                size="sm"
                onClick={() => listRef.current?.openCreate()}
                disabled={!canEdit || isBusy}
                aria-describedby={describedBy}
              >
                New Case Type
              </Button>
            }
          />
          <CaseTypeList
            ref={listRef}
            types={types}
            canEdit={canEdit}
            isBusy={isBusy}
            isSaving={isSaving}
            describedBy={describedBy}
            onSave={handleSave}
            onDelete={(type) => {
              setDeleteError(null);
              setPendingDelete(type);
            }}
          />
        </Card>

        <Card className="lg:col-span-4 p-4 sm:p-5">
          <SectionHeader
            icon="flag"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Default case type"
            titleId="default-case-type-heading"
            description="Preselected in the New Case form. It must be active; people can still pick another type or none."
          />
          <RadioGroup
            value={defaultId}
            onValueChange={changeDefault}
            aria-labelledby="default-case-type-heading"
            aria-describedby={describedBy}
            className="flex flex-col gap-3"
            disabled={!canEdit || isBusy}
          >
            <div className="flex min-h-6 items-center gap-2">
              <RadioGroupItem id="default-case-type-none" value={NO_DEFAULT} />
              <Label htmlFor="default-case-type-none">No default</Label>
            </div>
            {types.map((type) => (
              <div key={type.id} className="flex min-h-6 items-center gap-2">
                <RadioGroupItem
                  id={`default-case-type-${type.id}`}
                  value={type.id}
                  disabled={!type.isActive}
                />
                <Label htmlFor={`default-case-type-${type.id}`}>
                  {type.name}
                  {type.isActive ? '' : ' (inactive)'}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </Card>
      </div>

      <DeleteCaseTypeDialog
        name={pendingDelete?.name ?? null}
        isDeleting={deleteMutation.isPending}
        error={deleteError}
        onConfirm={confirmDelete}
        onCancel={() => {
          setPendingDelete(null);
          setDeleteError(null);
        }}
        onCloseAutoFocus={(event) => {
          if (!deletedRef.current) return;
          // The deleted row's Delete button is gone; move focus somewhere useful.
          deletedRef.current = false;
          event.preventDefault();
          document.getElementById('new-case-type-button')?.focus();
        }}
      />
    </div>
  );
}
