'use client';

/**
 * Event Types — Module Settings (PG-203, ADR-083).
 *
 * Meeting templates applied in the New Appointment form and bookable on the
 * firm's public booking page, plus the firm's booking link. Reads are open to
 * every user; changes are limited to admins and managers — the server is
 * authoritative, the UI only explains. Mirrors the PG-205 contact-types page.
 */
import { useRef, useState } from 'react';
import { Button, Card, toast } from '@intelliflow/ui';
import type { BookingLinkInput, CreateEventTypeInput, EventTypeDto } from '@intelliflow/validators';
import { useRequireAuth } from '@/lib/auth/AuthContext';
import { trpc } from '@/lib/trpc';
import { PageHeader } from '@/components/shared/page-header';
import { SectionHeader } from '@/components/shared/section-header';
import { DeleteTypeDialog } from '@/components/settings/DeleteTypeDialog';
import { EventTypeList, type EventTypeListHandle } from './components/EventTypeList';
import type { EventTypeSaveResult } from './components/EventTypeDialog';
import {
  BookingLinkCard,
  useOrigin,
  type BookingLinkSaveResult,
} from './components/BookingLinkCard';
import { EventTypesLoading } from './EventTypesLoading';

const READ_ONLY_NOTE_ID = 'event-types-read-only-note';

/** The tRPC error code of a failed request, if any. */
export function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('data' in error)) return undefined;
  const data = (error as { data?: { code?: unknown } }).data;
  return typeof data?.code === 'string' ? data.code : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Please try again.';
}

export default function EventTypesContent() {
  const auth = useRequireAuth();
  const { isLoading: authLoading, isAuthenticated } = auth;
  const enabled = isAuthenticated && !authLoading;
  const utils = trpc.useUtils();
  const listRef = useRef<EventTypeListHandle>(null);
  const origin = useOrigin();

  const listQuery = trpc.calendar.eventTypes.list.useQuery(undefined, { enabled });
  // Router-wide: also refreshes calendar.eventTypes.listActive, which the appointment form caches.
  const refresh = () => utils.calendar.eventTypes.invalidate();
  const createMutation = trpc.calendar.eventTypes.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.calendar.eventTypes.update.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.calendar.eventTypes.delete.useMutation({ onSuccess: refresh });
  const linkMutation = trpc.calendar.eventTypes.setBookingLink.useMutation({ onSuccess: refresh });

  const [pendingDelete, setPendingDelete] = useState<EventTypeDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const deletedRef = useRef(false);

  const handleSave = async (
    input: CreateEventTypeInput,
    id: string | null
  ): Promise<EventTypeSaveResult> => {
    try {
      const saved = id
        ? await updateMutation.mutateAsync({ ...input, id })
        : await createMutation.mutateAsync(input);
      toast({ title: id ? 'Event type updated' : 'Event type created', description: saved.name });
      setAnnouncement(`${saved.name} saved.`);
      return { ok: true };
    } catch (error) {
      if (errorCode(error) === 'CONFLICT' || errorCode(error) === 'NOT_FOUND') {
        return { ok: false, error: errorMessage(error) };
      }
      toast({
        title: 'Could not save event type',
        description: errorMessage(error),
        variant: 'destructive',
      });
      return { ok: false };
    }
  };

  const handleLinkSave = async (input: BookingLinkInput): Promise<BookingLinkSaveResult> => {
    try {
      await linkMutation.mutateAsync(input);
      toast({ title: input.handle ? 'Booking link saved' : 'Public booking turned off' });
      setAnnouncement(input.handle ? 'Booking link saved.' : 'Public booking turned off.');
      return { ok: true };
    } catch (error) {
      if (errorCode(error) === 'CONFLICT') return { ok: false, error: errorMessage(error) };
      toast({
        title: 'Could not save the booking link',
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
      toast({ title: 'Event type deleted', description: name });
      deletedRef.current = true;
    } catch (error) {
      setDeleteError(errorMessage(error));
    }
  };

  if (authLoading || listQuery.isLoading) return <EventTypesLoading />;

  if (listQuery.error || !listQuery.data) {
    const notDeployed = errorCode(listQuery.error) === 'NOT_FOUND';
    return (
      <div className="w-full text-center py-12">
        <h1 className="sr-only">Event Types</h1>
        {notDeployed ? (
          <p className="text-muted-foreground mb-4">
            Event types are not available yet in this environment. Try again after the next release.
          </p>
        ) : (
          <p className="text-red-700 dark:text-red-300 mb-4" role="alert">
            Failed to load event types{listQuery.error ? `: ${listQuery.error.message}` : '.'}
          </p>
        )}
        <Button type="button" variant="outline" onClick={() => listQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const { items, canEdit, bookingLink } = listQuery.data;
  const describedBy = canEdit ? undefined : READ_ONLY_NOTE_ID;
  const bookingOn = Boolean(bookingLink.handle) && bookingLink.availabilityConfigured;
  const bookingBaseUrl = bookingOn && origin ? `${origin}/book/${bookingLink.handle}` : null;
  const isBusy = deleteMutation.isPending;
  const isSaving = createMutation.isPending || updateMutation.isPending;
  const defaultHost = auth.user ? { id: auth.user.id, name: auth.user.name } : null;

  return (
    <div className="w-full">
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/' },
          { label: 'Calendar', href: '/calendar' },
          { label: 'Event Types' },
        ]}
        title="Event Types"
        description="Meeting types for the New Appointment form and your public booking page."
        className="mb-6"
      />

      <output aria-live="polite" className="sr-only">
        {announcement}
      </output>

      {!canEdit && (
        <p id={READ_ONLY_NOTE_ID} className="mb-4 text-sm text-muted-foreground">
          Only administrators and managers can change event types. You can view them here.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        <Card className="lg:col-span-8 p-4 sm:p-5">
          <SectionHeader
            icon="event_note"
            iconBg="bg-blue-100 dark:bg-blue-900/30"
            iconFg="text-blue-600 dark:text-blue-400"
            title="Event types"
            headingLevel={2}
            description="Inactive types are hidden from the appointment form and the booking page."
            action={
              <Button
                id="new-event-type-button"
                type="button"
                size="sm"
                onClick={() => listRef.current?.openCreate()}
                disabled={!canEdit || isBusy}
                aria-describedby={describedBy}
              >
                New Event Type
              </Button>
            }
          />
          <EventTypeList
            ref={listRef}
            items={items}
            canEdit={canEdit}
            isBusy={isBusy}
            isSaving={isSaving}
            bookingBaseUrl={bookingBaseUrl}
            defaultHost={defaultHost}
            describedBy={describedBy}
            onSave={handleSave}
            onDelete={(item) => {
              setDeleteError(null);
              setPendingDelete(item);
            }}
          />
        </Card>

        <Card className="lg:col-span-4 p-4 sm:p-5">
          <SectionHeader
            icon="link"
            iconBg="bg-violet-100 dark:bg-violet-900/30"
            iconFg="text-violet-600 dark:text-violet-400"
            title="Booking link"
            headingLevel={2}
            description="Clients book an event type at /book/<your handle>/<slug>."
          />
          <BookingLinkCard
            link={bookingLink}
            canEdit={canEdit}
            isSaving={linkMutation.isPending}
            describedBy={describedBy}
            onSave={handleLinkSave}
          />
        </Card>
      </div>

      <DeleteTypeDialog
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
          document.getElementById('new-event-type-button')?.focus();
        }}
        fallbackName="event type"
        description="Existing appointments of this type keep all their details and simply lose the type. Its booking link stops working."
      />
    </div>
  );
}
