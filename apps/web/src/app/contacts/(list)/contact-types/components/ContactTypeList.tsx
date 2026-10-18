'use client';

/**
 * Contact types (PG-205), in their sort order. The create/edit dialog lives here
 * and is opened from the section header through the `openCreate` handle
 * (playbook §4, forwardRef + useImperativeHandle); focus returns to whatever
 * opened it. Colour is decorative — every row states its facts in text. A delete
 * the server would refuse (built-in, default or in-use type) is blocked here with
 * `aria-disabled` and a visible reason, so keyboard users can reach the reason.
 */
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Badge, Button, EmptyState } from '@intelliflow/ui';
import type { ContactTypeDto } from '@intelliflow/validators';
import { contactTypeSwatchClass } from '@/components/contacts/contact-type-colors';
import {
  ContactTypeDialog,
  STATUS_LABELS,
  type ContactTypeSaveInput,
  type ContactTypeSaveResult,
} from './ContactTypeDialog';
import type { DefaultTagOption } from './DefaultTagPicker';

export interface ContactTypeListHandle {
  openCreate: () => void;
}

export interface ContactTypeListProps {
  types: ContactTypeDto[];
  tags: readonly DefaultTagOption[];
  canEdit: boolean;
  isBusy: boolean;
  isSaving: boolean;
  /** Ids referenced by `aria-describedby` on disabled controls (read-only note). */
  describedBy?: string;
  onSave: (input: ContactTypeSaveInput, id: string | null) => Promise<ContactTypeSaveResult>;
  onDelete: (type: ContactTypeDto) => void;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** Why the server would refuse to delete this type, or null when it can be deleted. */
export function deleteBlockedReason(type: ContactTypeDto): string | null {
  if (type.isSystem) return 'Built-in types cannot be deleted. Deactivate it instead.';
  if (type.isDefault) return 'The default type cannot be deleted. Choose another default first.';
  if (type.contactCount > 0) {
    return `${plural(type.contactCount, 'contact uses', 'contacts use')} this type. Deactivate it instead.`;
  }
  return null;
}

interface RowProps {
  type: ContactTypeDto;
  locked: boolean;
  describedBy?: string;
  onEdit: (type: ContactTypeDto, trigger: HTMLElement) => void;
  onDelete: (type: ContactTypeDto) => void;
}

function ContactTypeRow({ type, locked, describedBy, onEdit, onDelete }: Readonly<RowProps>) {
  const facts = [
    type.defaultStatus ? `Status: ${STATUS_LABELS[type.defaultStatus]}` : null,
    type.defaultDepartment ? `Department: ${type.defaultDepartment}` : null,
    type.defaultOwner === 'ACCOUNT_OWNER' ? 'Owner: account owner' : null,
    type.requiredFields.length > 0
      ? plural(type.requiredFields.length, 'required field', 'required fields')
      : null,
    type.defaultTags.length > 0
      ? plural(type.defaultTags.length, 'default tag', 'default tags')
      : null,
  ].filter(Boolean);
  const blockedReason = locked ? null : deleteBlockedReason(type);
  const reasonId = `contact-type-delete-reason-${type.id}`;

  return (
    <li
      className="flex flex-wrap items-center gap-3 px-3 py-3"
      data-testid={`contact-type-row-${type.id}`}
    >
      <span
        className={`inline-block h-3 w-3 shrink-0 rounded-full ${contactTypeSwatchClass(type.colorToken)}`}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{type.name}</span>
          {type.isDefault && <Badge variant="secondary">Default</Badge>}
          {type.isSystem && <Badge variant="outline">Built-in</Badge>}
          {!type.isActive && <Badge variant="outline">Inactive</Badge>}
          <span className="text-xs text-muted-foreground">
            {plural(type.contactCount, 'contact', 'contacts')}
          </span>
        </div>
        {facts.length > 0 && (
          <div className="text-xs text-muted-foreground">{facts.join(' · ')}</div>
        )}
        {blockedReason && (
          <p id={reasonId} className="text-xs text-muted-foreground">
            {blockedReason}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Edit ${type.name}`}
          aria-describedby={describedBy}
          disabled={locked}
          onClick={(event) => onEdit(type, event.currentTarget)}
        >
          Edit
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Delete ${type.name}`}
          aria-describedby={blockedReason ? reasonId : describedBy}
          aria-disabled={blockedReason ? true : undefined}
          disabled={locked}
          onClick={() => {
            if (!blockedReason) onDelete(type);
          }}
        >
          Delete
        </Button>
      </div>
    </li>
  );
}

export const ContactTypeList = forwardRef<ContactTypeListHandle, ContactTypeListProps>(
  function ContactTypeList(
    { types, tags, canEdit, isBusy, isSaving, describedBy, onSave, onDelete },
    ref
  ) {
    const [dialog, setDialog] = useState<{ open: boolean; type: ContactTypeDto | null }>({
      open: false,
      type: null,
    });
    const returnFocus = useRef<HTMLElement | null>(null);

    const open = (type: ContactTypeDto | null, trigger: Element | null) => {
      returnFocus.current = trigger instanceof HTMLElement ? trigger : null;
      setDialog({ open: true, type });
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
        {types.length === 0 ? (
          <EmptyState
            entity="contacts"
            variant="folder"
            phase="passive"
            size="sm"
            title="No contact types yet"
            description="Create a type to pre-fill status, department, owner and tags on new contacts."
            className="py-4 px-3 gap-2"
            // A11Y-11: a passive region is not an interactive tab stop.
            tabIndex={-1}
            aria-label="No contact types"
          />
        ) : (
          <ul
            className="divide-y divide-border rounded-lg border border-border"
            aria-label="Contact types"
          >
            {types.map((type) => (
              <ContactTypeRow
                key={type.id}
                type={type}
                locked={locked}
                describedBy={canEdit ? undefined : describedBy}
                onEdit={(row, trigger) => open(row, trigger)}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}

        <ContactTypeDialog
          open={dialog.open}
          contactType={dialog.type}
          existing={types}
          tags={tags}
          isSaving={isSaving}
          onSave={(input) => onSave(input, dialog.type?.id ?? null)}
          onClose={close}
        />
      </div>
    );
  }
);
