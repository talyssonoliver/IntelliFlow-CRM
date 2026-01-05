// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppHeader } from '../AppHeader';

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock child components to isolate AppHeader testing
vi.mock('../notifications', () => ({
  Notifications: () => <div data-testid="notifications">Notifications</div>,
}));

vi.mock('../search-bar', () => ({
  SearchBar: ({ className }: { className?: string }) => (
    <div data-testid="search-bar" className={className}>Search</div>
  ),
}));

vi.mock('../user-menu', () => ({
  UserMenu: ({ className }: { className?: string }) => (
    <div data-testid="user-menu" className={className}>User Menu</div>
  ),
}));

/**
 * AppHeader Component Tests
 *
 * Tests the main application header for authenticated users.
 * Covers rendering, navigation, accessibility, and responsive behavior.
 */
describe('AppHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render the header element', () => {
      render(<AppHeader />);

      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('sticky', 'top-0', 'z-50');
    });

    it('should render the logo', () => {
      render(<AppHeader />);

      expect(screen.getByText('IntelliFlow CRM')).toBeInTheDocument();
    });

    it('should render all navigation links', () => {
      render(<AppHeader />);

      expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /leads/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /contacts/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /deals/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /tickets/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /documents/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /agent actions/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
    });

    it('should render search bar', () => {
      render(<AppHeader />);

      expect(screen.getByTestId('search-bar')).toBeInTheDocument();
    });

    it('should render notifications', () => {
      render(<AppHeader />);

      expect(screen.getByTestId('notifications')).toBeInTheDocument();
    });

    it('should render user menu', () => {
      render(<AppHeader />);

      expect(screen.getByTestId('user-menu')).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('should have correct href for each navigation link', () => {
      render(<AppHeader />);

      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/dashboard');
      expect(screen.getByRole('link', { name: /leads/i })).toHaveAttribute('href', '/leads');
      expect(screen.getByRole('link', { name: /contacts/i })).toHaveAttribute('href', '/contacts');
      expect(screen.getByRole('link', { name: /deals/i })).toHaveAttribute('href', '/deals');
      expect(screen.getByRole('link', { name: /tickets/i })).toHaveAttribute('href', '/tickets');
      expect(screen.getByRole('link', { name: /documents/i })).toHaveAttribute('href', '/documents');
      expect(screen.getByRole('link', { name: /agent actions/i })).toHaveAttribute('href', '/agent-approvals/preview');
      expect(screen.getByRole('link', { name: /reports/i })).toHaveAttribute('href', '/analytics');
    });

    it('should have logo link to dashboard', () => {
      render(<AppHeader />);

      const logoLink = screen.getByRole('link', { name: /intelliflow crm/i });
      expect(logoLink).toHaveAttribute('href', '/dashboard');
    });
  });

  describe('Mobile Menu', () => {
    it('should render mobile menu toggle button', () => {
      render(<AppHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it('should show menu icon when mobile menu is closed', () => {
      render(<AppHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toHaveTextContent('menu');
    });

    it('should show close icon when mobile menu is open', async () => {
      const user = userEvent.setup();
      render(<AppHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      await user.click(toggleButton);

      expect(toggleButton).toHaveTextContent('close');
    });

    it('should toggle mobile menu state on button click', async () => {
      const user = userEvent.setup();
      render(<AppHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });

      // Initially closed (menu icon)
      expect(toggleButton).toHaveTextContent('menu');

      // Click to open
      await user.click(toggleButton);
      expect(toggleButton).toHaveTextContent('close');

      // Click to close
      await user.click(toggleButton);
      expect(toggleButton).toHaveTextContent('menu');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible mobile menu toggle', () => {
      render(<AppHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toHaveAccessibleName('Toggle menu');
    });

    it('should use semantic header element', () => {
      render(<AppHeader />);

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('should have navigation landmark', () => {
      render(<AppHeader />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should have sticky positioning', () => {
      render(<AppHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('sticky', 'top-0');
    });

    it('should use design system colors', () => {
      render(<AppHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('bg-card', 'border-border');
    });

    it('should have proper z-index for overlay', () => {
      render(<AppHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('z-50');
    });
  });
});
