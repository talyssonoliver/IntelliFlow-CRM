/**
 * @vitest-environment jsdom
 *
 * "Export all workspace data" card: starts an export, shows progress and expiry, and issues a
 * fresh link only for a finished export.
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({
  list: { data: [] as unknown[], isLoading: false, isError: false },
  request: { mutateAsync: vi.fn(), isPending: false },
  link: { mutateAsync: vi.fn(), isPending: false },
  invalidate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/ui')>()),
  toast: h.toast,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ workspaceExport: { invalidate: h.invalidate } }),
    workspaceExport: {
      list: { useQuery: () => h.list },
      request: { useMutation: () => h.request },
      downloadLink: { useMutation: () => h.link },
    },
  },
}));

import { WorkspaceExportCard, formatBytes } from '../components/WorkspaceExportCard';

const row = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  trigger: 'ADMIN',
  status: 'READY',
  requestedAt: '2026-11-23T10:00:00.000Z',
  completedAt: '2026-11-23T10:05:00.000Z',
  expiresAt: '2026-12-07T10:05:00.000Z',
  emailedAt: null,
  fileCount: 3,
  archiveBytes: 5 * 1024 * 1024,
  archiveSha256: 'a'.repeat(64),
  totalRows: 12,
  skippedFiles: 0,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  h.list = { data: [], isLoading: false, isError: false };
  h.request.isPending = false;
  h.request.mutateAsync.mockResolvedValue({ requestId: 'r1' });
});

describe('WorkspaceExportCard', () => {
  it('starts an export and says the link will be emailed', async () => {
    render(<WorkspaceExportCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Export all workspace data' }));
    await waitFor(() => expect(h.request.mutateAsync).toHaveBeenCalledTimes(1));
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Export started' }));
  });

  it("shows the server's refusal (rate limit) instead of failing silently", async () => {
    h.request.mutateAsync.mockRejectedValue(
      new Error('A workspace export can be requested once a day.')
    );
    render(<WorkspaceExportCard />);
    fireEvent.click(screen.getByRole('button', { name: 'Export all workspace data' }));
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Export not started',
          description: 'A workspace export can be requested once a day.',
        })
      )
    );
  });

  it('disables the button while an export is queued or running', () => {
    h.list = {
      data: [row({ status: 'RUNNING', archiveBytes: null })],
      isLoading: false,
      isError: false,
    };
    render(<WorkspaceExportCard />);
    expect(screen.getByRole('button', { name: 'Export in progress' })).toBeDisabled();
    expect(screen.getByText('Building')).toBeInTheDocument();
  });

  it('shows size, file count and the day the link stops for a finished export', () => {
    h.list = { data: [row()], isLoading: false, isError: false };
    render(<WorkspaceExportCard />);
    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/3 stored files/)).toBeInTheDocument();
    expect(screen.getByText(/link valid until 7 Dec 2026/)).toBeInTheDocument();
  });

  it('offers a new link only for a ready export', () => {
    h.list = {
      data: [
        row({ id: 'a' }),
        row({ id: 'b', status: 'EXPIRED' }),
        row({ id: 'c', status: 'FAILED' }),
      ],
      isLoading: false,
      isError: false,
    };
    render(<WorkspaceExportCard />);
    expect(screen.getAllByRole('button', { name: 'Get a new link' })).toHaveLength(1);
    expect(screen.getByText(/Request a new one/)).toBeInTheDocument();
    expect(screen.getByText(/The export failed/)).toBeInTheDocument();
  });

  it('formats sizes', () => {
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(10)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
  });
});
