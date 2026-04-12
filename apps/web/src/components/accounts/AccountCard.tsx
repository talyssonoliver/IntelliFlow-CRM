'use client';

import { ColumnDef } from '@tanstack/react-table';

export type AccountTier = 'ENTERPRISE' | 'MID_MARKET' | 'SMB' | 'STARTUP' | 'UNKNOWN';

export function getAccountTier(revenue: number | null | undefined): AccountTier {
  if (revenue == null) return 'UNKNOWN';
  if (revenue >= 10_000_000) return 'ENTERPRISE';
  if (revenue >= 1_000_000) return 'MID_MARKET';
  if (revenue >= 100_000) return 'SMB';
  return 'STARTUP';
}

export const TIER_CONFIG: Record<
  AccountTier,
  { label: string; color: string; dot: string; avatarBg: string }
> = {
  ENTERPRISE: {
    label: 'Enterprise',
    color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    dot: 'bg-purple-500',
    avatarBg: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  },
  MID_MARKET: {
    label: 'Mid-Market',
    color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    dot: 'bg-blue-500',
    avatarBg: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  SMB: {
    label: 'SMB',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    dot: 'bg-green-500',
    avatarBg: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  },
  STARTUP: {
    label: 'Startup',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    dot: 'bg-yellow-500',
    avatarBg: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  },
  UNKNOWN: {
    label: 'Unknown',
    color: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
    avatarBg: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  },
};

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
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    timeZone: timezone,
  });
}

function formatCompactCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function formatEmployees(count: number): string {
  return count.toLocaleString('en-US');
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
        const rawRevenue = account.revenue == null ? null : Number(account.revenue);
        const tier = getAccountTier(rawRevenue);
        const config = TIER_CONFIG[tier];
        const initials = getInitials(account.name);
        const parentName = account.parentAccount?.name;

        return (
          <div className="flex items-center gap-3">
            <div
              className={`size-9 rounded-lg ${config.avatarBg} flex items-center justify-center text-xs font-semibold shrink-0`}
            >
              {initials}
            </div>
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
        const tier = getAccountTier(revenue);
        const config = TIER_CONFIG[tier];
        return (
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full shrink-0 ${config.dot}`} />
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
