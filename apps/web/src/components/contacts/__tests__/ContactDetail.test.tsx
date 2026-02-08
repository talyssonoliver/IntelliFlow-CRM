import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContactDetail, type ContactDetailContact, type TabId } from '../ContactDetail';

// ─── Mock @intelliflow/ui ───────────────────────────────────────────────────────

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="tabs" data-value={value}>
      {typeof children === 'function' ? children({ value, onValueChange }) : children}
    </div>
  ),
  TabsList: ({ children, className, ...rest }: any) => (
    <div role="tablist" className={className} {...rest}>{children}</div>
  ),
  TabsTrigger: ({ children, value, className }: any) => (
    <button role="tab" data-value={value} className={className} aria-selected={false}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value, tabIndex, className }: any) => (
    <div role="tabpanel" data-value={value} tabIndex={tabIndex} className={className}>{children}</div>
  ),
  ChurnRiskCard: ({ data, title }: any) => (
    <div data-testid="churn-risk-card">{title} — Score: {data.score}</div>
  ),
  NextBestActionCard: ({ data, title }: any) => (
    <div data-testid="nba-card">{title} — {data.title}</div>
  ),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

// ─── Helpers ────────────────────────────────────────────────────────────────────

function createDetailContact(overrides: Partial<ContactDetailContact> = {}): ContactDetailContact {
  return {
    id: 'c-1',
    firstName: 'Sarah',
    lastName: 'Connor',
    email: 'sarah@skynet.com',
    phone: '+15550001234',
    title: 'VP of Engineering',
    department: 'Engineering',
    status: 'ACTIVE',
    createdAt: '2026-01-15T10:00:00.000Z',
    lastContactedAt: '2026-02-01T12:00:00.000Z',
    owner: { name: 'Jane Smith', title: 'Account Manager' },
    account: { id: 'acct-1', name: 'Cyberdyne Systems', industry: 'Technology' },
    metrics: { totalDeals: 5, totalValue: 150000, openTasks: 3, emailsSent: 42 },
    aiInsight: {
      conversionProbability: 75,
      lifetimeValue: 15000000,
      churnRisk: 'LOW',
      nextBestAction: 'Schedule a demo meeting',
      sentiment: 'POSITIVE',
      engagementScore: 85,
      recommendations: ['Send follow-up email', 'Schedule product demo'],
      sentimentTrend: 'IMPROVING',
      lastEngagementDays: 3,
    },
    ...overrides,
  };
}

const defaultProps = {
  contact: createDetailContact(),
  activeTab: 'overview' as TabId,
  onTabChange: vi.fn(),
  onEdit: vi.fn(),
  onEmail: vi.fn(),
  onCall: vi.fn(),
};

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('ContactDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Tab Navigation ────────────────────────────────────────────────────────────

  describe('Tab Navigation (Radix UI Tabs)', () => {
    it('renders all 7 tab triggers', () => {
      render(<ContactDetail {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      const tabs = within(tablist).getAllByRole('tab');
      expect(tabs).toHaveLength(7);
    });

    it('renders tab labels correctly', () => {
      render(<ContactDetail {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      expect(within(tablist).getByText('Overview')).toBeInTheDocument();
      expect(within(tablist).getByText('Activity')).toBeInTheDocument();
      expect(within(tablist).getByText('Deals')).toBeInTheDocument();
      expect(within(tablist).getByText('Tickets')).toBeInTheDocument();
      expect(within(tablist).getByText('Documents')).toBeInTheDocument();
      expect(within(tablist).getByText('Notes')).toBeInTheDocument();
      expect(within(tablist).getByText('AI Insights')).toBeInTheDocument();
    });

    it('tab triggers have role="tab"', () => {
      render(<ContactDetail {...defaultProps} />);

      const tabs = screen.getAllByRole('tab');
      expect(tabs.length).toBeGreaterThanOrEqual(7);
    });

    it('tab panels have role="tabpanel"', () => {
      render(<ContactDetail {...defaultProps} />);

      const panels = screen.getAllByRole('tabpanel');
      expect(panels.length).toBeGreaterThanOrEqual(1);
    });

    it('tab counts displayed with sr-only text', () => {
      render(<ContactDetail {...defaultProps} tabCounts={{ activity: 5, deals: 3 }} />);

      // sr-only count text
      expect(screen.getByText(', 5 items')).toBeInTheDocument();
      expect(screen.getByText(', 3 items')).toBeInTheDocument();
    });

    it('has tablist with aria-label', () => {
      render(<ContactDetail {...defaultProps} />);

      const tablist = screen.getByRole('tablist');
      expect(tablist).toHaveAttribute('aria-label', 'Contact information sections');
    });
  });

  // ── Data Display ──────────────────────────────────────────────────────────────

  describe('Data Display', () => {
    it('renders contact profile card (name, title, email, phone)', () => {
      render(<ContactDetail {...defaultProps} />);

      // Name appears multiple places (breadcrumb, heading, profile) — check at least 1
      expect(screen.getAllByText('Sarah Connor').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('VP of Engineering')).toBeInTheDocument();
      expect(screen.getByText('sarah@skynet.com')).toBeInTheDocument();
      expect(screen.getByText('+15550001234')).toBeInTheDocument();
    });

    it('shows contact owner info', () => {
      render(<ContactDetail {...defaultProps} />);

      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Account Manager')).toBeInTheDocument();
    });

    it('displays metrics summary (deals, value)', () => {
      render(<ContactDetail {...defaultProps} />);

      // Metrics appear in sidebar card — "Deals" label also in tabs, use getAllByText
      expect(screen.getAllByText('5').length).toBeGreaterThanOrEqual(1); // totalDeals
      expect(screen.getAllByText('$150k').length).toBeGreaterThanOrEqual(1); // totalValue formatted
    });

    it('renders linked account with navigation link', () => {
      render(<ContactDetail {...defaultProps} />);

      const link = screen.getByText('Cyberdyne Systems');
      expect(link.closest('a')).toHaveAttribute('href', '/accounts/acct-1');
    });

    it('shows AI Insights tab with ChurnRiskCard and NextBestActionCard', () => {
      render(<ContactDetail {...defaultProps} activeTab="ai-insights" />);

      expect(screen.getByTestId('churn-risk-card')).toBeInTheDocument();
      expect(screen.getByTestId('nba-card')).toBeInTheDocument();
    });
  });

  // ── Empty States ──────────────────────────────────────────────────────────────

  describe('Empty States', () => {
    it('renders without account when account is null', () => {
      const contact = createDetailContact({ account: null });
      render(<ContactDetail {...defaultProps} contact={contact} />);

      expect(screen.queryByText('Cyberdyne Systems')).not.toBeInTheDocument();
    });

    it('renders without AI insights when aiInsight is null', () => {
      const contact = createDetailContact({ aiInsight: null });
      render(<ContactDetail {...defaultProps} contact={contact} activeTab="ai-insights" />);

      expect(screen.queryByTestId('churn-risk-card')).not.toBeInTheDocument();
      expect(screen.queryByTestId('nba-card')).not.toBeInTheDocument();
    });
  });

  // ── Actions ───────────────────────────────────────────────────────────────────

  describe('Actions', () => {
    it('calls onEdit when edit button clicked', async () => {
      const user = userEvent.setup();
      const onEdit = vi.fn();
      render(<ContactDetail {...defaultProps} onEdit={onEdit} />);

      await user.click(screen.getByLabelText('Edit profile'));
      expect(onEdit).toHaveBeenCalled();
    });

    it('calls onEmail when email action clicked', async () => {
      const user = userEvent.setup();
      const onEmail = vi.fn();
      render(<ContactDetail {...defaultProps} onEmail={onEmail} />);

      await user.click(screen.getByLabelText('Send email to Sarah Connor'));
      expect(onEmail).toHaveBeenCalled();
    });

    it('calls onCall when call action clicked', async () => {
      const user = userEvent.setup();
      const onCall = vi.fn();
      render(<ContactDetail {...defaultProps} onCall={onCall} />);

      await user.click(screen.getByLabelText('Call Sarah Connor'));
      expect(onCall).toHaveBeenCalled();
    });
  });

  // ── Status Badge ──────────────────────────────────────────────────────────────

  describe('Status Badge', () => {
    it('displays Active status badge', () => {
      render(<ContactDetail {...defaultProps} />);

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('displays Inactive status badge', () => {
      const contact = createDetailContact({ status: 'INACTIVE' });
      render(<ContactDetail {...defaultProps} contact={contact} />);

      expect(screen.getByText('Inactive')).toBeInTheDocument();
    });

    it('displays Archived status badge', () => {
      const contact = createDetailContact({ status: 'ARCHIVED' });
      render(<ContactDetail {...defaultProps} contact={contact} />);

      expect(screen.getByText('Archived')).toBeInTheDocument();
    });
  });
});
