import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SettingsPage from '../page';

// Mock SearchInput from @intelliflow/ui
vi.mock('@intelliflow/ui', () => ({
  SearchInput: vi.fn(({ value, onChange, onClear, onKeyDown, placeholder, ...props }: any) => (
    <input
      data-testid="search-input"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onKeyDown={onKeyDown}
      aria-label={props['aria-label']}
    />
  )),
  Card: vi.fn(({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  )),
  cn: vi.fn((...args: any[]) => args.filter(Boolean).join(' ')),
}));

describe('SettingsPage', () => {
  describe('Rendering', () => {
    it('renders "Settings" heading via PageHeader', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('heading', { level: 1, name: /settings/i })).toBeInTheDocument();
    });

    it('renders breadcrumbs with Dashboard link', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
    });

    it('renders description text', () => {
      render(<SettingsPage />);
      expect(
        screen.getByText('Manage your account, team, and application settings')
      ).toBeInTheDocument();
    });

    it('renders search input with placeholder', () => {
      render(<SettingsPage />);
      const input = screen.getByTestId('search-input');
      expect(input).toHaveAttribute('placeholder', 'Search settings...');
    });

    it('renders all 7 settings items', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Account')).toBeInTheDocument();
      expect(screen.getByText('Team')).toBeInTheDocument();
      expect(screen.getByText('AI Chains')).toBeInTheDocument();
      expect(screen.getByText('Pipeline')).toBeInTheDocument();
      expect(screen.getByText('Integrations')).toBeInTheDocument();
      expect(screen.getByText('Notifications')).toBeInTheDocument();
      // Security appears both as category heading and item title
      const securityElements = screen.getAllByText('Security');
      expect(securityElements.length).toBeGreaterThanOrEqual(1);
    });

    it('renders all 4 category headings', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Account & Profile')).toBeInTheDocument();
      expect(screen.getByText('AI & Automation')).toBeInTheDocument();
      expect(screen.getByText('Integrations & Communications')).toBeInTheDocument();
    });

    it('renders Recent Changes section', () => {
      render(<SettingsPage />);
      expect(screen.getByText('Recent Changes')).toBeInTheDocument();
      expect(screen.getByText('No recent changes')).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('updates search on typing', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const input = screen.getByTestId('search-input');
      await user.type(input, 'account');
      expect(input).toHaveValue('account');
    });

    it('clears search on Escape key', async () => {
      const user = userEvent.setup();
      render(<SettingsPage />);
      const input = screen.getByTestId('search-input');
      await user.type(input, 'test');
      expect(input).toHaveValue('test');
      await user.keyboard('{Escape}');
      expect(input).toHaveValue('');
    });
  });

  describe('Accessibility', () => {
    it('search section has role="search"', () => {
      render(<SettingsPage />);
      expect(screen.getByRole('search')).toBeInTheDocument();
    });

    it('search section has aria-label', () => {
      render(<SettingsPage />);
      const searchRegion = screen.getByRole('search');
      expect(searchRegion).toHaveAttribute('aria-label', 'Search settings');
    });

    it('has aria-live region for result count', () => {
      render(<SettingsPage />);
      const liveRegion = document.querySelector('[aria-live="polite"]');
      expect(liveRegion).toBeInTheDocument();
    });

    it('search input has aria-label', () => {
      render(<SettingsPage />);
      const input = screen.getByTestId('search-input');
      expect(input).toHaveAttribute('aria-label', 'Search settings');
    });
  });
});
