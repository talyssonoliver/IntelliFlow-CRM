/**
 * TrialBadge — unit tests (Vitest + RTL)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ============================================================
// Hoisted mock factories
// ============================================================

const mockGetPlanState = vi.hoisted(() => vi.fn());
const mockUseAuth = vi.hoisted(() => vi.fn());
const mockUsePathname = vi.hoisted(() => vi.fn());

// ============================================================
// vi.mock declarations
// ============================================================

vi.mock('@/lib/trpc', () => ({
  trpc: {
    billing: {
      getPlanState: {
        useQuery: mockGetPlanState,
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// ============================================================
// Component under test
// ============================================================

import { TrialBadge } from '../TrialBadge';

// ============================================================
// Tests
// ============================================================

beforeEach(() => {
  mockUsePathname.mockReturnValue('/dashboard');
  mockUseAuth.mockReturnValue({ isAuthenticated: true, isLoading: false });
  mockGetPlanState.mockReturnValue({ data: undefined, isLoading: true });
});

describe('TrialBadge', () => {
  it('renders trial badge when source=trial and daysLeft is a number', () => {
    mockGetPlanState.mockReturnValue({
      data: {
        source: 'trial',
        tier: 'PROFESSIONAL',
        status: 'TRIALING',
        daysLeft: 10,
        trialEndsAt: new Date().toISOString(),
        currentPeriodEnd: null,
      },
      isLoading: false,
    });
    render(<TrialBadge />);
    expect(screen.getByTestId('trial-badge')).toBeDefined();
    expect(screen.getByText(/trial: 10d left/i)).toBeDefined();
  });

  it('does NOT render when source=stripe', () => {
    mockGetPlanState.mockReturnValue({
      data: {
        source: 'stripe',
        tier: 'PROFESSIONAL',
        status: 'ACTIVE',
        daysLeft: null,
        trialEndsAt: null,
        currentPeriodEnd: new Date().toISOString(),
      },
      isLoading: false,
    });
    render(<TrialBadge />);
    expect(screen.queryByTestId('trial-badge')).toBeNull();
  });

  it('does NOT render when data is undefined (loading)', () => {
    mockGetPlanState.mockReturnValue({ data: undefined, isLoading: true });
    render(<TrialBadge />);
    expect(screen.queryByTestId('trial-badge')).toBeNull();
  });

  it('shows urgent styling when daysLeft <= 3', () => {
    mockGetPlanState.mockReturnValue({
      data: {
        source: 'trial',
        tier: 'PROFESSIONAL',
        status: 'TRIALING',
        daysLeft: 2,
        trialEndsAt: new Date().toISOString(),
        currentPeriodEnd: null,
      },
      isLoading: false,
    });
    render(<TrialBadge />);
    const badge = screen.getByTestId('trial-badge');
    // Urgent styling uses red classes
    expect(badge.className).toContain('red');
  });
});
