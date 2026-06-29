/**
 * Integrations Settings Page Tests
 *
 * Task: IFC-234 — Settings Pages Wiring
 * Tests that the integrations page renders real connector health data from
 * trpc.integrations.getAllConnectorsHealth.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Hoist mock functions so they can be referenced inside vi.mock factories
const { mockToast, mockRevalidateModuleAccessInner, mockRevalidateAllDashboardCachesInner } =
  vi.hoisted(() => ({
    mockToast: vi.fn(),
    mockRevalidateModuleAccessInner: vi.fn().mockResolvedValue(undefined),
    mockRevalidateAllDashboardCachesInner: vi.fn().mockResolvedValue(undefined),
  }));

// Mock @intelliflow/ui to capture toast calls
vi.mock('@intelliflow/ui', async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return {
    ...actual,
    toast: mockToast,
  };
});

// Mock auth — integrations page uses useRequireAuth (query gated on isAuthenticated)
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({
    isLoading: false,
    isAuthenticated: true,
    user: { id: 'user-1' },
  }),
}));

// Mock server actions
vi.mock('@/app/settings/actions', () => ({
  revalidateModuleAccess: () => mockRevalidateModuleAccessInner(),
  revalidateAllDashboardCaches: () => mockRevalidateAllDashboardCachesInner(),
}));

type ConnectorStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

interface MockConnector {
  id: string;
  name: string;
  type: string;
  provider: string;
  status: ConnectorStatus;
  latencyMs: number | null;
  lastCheckedAt: Date;
  errorMessage?: string;
}

// Mock tRPC — controlled per test
let mockHealthData:
  | {
      connectors: MockConnector[];
      summary: {
        total: number;
        healthy: number;
        degraded: number;
        unhealthy: number;
        unknown: number;
      };
      checkedAt: Date;
    }
  | undefined = undefined;
let mockIsLoading = false;
let mockIsError = false;
const mockRefetch = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    integrations: {
      getAllConnectorsHealth: {
        useQuery: () => ({
          data: mockHealthData,
          isLoading: mockIsLoading,
          isError: mockIsError,
          refetch: mockRefetch,
        }),
      },
    },
    useUtils: () => ({}),
  },
}));

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/settings/integrations',
}));

// Must be imported AFTER mocks are hoisted by vitest
import IntegrationsPage from '../page';

const NOW = new Date('2026-06-29T00:00:00Z');

function makeConnector(
  overrides: Partial<MockConnector> & { id: string; name: string }
): MockConnector {
  return {
    type: 'messaging',
    provider: overrides.id,
    status: 'unknown',
    latencyMs: null,
    lastCheckedAt: NOW,
    ...overrides,
  };
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    mockHealthData = undefined;
    mockIsLoading = false;
    mockIsError = false;
    mockRefetch.mockReset();
    mockToast.mockClear();
    mockRevalidateModuleAccessInner.mockClear();
    mockRevalidateAllDashboardCachesInner.mockClear();
    // Re-apply resolved value after clear (mockReset wipes the impl)
    mockRevalidateModuleAccessInner.mockResolvedValue(undefined);
    mockRevalidateAllDashboardCachesInner.mockResolvedValue(undefined);
  });

  it('renders a loading skeleton while data is fetching', () => {
    mockIsLoading = true;
    render(<IntegrationsPage />);
    // Loading skeleton renders with aria-busy="true"
    expect(screen.getByTestId('integrations-loading')).toBeInTheDocument();
  });

  it('shows healthy connectors in the Connected section', () => {
    mockHealthData = {
      connectors: [
        makeConnector({ id: 'slack', name: 'Slack', status: 'healthy', latencyMs: 42 }),
        makeConnector({ id: 'gmail', name: 'Gmail', status: 'degraded', latencyMs: 150 }),
      ],
      summary: { total: 2, healthy: 1, degraded: 1, unhealthy: 0, unknown: 0 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    // Both should appear in the Connected section
    expect(screen.getByText('Slack')).toBeInTheDocument();
    expect(screen.getByText('Gmail')).toBeInTheDocument();
    // Connected badge count should be 2
    expect(screen.getAllByText('2').length).toBeGreaterThan(0);
  });

  it('shows unhealthy and unknown connectors in the Available section', () => {
    // unhealthy = health check failed (not connected per testConnection contract)
    // unknown   = not configured at all (no credentials)
    // Both go to Available — only healthy|degraded = Connected
    mockHealthData = {
      connectors: [
        makeConnector({
          id: 'salesforce',
          name: 'Salesforce',
          status: 'unhealthy',
          errorMessage: 'Auth token expired',
        }),
        makeConnector({ id: 'hubspot', name: 'HubSpot', status: 'unknown' }),
      ],
      summary: { total: 2, healthy: 0, degraded: 0, unhealthy: 1, unknown: 1 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    // Both appear somewhere on the page
    expect(screen.getByText('Salesforce')).toBeInTheDocument();
    expect(screen.getByText('HubSpot')).toBeInTheDocument();
    // Salesforce status label = Disconnected (unhealthy)
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    // HubSpot status label = Not configured (unknown)
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows error state with a retry button on query failure', () => {
    mockIsError = true;
    render(<IntegrationsPage />);
    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();
    retryBtn.click();
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('does NOT render hardcoded fake integration names', () => {
    mockHealthData = {
      connectors: [makeConnector({ id: 'slack', name: 'Slack', status: 'healthy', latencyMs: 42 })],
      summary: { total: 1, healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    // Hardcoded fake integrations from the old array
    expect(screen.queryByText('Salesforce')).not.toBeInTheDocument();
    expect(screen.queryByText('HubSpot')).not.toBeInTheDocument();
    expect(screen.queryByText('Mailchimp')).not.toBeInTheDocument();
    expect(screen.queryByText('Zapier')).not.toBeInTheDocument();
    // Google Calendar was in the fake list but not in this response
    expect(screen.queryByText('Google Calendar')).not.toBeInTheDocument();
  });

  it('shows latency badge for connected connectors with latencyMs', () => {
    mockHealthData = {
      connectors: [makeConnector({ id: 'slack', name: 'Slack', status: 'healthy', latencyMs: 42 })],
      summary: { total: 1, healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    expect(screen.getByText(/42\s*ms/i)).toBeInTheDocument();
  });

  it('shows a coming-soon toast when Disconnect is clicked', async () => {
    mockHealthData = {
      connectors: [
        makeConnector({ id: 'slack', name: 'Slack', status: 'healthy', latencyMs: null }),
      ],
      summary: { total: 1, healthy: 1, degraded: 0, unhealthy: 0, unknown: 0 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    const disconnectBtn = screen.getByRole('button', { name: /disconnect/i });
    fireEvent.click(disconnectBtn);
    // toast called (async, but fireEvent triggers sync part)
    // wait for async handler
    await new Promise((r) => setTimeout(r, 10));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Integration management coming soon' })
    );
  });

  it('shows a coming-soon toast when Connect is clicked', async () => {
    mockHealthData = {
      connectors: [makeConnector({ id: 'salesforce', name: 'Salesforce', status: 'unknown' })],
      summary: { total: 1, healthy: 0, degraded: 0, unhealthy: 0, unknown: 1 },
      checkedAt: NOW,
    };
    render(<IntegrationsPage />);
    const connectBtn = screen.getByRole('button', { name: /connect/i });
    fireEvent.click(connectBtn);
    await new Promise((r) => setTimeout(r, 10));
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Integration management coming soon' })
    );
  });
});
