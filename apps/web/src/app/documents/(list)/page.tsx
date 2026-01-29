'use client';

import { useState, useMemo, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ColumnDef } from '@tanstack/react-table';
import {
  DataTable,
  TableRowActions,
  type BulkAction,
  ConfirmationDialog,
  toast,
} from '@intelliflow/ui';
import { trpc } from '@/lib/trpc';
import { PageHeader, SearchFilterBar } from '@/components/shared';

// =============================================================================
// Types
// =============================================================================

interface DocumentMetadata {
  title: string;
  description?: string;
  documentType: string;
}

interface DocumentVersion {
  major: number;
  minor: number;
  patch: number;
}

interface DocumentRecord {
  id: string;
  metadata: DocumentMetadata;
  status: string;
  version?: DocumentVersion;
  sizeBytes?: string | number;
  createdAt: string;
  createdBy?: string;
  retentionUntil?: string;
  eSignature?: boolean;
}

// =============================================================================
// Filter Options
// =============================================================================

const DOCUMENT_TYPE_OPTIONS = [
  { value: 'contract', label: 'Contract' },
  { value: 'motion', label: 'Motion' },
  { value: 'evidence', label: 'Evidence' },
  { value: 'agreement', label: 'Agreement' },
];

const DOCUMENT_STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Draft' },
  { value: 'UNDER_REVIEW', label: 'In Review' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'SIGNED', label: 'Signed' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

// =============================================================================
// Helper Functions
// =============================================================================

function formatFileSize(bytes: number) {
  const kb = bytes / 1024;
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb.toFixed(0)} KB`;
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// =============================================================================
// Column Definitions
// =============================================================================

const columns: ColumnDef<DocumentRecord>[] = [
  {
    accessorKey: 'metadata.title',
    header: 'Document Title',
    cell: ({ row }) => {
      const doc = row.original;
      const hasLegalHold = doc.retentionUntil && new Date(doc.retentionUntil) > new Date();

      return (
        <div className="flex items-center gap-3">
          <div className="p-2 rounded bg-slate-100 dark:bg-slate-700">
            <span className="material-symbols-outlined text-[20px] text-primary">
              description
            </span>
          </div>
          <div>
            <p className="font-medium text-slate-900 dark:text-white">
              {doc.metadata.title}
            </p>
            {doc.metadata.description && (
              <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                {doc.metadata.description}
              </p>
            )}
            {hasLegalHold && (
              <span className="inline-flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                <span className="material-symbols-outlined text-sm">shield</span>
                Legal Hold
              </span>
            )}
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: 'metadata.documentType',
    header: 'Type',
    cell: ({ row }) => (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
        {row.original.metadata.documentType}
      </span>
    ),
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const doc = row.original;
      const signatureCount = doc.eSignature ? 1 : 0;
      return <DocumentStatusBadge status={doc.status} signatureCount={signatureCount} />;
    },
  },
  {
    id: 'version',
    header: 'Version',
    cell: ({ row }) => {
      const doc = row.original;
      const version = doc.version
        ? `${doc.version.major}.${doc.version.minor}.${doc.version.patch}`
        : '1.0.0';
      return (
        <span className="font-mono text-sm text-slate-500 dark:text-slate-400">
          v{version}
        </span>
      );
    },
  },
  {
    accessorKey: 'sizeBytes',
    header: 'Size',
    cell: ({ row }) => (
      <span className="text-sm text-slate-500 dark:text-slate-400">
        {row.original.sizeBytes ? formatFileSize(Number(row.original.sizeBytes)) : '-'}
      </span>
    ),
  },
  {
    accessorKey: 'createdAt',
    header: 'Created',
    cell: ({ row }) => (
      <div>
        <p className="text-sm text-slate-900 dark:text-white">
          {formatDate(row.original.createdAt)}
        </p>
        {row.original.createdBy && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            by {row.original.createdBy}
          </p>
        )}
      </div>
    ),
  },
  {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const doc = row.original;
      return (
        <TableRowActions
          quickActions={[
            {
              icon: 'download',
              label: 'Download',
              onClick: () => console.log('Download document:', doc.id),
            },
            {
              icon: 'share',
              label: 'Share',
              onClick: () => console.log('Share document:', doc.id),
            },
          ]}
          dropdownActions={[
            {
              icon: 'edit',
              label: 'Edit Metadata',
              onClick: () => console.log('Edit document:', doc.id),
            },
            {
              icon: 'content_copy',
              label: 'Duplicate',
              onClick: () => console.log('Duplicate document:', doc.id),
            },
            {
              icon: 'draw',
              label: 'Request Signature',
              onClick: () => console.log('Request signature for:', doc.id),
            },
            {
              icon: 'history',
              label: 'Version History',
              onClick: () => console.log('View history:', doc.id),
            },
            { id: 'sep-1', icon: '', label: '', onClick: () => {}, separator: true },
            {
              icon: 'archive',
              label: 'Archive',
              onClick: () => console.log('Archive document:', doc.id),
            },
            {
              icon: 'delete',
              label: 'Delete',
              variant: 'danger',
              onClick: () => console.log('Delete document:', doc.id),
            },
          ]}
        />
      );
    },
  },
];

// =============================================================================
// Page Component
// =============================================================================

export default function DocumentsPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortOrder, setSortOrder] = useState('newest');

  // Dialog state
  const [showArchiveDialog, setShowArchiveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Track selected documents for bulk actions
  const selectedDocumentsRef = useRef<DocumentRecord[]>([]);

  // Fetch documents from API
  const { data, isLoading, error, refetch } = trpc.documents.list.useQuery({
    limit: 100,
    offset: 0,
  });

  // tRPC mutations
  const bulkDownloadMutation = trpc.documents.bulkDownload.useMutation();
  const bulkArchiveMutation = trpc.documents.bulkArchive.useMutation();
  const bulkDeleteMutation = trpc.documents.bulkDelete.useMutation();

  const documents = (data?.data || []) as DocumentRecord[];

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let docs = documents.filter(
      (doc) =>
        searchQuery === '' ||
        doc.metadata.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (doc.metadata.description && doc.metadata.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
        doc.metadata.documentType.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (typeFilter) {
      docs = docs.filter(
        (doc) => doc.metadata.documentType.toLowerCase() === typeFilter.toLowerCase()
      );
    }

    if (statusFilter) {
      docs = docs.filter((doc) => doc.status === statusFilter);
    }

    if (sortOrder === 'name') {
      docs = [...docs].sort((a, b) =>
        a.metadata.title.localeCompare(b.metadata.title)
      );
    } else if (sortOrder === 'oldest') {
      docs = [...docs].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else {
      docs = [...docs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return docs;
  }, [documents, searchQuery, typeFilter, statusFilter, sortOrder]);

  // Handle row click - navigate to document detail
  const handleRowClick = (doc: DocumentRecord) => {
    router.push(`/documents/${doc.id}`);
  };

  // ==========================================================================
  // Bulk Action Handlers
  // ==========================================================================

  const handleBulkDownload = useCallback(
    async (documents: DocumentRecord[]) => {
      try {
        const result = await bulkDownloadMutation.mutateAsync({
          ids: documents.map((d) => d.id),
        });

        if (result.storageKeys.length > 0) {
          // In a real implementation, you would generate download URLs
          // For now, show a success message with the count
          toast({
            title: 'Download Ready',
            description: `${result.storageKeys.length} document(s) ready for download.`,
          });

          // Open download for each file (in production, you might create a zip)
          result.storageKeys.forEach((doc) => {
            // This would be replaced with actual storage URL generation
            console.log(`Downloading: ${doc.title} (${doc.storageKey})`);
          });
        }

        if (result.failed.length > 0) {
          toast({
            title: 'Some downloads failed',
            description: `${result.failed.length} document(s) could not be downloaded.`,
            variant: 'destructive',
          });
        }
      } catch (error) {
        toast({
          title: 'Download Failed',
          description: error instanceof Error ? error.message : 'An unexpected error occurred',
          variant: 'destructive',
        });
      }
    },
    [bulkDownloadMutation]
  );

  const handleBulkShare = useCallback(
    async (documents: DocumentRecord[]) => {
      // For bulk share, we would need a dialog to select recipients
      // For now, we'll show a placeholder message
      toast({
        title: 'Share Documents',
        description: `Selected ${documents.length} document(s) for sharing. Open document details to manage access.`,
      });
      // In a full implementation, this would open a user selection dialog
      // and call bulkShareMutation with the selected recipients
    },
    []
  );

  const handleBulkArchive = useCallback(async () => {
    const documents = selectedDocumentsRef.current;
    if (documents.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkArchiveMutation.mutateAsync({
        ids: documents.map((d) => d.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Documents Archived',
          description: `Successfully archived ${result.successful.length} document(s).`,
        });
        refetch();
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some documents could not be archived',
          description: `${result.failed.length} document(s) failed: ${result.failed[0]?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Archive Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowArchiveDialog(false);
    }
  }, [bulkArchiveMutation, refetch]);

  const handleBulkDelete = useCallback(async () => {
    const documents = selectedDocumentsRef.current;
    if (documents.length === 0) return;

    setIsSubmitting(true);
    try {
      const result = await bulkDeleteMutation.mutateAsync({
        ids: documents.map((d) => d.id),
      });

      if (result.successful.length > 0) {
        toast({
          title: 'Documents Deleted',
          description: `Successfully deleted ${result.successful.length} document(s).`,
        });
        refetch();
      }

      if (result.failed.length > 0) {
        toast({
          title: 'Some documents could not be deleted',
          description: `${result.failed.length} document(s) failed: ${result.failed[0]?.error ?? 'Unknown error'}`,
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Delete Failed',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
      setShowDeleteDialog(false);
    }
  }, [bulkDeleteMutation, refetch]);

  // Bulk actions for selected documents
  const bulkActions: BulkAction<DocumentRecord>[] = useMemo(
    () => [
      {
        icon: 'download',
        label: 'Download',
        onClick: (selected) => {
          handleBulkDownload(selected);
        },
      },
      {
        icon: 'share',
        label: 'Share',
        onClick: (selected) => {
          handleBulkShare(selected);
        },
      },
      {
        icon: 'archive',
        label: 'Archive',
        onClick: (selected) => {
          selectedDocumentsRef.current = selected;
          setShowArchiveDialog(true);
        },
      },
      {
        icon: 'delete',
        label: 'Delete',
        variant: 'danger',
        onClick: (selected) => {
          selectedDocumentsRef.current = selected;
          setShowDeleteDialog(true);
        },
      },
    ],
    [handleBulkDownload, handleBulkShare]
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <PageHeader
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Documents' },
        ]}
        title="Document Library"
        description="Manage legal documents with versioning, e-signatures, and access control."
        actions={[
          {
            label: 'Upload Document',
            icon: 'upload_file',
            variant: 'primary',
            href: '/documents/new',
          },
        ]}
      />

      {/* Search and Filters */}
      <SearchFilterBar
        searchValue={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search documents by title, type, or content..."
        searchAriaLabel="Search documents"
        filters={[
          {
            id: 'type',
            label: 'Document Type',
            icon: 'description',
            options: DOCUMENT_TYPE_OPTIONS,
            value: typeFilter,
            onChange: setTypeFilter,
          },
          {
            id: 'status',
            label: 'Status',
            icon: 'label',
            options: DOCUMENT_STATUS_OPTIONS,
            value: statusFilter,
            onChange: setStatusFilter,
          },
        ]}
        sort={{
          options: SORT_OPTIONS,
          value: sortOrder,
          onChange: setSortOrder,
        }}
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredDocuments}
        isLoading={isLoading}
        error={error?.message || null}
        emptyMessage={searchQuery ? 'No documents match your search' : 'No documents found'}
        emptyIcon="description"
        onRowClick={handleRowClick}
        enableRowSelection
        bulkActions={bulkActions}
        pageSize={10}
      />

      {/* Bulk Archive Confirmation Dialog */}
      <ConfirmationDialog
        open={showArchiveDialog}
        onOpenChange={setShowArchiveDialog}
        title="Archive Documents"
        description={`Are you sure you want to archive ${selectedDocumentsRef.current.length} selected document(s)? Archived documents can be restored later.`}
        confirmLabel="Archive"
        onConfirm={handleBulkArchive}
        variant="default"
        isLoading={isSubmitting}
        icon="archive"
      />

      {/* Bulk Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="Delete Documents"
        description={`Are you sure you want to delete ${selectedDocumentsRef.current.length} selected document(s)? Documents under legal hold cannot be deleted.`}
        confirmLabel="Delete"
        onConfirm={handleBulkDelete}
        variant="destructive"
        isLoading={isSubmitting}
        icon="delete"
      />
    </div>
  );
}

function DocumentStatusBadge({
  status,
  signatureCount,
}: {
  status: string;
  signatureCount: number;
}) {
  const statusConfig = {
    DRAFT: { bg: 'bg-muted', text: 'text-muted-foreground', icon: 'edit_note' },
    UNDER_REVIEW: { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', icon: 'rate_review' },
    APPROVED: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: 'check_circle' },
    SIGNED: { bg: 'bg-primary/10', text: 'text-primary', icon: 'verified' },
    ARCHIVED: { bg: 'bg-gray-100 dark:bg-gray-900/30', text: 'text-gray-600 dark:text-gray-400', icon: 'archive' },
    SUPERSEDED: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', icon: 'history' },
  };

  const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.DRAFT;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}
    >
      <span className="material-symbols-outlined text-sm">{config.icon}</span>
      {status.replace('_', ' ')}
      {status === 'SIGNED' && signatureCount > 0 && (
        <span className="ml-0.5">({signatureCount})</span>
      )}
    </span>
  );
}
