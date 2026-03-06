'use client';

import {
  getTypeConfig,
  getStatusConfig,
  formatTimeRange,
  formatDuration,
  isOverdue,
  APPOINTMENT_TYPE_OPTIONS,
  APPOINTMENT_STATUS_OPTIONS,
} from '@/lib/appointments/appointment-utils';
import type { AppointmentListItem, AppointmentStats, AppointmentFilters } from './types';

export interface AppointmentListProps {
  appointments: AppointmentListItem[];
  total: number;
  isLoading: boolean;
  stats: AppointmentStats;
  onRowClick: (id: string) => void;
  pagination: { page: number; limit: number; onPageChange: (page: number) => void };
  filters: AppointmentFilters;
  onFilterChange: (filters: Partial<AppointmentFilters>) => void;
}

const STAT_CARDS = [
  {
    key: 'upcoming',
    label: 'Upcoming',
    icon: 'schedule',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    key: 'confirmed',
    label: 'Confirmed',
    icon: 'check_circle',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    key: 'completed',
    label: 'Completed',
    icon: 'task_alt',
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  { key: 'overdue', label: 'Overdue', icon: 'warning', color: 'text-destructive', bg: 'bg-red-50' },
] as const;

function SortableHeader({
  label,
  sortKey,
  currentSortBy,
  currentSortOrder,
  onSort,
}: {
  label: string;
  sortKey: AppointmentFilters['sortBy'];
  currentSortBy: AppointmentFilters['sortBy'];
  currentSortOrder: AppointmentFilters['sortOrder'];
  onSort: (
    sortBy: AppointmentFilters['sortBy'],
    sortOrder: AppointmentFilters['sortOrder']
  ) => void;
}) {
  const isActive = currentSortBy === sortKey;
  const nextOrder = isActive && currentSortOrder === 'asc' ? 'desc' : 'asc';
  const icon = isActive
    ? currentSortOrder === 'asc'
      ? 'arrow_upward'
      : 'arrow_downward'
    : 'swap_vert';

  return (
    <th className="text-left px-4 py-3 font-medium text-gray-600">
      <button
        type="button"
        onClick={() => onSort(sortKey, nextOrder)}
        className="flex items-center gap-1 hover:text-gray-900 transition-colors"
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span
          className={`material-symbols-outlined text-sm ${isActive ? 'text-primary' : 'text-gray-400'}`}
          aria-hidden="true"
        >
          {icon}
        </span>
      </button>
    </th>
  );
}

export function AppointmentList({
  appointments,
  total,
  isLoading,
  stats,
  onRowClick,
  pagination,
  filters,
  onFilterChange,
}: AppointmentListProps) {
  const totalPages = Math.ceil(total / pagination.limit);

  const getStatValue = (key: string): number => {
    if (key === 'upcoming') return stats.upcoming;
    if (key === 'overdue') return stats.overdue;
    if (key === 'confirmed') return stats.byStatus?.CONFIRMED ?? 0;
    if (key === 'completed') return stats.byStatus?.COMPLETED ?? 0;
    return 0;
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4" data-testid="list-skeleton">
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="h-12 bg-gray-100 rounded" />
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-14 bg-gray-50 rounded" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="appointment-list">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {STAT_CARDS.map((card) => (
          <div key={card.key} className={`rounded-lg border p-4 ${card.bg}`}>
            <div className="flex items-center gap-2">
              <span className={`material-symbols-outlined text-xl ${card.color}`}>{card.icon}</span>
              <div>
                <p className="text-2xl font-bold text-gray-900">{getStatValue(card.key)}</p>
                <p className="text-xs text-gray-600">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => onFilterChange({ search: e.target.value })}
              placeholder="Search appointments..."
              className="w-full pl-10 pr-3 py-2 rounded-md border border-gray-300 text-sm"
            />
          </div>
        </div>

        <select
          value={filters.status}
          onChange={(e) =>
            onFilterChange({ status: e.target.value as AppointmentFilters['status'] })
          }
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          aria-label="Status filter"
        >
          <option value="">All Statuses</option>
          {APPOINTMENT_STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={filters.appointmentType}
          onChange={(e) =>
            onFilterChange({
              appointmentType: e.target.value as AppointmentFilters['appointmentType'],
            })
          }
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          aria-label="Type filter"
        >
          <option value="">All Types</option>
          {APPOINTMENT_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={`${filters.sortBy}:${filters.sortOrder}`}
          onChange={(e) => {
            const [sortBy, sortOrder] = e.target.value.split(':') as [
              AppointmentFilters['sortBy'],
              AppointmentFilters['sortOrder'],
            ];
            onFilterChange({ sortBy, sortOrder });
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          aria-label="Sort by"
        >
          <option value="startTime:asc">Time (Earliest)</option>
          <option value="startTime:desc">Time (Latest)</option>
          <option value="createdAt:desc">Newest First</option>
          <option value="createdAt:asc">Oldest First</option>
          <option value="updatedAt:desc">Recently Updated</option>
        </select>
      </div>

      {/* Date Range Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          From
          <input
            type="date"
            value={filters.startTimeFrom ? toDateInputValue(filters.startTimeFrom) : ''}
            onChange={(e) =>
              onFilterChange({
                startTimeFrom: e.target.value ? new Date(e.target.value + 'T00:00:00') : undefined,
              })
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            aria-label="Date from"
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          To
          <input
            type="date"
            value={filters.startTimeTo ? toDateInputValue(filters.startTimeTo) : ''}
            onChange={(e) =>
              onFilterChange({
                startTimeTo: e.target.value ? new Date(e.target.value + 'T23:59:59') : undefined,
              })
            }
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            aria-label="Date to"
          />
        </label>
        {(filters.startTimeFrom || filters.startTimeTo) && (
          <button
            type="button"
            onClick={() => onFilterChange({ startTimeFrom: undefined, startTimeTo: undefined })}
            className="text-sm text-primary hover:underline"
          >
            Clear dates
          </button>
        )}
      </div>

      {/* Table */}
      {appointments.length === 0 ? (
        <div className="text-center py-12 text-gray-500" data-testid="list-empty">
          <span className="material-symbols-outlined text-4xl mb-2">calendar_month</span>
          <p className="text-sm">No appointments found</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b">
                <SortableHeader
                  label="Title"
                  sortKey="createdAt"
                  currentSortBy={filters.sortBy}
                  currentSortOrder={filters.sortOrder}
                  onSort={(sortBy, sortOrder) => onFilterChange({ sortBy, sortOrder })}
                />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Type</th>
                <SortableHeader
                  label="Time"
                  sortKey="startTime"
                  currentSortBy={filters.sortBy}
                  currentSortOrder={filters.sortOrder}
                  onSort={(sortBy, sortOrder) => onFilterChange({ sortBy, sortOrder })}
                />
                <th className="text-left px-4 py-3 font-medium text-gray-600">Duration</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Attendees</th>
                <SortableHeader
                  label="Status"
                  sortKey="updatedAt"
                  currentSortBy={filters.sortBy}
                  currentSortOrder={filters.sortOrder}
                  onSort={(sortBy, sortOrder) => onFilterChange({ sortBy, sortOrder })}
                />
              </tr>
            </thead>
            <tbody>
              {appointments.map((appt) => {
                const typeConfig = getTypeConfig(appt.appointmentType);
                const statusConfig = getStatusConfig(appt.status);
                const overdue = isOverdue(appt.endTime, appt.status);
                return (
                  <tr
                    key={appt.id}
                    onClick={() => onRowClick(appt.id)}
                    className={`border-b hover:bg-gray-50 cursor-pointer transition-colors ${
                      overdue ? 'border-l-4 border-l-destructive' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`material-symbols-outlined text-base ${typeConfig.color}`}>
                          {typeConfig.icon}
                        </span>
                        <span className="font-medium text-gray-900 truncate max-w-[200px]">
                          {appt.title}
                        </span>
                        {appt.hasConflict && (
                          <span
                            className="material-symbols-outlined text-sm text-red-500"
                            title="Has conflict"
                          >
                            warning
                          </span>
                        )}
                        {appt.isRecurring && (
                          <span
                            className="material-symbols-outlined text-sm text-gray-400"
                            title="Recurring"
                          >
                            repeat
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${typeConfig.bgColor} ${typeConfig.color}`}
                      >
                        {typeConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatTimeRange(appt.startTime, appt.endTime)}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {formatDuration(appt.startTime, appt.endTime)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-gray-600">{appt.attendeeCount}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs px-2 py-1 rounded ${statusConfig.bgColor} ${statusConfig.color}`}
                      >
                        {statusConfig.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2" data-testid="pagination">
          <p className="text-sm text-gray-600">
            Showing {(pagination.page - 1) * pagination.limit + 1}-
            {Math.min(pagination.page * pagination.limit, total)} of {total}
          </p>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => pagination.onPageChange(pagination.page + 1)}
              disabled={pagination.page >= totalPages}
              className="px-3 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function toDateInputValue(date: Date): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
