/**
 * AI Settings Components Tests
 *
 * PG-128: AI Chain Versioning Admin UI
 *
 * Unit tests for individual components.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TooltipProvider } from '@intelliflow/ui';
import type { ChainVersionSummary } from '@intelliflow/validators';

// Mock useToast
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

// Mock the Zep budget hook
vi.mock('../hooks', () => ({
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

import { ZepBudgetGauge } from '../components/ZepBudgetGauge';
import { ChainVersionCard } from '../components/ChainVersionCard';
import { ChainVersionsDashboard } from '../components/ChainVersionsDashboard';
import { ChainVersionsTable } from '../components/ChainVersionsTable';
import { RollbackConfirmDialog } from '../components/RollbackConfirmDialog';
import { VersionAuditLog } from '../components/VersionAuditLog';

// Helper to wrap components needing TooltipProvider
const renderWithTooltip = (ui: React.ReactElement) => {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
};

// Mock data following ChainVersionSummary schema
const mockVersionSummary: ChainVersionSummary = {
  id: 'v1-uuid-1234-5678-9abc',
  chainType: 'SCORING',
  status: 'ACTIVE',
  model: 'gpt-4',
  description: 'Lead scoring chain',
  rolloutStrategy: 'IMMEDIATE',
  rolloutPercent: null,
  createdAt: new Date('2025-01-01'),
  createdBy: 'admin@test.com',
};

const mockDraftVersion: ChainVersionSummary = {
  id: 'v2-uuid-1234-5678-9abc',
  chainType: 'QUALIFICATION',
  status: 'DRAFT',
  model: 'gpt-3.5-turbo',
  description: 'Qualification chain',
  rolloutStrategy: 'PERCENTAGE',
  rolloutPercent: 50,
  createdAt: new Date('2025-01-03'),
  createdBy: 'developer@test.com',
};

describe('ZepBudgetGauge', () => {
  it('renders the gauge title', () => {
    renderWithTooltip(<ZepBudgetGauge />);

    expect(screen.getByText('Zep Memory Budget')).toBeInTheDocument();
  });

  it('shows percentage used', () => {
    renderWithTooltip(<ZepBudgetGauge />);

    expect(screen.getByText('20%')).toBeInTheDocument();
  });

  it('displays episode counts', () => {
    renderWithTooltip(<ZepBudgetGauge />);

    expect(screen.getByText(/200.*\/.*1,000.*episodes/)).toBeInTheDocument();
  });

  it('shows persisted storage indicator when persisted', () => {
    renderWithTooltip(<ZepBudgetGauge />);

    expect(screen.getByText('Persisted Storage')).toBeInTheDocument();
  });
});

describe('ChainVersionCard', () => {
  const defaultProps = {
    id: mockVersionSummary.id,
    chainType: mockVersionSummary.chainType,
    status: mockVersionSummary.status,
    model: mockVersionSummary.model,
    description: mockVersionSummary.description,
    createdAt: mockVersionSummary.createdAt,
    createdBy: mockVersionSummary.createdBy,
    onSelect: vi.fn(),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chain type label correctly', () => {
    render(<ChainVersionCard {...defaultProps} />);

    // ChainVersionCard shows human-readable labels
    expect(screen.getByText('Lead Scoring')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<ChainVersionCard {...defaultProps} />);

    expect(screen.getByText(/Active/i)).toBeInTheDocument();
  });

  it('renders model name', () => {
    render(<ChainVersionCard {...defaultProps} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('shows created by information', () => {
    render(<ChainVersionCard {...defaultProps} />);

    expect(screen.getByText(/admin@test.com/i)).toBeInTheDocument();
  });
});

describe('ChainVersionsDashboard', () => {
  const mockActiveVersions: Record<'SCORING' | 'QUALIFICATION' | 'EMAIL_WRITER' | 'FOLLOWUP', ChainVersionSummary | null> = {
    SCORING: mockVersionSummary,
    QUALIFICATION: null,
    EMAIL_WRITER: null,
    FOLLOWUP: null,
  };

  const defaultProps = {
    activeVersions: mockActiveVersions,
    isLoading: false,
    onViewVersion: vi.fn(),
  };

  it('renders all four chain type cards', () => {
    render(<ChainVersionsDashboard {...defaultProps} />);

    expect(screen.getByText('Lead Scoring')).toBeInTheDocument();
    expect(screen.getByText('Lead Qualification')).toBeInTheDocument();
    expect(screen.getByText('Email Writer')).toBeInTheDocument();
    expect(screen.getByText('Follow-up')).toBeInTheDocument();
  });

  it('shows active version model for SCORING chain', () => {
    render(<ChainVersionsDashboard {...defaultProps} />);

    expect(screen.getByText('gpt-4')).toBeInTheDocument();
  });

  it('shows "No active version" for chains without active version', () => {
    render(<ChainVersionsDashboard {...defaultProps} />);

    const noActiveTexts = screen.getAllByText('No active version');
    expect(noActiveTexts.length).toBe(3);
  });
});

describe('ChainVersionsTable', () => {
  const mockVersions: ChainVersionSummary[] = [mockVersionSummary, mockDraftVersion];

  const defaultProps = {
    versions: mockVersions,
    isLoading: false,
    onSelect: vi.fn(),
    onActivate: vi.fn(),
    onDeprecate: vi.fn(),
    onArchive: vi.fn(),
    onRollback: vi.fn(),
    selectedChainType: 'all' as const,
    selectedStatus: 'all' as const,
    onChainTypeChange: vi.fn(),
    onStatusChange: vi.fn(),
    isActioning: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders versions in the table', () => {
    render(<ChainVersionsTable {...defaultProps} />);

    // Table should have content
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('shows Activate button for draft versions', () => {
    render(<ChainVersionsTable {...defaultProps} />);

    const activateButtons = screen.getAllByRole('button', { name: /Activate/i });
    expect(activateButtons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no versions match filter', () => {
    render(<ChainVersionsTable {...defaultProps} versions={[]} />);

    expect(screen.getByText('No versions found')).toBeInTheDocument();
  });
});

describe('RollbackConfirmDialog', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    targetVersion: mockVersionSummary,
    onConfirm: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders dialog when open', () => {
    render(<RollbackConfirmDialog {...defaultProps} />);

    expect(screen.getByText(/Rollback to Version/i)).toBeInTheDocument();
  });

  it('shows target version chain type', () => {
    render(<RollbackConfirmDialog {...defaultProps} />);

    expect(screen.getByText('SCORING')).toBeInTheDocument();
  });

  it('requires reason to be entered', () => {
    render(<RollbackConfirmDialog {...defaultProps} />);

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    expect(confirmButton).toBeDisabled();
  });

  it('enables confirm button when reason is provided', async () => {
    const user = userEvent.setup();
    render(<RollbackConfirmDialog {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/Describe why you're rolling back/i);
    await user.type(textarea, 'Reverting due to performance issues');

    const confirmButton = screen.getByRole('button', { name: /Confirm Rollback/i });
    expect(confirmButton).not.toBeDisabled();
  });

  it('calls onConfirm with reason when submitted', async () => {
    const user = userEvent.setup();
    render(<RollbackConfirmDialog {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(/Describe why you're rolling back/i);
    await user.type(textarea, 'Reverting due to performance issues');

    await user.click(screen.getByRole('button', { name: /Confirm Rollback/i }));

    expect(defaultProps.onConfirm).toHaveBeenCalledWith('Reverting due to performance issues');
  });

  it('shows character count', () => {
    render(<RollbackConfirmDialog {...defaultProps} />);

    // Format is "0/500" without spaces
    expect(screen.getByText(/0\/500/)).toBeInTheDocument();
  });
});

describe('VersionAuditLog', () => {
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
    {
      id: 'audit-2',
      versionId: 'v1-uuid',
      action: 'CREATED' as const,
      previousState: null,
      newState: { status: 'DRAFT' },
      performedBy: 'developer@test.com',
      performedAt: new Date('2025-01-01'),
      reason: null,
    },
  ];

  const defaultProps = {
    auditLog: mockAuditLog,
    isLoading: false,
  };

  it('renders audit log header', () => {
    render(<VersionAuditLog {...defaultProps} />);

    expect(screen.getByText('Audit Log')).toBeInTheDocument();
  });

  it('renders all audit entries', () => {
    render(<VersionAuditLog {...defaultProps} />);

    expect(screen.getByText('admin@test.com')).toBeInTheDocument();
    expect(screen.getByText('developer@test.com')).toBeInTheDocument();
  });

  it('renders action badges', () => {
    render(<VersionAuditLog {...defaultProps} />);

    expect(screen.getByText(/ACTIVATED/)).toBeInTheDocument();
    expect(screen.getByText(/CREATED/)).toBeInTheDocument();
  });

  it('shows reason when provided', () => {
    render(<VersionAuditLog {...defaultProps} />);

    expect(screen.getByText('Initial activation')).toBeInTheDocument();
  });

  it('shows empty state when no audit entries', () => {
    render(<VersionAuditLog {...defaultProps} auditLog={[]} />);

    expect(screen.getByText('No audit entries found')).toBeInTheDocument();
  });

  it('renders filter dropdown', () => {
    render(<VersionAuditLog {...defaultProps} />);

    expect(screen.getByText('All Actions')).toBeInTheDocument();
  });
});
