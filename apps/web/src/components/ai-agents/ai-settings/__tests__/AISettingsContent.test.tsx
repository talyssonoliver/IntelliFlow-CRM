/**
 * AI Settings Content Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Tests for the AI settings page components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@intelliflow/ui';

// Mock data following ChainVersionSummary schema
const mockVersions = [
  {
    id: 'v1-uuid',
    chainType: 'SCORING' as const,
    status: 'ACTIVE' as const,
    model: 'gpt-4',
    description: 'Lead scoring chain',
    rolloutStrategy: 'IMMEDIATE' as const,
    rolloutPercent: null,
    createdAt: new Date('2025-01-01'),
    createdBy: 'admin@test.com',
  },
  {
    id: 'v2-uuid',
    chainType: 'QUALIFICATION' as const,
    status: 'DRAFT' as const,
    model: 'gpt-3.5-turbo',
    description: 'Qualification chain',
    rolloutStrategy: 'PERCENTAGE' as const,
    rolloutPercent: 50,
    createdAt: new Date('2025-01-03'),
    createdBy: 'developer@test.com',
  },
];

const mockActiveVersions = {
  SCORING: mockVersions[0],
  QUALIFICATION: null,
  EMAIL_WRITER: null,
  FOLLOWUP: null,
};

const mockAuditLog = [
  {
    id: 'audit-1',
    versionId: 'v1-uuid',
    action: 'ACTIVATED' as const,
    previousState: { status: 'DRAFT' },
    newState: { status: 'ACTIVE' },
    performedBy: 'admin@test.com',
    performedAt: new Date('2025-01-02'),
    reason: 'Initial activation',
  },
];

// Mock the hooks
const mockActivateVersion = vi.fn();
const mockDeprecateVersion = vi.fn();
const mockArchiveVersion = vi.fn();
const mockRollbackVersion = vi.fn();
const mockRefetch = vi.fn();

vi.mock('../hooks', () => ({
  useChainVersions: () => ({
    versions: mockVersions,
    activeVersions: mockActiveVersions,
    stats: {
      totalVersions: 2,
      activeVersions: 1,
      draftVersions: 1,
      deprecatedVersions: 0,
      archivedVersions: 0,
      byChainType: { SCORING: 1, QUALIFICATION: 1 },
    },
    isLoading: false,
    isLoadingActive: false,
    isLoadingStats: false,
    error: null,
    activateVersion: mockActivateVersion,
    deprecateVersion: mockDeprecateVersion,
    archiveVersion: mockArchiveVersion,
    rollbackVersion: mockRollbackVersion,
    isActivating: false,
    isDeprecating: false,
    isArchiving: false,
    isRollingBack: false,
    refetch: mockRefetch,
  }),
  useVersionAudit: () => ({
    auditLog: mockAuditLog,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useZepBudget: () => ({
    budget: {
      used: 200,
      remaining: 800,
      total: 1000,
      warningThreshold: 800,
      limitThreshold: 950,
      isWarning: false,
      isLimited: false,
      isPersisted: true,
      lastSyncedAt: '2025-01-01T00:00:00Z',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    percentUsed: 20,
    budgetStatus: 'normal' as const,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: Readonly<{ children: React.ReactNode; href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock useToast
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

// Import after mocks
import AISettingsContent from '../AISettingsContent';

// Wrapper with TooltipProvider
const renderWithProviders = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

describe('AI Settings Content', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Header and Navigation', () => {
    it('renders page title and description', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByText('AI Chain Versions')).toBeInTheDocument();
      expect(
        screen.getByText('Manage AI chain versions, rollout strategies, and memory budget')
      ).toBeInTheDocument();
    });

    it('renders breadcrumb navigation', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('AI Chains')).toBeInTheDocument();
    });

    it('renders refresh button', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByRole('button', { name: /Refresh/i })).toBeInTheDocument();
    });

    it('calls refetch when refresh button is clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AISettingsContent />);

      await user.click(screen.getByRole('button', { name: /Refresh/i }));
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Tabs', () => {
    it('renders all four tabs', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Versions/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Memory/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Audit Log/i })).toBeInTheDocument();
    });

    it('defaults to Overview tab', () => {
      renderWithProviders(<AISettingsContent />);

      const overviewTab = screen.getByRole('tab', { name: /Overview/i });
      expect(overviewTab).toHaveAttribute('data-state', 'active');
    });

    it('switches to Versions tab when clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AISettingsContent />);

      await user.click(screen.getByRole('tab', { name: /Versions/i }));

      const versionsTab = screen.getByRole('tab', { name: /Versions/i });
      expect(versionsTab).toHaveAttribute('data-state', 'active');
    });
  });

  describe('Overview Tab', () => {
    it('renders Active Versions section', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByText('Active Versions')).toBeInTheDocument();
    });

    it('renders quick stats cards', () => {
      renderWithProviders(<AISettingsContent />);

      expect(screen.getByText('Total Versions')).toBeInTheDocument();
      expect(screen.getByText('Drafts')).toBeInTheDocument();
      // "Active" appears in multiple places (stats card + status badges)
      expect(screen.getAllByText('Active').length).toBeGreaterThan(0);
    });

    it('displays version counts', () => {
      renderWithProviders(<AISettingsContent />);

      // Should have stat cards with numbers
      expect(screen.getByText('Total Versions')).toBeInTheDocument();
      // Numbers may appear multiple times, just check they exist
      expect(screen.getAllByText('2').length).toBeGreaterThan(0);
    });
  });

  describe('Memory Tab', () => {
    it('renders Memory Management section when Memory tab is selected', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AISettingsContent />);

      await user.click(screen.getByRole('tab', { name: /Memory/i }));

      expect(screen.getByText('Memory Management')).toBeInTheDocument();
    });

    it('renders threshold information', async () => {
      const user = userEvent.setup();
      renderWithProviders(<AISettingsContent />);

      await user.click(screen.getByRole('tab', { name: /Memory/i }));

      expect(screen.getByText(/Normal operation/i)).toBeInTheDocument();
    });
  });
});

describe('ZepBudgetGauge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the gauge component', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AISettingsContent />);

    await user.click(screen.getByRole('tab', { name: /Memory/i }));

    // Check for Memory Management section (ZepBudgetGauge is within this tab)
    expect(screen.getByText('Memory Management')).toBeInTheDocument();
    // The gauge shows percentage and storage type - may appear multiple times
    expect(screen.getAllByText(/Persisted Storage|Free Tier/i).length).toBeGreaterThan(0);
  });
});

describe('ChainVersionsDashboard', () => {
  it('renders chain type cards in overview', () => {
    renderWithProviders(<AISettingsContent />);

    // The dashboard should show cards for Lead Scoring (human-readable label)
    expect(screen.getByText('Lead Scoring')).toBeInTheDocument();
  });
});

describe('Dialogs', () => {
  it('opens activate dialog when activate action is triggered', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AISettingsContent />);

    // Switch to versions tab
    await user.click(screen.getByRole('tab', { name: /Versions/i }));

    // Find and click an activate button (for draft version)
    const activateButtons = screen.getAllByRole('button', { name: /Activate/i });
    if (activateButtons.length > 0) {
      await user.click(activateButtons[0]);

      await waitFor(() => {
        // Dialog title is "Activate Version?"
        expect(screen.getByText(/Activate Version\?/)).toBeInTheDocument();
      });
    }
  });
});
