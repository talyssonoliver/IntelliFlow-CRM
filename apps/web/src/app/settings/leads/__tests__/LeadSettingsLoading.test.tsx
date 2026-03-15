/**
 * LeadSettingsLoading Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the skeleton loading state component rendered while
 * auth and data queries are in flight.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock @intelliflow/ui to avoid importing the full package
vi.mock('@intelliflow/ui', () => ({
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

// Import the real component (NOT mocked)
import { LeadSettingsLoading } from '../LeadSettingsLoading';

describe('LeadSettingsLoading', () => {
  it('renders without crashing', () => {
    render(<LeadSettingsLoading />);

    // Multiple skeletons should be present
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders multiple skeleton elements for loading animation', () => {
    render(<LeadSettingsLoading />);

    // The component renders at least 9 skeleton placeholders
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(9);
  });

  it('renders card elements for content skeleton', () => {
    render(<LeadSettingsLoading />);

    const cards = screen.getAllByTestId('card');
    expect(cards.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a breadcrumb-sized skeleton (h-4 w-48)', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const breadcrumbSkeleton = skeletons.find((el) =>
      el.className.includes('h-4') && el.className.includes('w-48')
    );
    expect(breadcrumbSkeleton).toBeTruthy();
  });

  it('renders a header-sized skeleton (h-8 w-56)', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const headerSkeleton = skeletons.find((el) =>
      el.className.includes('h-8') && el.className.includes('w-56')
    );
    expect(headerSkeleton).toBeTruthy();
  });

  it('renders tab skeleton placeholders (h-10)', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const tabSkeletons = skeletons.filter((el) => el.className.includes('h-10'));
    expect(tabSkeletons.length).toBeGreaterThanOrEqual(4);
  });

  it('renders 5 content row cards', () => {
    render(<LeadSettingsLoading />);

    const cards = screen.getAllByTestId('card');
    // 5 content row cards + 1 sidebar card = 6 total
    expect(cards.length).toBeGreaterThanOrEqual(5);
  });
});
