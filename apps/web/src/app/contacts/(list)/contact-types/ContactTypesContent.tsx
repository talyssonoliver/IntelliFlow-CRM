'use client';

/**
 * Contact Types — Module Settings (PG-205, ADR-080).
 *
 * A contact type's defaults (status, department, owner rule, required fields,
 * default tags) are applied when a contact is created. Reads are open to every
 * user; changes are limited to admins and managers — the server is
 * authoritative, the UI only explains. Mirrors the PG-204 case-types page.
 */
import { useMemo, useRef, useState } from 'react';
import { Button, Card, Label, RadioGroup, RadioGroupItem, toast } from '@intelliflow/ui';
import type { ContactTypeDto } from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { ContactTypeList, type ContactTypeListHandle } from './components/ContactTypeList';
import type { ContactTypeSaveInput, ContactTypeSaveResult } from './components/ContactTypeDialog';
import type { DefaultTagOption } from './components/DefaultTagPicker';
import { DeleteContactTypeDialog } from './components/DeleteContactTypeDialog';
import { ContactTypesLoading } from './ContactTypesLoading';

const NO_DEFAULT = '__none__';
const READ_ONLY_NOTE_ID = 'contact-types-read-only-note';

/** The tRPC error code of a failed mutation, if any. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

export default function ContactTypesContent() {
  const { isLoading: authLoading, isAuthenticated } = useRequireAuth();
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const listRef = useRef<ContactTypeListHandle>(null);

  const listQuery = trpc.contactTypes.list.useQuery(undefined, { enabled });
  const tagsQuery = trpc.contactSettings.tags.list.useQuery(undefined, { enabled });
  // Router-wide: also refreshes contactTypes.listActive, which the contact pickers cache for 5 min.
  const refresh = () => utils.contactTypes.invalidate();
  const createMutation = trpc.contactTypes.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.contactTypes.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.contactTypes.delete.useMutation({ onSuccess: refresh });
  const setDefaultMutation = trpc.contactTypes.setDefault.useMutation({ onSuccess: refresh });

  const [pendingDelete, setPendingDelete] = useState<ContactTypeDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const deletedRef = useRef(false);

  const types = useMemo(() => listQuery.data?.types ?? [], [listQuery.data]);
  const tags = useMemo<DefaultTagOption[]>(
    () =>
      (tagsQuery.data ?? []).map((tag) => ({ id: tag.id, name: tag.name, isActive: tag.isActive })),
    [tagsQuery.data]
  );
  const canEdit = listQuery.data?.canEdit ?? false;
  const isBusy = deleteMutation.isPending || setDefaultMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;

  const handleSave = async (
    input: ContactTypeSaveInput,
    id: string | null
  ): Promise<ContactTypeSaveResult> => {
    try {
      const saved = id
        ? await updateMutation.mutateAsync({ ...input, id })
        : await createMutation.mutateAsync(input);
      toast({
        title: id ? 'Contact type updated' : 'Contact type created',
        description: saved.name,
      });
      setAnnouncement(`${saved.name} saved.`);
      return { ok: true };
    } catch (error) {
      if (errorCode(error) === 'CONFLICT') return { ok: false, error: errorMessage(error) };
      toast({
        title: 'Could not save contact type',
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
      toast({ title: 'Contact type deleted', description: name });
      deletedRef.current = true;
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  };

  // Radix radios select on arrow focus, so moving through the group only changes a draft;
  // the default is saved by the "Save default" button (one write, on purpose).
  const [draftDefaultId, setDraftDefaultId] = useState<string | null>(null);

  const saveDefault = (value: string) => {
    if (isBusy) return;
    const id = value === NO_DEFAULT ? null : value;
    setDefaultMutation.mutate(
      { id },
      {
        onSuccess: () => {
          setDraftDefaultId(null);
          const name = types.find((t) => t.id === id)?.name;
          setAnnouncement(
            name ? `Default contact type set to ${name}.` : 'Default contact type cleared.'
          );
        },
        onError: (error) =>
          toast({
            title: 'Could not change the default contact type',
            description: error.message,
            variant: 'destructive',
          }),
      }
    );
  };

  if (authLoading || listQuery.isLoading) return <ContactTypesLoading />;

  if (listQuery.error || !listQuery.data) {
    return (
      <div className="w-full text-center py-12">
        <h1 className="sr-only">Contact Types</h1>
        <p className="text-red-700 dark:text-red-300 mb-4" role="alert">
          Failed to load contact types{listQuery.error ? `: ${listQuery.error.message}` : '.'}
        </p>
        <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const savedDefaultId = types.find((t) => t.isDefault)?.id ?? NO_DEFAULT;
  const defaultId = draftDefaultId ?? savedDefaultId;
  const describedBy = canEdit ? undefined : READ_ONLY_NOTE_ID;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Contacts', href: '/contacts' },
          { label: 'Contact Types' },
        ]}
        title="Contact Types"
        description="Defaults applied when a contact is created: status, department, owner, required fields and tags."
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {setDefaultMutation.isPending ? 'Saving the default contact type…' : announcement}
      </output>

      {!canEdit && (
        <p id={READ_ONLY_NOTE_ID} className="mb-4 text-sm text-muted-foreground">
          Only administrators and managers can change contact types. You can view them here.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5">
          <SectionHeader
            icon="badge"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Contact types"
            headingLevel={2}
            description="Shown in the contact forms. Inactive types are hidden there but kept on existing contacts."
            action={
              <Button
                id="new-contact-type-button"
                type="button"
                size="sm"
                onClick={() => listRef.current?.openCreate()}
                disabled={!canEdit || isBusy}
                aria-describedby={describedBy}
              >
                New Contact Type
              </Button>
            }
          />
          <ContactTypeList
            ref={listRef}
            types={types}
            tags={tags}
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
            title="Default contact type"
            titleId="default-contact-type-heading"
            headingLevel={2}
            description="Preselected in the New Contact form. It must be active; people can still pick another type or none."
          />
          <RadioGroup
            value={defaultId}
            onValueChange={setDraftDefaultId}
            aria-labelledby="default-contact-type-heading"
            aria-describedby={describedBy}
            className="flex flex-col gap-3"
            disabled={!canEdit}
            aria-busy={setDefaultMutation.isPending}
          >
            <div className="flex min-h-6 items-center gap-2">
              <RadioGroupItem id="default-contact-type-none" value={NO_DEFAULT} />
              <Label htmlFor="default-contact-type-none">No default</Label>
            </div>
            {types.map((type) => (
              <div key={type.id} className="flex min-h-6 items-center gap-2">
                <RadioGroupItem
                  id={`default-contact-type-${type.id}`}
                  value={type.id}
                  disabled={!type.isActive}
                />
                <Label htmlFor={`default-contact-type-${type.id}`}>
                  {type.name}
                  {type.isActive ? '' : ' (inactive)'}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <Button
            type="button"
            variant="outline"
            className="mt-4"
            onClick={() => saveDefault(defaultId)}
            disabled={!canEdit || isBusy || defaultId === savedDefaultId}
          >
            Save default
          </Button>
          {setDefaultMutation.isPending && (
            <p className="mt-3 text-sm text-muted-foreground" aria-hidden="true">
              Saving the default contact type…
            </p>
          )}
        </Card>
      </div>

      <DeleteContactTypeDialog
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
          document.getElementById('new-contact-type-button')?.focus();
        }}
      />
    </div>
  );
}
