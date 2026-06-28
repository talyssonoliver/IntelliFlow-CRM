// @vitest-environment jsdom
/**
 * Dashboard widgets — accessibility regression tests (PG-058).
 *
 * Deterministic DOM assertions for the WCAG 2.1 AA fixes that clear the
 * `lighthouse-gte-90` gate on /dashboard (axe-core under jsdom cannot check
 * contrast/focus, so we assert the specific aria contracts directly — same
 * approach as the PG-166 home-page a11y suite):
 *  - decorative material-symbols icons are aria-hidden (button-name/link-name)
 *  - the Pipeline "options" icon-only button has an accessible name (button-name)
 *  - the Deals-Won <select> has an accessible name (label)
 *
 * Note: the pipeline stage bars are intentionally decorative (no progressbar
 * role) — the value they depict is already conveyed in the adjacent
 * "<stage> — £X (N Deals)" text, and the repo sonar-guard
 * (jsx-a11y/prefer-tag-over-role) forbids role="progressbar".
 */
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Authenticated so the auth-gated widgets render their content, not skeletons.
vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useRequireAuth: () => ({ isLoading: false }),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    lead: { stats: { useQuery: () => ({ data: { total: 1200 }, isLoading: false, error: null }) } },
    analytics: {
      getOverview: {
        useQuery: () => ({
          data: { totalRevenue: 45200, revenueDelta: 100, leadDelta: 50, openOpportunities: 18 },
          isLoading: false,
        }),
      },
      dealsWonTrend: {
        useQuery: () => ({
          data: [
            { month: 'Jan', value: 4 },
            { month: 'Feb', value: 10 },
          ],
          isLoading: false,
        }),
      },
    },
    opportunity: {
      getPipeline: {
        useQuery: () => ({
          data: {
            stages: [
              {
                stageKey: 'QUALIFICATION',
                displayName: 'Qualification',
                count: 5,
                totalValue: 10000,
              },
              { stageKey: 'PROPOSAL', displayName: 'Proposal', count: 3, totalValue: 20000 },
            ],
            totalPipelineValue: 50000,
          },
          isLoading: false,
        }),
      },
    },
  },
}));

vi.mock('@/lib/api', () => ({
  api: {
    ticket: {
      stats: {
        useQuery: () => ({
          data: { total: 12, slaBreached: 2, bySLAStatus: { AT_RISK: 3, BREACHED: 2 } },
          isLoading: false,
        }),
      },
    },
  },
}));

import { TotalLeadsWidget } from '@/components/dashboard/widgets/TotalLeadsWidget';
import { SalesRevenueWidget } from '@/components/dashboard/widgets/SalesRevenueWidget';
import { ActiveDealsWidget } from '@/components/dashboard/widgets/ActiveDealsWidget';
import { OpenTicketsWidget } from '@/components/dashboard/widgets/OpenTicketsWidget';
import { PipelineSummaryWidget } from '@/components/dashboard/widgets/PipelineSummaryWidget';
import { DealsWonWidget } from '@/components/dashboard/widgets/DealsWonWidget';

function expectAllIconsHidden(container: HTMLElement) {
  const icons = container.querySelectorAll('.material-symbols-outlined');
  expect(icons.length).toBeGreaterThan(0);
  icons.forEach((icon) => expect(icon).toHaveAttribute('aria-hidden', 'true'));
}

describe('dashboard widget accessibility', () => {
  it('TotalLeadsWidget marks decorative icons aria-hidden', () => {
    const { container } = render(<TotalLeadsWidget />);
    expectAllIconsHidden(container);
  });

  it('SalesRevenueWidget marks the payments icon aria-hidden', () => {
    const { container } = render(<SalesRevenueWidget />);
    expectAllIconsHidden(container);
  });

  it('ActiveDealsWidget marks the handshake icon aria-hidden', () => {
    const { container } = render(<ActiveDealsWidget />);
    expectAllIconsHidden(container);
  });

  it('OpenTicketsWidget marks the ticket icon aria-hidden', () => {
    const { container } = render(<OpenTicketsWidget />);
    expectAllIconsHidden(container);
  });

  it('PipelineSummaryWidget icon-button has an accessible name', () => {
    const { container } = render(<PipelineSummaryWidget />);
    expectAllIconsHidden(container);
    // Icon-only button must have an accessible name (Lighthouse button-name).
    expect(screen.getByRole('button', { name: 'Pipeline options' })).toBeInTheDocument();
  });

  it('DealsWonWidget <select> has an accessible name (Lighthouse label)', () => {
    render(<DealsWonWidget />);
    expect(
      screen.getByRole('combobox', { name: 'Select deals-won time range' })
    ).toBeInTheDocument();
  });
});
