'use client';

import { useState, useMemo, useCallback } from 'react';
import { ColumnDef } from '@tanstack/react-table';
import { DataTable, ConfirmationDialog, Button, toast } from '@intelliflow/ui';
import { formatFileSize, formatDate, getStatusConfig, getMimeTypeIcon } from './document-utils';
import type {
  DocumentListProps,
  DocumentRecord,
  DocumentStatus,
  BulkAction,
  DocumentFilters,
} from './types';

// =============================================================================
// Sub-components and column factory (module-level — fixes S6478)
// =============================================================================

function DocSelectAllHeader({
  selectedCount,
  totalCount,
  onToggle,
}: Readonly<{ selectedCount: number; totalCount: number; onToggle: () => void }>) {
  return (
    <input
      type="checkbox"
      checked={selectedCount === totalCount && totalCount > 0}
      onChange={onToggle}
      aria-label="Select all documents"
    />
  );
}

function DocSelectCell({
  id,
  title,
  isChecked,
  onToggle,
}: Readonly<{ id: string; title: string; isChecked: boolean; onToggle: (id: string) => void }>) {
  return (
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => {
        e.stopPropagation();
        onToggle(id);
      }}
      aria-label={`Select ${title}`}
    />
  );
}

function DocSortableHeader({
  label,
  field,
  sortField,
  sortDirection,
  onSort,
}: Readonly<{
  label: string;
  field: string;
  sortField: string;
  sortDirection: 'asc' | 'desc';
  onSort: (field: string) => void;
}>) {
  return (
    <button onClick={() => onSort(field)} className="flex items-center gap-1">
      {label}
      {sortField === field && <span>{sortDirection === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

function DocNameCell({ doc }: Readonly<{ doc: DocumentRecord }>) {
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
}

/** Column factory — defined at module level (not inside the component) to satisfy S6478. */
function buildDocumentColumns(
  selectedIds: Set<string>,
  paginatedDocuments: DocumentRecord[],
  toggleSelectAll: () => void,
  toggleSelection: (id: string) => void,
  handleSort: (field: string) => void,
  sortField: string,
  sortDirection: 'asc' | 'desc'
): ColumnDef<DocumentRecord>[] {
  return [
    {
      id: 'select',
      header: () => (
        <DocSelectAllHeader
          selectedCount={selectedIds.size}
          totalCount={paginatedDocuments.length}
          onToggle={toggleSelectAll}
        />
      ),
      cell: ({ row }) => (
        <DocSelectCell
          id={row.original.id}
          title={row.original.metadata.title}
          isChecked={selectedIds.has(row.original.id)}
          onToggle={toggleSelection}
        />
      ),
      enableSorting: false,
    },
    {
      accessorKey: 'metadata.title',
      header: () => (
        <DocSortableHeader
          label="Name"
          field="name"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => <DocNameCell doc={row.original} />,
    },
    {
      accessorKey: 'status',
      header: () => (
        <DocSortableHeader
          label="Status"
          field="status"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => <DocumentStatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'sizeBytes',
      header: () => (
        <DocSortableHeader
          label="Size"
          field="size"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => formatFileSize(Number(row.original.sizeBytes) || 0),
    },
    {
      accessorKey: 'createdAt',
      header: () => (
        <DocSortableHeader
          label="Date"
          field="date"
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      ),
      cell: ({ row }) => formatDate(row.original.createdAt),
    },
  ];
}

// =============================================================================
// DocumentStatusBadge Sub-Component
// =============================================================================

export function DocumentStatusBadge({ status }: Readonly<{ status: DocumentStatus }>) {
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
}: Readonly<DocumentListProps>) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, _setFilters] = useState<DocumentFilters>(initialFilters ?? {});
  const [sortField, setSortField] = useState<string>('createdAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(0);
  const [confirmAction, setConfirmAction] = useState<{ action: BulkAction; ids: string[] } | null>(
    null
  );
  const [documents, _setDocuments] = useState<DocumentRecord[]>(initialDocuments ?? []);
  const [isLoading, _setIsLoading] = useState(false);
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
          break;
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
    toast({
      title: `${confirmAction.action} completed for ${confirmAction.ids.length} document(s)`,
    });
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
  // Columns are built by a module-level factory to avoid S6478 (JSX-returning
  // functions defined inside a React component). useMemo caches the result.

  const columns = useMemo(
    () =>
      buildDocumentColumns(
        selectedIds,
        paginatedDocuments,
        toggleSelectAll,
        toggleSelection,
        handleSort,
        sortField,
        sortDirection
      ),
    [
      selectedIds,
      paginatedDocuments,
      toggleSelectAll,
      toggleSelection,
      handleSort,
      sortField,
      sortDirection,
    ]
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div
        className="space-y-4"
        role="status" // NOSONAR typescript:S6819 — loading skeleton region; <output> is for form computation results
        aria-label="Loading documents"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /> // NOSONAR typescript:S6479
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
        <div
          className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg"
          data-testid="bulk-toolbar"
        >
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
      <div
        role="table" // NOSONAR typescript:S6819 — wrapper div needed to pass aria-label; DataTable renders its own <table> internally
        aria-label="Documents table"
      >
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
