'use client';

/**
 * Event types (PG-203). The create/edit dialog lives here and is opened from the
 * section header through the `openCreate` handle (playbook §4, forwardRef +
 * useImperativeHandle); focus returns to whatever opened it. Colour is
 * decorative — every row states its facts in text.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Badge, Button, EmptyState } from '@intelliflow/ui';
import type { CreateEventTypeInput, EventTypeDto } from '@intelliflow/validators';
import { eventTypeSwatchClass } from '@/components/calendar/event-type-colors';
import { EventTypeDialog, LOCATION_LABELS, type EventTypeSaveResult } from './EventTypeDialog';

export interface EventTypeListHandle {
  openCreate: () => void;
}

export interface EventTypeListProps {
  items: EventTypeDto[];
  canEdit: boolean;
  isBusy: boolean;
  isSaving: boolean;
  /** `<origin>/book/<handle>` when public booking is on, else null. */
  bookingBaseUrl: string | null;
  defaultHost: { id: string; name: string | null } | null;
  describedBy?: string;
  onSave: (input: CreateEventTypeInput, id: string | null) => Promise<EventTypeSaveResult>;
  onDelete: (item: EventTypeDto) => void;
}

interface RowProps {
  item: EventTypeDto;
  locked: boolean;
  bookingBaseUrl: string | null;
  describedBy?: string;
  onEdit: (item: EventTypeDto, trigger: HTMLElement) => void;
  onDelete: (item: EventTypeDto) => void;
}

function EventTypeRow({
  item,
  locked,
  bookingBaseUrl,
  describedBy,
  onEdit,
  onDelete,
}: Readonly<RowProps>) {
  const [copied, setCopied] = useState(false);
  const bookable = Boolean(bookingBaseUrl) && item.isActive && item.hostAvailable;
  const facts = [
    `${item.durationMinutes} min`,
    LOCATION_LABELS[item.locationType],
    item.hostAvailable && item.hostName ? `Host: ${item.hostName}` : null,
  ].filter(Boolean);

  const copy = async () => {
    await navigator.clipboard.writeText(`${bookingBaseUrl}/${item.slug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <li
      className="flex flex-wrap items-center gap-3 px-3 py-3"
      data-testid={`event-type-row-${item.id}`}
    >
      <span
        className={`inline-block h-3 w-3 shrink-0 rounded-full ${eventTypeSwatchClass(item.colorToken)}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{item.name}</span>
          {!item.isActive && <Badge variant="outline">Inactive</Badge>}
          {!item.hostAvailable && <Badge variant="outline">Host unavailable</Badge>}
        </div>
        <div className="text-xs text-muted-foreground">{facts.join(' · ')}</div>
        <div className="font-mono text-xs text-muted-foreground">/{item.slug}</div>
      </div>
      <div className="flex items-center gap-1">
        {bookable && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Copy link for ${item.name}`}
            onClick={copy}
          >
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        )}
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Edit ${item.name}`}
          aria-describedby={describedBy}
          disabled={locked}
          onClick={(event) => onEdit(item, event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Delete ${item.name}`}
          aria-describedby={describedBy}
          disabled={locked}
          onClick={() => onDelete(item)}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export const EventTypeList = forwardRef<EventTypeListHandle, EventTypeListProps>(
  function EventTypeList(
    {
      items,
      canEdit,
      isBusy,
      isSaving,
      bookingBaseUrl,
      defaultHost,
      describedBy,
      onSave,
      onDelete,
    },
    ref
  ) {
    // `session` remounts the dialog on every opening, so its draft starts from the chosen
    // type once and is never reset by a parent re-render while the user is typing or saving.
    const [dialog, setDialog] = useState<{
      open: boolean;
      item: EventTypeDto | null;
      session: number;
    }>({ open: false, item: null, session: 0 });
    const returnFocus = useRef<HTMLElement | null>(null);

    const open = (item: EventTypeDto | null, trigger: Element | null) => {
      returnFocus.current = trigger instanceof HTMLElement ? trigger : null;
      setDialog((current) => ({ open: true, item, session: current.session + 1 }));
    };
    useImperativeHandle(ref, () => ({
      openCreate: () => open(null, document.activeElement),
    }));

    const close = () => {
      setDialog((current) => ({ ...current, open: false }));
      const target = returnFocus.current;
      if (target) setTimeout(() => target.focus(), 0);
    };

    const locked = !canEdit || isBusy;

    return (
      <div className="space-y-3">
        {items.length === 0 ? (
          <EmptyState
            entity="appointments"
            phase="passive"
            size="sm"
            title="No event types yet"
            description="Create a meeting type to pre-fill new appointments and to offer it on your booking page."
            className="py-4 px-3 gap-2"
            // A11Y-11: a passive region is not an interactive tab stop.
            tabIndex={-1}
            aria-label="No event types"
          />
        ) : (
          <ul
            className="divide-y divide-border rounded-lg border border-border"
            aria-label="Event types"
          >
            {items.map((item) => (
              <EventTypeRow
                key={item.id}
                item={item}
                locked={locked}
                bookingBaseUrl={bookingBaseUrl}
                describedBy={canEdit ? undefined : describedBy}
                onEdit={(row, trigger) => open(row, trigger)}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}

        <EventTypeDialog
          key={dialog.session}
          open={dialog.open}
          eventType={dialog.item}
          existing={items}
          defaultHost={defaultHost}
          isSaving={isSaving}
          onSave={(input) => onSave(input, dialog.item?.id ?? null)}
          onClose={close}
        />
      </div>
    );
  }
);
