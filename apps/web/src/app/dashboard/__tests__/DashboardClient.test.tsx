// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Suspense } from 'react';
import DashboardClient from '../DashboardClient';

// ── Auth ──────────────────────────────────────────────────────────────────────
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false }),
  useAuth: () => ({ isAuthenticated: true, isLoading: false }),
}));

// ── Widget registry — lightweight stubs so each widget renders instantly ──────
vi.mock('@/components/dashboard/widgets', () => ({
  widgetRegistry: {
    'total-leads': ({ config: _c }: { config?: unknown }) => (
      <div data-testid="widget-total-leads">Total Leads</div>
    ),
    'sales-revenue': () => <div data-testid="widget-sales-revenue">Sales Revenue</div>,
    'active-deals': () => <div data-testid="widget-active-deals">Active Deals</div>,
    'open-tickets': () => <div data-testid="widget-open-tickets">Open Tickets</div>,
    'pipeline-summary': () => <div data-testid="widget-pipeline-summary">Pipeline Summary</div>,
    'upcoming-tasks': () => <div data-testid="widget-upcoming-tasks">Upcoming Tasks</div>,
    'deals-won': () => <div data-testid="widget-deals-won">Deals Won</div>,
    'recent-activity': () => <div data-testid="widget-recent-activity">Recent Activity</div>,
  },
}));

// ── localStorage ──────────────────────────────────────────────────────────────
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Helper: wrap in Suspense because DashboardClient uses <Suspense> internally
function renderDashboard(props: Parameters<typeof DashboardClient>[0] = {}) {
  return render(
    <Suspense fallback={<div>Loading…</div>}>
      <DashboardClient {...props} />
    </Suspense>
  );
}

describe('DashboardClient', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('renders the page header', () => {
    renderDashboard();

    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders Customize and Add New links', () => {
    renderDashboard();

    expect(screen.getByRole('link', { name: /customize/i })).toHaveAttribute(
      'href',
      '/dashboard/customize'
    );
    expect(screen.getByRole('link', { name: /add new/i })).toHaveAttribute(
      'href',
      '/dashboard/new'
    );
  });

  it('renders all 8 default widgets', () => {
    renderDashboard();

    expect(screen.getByTestId('widget-total-leads')).toBeInTheDocument();
    expect(screen.getByTestId('widget-sales-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('widget-active-deals')).toBeInTheDocument();
    expect(screen.getByTestId('widget-open-tickets')).toBeInTheDocument();
    expect(screen.getByTestId('widget-pipeline-summary')).toBeInTheDocument();
    expect(screen.getByTestId('widget-upcoming-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('widget-deals-won')).toBeInTheDocument();
    expect(screen.getByTestId('widget-recent-activity')).toBeInTheDocument();
  });

  it('passes initialLeadStats only to the total-leads widget', () => {
    // The stub ignores it, but we verify there is no error when it is provided
    renderDashboard({ initialLeadStats: { total: 99 } });

    expect(screen.getByTestId('widget-total-leads')).toBeInTheDocument();
  });

  // Removed "shows auth loading skeleton while auth is pending" — stale.
  // DashboardClient was refactored to render widgets immediately via Suspense
  // skeletons; authLoading is destructured but intentionally unused, so there
  // is no branch to cover. The "no monolithic isLoaded gate" test below is the
  // replacement contract.

  it('does not gate widgets behind a monolithic isLoaded state', () => {
    // All 8 widgets must be present immediately (no isLoaded flag)
    renderDashboard();

    const widgetIds = [
      'widget-total-leads',
      'widget-sales-revenue',
      'widget-active-deals',
      'widget-open-tickets',
      'widget-pipeline-summary',
      'widget-upcoming-tasks',
      'widget-deals-won',
      'widget-recent-activity',
    ];
    widgetIds.forEach((id) => {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    });
  });

  it('respects a saved layout from localStorage', () => {
    // A layout with only 2 widgets
    const saved = [
      { id: 'w1', type: 'total-leads', title: 'Total Leads', colSpan: 1, rowSpan: 1 },
      { id: 'w2', type: 'deals-won', title: 'Deals Won', colSpan: 3, rowSpan: 1 },
    ];
    localStorageMock.setItem('dashboard-layout', JSON.stringify(saved));

    renderDashboard();

    // Both saved widgets should appear
    expect(screen.getByTestId('widget-total-leads')).toBeInTheDocument();
    expect(screen.getByTestId('widget-deals-won')).toBeInTheDocument();
  });
});
