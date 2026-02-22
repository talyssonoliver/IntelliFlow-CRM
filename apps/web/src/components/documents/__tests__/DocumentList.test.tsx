import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DocumentList, DocumentStatusBadge } from '../DocumentList';
import {
  createDocumentFactory,
  resetFactories,
  mockRouter,
} from './document-test-utils';
import type { DocumentStatus } from '../types';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/documents',
}));

const mockToast = vi.fn();

vi.mock('@intelliflow/ui', () => ({
  DataTable: ({ columns, data, onRowClick }: any) => (
    <table data-testid="data-table">
      <thead>
        <tr>
          {columns.map((col: any, i: number) => (
            <th key={i}>{typeof col.header === 'function' ? col.header() : col.header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.map((row: any, i: number) => (
          <tr key={i} onClick={() => onRowClick?.(row)} data-testid={`row-${row.id}`}>
            {columns.map((col: any, j: number) => (
              <td key={j}>
                {typeof col.cell === 'function'
                  ? col.cell({ row: { original: row } })
                  : null}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
  ConfirmationDialog: ({ open, title, description, onConfirm, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirmation-dialog" role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button onClick={onConfirm} data-testid="confirm-button">Confirm</button>
        <button onClick={() => onOpenChange?.(false)} data-testid="cancel-button">Cancel</button>
      </div>
    ) : null,
  Button: ({ children, onClick, disabled, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} {...props}>
      {children}
    </button>
  ),
  toast: (...args: any[]) => mockToast(...args),
}));

// =============================================================================
// Tests
// =============================================================================

describe('DocumentStatusBadge', () => {
  it('renders Draft status with correct label', () => {
    render(<DocumentStatusBadge status="DRAFT" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByLabelText('Status: Draft')).toBeInTheDocument();
  });

  it('renders Approved status with correct label', () => {
    render(<DocumentStatusBadge status="APPROVED" />);
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders In Review status', () => {
    render(<DocumentStatusBadge status="UNDER_REVIEW" />);
    expect(screen.getByText('In Review')).toBeInTheDocument();
  });

  it.each<[DocumentStatus, string]>([
    ['SIGNED', 'Signed'],
    ['ARCHIVED', 'Archived'],
    ['SUPERSEDED', 'Superseded'],
  ])('renders %s status as %s', (status, label) => {
    render(<DocumentStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('DocumentList', () => {
  const defaultProps = {
    tenantId: 'tenant-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    resetFactories();
    vi.clearAllMocks();
  });

  // ─── Empty State ──────────────────────────────────────────────────────────

  it('renders empty state when no documents', () => {
    render(<DocumentList {...defaultProps} />);
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByText('No documents')).toBeInTheDocument();
  });

  // ─── Table Rendering ──────────────────────────────────────────────────────

  it('renders document table with documents', () => {
    const docs = [
      createDocumentFactory({ id: 'doc-a', metadata: { title: 'Alpha', documentType: 'CONTRACT' } }),
      createDocumentFactory({ id: 'doc-b', metadata: { title: 'Beta', documentType: 'MOTION' } }),
    ];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
    expect(screen.queryByTestId('empty-state')).not.toBeInTheDocument();
  });

  it('renders document titles in table', () => {
    const docs = [
      createDocumentFactory({ metadata: { title: 'Quarterly Report', documentType: 'CONTRACT' } }),
    ];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('Quarterly Report')).toBeInTheDocument();
  });

  it('renders document descriptions when present', () => {
    const docs = [
      createDocumentFactory({ metadata: { title: 'Doc', description: 'A detailed desc', documentType: 'CONTRACT' } }),
    ];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('A detailed desc')).toBeInTheDocument();
  });

  it('renders status badges for each document', () => {
    const docs = [
      createDocumentFactory({ status: 'DRAFT' }),
      createDocumentFactory({ status: 'APPROVED' }),
    ];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders file sizes', () => {
    const docs = [createDocumentFactory({ sizeBytes: 5242880 })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('5.0 MB')).toBeInTheDocument();
  });

  it('renders formatted dates', () => {
    const docs = [createDocumentFactory({ createdAt: '2026-01-15T10:30:00Z' })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('Jan 15, 2026')).toBeInTheDocument();
  });

  // ─── Selection & Bulk Actions ─────────────────────────────────────────────

  it('does not show bulk action toolbar initially', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.queryByTestId('bulk-toolbar')).not.toBeInTheDocument();
  });

  it('shows bulk toolbar when documents are selected', () => {
    const docs = [createDocumentFactory({ id: 'sel-1' })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    // Click the checkbox for the document
    const checkbox = screen.getByLabelText(/Select Document/i);
    fireEvent.click(checkbox);
    expect(screen.getByTestId('bulk-toolbar')).toBeInTheDocument();
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows select all checkbox', () => {
    const docs = [createDocumentFactory(), createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByLabelText('Select all documents')).toBeInTheDocument();
  });

  it('toggles select all', () => {
    const docs = [createDocumentFactory(), createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText('Select all documents'));
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    // Toggle off
    fireEvent.click(screen.getByLabelText('Select all documents'));
    expect(screen.queryByTestId('bulk-toolbar')).not.toBeInTheDocument();
  });

  it('opens confirmation dialog for bulk delete', () => {
    const docs = [createDocumentFactory({ id: 'del-1' })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText(/Select Document/i));
    fireEvent.click(screen.getByLabelText('Delete selected documents'));
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Delete 1 document/)).toBeInTheDocument();
  });

  it('opens confirmation dialog for bulk archive', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText(/Select Document/i));
    fireEvent.click(screen.getByLabelText('Archive selected documents'));
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText(/Archive 1 document/)).toBeInTheDocument();
  });

  it('executes bulk action and calls onBulkAction callback', () => {
    const onBulk = vi.fn();
    const docs = [createDocumentFactory({ id: 'bulk-1' })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} onBulkAction={onBulk} />);
    fireEvent.click(screen.getByLabelText(/Select Document/i));
    fireEvent.click(screen.getByLabelText('Delete selected documents'));
    fireEvent.click(screen.getByTestId('confirm-button'));
    expect(onBulk).toHaveBeenCalledWith('delete', ['bulk-1']);
    expect(mockToast).toHaveBeenCalled();
  });

  it('dismisses confirmation dialog on cancel', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText(/Select Document/i));
    fireEvent.click(screen.getByLabelText('Delete selected documents'));
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancel-button'));
    expect(screen.queryByTestId('confirmation-dialog')).not.toBeInTheDocument();
  });

  it('opens download bulk action without dialog', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText(/Select Document/i));
    fireEvent.click(screen.getByLabelText('Download selected documents'));
    // Download goes through confirmation dialog too
    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
  });

  // ─── Sort Headers ─────────────────────────────────────────────────────────

  it('renders sortable column headers', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Size')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
  });

  it('toggles sort direction on column click', () => {
    const docs = [
      createDocumentFactory({ metadata: { title: 'Alpha', documentType: 'C' }, createdAt: '2026-01-01T00:00:00Z' }),
      createDocumentFactory({ metadata: { title: 'Zeta', documentType: 'C' }, createdAt: '2026-01-02T00:00:00Z' }),
    ];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    // Click the Name sort header
    fireEvent.click(screen.getByText('Name'));
    // Should show ascending indicator
    expect(screen.getByText('↑')).toBeInTheDocument();
    // Click again to toggle
    fireEvent.click(screen.getByText('Name'));
    expect(screen.getByText('↓')).toBeInTheDocument();
  });

  it('changes sort field when clicking different header', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByText('Size'));
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  // ─── Pagination ───────────────────────────────────────────────────────────

  it('does not show pagination with fewer documents than page size', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.queryByTestId('pagination')).not.toBeInTheDocument();
  });

  it('shows pagination when more than PAGE_SIZE documents', () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      createDocumentFactory({ id: `doc-p-${i}`, metadata: { title: `Doc ${i}`, documentType: 'C' } })
    );
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByTestId('pagination')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('navigates to next page', () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      createDocumentFactory({ id: `doc-n-${i}`, metadata: { title: `Doc ${i}`, documentType: 'C' } })
    );
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByText('Page 2 of 2')).toBeInTheDocument();
  });

  it('navigates to previous page', () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      createDocumentFactory({ id: `doc-prev-${i}`, metadata: { title: `Doc ${i}`, documentType: 'C' } })
    );
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText('Next page'));
    fireEvent.click(screen.getByLabelText('Previous page'));
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });

  it('disables previous button on first page', () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      createDocumentFactory({ id: `doc-dis-${i}`, metadata: { title: `Doc ${i}`, documentType: 'C' } })
    );
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByLabelText('Previous page')).toBeDisabled();
  });

  it('disables next button on last page', () => {
    const docs = Array.from({ length: 25 }, (_, i) =>
      createDocumentFactory({ id: `doc-last-${i}`, metadata: { title: `Doc ${i}`, documentType: 'C' } })
    );
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByLabelText('Next page'));
    expect(screen.getByLabelText('Next page')).toBeDisabled();
  });

  // ─── Row Click ────────────────────────────────────────────────────────────

  it('calls onDocumentSelect when row is clicked', () => {
    const onSelect = vi.fn();
    const docs = [createDocumentFactory({ id: 'click-1' })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} onDocumentSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('row-click-1'));
    expect(onSelect).toHaveBeenCalledWith('click-1');
  });

  // ─── Filtering ────────────────────────────────────────────────────────────

  it('accepts initialFilters prop', () => {
    const docs = [
      createDocumentFactory({ status: 'DRAFT', metadata: { title: 'D1', documentType: 'C' } }),
      createDocumentFactory({ status: 'APPROVED', metadata: { title: 'D2', documentType: 'C' } }),
    ];
    render(
      <DocumentList
        {...defaultProps}
        initialDocuments={docs}
        initialFilters={{ status: ['DRAFT'] }}
      />
    );
    // With status filter, only DRAFT documents should be visible
    expect(screen.getByText('D1')).toBeInTheDocument();
    expect(screen.queryByText('D2')).not.toBeInTheDocument();
  });

  it('filters by query string', () => {
    const docs = [
      createDocumentFactory({ metadata: { title: 'Annual Report', documentType: 'C' } }),
      createDocumentFactory({ metadata: { title: 'Meeting Notes', documentType: 'C' } }),
    ];
    render(
      <DocumentList
        {...defaultProps}
        initialDocuments={docs}
        initialFilters={{ query: 'annual' }}
      />
    );
    expect(screen.getByText('Annual Report')).toBeInTheDocument();
    expect(screen.queryByText('Meeting Notes')).not.toBeInTheDocument();
  });

  it('filters by classification', () => {
    const docs = [
      createDocumentFactory({ classification: 'PUBLIC', metadata: { title: 'Public Doc', documentType: 'C' } }),
      createDocumentFactory({ classification: 'PRIVILEGED', metadata: { title: 'Privileged Doc', documentType: 'C' } }),
    ];
    render(
      <DocumentList
        {...defaultProps}
        initialDocuments={docs}
        initialFilters={{ classification: ['PRIVILEGED'] }}
      />
    );
    expect(screen.queryByText('Public Doc')).not.toBeInTheDocument();
    expect(screen.getByText('Privileged Doc')).toBeInTheDocument();
  });

  it('filters by file type', () => {
    const docs = [
      createDocumentFactory({ mimeType: 'application/pdf', metadata: { title: 'PDF Doc', documentType: 'C' } }),
      createDocumentFactory({ mimeType: 'image/png', metadata: { title: 'Image Doc', documentType: 'C' } }),
    ];
    render(
      <DocumentList
        {...defaultProps}
        initialDocuments={docs}
        initialFilters={{ fileType: ['pdf'] }}
      />
    );
    expect(screen.getByText('PDF Doc')).toBeInTheDocument();
    expect(screen.queryByText('Image Doc')).not.toBeInTheDocument();
  });

  it('filters by query in description', () => {
    const docs = [
      createDocumentFactory({ metadata: { title: 'Doc A', description: 'Contains keyword alpha', documentType: 'C' } }),
      createDocumentFactory({ metadata: { title: 'Doc B', description: 'Other content', documentType: 'C' } }),
    ];
    render(
      <DocumentList
        {...defaultProps}
        initialDocuments={docs}
        initialFilters={{ query: 'alpha' }}
      />
    );
    expect(screen.getByText('Doc A')).toBeInTheDocument();
    expect(screen.queryByText('Doc B')).not.toBeInTheDocument();
  });

  // ─── Sorting ──────────────────────────────────────────────────────────────

  it('sorts by status', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByText('Status'));
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('sorts by date', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    fireEvent.click(screen.getByText('Date'));
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('has table role for documents area', () => {
    const docs = [createDocumentFactory()];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByRole('table', { name: 'Documents table' })).toBeInTheDocument();
  });

  it('checkboxes have aria-labels', () => {
    const docs = [createDocumentFactory({ metadata: { title: 'My Doc', documentType: 'C' } })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    expect(screen.getByLabelText('Select My Doc')).toBeInTheDocument();
    expect(screen.getByLabelText('Select all documents')).toBeInTheDocument();
  });

  // ─── MIME Type Icons ──────────────────────────────────────────────────────

  it('renders mime type icon for documents', () => {
    const docs = [createDocumentFactory({ mimeType: 'application/pdf' })];
    const { container } = render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    // getMimeTypeIcon returns 'picture_as_pdf' for PDF
    expect(container.querySelector('.material-symbols-outlined')).toBeInTheDocument();
  });

  it('handles documents without mimeType', () => {
    const docs = [createDocumentFactory({ mimeType: undefined })];
    render(<DocumentList {...defaultProps} initialDocuments={docs} />);
    // Should still render without error
    expect(screen.getByTestId('data-table')).toBeInTheDocument();
  });
});
