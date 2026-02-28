'use client';

import { useState, useMemo, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  ConfirmationDialog,
  Button,
  toast,
} from '@intelliflow/ui';
import { formatFileSize, formatDate, getStatusConfig, getMimeTypeIcon } from './document-utils';
import type {
  DocumentListProps,
  DocumentRecord,
  DocumentStatus,
  BulkAction,
  DocumentFilters,
} from './types';

// =============================================================================
// DocumentStatusBadge Sub-Component
// =============================================================================

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const config = getStatusConfig(status);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}
      aria-label={`Status: ${config.label}`}
    >
      <span className="material-symbols-outlined text-sm">{config.icon}</span>
      {config.label}
    </span>
  );
}

// =============================================================================
// DocumentList Component
// =============================================================================

const PAGE_SIZE = 20;

export function DocumentList({
  tenantId: _tenantId,
  userId: _userId,
  initialFilters,
  initialDocuments,
  onDocumentSelect,
  onBulkAction,
}: DocumentListProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, _setFilters] = useState<DocumentFilters>(initialFilters ?? {});
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{ action: BulkAction; ids: string[] } | null>(null);
  const [documents] = useState<DocumentRecord[]>(initialDocuments ?? []);
  const [isLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ─── Client-Side Filtering ────────────────────────────────────────────────

  const filteredDocuments = useMemo(() => {
    let result = [...documents];

    if (filters.query) {
      const query = filters.query.toLowerCase();
      result = result.filter(
        (doc) =>
          doc.metadata.title.toLowerCase().includes(query) ||
          doc.metadata.description?.toLowerCase().includes(query)
      );
    }
    if (filters.status?.length) {
      result = result.filter((doc) => filters.status!.includes(doc.status));
    }
    if (filters.classification?.length) {
      result = result.filter(
        (doc) => doc.classification && filters.classification!.includes(doc.classification)
      );
    }
    if (filters.fileType?.length) {
      result = result.filter(
        (doc) => doc.mimeType && filters.fileType!.some((ft) => doc.mimeType!.includes(ft))
      );
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'name':
          comparison = a.metadata.title.localeCompare(b.metadata.title);
          break;
        case 'date':
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'size':
          comparison = (Number(a.sizeBytes) || 0) - (Number(b.sizeBytes) || 0);
          break;
        case 'status':
          comparison = a.status.localeCompare(b.status);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'desc' ? -comparison : comparison;
    });

    return result;
  }, [documents, filters, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredDocuments.length / PAGE_SIZE);
  const paginatedDocuments = useMemo(
    () => filteredDocuments.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE),
    [filteredDocuments, currentPage]
  );

  // ─── Selection ────────────────────────────────────────────────────────────

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === paginatedDocuments.length) return new Set();
      return new Set(paginatedDocuments.map((d) => d.id));
    });
  }, [paginatedDocuments]);

  // ─── Bulk Actions ─────────────────────────────────────────────────────────

  const handleBulkAction = useCallback(
    (action: BulkAction) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      setConfirmAction({ action, ids });
    },
    [selectedIds]
  );

  const executeBulkAction = useCallback(() => {
    if (!confirmAction) return;
    onBulkAction?.(confirmAction.action, confirmAction.ids);
    toast({ title: `${confirmAction.action} completed for ${confirmAction.ids.length} document(s)` });
    setSelectedIds(new Set());
    setConfirmAction(null);
  }, [confirmAction, onBulkAction]);

  // ─── Sort Handler ─────────────────────────────────────────────────────────

  const handleSort = useCallback(
    (field: string) => {
      if (sortField === field) {
        setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortField(field);
        setSortDirection('asc');
      }
    },
    [sortField]
  );

  // ─── Column Definitions ───────────────────────────────────────────────────

  const columns: ColumnDef<DocumentRecord>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={selectedIds.size === paginatedDocuments.length && paginatedDocuments.length > 0}
            onChange={toggleSelectAll}
            aria-label="Select all documents"
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={selectedIds.has(row.original.id)}
            onChange={(e) => {
              e.stopPropagation();
              toggleSelection(row.original.id);
            }}
            aria-label={`Select ${row.original.metadata.title}`}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: 'metadata.title',
        header: () => (
          <button
            onClick={() => handleSort('name')}
            className="flex items-center gap-1"
          >
            Name
            {sortField === 'name' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ),
        cell: ({ row }) => {
          const doc = row.original;
          const iconName = getMimeTypeIcon(doc.mimeType ?? 'application/octet-stream');
          return (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded bg-slate-100 dark:bg-slate-700">
                <span className="material-symbols-outlined text-[20px] text-primary">{iconName}</span>
              </div>
              <div>
                <p className="font-medium text-slate-900 dark:text-white">{doc.metadata.title}</p>
                {doc.metadata.description && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                    {doc.metadata.description}
                  </p>
                )}
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: 'status',
        header: () => (
          <button
            onClick={() => handleSort('status')}
            className="flex items-center gap-1"
          >
            Status
            {sortField === 'status' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ),
        cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'sizeBytes',
        header: () => (
          <button
            onClick={() => handleSort('size')}
            className="flex items-center gap-1"
          >
            Size
            {sortField === 'size' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ),
        cell: ({ row }) => formatFileSize(Number(row.original.sizeBytes) || 0),
      },
      {
        accessorKey: 'createdAt',
        header: () => (
          <button
            onClick={() => handleSort('date')}
            className="flex items-center gap-1"
          >
            Date
            {sortField === 'date' && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
          </button>
        ),
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
    ],
    [selectedIds, paginatedDocuments, toggleSelectAll, toggleSelection, handleSort, sortField, sortDirection]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-4" role="status" aria-label="Loading documents">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12" role="alert">
        <p className="text-red-600 dark:text-red-400">Failed to load documents: {error}</p>
        <Button variant="outline" className="mt-4" onClick={() => setError(null)}>
          Retry
        </Button>
      </div>
    );
  }

  if (documents.length === 0 && !isLoading) {
    return (
      <div className="text-center py-12" data-testid="empty-state">
        <span className="material-symbols-outlined text-5xl text-slate-400">folder_off</span>
        <h3 className="mt-4 text-lg font-medium text-slate-900 dark:text-white">No documents</h3>
        <p className="mt-2 text-sm text-slate-500">Upload your first document to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk Action Toolbar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg" data-testid="bulk-toolbar">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkAction('download')}
            aria-label="Download selected documents"
          >
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkAction('archive')}
            aria-label="Archive selected documents"
          >
            Archive
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => handleBulkAction('delete')}
            aria-label="Delete selected documents"
          >
            Delete
          </Button>
        </div>
      )}

      {/* Data Table */}
      <div role="table" aria-label="Documents table">
        <DataTable
          columns={columns}
          data={paginatedDocuments}
          onRowClick={(row) => onDocumentSelect?.(row.id)}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" data-testid="pagination">
          <span className="text-sm text-slate-500">
            Page {currentPage + 1} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmAction && (
        <ConfirmationDialog
          open={!!confirmAction}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={`${confirmAction.action.charAt(0).toUpperCase() + confirmAction.action.slice(1)} ${confirmAction.ids.length} document(s)?`}
          description={`This action will ${confirmAction.action} the selected documents.`}
          onConfirm={executeBulkAction}
          variant={confirmAction.action === 'delete' ? 'destructive' : 'default'}
        />
      )}
    </div>
  );
}
