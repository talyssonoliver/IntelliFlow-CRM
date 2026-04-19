/**
 * LeadSettingsLoading Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the skeleton loading state component rendered while
 * auth and data queries are in flight. The skeleton mirrors the
 * 12-col bento grid so there is no layout shift on hydration.
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

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders multiple skeleton elements for loading animation', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThanOrEqual(9);
  });

  it('renders card elements for each bento section', () => {
    render(<LeadSettingsLoading />);

    const cards = screen.getAllByTestId('card');
    // 5 bento cells: stages, automation, scoring, custom fields, summary
    expect(cards).toHaveLength(5);
  });

  it('renders a breadcrumb-sized skeleton (h-4 w-48)', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const breadcrumbSkeleton = skeletons.find(
      (el) => el.className.includes('h-4') && el.className.includes('w-48')
    );
    expect(breadcrumbSkeleton).toBeTruthy();
  });

  it('renders a header-sized skeleton (h-8 w-56)', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const headerSkeleton = skeletons.find(
      (el) => el.className.includes('h-8') && el.className.includes('w-56')
    );
    expect(headerSkeleton).toBeTruthy();
  });

  it('renders action button skeletons (h-10 w-36) in the header', () => {
    render(<LeadSettingsLoading />);

    const skeletons = screen.getAllByTestId('skeleton');
    const actionBtnSkeletons = skeletons.filter(
      (el) => el.className.includes('h-10') && el.className.includes('w-36')
    );
    expect(actionBtnSkeletons.length).toBeGreaterThanOrEqual(2);
  });

  it('renders cards with the canonical bento col-span classes', () => {
    render(<LeadSettingsLoading />);

    const cards = screen.getAllByTestId('card');
    const spans = cards.map((c) => c.className);

    expect(spans.some((s) => s.includes('lg:col-span-8'))).toBe(true);
    expect(spans.some((s) => s.includes('lg:col-span-4'))).toBe(true);
    expect(spans.some((s) => s.includes('lg:col-span-7'))).toBe(true);
    expect(spans.some((s) => s.includes('lg:col-span-5'))).toBe(true);
    expect(spans.some((s) => s.includes('lg:col-span-12'))).toBe(true);
  });
});
