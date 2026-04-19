import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DocumentLinks } from '../DocumentLinks';

const mockUseQuery = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    documents: {
      list: {
        useQuery: (...args: unknown[]) => mockUseQuery(...args),
      },
    },
  },
}));

describe('DocumentLinks', () => {
  beforeEach(() => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('renders empty state when no documents', () => {
    // Source migrated to `<EmptyState entity="documents" />` (DocumentLinks.tsx:101).
    // Canonical title: 'No documents yet'.
    render(<DocumentLinks caseId="case-1" />);
    expect(screen.getByText('No documents yet')).toBeInTheDocument();
  });

  it('renders empty-state description pointing to the documents area', () => {
    // Canonical description from packages/ui entity-empty-state-config.
    render(<DocumentLinks caseId="case-999" />);
    expect(
      screen.getByText(/Create or link proposals, contracts, and other business documents\./)
    ).toBeInTheDocument();
  });

  it('renders loading skeletons when loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<DocumentLinks caseId="case-loading" />);
    const skeletons = container.querySelectorAll(
      '[class*="animate-pulse"], [data-slot="skeleton"]'
    );
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders document list when data is available', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-1',
            title: 'Settlement Agreement v2',
            document_type: 'AGREEMENT',
            status: 'APPROVED',
            version_major: 2,
            version_minor: 0,
            size_bytes: 245000,
            created_at: '2026-01-15T10:00:00Z',
          },
          {
            id: 'doc-2',
            title: 'Evidence Exhibit A',
            document_type: 'EVIDENCE',
            status: 'DRAFT',
            version_major: 1,
            version_minor: 0,
            size_bytes: 1024000,
            created_at: '2026-02-01T14:30:00Z',
          },
        ],
      },
      isLoading: false,
    });

    render(<DocumentLinks caseId="case-with-docs" />);
    expect(screen.getByText('Settlement Agreement v2')).toBeInTheDocument();
    expect(screen.getByText('Evidence Exhibit A')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('v2.0')).toBeInTheDocument();
  });

  it('renders COURT_FILING document type', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-filing',
            title: 'Court Filing',
            document_type: 'COURT_FILING',
            status: 'SIGNED',
            version_major: 1,
            version_minor: 0,
            size_bytes: 50000,
            created_at: '2026-01-20T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-filing" />);
    expect(screen.getByText('Court Filing')).toBeInTheDocument();
    expect(screen.getByText('Signed')).toBeInTheDocument();
  });

  it('renders CORRESPONDENCE document type', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-corr',
            title: 'Client Letter',
            document_type: 'CORRESPONDENCE',
            status: 'UNDER_REVIEW',
            version_major: 1,
            version_minor: 2,
            size_bytes: 8500,
            created_at: '2026-02-05T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-corr" />);
    expect(screen.getByText('Client Letter')).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();
    expect(screen.getByText('v1.2')).toBeInTheDocument();
  });

  it('renders ARCHIVED status badge', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-arch',
            title: 'Old Report',
            document_type: 'REPORT',
            status: 'ARCHIVED',
            version_major: 3,
            version_minor: 1,
            size_bytes: 200,
            created_at: '2025-06-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-arch" />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
  });

  it('renders SUPERSEDED status badge with line-through', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-sup',
            title: 'Superseded Contract',
            document_type: 'CONTRACT',
            status: 'SUPERSEDED',
            version_major: 1,
            version_minor: 0,
            size_bytes: 100000,
            created_at: '2025-01-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-sup" />);
    expect(screen.getByText('Superseded')).toBeInTheDocument();
  });

  it('formats file sizes correctly: bytes', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-small',
            title: 'Tiny File',
            document_type: 'OTHER',
            status: 'DRAFT',
            version_major: 1,
            version_minor: 0,
            size_bytes: 512,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-small" />);
    expect(screen.getByText('512 B')).toBeInTheDocument();
  });

  it('formats file sizes correctly: KB', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-kb',
            title: 'KB File',
            document_type: 'OTHER',
            status: 'DRAFT',
            version_major: 1,
            version_minor: 0,
            size_bytes: 5120,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-kb" />);
    expect(screen.getByText('5.0 KB')).toBeInTheDocument();
  });

  it('formats file sizes correctly: MB', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-mb',
            title: 'Big File',
            document_type: 'OTHER',
            status: 'DRAFT',
            version_major: 1,
            version_minor: 0,
            size_bytes: 2621440,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-mb" />);
    expect(screen.getByText('2.5 MB')).toBeInTheDocument();
  });

  it('handles camelCase field names from API', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-camel',
            title: 'CamelCase Doc',
            documentType: 'COURT_FILING',
            status: 'APPROVED',
            versionMajor: 2,
            versionMinor: 3,
            sizeBytes: 100000,
            createdAt: '2026-02-10T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-camel" />);
    expect(screen.getByText('CamelCase Doc')).toBeInTheDocument();
    expect(screen.getByText('v2.3')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders unknown doc type with fallback icon/color', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-unknown',
            title: 'Unknown Type Doc',
            document_type: 'CUSTOM_TYPE',
            status: 'DRAFT',
            version_major: 1,
            version_minor: 0,
            size_bytes: 1000,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-unknown" />);
    expect(screen.getByText('Unknown Type Doc')).toBeInTheDocument();
  });

  it('renders unknown status with fallback badge', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-unk-status',
            title: 'Unknown Status Doc',
            document_type: 'CONTRACT',
            status: 'PENDING_APPROVAL',
            version_major: 1,
            version_minor: 0,
            size_bytes: 1000,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-unk-status" />);
    // Falls back to DRAFT badge
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('renders default version when version fields missing', () => {
    mockUseQuery.mockReturnValue({
      data: {
        documents: [
          {
            id: 'doc-no-ver',
            title: 'No Version Doc',
            document_type: 'MEMO',
            status: 'DRAFT',
            size_bytes: 500,
            created_at: '2026-02-01T10:00:00Z',
          },
        ],
      },
      isLoading: false,
    });
    render(<DocumentLinks caseId="case-no-ver" />);
    expect(screen.getByText('v1.0')).toBeInTheDocument();
  });
});
