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
  const trial = (daysLeft: number, status: 'TRIALING' | 'TRIAL_ENDED' = 'TRIALING') => ({
    data: {
      source: 'trial',
      tier: 'STARTER',
      status,
      daysLeft,
      trialEndsAt: new Date().toISOString(),
      currentPeriodEnd: null,
    },
    isLoading: false,
  });

  it('leads to choosing a plan while the trial runs', () => {
    mockGetPlanState.mockReturnValue(trial(5));
    render(<TrialBadge />);
    const badge = screen.getByRole('link', { name: /5 days remaining\. choose a plan/i });
    expect(badge.getAttribute('href')).toBe('/billing/plans');
    expect(badge).toHaveTextContent('Trial: 5d left');
  });

  it('says the trial has ended, never "0d left", and leads to choosing a plan (#1220)', () => {
    mockGetPlanState.mockReturnValue(trial(0, 'TRIAL_ENDED'));
    render(<TrialBadge />);
    const badge = screen.getByRole('link', { name: /your trial has ended\. choose a plan/i });
    expect(badge.getAttribute('href')).toBe('/billing/plans');
    expect(badge).toHaveTextContent('Trial ended: choose a plan');
    expect(badge).not.toHaveTextContent('0d left');
    expect(badge.getAttribute('data-trial-status')).toBe('ended');
    expect(badge.className).toContain('red');
  });

  it('says "1 day", not "1 days"', () => {
    mockGetPlanState.mockReturnValue(trial(1));
    render(<TrialBadge />);
    expect(screen.getByRole('link', { name: /1 day remaining/i })).toBeInTheDocument();
  });

  it('fetches on pages outside the protected list, such as the Help Center', () => {
    mockUsePathname.mockReturnValue('/help-center');
    render(<TrialBadge />);
    expect(mockGetPlanState).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: true })
    );
  });

  it('does not fetch on sign-in pages', () => {
    mockUsePathname.mockReturnValue('/login');
    render(<TrialBadge />);
    expect(mockGetPlanState).toHaveBeenLastCalledWith(
      undefined,
      expect.objectContaining({ enabled: false })
    );
  });

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

  it('does NOT render for a partner-granted PARTNER_FREE plan (not a trial)', () => {
    mockGetPlanState.mockReturnValue({
      data: {
        source: 'partner',
        tier: 'PARTNER_FREE',
        status: 'ACTIVE',
        daysLeft: null,
        trialEndsAt: null,
        currentPeriodEnd: null,
      },
      isLoading: false,
    });
    render(<TrialBadge />);
    expect(screen.queryByTestId('trial-badge')).toBeNull();
    expect(screen.queryByText(/trial/i)).toBeNull();
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
