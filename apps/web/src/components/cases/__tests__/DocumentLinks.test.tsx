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
    render(<DocumentLinks caseId="case-1" />);
    expect(screen.getByText(/No documents attached to this case/)).toBeInTheDocument();
  });

  it('renders document page reference in empty state', () => {
    render(<DocumentLinks caseId="case-999" />);
    expect(screen.getByText(/Upload or link documents from the Documents page/)).toBeInTheDocument();
  });

  it('renders loading skeletons when loading', () => {
    mockUseQuery.mockReturnValue({ data: undefined, isLoading: true });

    const { container } = render(<DocumentLinks caseId="case-loading" />);
    const skeletons = container.querySelectorAll('[class*="animate-pulse"], [data-slot="skeleton"]');
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
});
