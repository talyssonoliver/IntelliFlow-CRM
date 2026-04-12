// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { TotalLeadsWidget } from '../TotalLeadsWidget';

const useQueryMock = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    lead: {
      stats: {
        useQuery: (...args: unknown[]) => useQueryMock(...args),
      },
    },
  },
}));

describe('TotalLeadsWidget', () => {
  beforeEach(() => {
    useQueryMock.mockReset();
  });

  it('shows loading skeleton while fetching', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const { container } = render(<TotalLeadsWidget />);

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders lead total when data is available', () => {
    useQueryMock.mockReturnValue({ data: { total: 2345 }, isLoading: false, error: null });
    render(<TotalLeadsWidget />);

    expect(screen.getByText('Total Leads')).toBeInTheDocument();
    expect(screen.getByText('2,345')).toBeInTheDocument();
  });

  it('returns null on error', () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error('boom') });
    const { container } = render(<TotalLeadsWidget />);

    expect(container).toBeEmptyDOMElement();
  });
});
