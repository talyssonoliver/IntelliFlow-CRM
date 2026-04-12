// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import NotFoundPage, { metadata } from '../page';

vi.mock('next/navigation', () => ({
  usePathname: () => '/missing/revenue-report',
}));

describe('NotFoundPage', () => {
  it('renders the missing-page heading and recovery actions', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: /page not found/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to dashboard/i })).toHaveAttribute(
      'href',
      '/dashboard'
    );
    expect(screen.getByRole('link', { name: /back to home/i })).toHaveAttribute('href', '/');
  });

  it('renders the search suggestion section', () => {
    render(<NotFoundPage />);

    expect(screen.getByRole('heading', { name: /try one of these instead/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /reports/i })).toHaveAttribute('href', '/analytics');
  });

  it('exports metadata for a non-indexable 404 route', () => {
    expect(metadata.title).toBe('Page Not Found | IntelliFlow CRM');
    expect(metadata.alternates?.canonical).toBe('/404');
    expect(metadata.robots).toEqual({
      index: false,
      follow: false,
    });
  });
});
