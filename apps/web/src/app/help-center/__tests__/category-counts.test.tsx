import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import HelpCenterPage from '../(list)/page';

const mockCounts = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: { helpArticle: { getCategoryCounts: { useQuery: mockCounts } } },
}));

vi.mock('@/components/shared', () => ({
  PageHeader: () => null,
  SearchFilterBar: () => null,
}));

function cardFor(title: string): HTMLElement {
  const item = screen.getByText(title).closest('li');
  if (!item) throw new Error(`no card for ${title}`);
  return item;
}

describe('Help Center category counts', () => {
  beforeEach(() => mockCounts.mockReset());

  it('shows the count the API returned, not a stored number', () => {
    mockCounts.mockReturnValue({ data: { 'email-calendar': 2 } });
    render(<HelpCenterPage />);
    expect(within(cardFor('Email & Calendar')).getByText('2 articles')).toBeInTheDocument();
  });

  it('shows zero for a category the API has no articles for', () => {
    mockCounts.mockReturnValue({ data: { 'email-calendar': 2 } });
    render(<HelpCenterPage />);
    expect(within(cardFor('Tickets & Cases')).getByText('0 articles')).toBeInTheDocument();
  });

  it('shows no count while loading or after a failed request', () => {
    mockCounts.mockReturnValue({ data: undefined });
    render(<HelpCenterPage />);
    expect(within(cardFor('Email & Calendar')).queryByText(/article/)).not.toBeInTheDocument();
  });
});
