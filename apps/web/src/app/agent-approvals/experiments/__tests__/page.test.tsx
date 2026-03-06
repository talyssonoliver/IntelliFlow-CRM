/**
 * ExperimentsPage tests (PG-149 coverage)
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ExperimentsPage from '../page';

// Mock auth context
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(),
}));

// Mock the ExperimentsDashboard component
vi.mock('@/components/ai-intelligence/ExperimentsDashboard', () => ({
  ExperimentsDashboard: () => <div data-testid="experiments-dashboard">Dashboard loaded</div>,
}));

// Mock Skeleton from ui package
vi.mock('@intelliflow/ui', () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

import { useRequireAuth } from '@/lib/auth/AuthContext';
const mockUseRequireAuth = vi.mocked(useRequireAuth);

describe('ExperimentsPage', () => {
  it('renders loading skeleton when auth is loading', () => {
    mockUseRequireAuth.mockReturnValue({ isLoading: true } as any);

    render(<ExperimentsPage />);
    const skeletons = screen.getAllByTestId('skeleton');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('renders ExperimentsDashboard when authenticated', () => {
    mockUseRequireAuth.mockReturnValue({ isLoading: false } as any);

    render(<ExperimentsPage />);
    expect(screen.getByTestId('experiments-dashboard')).toBeInTheDocument();
    expect(screen.getByText('Dashboard loaded')).toBeInTheDocument();
  });
});
