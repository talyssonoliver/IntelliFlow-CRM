'use client';

/**
 * CaseList Component (PG-138)
 *
 * Matches the case_list.html design mockup:
 * - Page header with title, subtitle, Export button
 * - 4 stat cards with icons, values, and trend indicators
 * - Search bar in card with Status/Priority/Assignee dropdowns + More Filters
 * - Table with Case Number, Title (+ subtitle), Client, Status badge,
 *   Priority dot, Assignee avatar, Next Deadline, actions menu
 * - Overdue rows tinted red, closed rows dimmed
 * - Numbered pagination
 */

import { Skeleton, cn } from '@intelliflow/ui';
import { CASE_STATUSES, CASE_PRIORITIES } from '@intelliflow/domain';
import {
  getStatusConfig,
  getPriorityConfig,
  formatDeadline,
  getInitials,
  timeAgo,
} from '@/lib/cases/case-utils';
import type {
  CaseListItem,
  CaseStats,
  CaseFilterOptions,
} from './types';

// =============================================================================
// Props
// =============================================================================

export interface CaseListProps {
  cases: CaseListItem[];
  total: number;
  isLoading: boolean;
  stats: CaseStats;
  filterOptions: CaseFilterOptions;
  onRowClick: (caseItem: CaseListItem) => void;
  pagination: {
    page: number;
    limit: number;
    onPageChange: (page: number) => void;
  };
  searchValue: string;
  onSearchChange: (value: string) => void;
  statusFilter: string[];
  onStatusChange: (value: string[]) => void;
  priorityFilter: string[];
  onPriorityChange: (value: string[]) => void;
  sortValue: string;
  onSortChange: (value: string) => void;
}

// =============================================================================
// Stats Cards
// =============================================================================

function TrendIndicator({ value, label }: { value?: number; label: string }) {
  if (value === undefined || value === null) return null;
  const isPositive = value >= 0;
  return (
    <p className={cn('text-sm font-medium flex items-center gap-1', isPositive ? 'text-green-600' : 'text-red-600')}>
      <span className="material-symbols-outlined text-[16px]">
        {isPositive ? 'trending_up' : 'trending_down'}
      </span>
      {isPositive ? '+' : ''}{value}%
      <span className="text-muted-foreground font-normal">{label}</span>
    </p>
  );
}

function StatsBar({ stats, isLoading }: { stats: CaseStats; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-xl p-6 bg-card border border-border shadow-sm">
            <Skeleton className="h-4 w-16 mb-3" />
            <Skeleton className="h-8 w-20 mb-2" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Open */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">Open</p>
          <span className="material-symbols-outlined text-primary">folder_open</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.open}</p>
        <TrendIndicator value={stats.openTrend} label="from last month" />
      </div>

      {/* In Progress */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">In Progress</p>
          <span className="material-symbols-outlined text-blue-500">pending</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.inProgress}</p>
        <TrendIndicator value={stats.inProgressTrend} label="from last month" />
      </div>

      {/* Overdue — red accent */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border-2 border-red-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 -mr-8 -mt-8 rounded-full" />
        <div className="flex justify-between items-start relative">
          <p className="text-red-600 text-sm font-semibold uppercase tracking-wider">Overdue</p>
          <span className="material-symbols-outlined text-red-500">error</span>
        </div>
        <p className="text-red-700 text-3xl font-bold leading-tight relative">{stats.overdue}</p>
        {stats.overdue > 0 && (
          <p className="text-red-600 text-sm font-medium flex items-center gap-1 relative">
            <span className="material-symbols-outlined text-[16px]">warning</span>
            Action required
          </p>
        )}
      </div>

      {/* Closed */}
      <div className="flex flex-col gap-2 rounded-xl p-6 bg-card border border-border shadow-sm">
        <div className="flex justify-between items-start">
          <p className="text-muted-foreground text-sm font-semibold uppercase tracking-wider">Closed</p>
          <span className="material-symbols-outlined text-green-600">check_circle</span>
        </div>
        <p className="text-foreground text-3xl font-bold leading-tight">{stats.closedThisMonth}</p>
        <TrendIndicator value={stats.closedTrend} label="from last month" />
      </div>
    </div>
  );
}

// =============================================================================
// Filter Bar
// =============================================================================

function FilterBar({
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  filterOptions,
}: {
  searchValue: string;
  onSearchChange: (v: string) => void;
  statusFilter: string[];
  onStatusChange: (v: string[]) => void;
  priorityFilter: string[];
  onPriorityChange: (v: string[]) => void;
  filterOptions: CaseFilterOptions;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-6 shadow-sm">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-muted border border-border rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
              placeholder="Search cases by ID, title, or client..."
              aria-label="Search cases"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={statusFilter[0] ?? ''}
            onChange={(e) => onStatusChange(e.target.value ? [e.target.value] : [])}
            className="text-sm py-2 px-3 pr-8 border-border rounded-lg focus:ring-primary focus:border-primary bg-card border"
            aria-label="Filter by status"
          >
            <option value="">Status: All</option>
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>{getStatusConfig(s).label}</option>
            ))}
          </select>
          <select
            value={priorityFilter[0] ?? ''}
            onChange={(e) => onPriorityChange(e.target.value ? [e.target.value] : [])}
            className="text-sm py-2 px-3 pr-8 border-border rounded-lg focus:ring-primary focus:border-primary bg-card border"
            aria-label="Filter by priority"
          >
            <option value="">Priority: All</option>
            {CASE_PRIORITIES.map((p) => (
              <option key={p} value={p}>{getPriorityConfig(p).label}</option>
            ))}
          </select>
          {filterOptions.assignees && filterOptions.assignees.length > 0 && (
            <select
              className="text-sm py-2 px-3 pr-8 border-border rounded-lg focus:ring-primary focus:border-primary bg-card border"
              aria-label="Filter by assignee"
              defaultValue=""
            >
              <option value="">Assignee: All</option>
              {filterOptions.assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
          <button className="flex items-center gap-1 text-sm font-medium text-primary hover:bg-primary/5 px-3 py-2 rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[18px]">filter_list</span>
            More Filters
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Avatar
// =============================================================================

function AssigneeAvatar({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  if (avatarUrl) {
    return (
      <div
        className="size-7 rounded-full bg-muted bg-cover bg-center shrink-0"
        style={{ backgroundImage: `url(${avatarUrl})` }}
        aria-label={name}
      />
    );
  }
  return (
    <div className="size-7 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-bold shrink-0">
      {getInitials(name)}
    </div>
  );
}

// =============================================================================
// Table Row
// =============================================================================

function CaseRow({ caseItem, onClick }: { caseItem: CaseListItem; onClick: () => void }) {
  const statusCfg = getStatusConfig(caseItem.status);
  const priorityCfg = getPriorityConfig(caseItem.priority);
  const isClosed = caseItem.status === 'CLOSED' || caseItem.status === 'CANCELLED';
  const isOverdueRow = caseItem.isOverdue && !isClosed;

  const shortName = caseItem.assignee.name
    .split(' ')
    .map((p, i) => (i === 0 ? p : `${p[0]}.`))
    .join(' ');

  const subtitle = caseItem.lastActivityText || (caseItem.updatedAt ? `Updated ${timeAgo(caseItem.updatedAt)}` : '');

  return (
    <tr
      className={cn(
        'hover:bg-muted transition-colors cursor-pointer group',
        isOverdueRow && 'bg-red-50/30',
        isClosed && 'opacity-70',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <td className="px-6 py-4 text-sm font-bold text-primary">
        {caseItem.caseNumber || caseItem.id.slice(0, 12)}
      </td>
      <td className="px-6 py-4">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">{caseItem.title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-foreground">{caseItem.client.name}</td>
      <td className="px-6 py-4">
        <span className={cn(
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
          statusCfg.bgColor,
          statusCfg.color,
        )}>
          {isOverdueRow ? 'Overdue' : statusCfg.label}
        </span>
      </td>
      <td className="px-6 py-4">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', priorityCfg.textColor)}>
          <span className={cn('size-2 rounded-full', priorityCfg.dotColor)} />
          {priorityCfg.label}
        </span>
      </td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <AssigneeAvatar name={caseItem.assignee.name} avatarUrl={caseItem.assignee.avatarUrl} />
          <span className="text-sm text-foreground">{shortName}</span>
        </div>
      </td>
      <td className={cn('px-6 py-4 text-sm', isOverdueRow ? 'text-red-600 font-semibold' : isClosed ? 'text-muted-foreground' : 'text-foreground')}>
        {isClosed ? 'Completed' : formatDeadline(caseItem.deadline)}
      </td>
      <td className="px-6 py-4 text-right">
        <button
          className="text-muted-foreground hover:text-primary transition-colors"
          onClick={(e) => { e.stopPropagation(); }}
          aria-label="More actions"
        >
          <span className="material-symbols-outlined">more_horiz</span>
        </button>
      </td>
    </tr>
  );
}

// =============================================================================
// Mobile Card (shown on small screens instead of table rows)
// =============================================================================

function CaseCard({ caseItem, onClick }: { caseItem: CaseListItem; onClick: () => void }) {
  const statusCfg = getStatusConfig(caseItem.status);
  const priorityCfg = getPriorityConfig(caseItem.priority);
  const isClosed = caseItem.status === 'CLOSED' || caseItem.status === 'CANCELLED';
  const isOverdueRow = caseItem.isOverdue && !isClosed;

  return (
    <div
      className={cn(
        'bg-card rounded-xl border border-border p-4 shadow-sm cursor-pointer hover:border-primary/30 transition-colors',
        isOverdueRow && 'border-red-200 bg-red-50/30 dark:border-red-800/50 dark:bg-red-950/10',
        isClosed && 'opacity-70',
      )}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick(); }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-bold text-primary">{caseItem.caseNumber}</span>
          <h3 className="text-sm font-semibold text-foreground truncate mt-0.5">{caseItem.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{caseItem.client.name}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium ml-2 shrink-0', priorityCfg.textColor)}>
          <span className={cn('size-2 rounded-full', priorityCfg.dotColor)} />
          {priorityCfg.label}
        </span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium',
            statusCfg.bgColor,
            statusCfg.color,
          )}>
            {isOverdueRow ? 'Overdue' : statusCfg.label}
          </span>
          <div className="flex items-center gap-1.5">
            <AssigneeAvatar name={caseItem.assignee.name} avatarUrl={caseItem.assignee.avatarUrl} />
            <span className="text-xs text-muted-foreground">{caseItem.assignee.name.split(' ')[0]}</span>
          </div>
        </div>
        <span className={cn('text-xs', isOverdueRow ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>
          {isClosed ? 'Closed' : formatDeadline(caseItem.deadline)}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Empty State
// =============================================================================

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="material-symbols-outlined text-5xl text-muted-foreground/50 mb-4">gavel</span>
      <h3 className="text-lg font-semibold text-foreground mb-2">No cases found</h3>
      <p className="text-sm text-muted-foreground mb-6">Get started by creating your first case.</p>
      <button className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-primary/90 transition-colors">
        <span className="material-symbols-outlined text-[18px]">add</span>
        Create New Case
      </button>
    </div>
  );
}

// =============================================================================
// Table Skeleton
// =============================================================================

function TableSkeleton() {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <div className="flex items-center gap-2">
            <Skeleton className="size-7 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// Pagination
// =============================================================================

function Pagination({ page, limit, total, onPageChange }: {
  page: number;
  limit: number;
  total: number;
  onPageChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  // Build page numbers with ellipsis
  const pages: (number | 'ellipsis')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('ellipsis');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('ellipsis');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-card border-t border-border">
      <div className="text-sm text-muted-foreground">
        Showing <span className="font-bold text-foreground">{start}</span> to{' '}
        <span className="font-bold text-foreground">{end}</span> of{' '}
        <span className="font-bold text-foreground">{total}</span> cases
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label="Previous page"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        {pages.map((p, i) =>
          p === 'ellipsis' ? (
            <span key={`e${i}`} className="px-2 text-muted-foreground">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={cn(
                'w-10 h-10 font-medium rounded-lg transition-colors border',
                p === page
                  ? 'border-primary bg-primary text-white font-bold'
                  : 'border-border text-muted-foreground hover:bg-muted',
              )}
            >
              {p}
            </button>
          ),
        )}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 border border-border rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-50 transition-colors"
          aria-label="Next page"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function CaseList({
  cases,
  total,
  isLoading,
  stats,
  filterOptions,
  onRowClick,
  pagination,
  searchValue,
  onSearchChange,
  statusFilter,
  onStatusChange,
  priorityFilter,
  onPriorityChange,
  sortValue: _sortValue,
  onSortChange: _onSortChange,
}: CaseListProps) {
  return (
    <div>
      <StatsBar stats={stats} isLoading={isLoading} />

      <FilterBar
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        statusFilter={statusFilter}
        onStatusChange={onStatusChange}
        priorityFilter={priorityFilter}
        onPriorityChange={onPriorityChange}
        filterOptions={filterOptions}
      />

      {isLoading ? (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <TableSkeleton />
        </div>
      ) : cases.length === 0 ? (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <EmptyState />
        </div>
      ) : (
        <>
          {/* Mobile: Card view */}
          <div className="lg:hidden space-y-3">
            {cases.map((c) => (
              <CaseCard key={c.id} caseItem={c} onClick={() => onRowClick(c)} />
            ))}
          </div>

          {/* Desktop: Table view */}
          <div className="hidden lg:block bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-muted border-b border-border">
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Case Number</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Title</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Client</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Priority</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Assignee</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Next Deadline</th>
                    <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {cases.map((c) => (
                    <CaseRow key={c.id} caseItem={c} onClick={() => onRowClick(c)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            page={pagination.page}
            limit={pagination.limit}
            total={total}
            onPageChange={pagination.onPageChange}
          />
        </>
      )}
    </div>
  );
}
