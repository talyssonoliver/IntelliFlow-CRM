// @vitest-environment jsdom
/**
 * ContactDetail Component Tests (PG-133)
 *
 * Tests the ContactDetail component for:
 * - Profile card rendering
 * - Tab navigation (overview, activity, deals, tickets, documents, notes, ai-insights)
 * - Action buttons (edit, email, call)
 * - AI insights display
 * - Contact metrics
 * - Account relationship
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactDetail } from '../ContactDetail';
import { createMockContactDetail, createMockHandlers, resetAllMocks } from './contact-test-utils';

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

// Mock UI components
vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Tabs: ({ children, value, onValueChange }: {
    children: React.ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <div data-testid="tabs" data-value={value} onClick={() => onValueChange('test')}>
      {children}
    </div>
  ),
  TabsList: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} role="tablist">{children}</div>
  ),
  TabsTrigger: ({ children, value, className }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => (
    <button role="tab" data-value={value} className={className}>{children}</button>
  ),
  TabsContent: ({ children, value, className }: {
    children: React.ReactNode;
    value: string;
    className?: string;
  }) => (
    <div role="tabpanel" data-value={value} className={className}>{children}</div>
  ),
  ChurnRiskCard: ({ data, title }: { data: unknown; title: string }) => (
    <div data-testid="churn-risk-card">{title}</div>
  ),
  NextBestActionCard: ({ data, title }: { data: unknown; title: string }) => (
    <div data-testid="nba-card">{title}</div>
  ),
}));

describe('ContactDetail', () => {
  let handlers: ReturnType<typeof createMockHandlers>;
  let contact: ReturnType<typeof createMockContactDetail>;

  beforeEach(() => {
    handlers = createMockHandlers();
    resetAllMocks(handlers);
    contact = createMockContactDetail();
  });

  describe('Header and Breadcrumbs', () => {
    it('renders breadcrumb navigation', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      const backLink = screen.getByText('Contacts').closest('a');
      expect(backLink).toHaveAttribute('href', '/contacts');
      expect(screen.getByText('Sarah Connor')).toBeInTheDocument();
    });

    it('renders contact name in header', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      // Name appears in breadcrumb, h1, and profile card
      const nameElements = screen.getAllByText('Sarah Connor');
      expect(nameElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders action buttons', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByLabelText('Edit profile')).toBeInTheDocument();
      expect(screen.getByLabelText(/Send email to Sarah Connor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Call Sarah Connor/i)).toBeInTheDocument();
    });
  });

  describe('Profile Card', () => {
    it('renders contact avatar initials', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('SC')).toBeInTheDocument();
    });

    it('renders contact title', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('Chief Technology Officer')).toBeInTheDocument();
    });

    it('renders account link when account is present', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      const accountLink = screen.getByText('TechCorp Industries').closest('a');
      expect(accountLink).toHaveAttribute('href', '/accounts/account-1');
    });

    it('renders status badge', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('renders email address with mailto link', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      const emailLink = screen.getByText('sarah.connor@example.com').closest('a');
      expect(emailLink).toHaveAttribute('href', 'mailto:sarah.connor@example.com');
    });

    it('renders phone with tel link', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      const phoneLink = screen.getByText('+1 (555) 987-6543').closest('a');
      expect(phoneLink).toHaveAttribute('href', 'tel:+1 (555) 987-6543');
    });

    it('renders contact metrics (total value and deals)', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('$450k')).toBeInTheDocument();
      expect(screen.getByText('Total Value')).toBeInTheDocument();
      expect(screen.getByText('8')).toBeInTheDocument();
      expect(screen.getByText('Deals')).toBeInTheDocument();
    });
  });

  describe('Contact Owner Card', () => {
    it('renders contact owner section', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('Contact Owner')).toBeInTheDocument();
      expect(screen.getByText('Account Manager')).toBeInTheDocument();
      expect(screen.getByText('Senior Sales')).toBeInTheDocument();
    });

    it('renders owner initial', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('A')).toBeInTheDocument(); // "Account Manager"[0]
    });
  });

  describe('Tab Navigation', () => {
    it('renders all tab options', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('Overview')).toBeInTheDocument();
      expect(screen.getByText('Activity')).toBeInTheDocument();
      expect(screen.getByText('Deals')).toBeInTheDocument();
      expect(screen.getByText('Tickets')).toBeInTheDocument();
      expect(screen.getByText('Documents')).toBeInTheDocument();
      expect(screen.getByText('Notes')).toBeInTheDocument();
      expect(screen.getByText('AI Insights')).toBeInTheDocument();
    });

    it('shows tab counts when provided', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
          tabCounts={{ deals: 5, tickets: 3 }}
        />
      );

      // Tab counts appear as badges next to tab labels
      const tabs = screen.getAllByRole('tab');
      const dealsTab = tabs.find(tab => tab.textContent?.includes('Deals'));
      const ticketsTab = tabs.find(tab => tab.textContent?.includes('Tickets'));

      expect(dealsTab?.textContent).toContain('5');
      expect(ticketsTab?.textContent).toContain('3');
    });

    it('hides zero counts', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
          tabCounts={{ deals: 0, tickets: 3 }}
        />
      );

      const tabs = screen.getAllByRole('tab');
      const dealsTab = tabs.find(tab => tab.textContent?.includes('Deals'));

      // Should not show "0" badge
      expect(dealsTab?.textContent).not.toMatch(/\b0\b/);
    });
  });

  describe('AI Insights Tab', () => {
    it('renders AI insights tab content', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="ai-insights"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByTestId('churn-risk-card')).toBeInTheDocument();
      expect(screen.getByTestId('nba-card')).toBeInTheDocument();
    });

    it('renders AI metrics (conversion, LTV, engagement)', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="ai-insights"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByText('75%')).toBeInTheDocument();
      expect(screen.getByText('Conversion Probability')).toBeInTheDocument();

      expect(screen.getByText('$250k')).toBeInTheDocument();
      expect(screen.getByText('Est. Lifetime Value')).toBeInTheDocument();

      expect(screen.getByText('82%')).toBeInTheDocument();
      expect(screen.getByText('Engagement Score')).toBeInTheDocument();
    });

    it('does not render AI insights when aiInsight is null', () => {
      const contactWithoutAI = { ...contact, aiInsight: null };
      render(
        <ContactDetail
          contact={contactWithoutAI}
          activeTab="ai-insights"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.queryByText('Conversion Probability')).not.toBeInTheDocument();
    });
  });

  describe('Action Handlers', () => {
    it('calls onEdit when edit button clicked', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      fireEvent.click(screen.getByLabelText('Edit profile'));
      expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    });

    it('calls onEmail when email button clicked', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      fireEvent.click(screen.getByLabelText(/Send email to Sarah Connor/i));
      expect(handlers.onEmail).toHaveBeenCalledTimes(1);
    });

    it('calls onCall when call button clicked', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      fireEvent.click(screen.getByLabelText(/Call Sarah Connor/i));
      expect(handlers.onCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('Children Pass-through', () => {
    it('renders children in tab content area', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        >
          <div data-testid="custom-content">Custom Tab Content</div>
        </ContactDetail>
      );

      expect(screen.getByTestId('custom-content')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('has proper tab list aria-label', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByRole('tablist')).toHaveAttribute('aria-label', 'Contact information sections');
    });

    it('has accessible button labels', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
        />
      );

      expect(screen.getByLabelText('Edit profile')).toBeInTheDocument();
      expect(screen.getByLabelText(/Send email to Sarah Connor/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/Call Sarah Connor/i)).toBeInTheDocument();
    });

    it('provides screen reader only text for tab counts', () => {
      render(
        <ContactDetail
          contact={contact}
          activeTab="overview"
          onTabChange={handlers.onTabChange}
          onEdit={handlers.onEdit}
          onEmail={handlers.onEmail}
          onCall={handlers.onCall}
          tabCounts={{ deals: 5 }}
        />
      );

      const srOnly = document.querySelector('.sr-only');
      expect(srOnly?.textContent).toContain('5 items');
    });
  });
});
