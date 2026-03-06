'use client';

import React, { useMemo } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable, TableRowActions, type BulkAction, Skeleton } from '@intelliflow/ui';

// ─── Types ──────────────────────────────────────────────────────────────────────

type ContactStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

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

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return 'Invalid date';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
}: ContactListProps) {
  const columns: ColumnDef<Contact>[] = useMemo(
    () => [
      {
        accessorKey: 'firstName',
        header: 'Contact Name',
        size: 220,
        cell: ({ row }) => {
          const c = row.original;
          const name = `${c.firstName}${c.lastName}`;
          const initials = `${c.firstName?.[0] || ''}${c.lastName?.[0] || ''}`.toUpperCase() || '?';
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
                  {c.firstName} {c.lastName}
                </p>
                {c.title && <p className="text-sm text-slate-500 dark:text-slate-400">{c.title}</p>}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'account',
        header: 'Account',
        size: 180,
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-slate-900 dark:text-white">
              {row.original.account?.name || '-'}
            </p>
            {row.original.department && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {row.original.department}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        size: 200,
        cell: ({ row }) => (
          <a
            href={`mailto:${row.original.email}`}
            onClick={(e) => e.stopPropagation()}
            className="text-primary hover:underline text-sm"
            aria-label={`Send email to ${row.original.firstName} ${row.original.lastName}`}
          >
            {row.original.email}
          </a>
        ),
      },
      {
        accessorKey: 'phone',
        header: 'Phone',
        size: 140,
        cell: ({ row }) => (
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {row.original.phone || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'createdAt',
        header: 'Added',
        size: 100,
        cell: ({ row }) => (
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {formatDate(row.original.createdAt)}
          </span>
        ),
      },
      {
        id: 'activity',
        header: 'Activity',
        size: 120,
        cell: ({ row }) => {
          const opp = row.original._count?.opportunities ?? 0;
          const tasks = row.original._count?.tasks ?? 0;
          if (opp === 0 && tasks === 0)
            return <span className="text-sm text-muted-foreground italic">No activity</span>;
          return (
            <div className="flex flex-col gap-1">
              {opp > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    handshake
                  </span>
                  {opp} {opp === 1 ? 'Deal' : 'Deals'}
                </span>
              )}
              {tasks > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    task_alt
                  </span>
                  {tasks} {tasks === 1 ? 'Task' : 'Tasks'}
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="block text-right">Actions</span>,
        size: 120,
        cell: ({ row }) => {
          const c = row.original;
          return (
            <TableRowActions
              quickActions={[
                {
                  icon: 'phone',
                  label: 'Call',
                  onClick: () => {
                    if (c.phone) window.open(`tel:${c.phone}`);
                  },
                },
                {
                  icon: 'mail',
                  label: 'Send Email',
                  onClick: () => window.open(`mailto:${c.email}`),
                },
              ]}
              dropdownActions={[
                { icon: 'edit', label: 'Edit Contact', onClick: () => onEdit?.(c) },
                ...(onCreateDeal
                  ? [{ icon: 'handshake', label: 'Create Deal', onClick: () => onCreateDeal(c) }]
                  : []),
                ...(onCreateTicket
                  ? [
                      {
                        icon: 'confirmation_number',
                        label: 'Create Ticket',
                        onClick: () => onCreateTicket(c),
                      },
                    ]
                  : []),
                ...(onScheduleMeeting
                  ? [
                      {
                        icon: 'event',
                        label: 'Schedule Meeting',
                        onClick: () => onScheduleMeeting(c),
                      },
                    ]
                  : []),
                { id: 'sep-1', icon: '', label: '', onClick: () => undefined, separator: true }, // Separator: onClick is intentionally a no-op
                { icon: 'delete', label: 'Delete', variant: 'danger', onClick: () => onDelete(c) },
              ]}
            />
          );
        },
      },
    ],
    [onDelete, onEdit, onCreateDeal, onCreateTicket, onScheduleMeeting]
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
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading contacts...</span>
        {[...Array(5)].map((_, i) => (
          <div
            key={i}
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
      <div className="text-center py-12">
        <span className="material-symbols-outlined text-5xl text-slate-300 mb-4" aria-hidden="true">
          person_off
        </span>
        <p className="text-slate-500 dark:text-slate-400">No contacts found</p>
      </div>
    );
  }

  return (
    <div>
      <DataTable
        columns={columns}
        data={contacts}
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
        <div role="status" aria-live="polite" className="mt-2 text-sm text-slate-500">
          Showing {contacts.length} of {total}
        </div>
      ) : null}
    </div>
  );
}
