/**
 * Documents list page - bulk action handling (SonarCloud S9383).
 *
 * Verifies that promise-returning bulk handlers report failures to the user
 * rather than floating, and that archive/delete await the list refetch.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const refetch = vi.hoisted(() => vi.fn());
const bulkDownload = vi.hoisted(() => vi.fn());
const bulkArchive = vi.hoisted(() => vi.fn());
const bulkDelete = vi.hoisted(() => vi.fn());
const toastMock = vi.hoisted(() => vi.fn());

const stable = vi.hoisted(() => ({
  listResult: {
    data: { data: [{ id: 'doc-1' }, { id: 'doc-2' }] },
    isLoading: false,
    error: null,
    refetch: null as unknown,
  },
  typesResult: { data: [] as unknown[] },
  downloadMutation: { mutateAsync: null as unknown },
  archiveMutation: { mutateAsync: null as unknown },
  deleteMutation: { mutateAsync: null as unknown },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    documents: {
      list: { useQuery: () => stable.listResult },
      bulkDownload: { useMutation: () => stable.downloadMutation },
      bulkArchive: { useMutation: () => stable.archiveMutation },
      bulkDelete: { useMutation: () => stable.deleteMutation },
    },
    documentSettings: { documentTypes: { list: { useQuery: () => stable.typesResult } } },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@/components/shared', () => ({
  PageHeader: () => null,
  SearchFilterBar: () => null,
}));

vi.mock('@/components/documents', () => ({
  DocumentStatusBadge: () => null,
  formatFileSize: () => '',
  formatDate: () => '',
}));

vi.mock('@/components/documents/document-type-utils', () => ({
  getDocumentTypeDisplayLabel: () => '',
  SYSTEM_DOCUMENT_TYPE_OPTIONS: [],
}));

type BulkActionLike = { label: string; onClick: (selected: unknown[]) => void };

vi.mock('@intelliflow/ui', () => ({
  toast: toastMock,
  TableRowActions: () => null,
  DataTable: ({ bulkActions }: { bulkActions: BulkActionLike[] }) => (
    <div>
      {bulkActions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => action.onClick([{ id: 'doc-1' }, { id: 'doc-2' }])}
        >
          bulk-{action.label}
        </button>
      ))}
    </div>
  ),
  ConfirmationDialog: ({
    open,
    title,
    onConfirm,
  }: {
    open: boolean;
    title: string;
    onConfirm: () => void;
  }): ReactNode =>
    open ? (
      <button type="button" onClick={onConfirm}>
        confirm-{title}
      </button>
    ) : null,
}));

import DocumentsPage from '../page';

describe('DocumentsPage bulk actions', () => {
  beforeEach(() => {
    refetch.mockReset().mockResolvedValue(undefined);
    bulkDownload.mockReset();
    bulkArchive.mockReset();
    bulkDelete.mockReset();
    toastMock.mockReset();
    stable.listResult.refetch = refetch;
    stable.downloadMutation.mutateAsync = bulkDownload;
    stable.archiveMutation.mutateAsync = bulkArchive;
    stable.deleteMutation.mutateAsync = bulkDelete;
  });

  it('download: reports the ready count on success', async () => {
    bulkDownload.mockResolvedValue({
      storageKeys: [{ title: 'A', storageKey: 'k1' }],
      failed: [],
    });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Download'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Download Ready' }))
    );
  });

  it('download: warns about partial failures', async () => {
    bulkDownload.mockResolvedValue({ storageKeys: [], failed: [{ id: 'doc-2' }] });
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Download'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Some downloads failed', variant: 'destructive' })
      )
    );
  });

  it('download: shows a destructive toast with the error message when the mutation rejects', async () => {
    bulkDownload.mockRejectedValue(new Error('storage offline'));
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Download'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith({
        title: 'Download Failed',
        description: 'storage offline',
        variant: 'destructive',
      })
    );
  });

  it('download: falls back to a generic message for non-Error rejections', async () => {
    bulkDownload.mockRejectedValue('nope');
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Download'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Download Failed',
          description: 'An unexpected error occurred',
        })
      )
    );
  });

  it('share: points the user at the document detail page', () => {
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Share'));

    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Share 2 Documents' }));
  });

  it('archive: awaits the refetch after a successful archive', async () => {
    bulkArchive.mockResolvedValue({ successful: ['doc-1'], failed: [] });
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Archive'));
    fireEvent.click(screen.getByText('confirm-Archive Documents'));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Documents Archived' })
    );
  });

  it('archive: reports a failure when the refetch after archive rejects', async () => {
    bulkArchive.mockResolvedValue({ successful: ['doc-1'], failed: [] });
    refetch.mockRejectedValue(new Error('refetch failed'));
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Archive'));
    fireEvent.click(screen.getByText('confirm-Archive Documents'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Archive Failed', description: 'refetch failed' })
      )
    );
  });

  it('delete: awaits the refetch and reports partial failures', async () => {
    bulkDelete.mockResolvedValue({
      successful: ['doc-1'],
      failed: [{ id: 'doc-2', error: 'legal hold' }],
    });
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Delete'));
    fireEvent.click(screen.getByText('confirm-Delete Documents'));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Some documents could not be deleted',
        description: expect.stringContaining('legal hold'),
      })
    );
  });

  it('delete: reports a failure when the refetch after delete rejects', async () => {
    bulkDelete.mockResolvedValue({ successful: ['doc-1'], failed: [] });
    refetch.mockRejectedValue(new Error('refetch failed'));
    render(<DocumentsPage />);

    fireEvent.click(screen.getByText('bulk-Delete'));
    fireEvent.click(screen.getByText('confirm-Delete Documents'));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Delete Failed', description: 'refetch failed' })
      )
    );
  });
});
