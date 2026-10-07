'use client';

import { ColumnDef } from '@tanstack/react-table';
import { TierAvatar, TierDot } from './TierBadge';

export interface AccountRow {
  id: string;
  name: string;
  industry: string | null;
  revenue: number | string | null;
  employees: number | null;
  website: string | null;
  description: string | null;
  parentAccountId?: string | null;
  parentAccount?: { id: string; name: string } | null;
  createdAt: Date | string;
  owner?: {
    id: string;
    name: string | null;
    email: string;
  } | null;
  _count?: {
    contacts: number;
    opportunities: number;
  };
}

export interface AccountRowHandlers {
  onView: (id: string) => void;
  onEdit: (id: string) => void;
  onCreateDeal: (id: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(date: Date | string, timezone: string = 'Europe/London'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return 'Invalid date';
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: timezone,
  });
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatEmployees(count: number): string {
  return count.toLocaleString('en-GB');
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function createAccountColumns(
  handlers: Readonly<AccountRowHandlers>
): ColumnDef<AccountRow>[] {
  return [
    {
      accessorKey: 'name',
      header: 'Name',
      size: 260,
      cell: ({ row }) => {
        const account = row.original;
        const initials = getInitials(account.name);
        const parentName = account.parentAccount?.name;

        return (
          <div className="flex items-center gap-3">
            <TierAvatar revenue={account.revenue} initials={initials} />
            <div className="flex flex-col min-w-0">
              <button
                className="text-sm font-semibold text-foreground hover:text-primary text-left truncate"
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onView(account.id);
                }}
              >
                {account.name}
              </button>
              <span className="text-xs text-muted-foreground truncate">
                {parentName ? `Parent: ${parentName}` : 'Standalone'}
              </span>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'industry',
      header: 'Industry',
      size: 140,
      cell: ({ row }) => (
        <span className="text-sm text-foreground">{row.original.industry ?? '—'}</span>
      ),
    },
    {
      accessorKey: 'revenue',
      header: 'Revenue',
      size: 130,
      cell: ({ row }) => {
        const rawRevenue = row.original.revenue;
        const revenue = rawRevenue == null ? null : Number(rawRevenue);
        return (
          <div className="flex items-center gap-2">
            <TierDot revenue={rawRevenue} />
            <span className="text-sm text-foreground">
              {revenue == null ? '—' : formatCompactCurrency(revenue)}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: 'employees',
      header: 'Employees',
      size: 110,
      cell: ({ row }) => (
        <span className="text-sm text-foreground">
          {row.original.employees == null ? '—' : formatEmployees(row.original.employees)}
        </span>
      ),
    },
    {
      id: 'owner',
      header: 'Owner',
      size: 160,
      cell: ({ row }) => {
        const owner = row.original.owner;
        if (!owner) return <span className="text-sm text-muted-foreground">—</span>;
        const displayName = owner.name ?? owner.email;
        const initials = getInitials(displayName);
        return (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium shrink-0">
              {initials}
            </div>
            <span className="text-sm text-foreground truncate">{displayName}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      size: 130,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: 'Actions',
      size: 80,
      cell: ({ row }) => {
        const account = row.original;
        return (
          <div className="flex items-center gap-1">
            <button
              className="p-1 rounded hover:bg-muted"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onEdit(account.id);
              }}
              title="Edit account"
            >
              <span className="material-symbols-outlined text-base text-muted-foreground">
                edit
              </span>
            </button>
            <button
              className="p-1 rounded hover:bg-destructive/10"
              onClick={(e) => {
                e.stopPropagation();
                handlers.onDelete(account.id);
              }}
              title="Delete account"
            >
              <span className="material-symbols-outlined text-base text-muted-foreground hover:text-destructive">
                delete
              </span>
            </button>
          </div>
        );
      },
    },
  ];
}
