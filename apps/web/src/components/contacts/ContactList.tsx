'use client';

import React, { useMemo } from 'react';
import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable, EmptyState, TableRowActions, type BulkAction, Skeleton } from '@intelliflow/ui';
import { EntityHoverCard } from '@/components/shared/entity-hover-card';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'PROSPECT' | 'CUSTOMER' | 'FORMER_CUSTOMER';

interface Contact {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
  department: string | null;
  accountId: string | null;
  status: ContactStatus;
  createdAt: Date | string;
  owner?: { id: string; email: string; name: string | null } | null;
  account?: { id: string; name: string } | null;
  _count?: { opportunities: number; tasks: number };
}

export interface ContactListProps {
  contacts: Contact[];
  total: number;
  isLoading: boolean;
  onRowClick: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkEmail: (ids: string[]) => void;
  onBulkExport: (ids: string[], format: 'csv' | 'json') => void;
  onEdit?: (contact: Contact) => void;
  onCreateDeal?: (contact: Contact) => void;
  onCreateTicket?: (contact: Contact) => void;
  onScheduleMeeting?: (contact: Contact) => void;
  pageSize?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getAvatarColor(name: string) {
  const colors = [
    'bg-amber-200 text-amber-800 border-amber-300',
    'bg-indigo-100 text-indigo-700 border-indigo-200',
    'bg-emerald-100 text-emerald-700 border-emerald-200',
    'bg-rose-100 text-rose-700 border-rose-200',
    'bg-sky-100 text-sky-700 border-sky-200',
  ];
  const hash = name.split('').reduce((acc, char) => acc + (char.codePointAt(0) ?? 0), 0);
  return colors[hash % colors.length];
}

function formatDate(date: Date | string, timezone: string = 'Europe/London'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone });
}

// ─── Column sub-components (module-level — fixes S6478) ─────────────────────────

function ContactNameCell({ contact }: Readonly<{ contact: Contact }>) {
  const name = `${contact.firstName}${contact.lastName}`;
  const initials = `${contact.firstName?.[0] || ''}${contact.lastName?.[0] || ''}`.toUpperCase() || '?';
  return (
    <div className="flex items-center gap-3">
      <span
        className={`size-10 rounded-full shrink-0 flex items-center justify-center font-bold text-sm border ${getAvatarColor(name)}`}
        aria-hidden="true"
      >
        {initials}
      </span>
      <div>
        <p className="font-medium text-slate-900 dark:text-white">
          {contact.firstName} {contact.lastName}
        </p>
        {contact.title && (
          <p className="text-sm text-slate-500 dark:text-slate-400">{contact.title}</p>
        )}
      </div>
    </div>
  );
}

function ContactAccountCell({ contact }: Readonly<{ contact: Contact }>) {
  return (
    <div>
      <p className="font-medium text-slate-900 dark:text-white">
        {contact.account?.name || '-'}
      </p>
      {contact.department && (
        <p className="text-sm text-slate-500 dark:text-slate-400">{contact.department}</p>
      )}
    </div>
  );
}

function ContactEmailCell({ contact }: Readonly<{ contact: Contact }>) {
  return (
    <EntityHoverCard
      email={contact.email}
      displayName={`${contact.firstName} ${contact.lastName}`.trim()}
    >
      <a
        href={`/email/compose?to=${encodeURIComponent(contact.email)}`}
        onClick={(e) => e.stopPropagation()}
        className="text-primary hover:underline text-sm"
        aria-label={`Send email to ${contact.firstName} ${contact.lastName}`}
      >
        {contact.email}
      </a>
    </EntityHoverCard>
  );
}

function ContactPhoneCell({ contact }: Readonly<{ contact: Contact }>) {
  return (
    <span className="text-sm text-slate-500 dark:text-slate-400">{contact.phone || '-'}</span>
  );
}

function ContactAddedCell({ contact, timezone }: Readonly<{ contact: Contact; timezone: string }>) {
  return (
    <span className="text-sm text-slate-600 dark:text-slate-400">
      {formatDate(contact.createdAt, timezone)}
    </span>
  );
}

const noActivityCell = (
  <span className="text-sm text-muted-foreground italic">No activity</span>
);

function ContactActivityCell({ contact }: Readonly<{ contact: Contact }>) {
  const opp = contact._count?.opportunities ?? 0;
  const tasks = contact._count?.tasks ?? 0;
  if (opp === 0 && tasks === 0) return noActivityCell;
  return (
    <div className="flex flex-col gap-1">
      {opp > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">handshake</span>
          {opp} {opp === 1 ? 'Deal' : 'Deals'}
        </span>
      )}
      {tasks > 0 && (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          <span className="material-symbols-outlined text-sm" aria-hidden="true">task_alt</span>
          {tasks} {tasks === 1 ? 'Task' : 'Tasks'}
        </span>
      )}
    </div>
  );
}

function ContactActionsHeader() {
  return <span className="block text-right">Actions</span>;
}

interface ContactActionCallbacks {
  onDelete: (c: Contact) => void;
  onEdit?: (c: Contact) => void;
  onCreateDeal?: (c: Contact) => void;
  onCreateTicket?: (c: Contact) => void;
  onScheduleMeeting?: (c: Contact) => void;
}

function ContactActionsCell({
  contact,
  onDelete,
  onEdit,
  onCreateDeal,
  onCreateTicket,
  onScheduleMeeting,
}: Readonly<{ contact: Contact } & ContactActionCallbacks>) {
  return (
    <TableRowActions
      quickActions={[
        {
          icon: 'phone',
          label: 'Call',
          onClick: () => { if (contact.phone) window.open(`tel:${contact.phone}`); },
        },
        {
          icon: 'mail',
          label: 'Send Email',
          onClick: () => { window.location.href = `/email/compose?to=${encodeURIComponent(contact.email)}`; },
        },
      ]}
      dropdownActions={[
        { icon: 'edit', label: 'Edit Contact', onClick: () => onEdit?.(contact) },
        ...(onCreateDeal
          ? [{ icon: 'handshake', label: 'Create Deal', onClick: () => onCreateDeal(contact) }]
          : []),
        ...(onCreateTicket
          ? [{ icon: 'confirmation_number', label: 'Create Ticket', onClick: () => onCreateTicket(contact) }]
          : []),
        ...(onScheduleMeeting
          ? [{ icon: 'event', label: 'Schedule Meeting', onClick: () => onScheduleMeeting(contact) }]
          : []),
        { id: 'sep-1', icon: '', label: '', onClick: () => undefined, separator: true },
        { icon: 'delete', label: 'Delete', variant: 'danger', onClick: () => onDelete(contact) },
      ]}
    />
  );
}

/** Column factory — defined at module level (not inside the component) to satisfy S6478. */
function buildContactColumns(callbacks: ContactActionCallbacks, timezone: string = 'Europe/London'): ColumnDef<Contact>[] {
  const { onDelete, onEdit, onCreateDeal, onCreateTicket, onScheduleMeeting } = callbacks;
  return [
    {
      accessorKey: 'firstName',
      header: 'Contact Name',
      size: 220,
      cell: ({ row }) => <ContactNameCell contact={row.original} />,
    },
    {
      accessorKey: 'account',
      header: 'Account',
      size: 180,
      cell: ({ row }) => <ContactAccountCell contact={row.original} />,
    },
    {
      accessorKey: 'email',
      header: 'Email',
      size: 200,
      cell: ({ row }) => <ContactEmailCell contact={row.original} />,
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      size: 140,
      cell: ({ row }) => <ContactPhoneCell contact={row.original} />,
    },
    {
      accessorKey: 'createdAt',
      header: 'Added',
      size: 100,
      cell: ({ row }) => <ContactAddedCell contact={row.original} timezone={timezone} />,
    },
    {
      id: 'activity',
      header: 'Activity',
      size: 120,
      cell: ({ row }) => <ContactActivityCell contact={row.original} />,
    },
    {
      id: 'actions',
      header: () => <ContactActionsHeader />,
      size: 120,
      cell: ({ row }) => (
        <ContactActionsCell
          contact={row.original}
          onDelete={onDelete}
          onEdit={onEdit}
          onCreateDeal={onCreateDeal}
          onCreateTicket={onCreateTicket}
          onScheduleMeeting={onScheduleMeeting}
        />
      ),
    },
  ];
}

// ─── Component ──────────────────────────────────────────────────────────────────

export function ContactList({
  contacts,
  total,
  isLoading,
  onRowClick,
  onDelete,
  onBulkDelete,
  onBulkEmail,
  onBulkExport,
  onEdit,
  onCreateDeal,
  onCreateTicket,
  onScheduleMeeting,
  pageSize = 10,
}: Readonly<ContactListProps>) {
  const { timezone } = useTimezoneContext();
  // Columns are built by a module-level factory to avoid S6478 (JSX-returning
  // functions defined inside a React component). useMemo caches the result.
  const columns = useMemo(
    () => buildContactColumns({ onDelete, onEdit, onCreateDeal, onCreateTicket, onScheduleMeeting }, timezone),
    [onDelete, onEdit, onCreateDeal, onCreateTicket, onScheduleMeeting, timezone]
  );

  const bulkActions: BulkAction<Contact>[] = useMemo(
    () => [
      {
        icon: 'mail',
        label: 'Send Email',
        onClick: (selected) => onBulkEmail(selected.map((c) => c.id)),
      },
      {
        icon: 'file_export',
        label: 'Export',
        onClick: (selected) =>
          onBulkExport(
            selected.map((c) => c.id),
            'csv'
          ),
      },
      {
        icon: 'delete',
        label: 'Delete',
        variant: 'danger',
        onClick: (selected) => onBulkDelete(selected.map((c) => c.id)),
      },
    ],
    [onBulkEmail, onBulkExport, onBulkDelete]
  );

  if (isLoading) {
    return (
      <div aria-live="polite" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading contacts...</span>
        {[...new Array(5)].map((_, i) => (
          <div
            key={i} // NOSONAR typescript:S6479
            className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
          >
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <EmptyState entity="contacts" phase="passive" />
    );
  }

  return (
    <div>
      <DataTable
        columns={columns}
        data={contacts}
        entity="contacts"
        emptyMessage="No contacts match your search criteria"
        emptyIcon="person_off"
        onRowClick={onRowClick}
        enableRowSelection
        bulkActions={bulkActions}
        pageSize={pageSize}
        hidePagination
        aria-label="Contact list"
      />
      {total > 0 ? (
        <output aria-live="polite" className="mt-2 text-sm text-slate-500">
          Showing {contacts.length} of {total}
        </output>
      ) : null}
    </div>
  );
}
