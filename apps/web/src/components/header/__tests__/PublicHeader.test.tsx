// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PublicHeader } from '../PublicHeader';

// Mock next/navigation
const mockUsePathname = vi.fn(() => '/');

vi.mock('next/navigation', () => ({
  usePathname: () => mockUsePathname(),
}));

// Mock next/link - preserve className for styling tests
vi.mock('next/link', () => ({
  default: ({ children, href, onClick, className }: { children: React.ReactNode; href: string; onClick?: () => void; className?: string }) => (
    <a href={href} onClick={onClick} className={className}>{children}</a>
  ),
}));

/**
 * PublicHeader Component Tests
 *
 * Tests the public/marketing header for unauthenticated visitors.
 * Covers rendering, navigation, CTA buttons, accessibility, and responsive behavior.
 */
describe('PublicHeader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUsePathname.mockReturnValue('/');
  });

  describe('Rendering', () => {
    it('should render the header element', () => {
      render(<PublicHeader />);

      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
      expect(header).toHaveClass('sticky', 'top-0', 'z-50');
    });

    it('should render the logo with brand name', () => {
      render(<PublicHeader />);

      expect(screen.getByText('IntelliFlow CRM')).toBeInTheDocument();
    });

    it('should have logo link to home page', () => {
      render(<PublicHeader />);

      const logoLink = screen.getByRole('link', { name: /intelliflow crm/i });
      expect(logoLink).toHaveAttribute('href', '/');
    });

    it('should render all public navigation links', () => {
      render(<PublicHeader />);

      expect(screen.getByRole('link', { name: /features/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /pricing/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /about/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /contact/i })).toBeInTheDocument();
    });
  });

  describe('Navigation Links', () => {
    it('should have correct href for each navigation link', () => {
      render(<PublicHeader />);

      expect(screen.getByRole('link', { name: /features/i })).toHaveAttribute('href', '/features');
      expect(screen.getByRole('link', { name: /pricing/i })).toHaveAttribute('href', '/pricing');
      expect(screen.getByRole('link', { name: /about/i })).toHaveAttribute('href', '/about');
      expect(screen.getByRole('link', { name: /contact/i })).toHaveAttribute('href', '/contact');
    });

    it('should highlight active navigation link', () => {
      mockUsePathname.mockReturnValue('/features');
      render(<PublicHeader />);

      const featuresLink = screen.getAllByRole('link', { name: /features/i })[0];
      expect(featuresLink).toHaveClass('bg-primary/10', 'text-primary');
    });

    it('should not highlight inactive navigation links', () => {
      mockUsePathname.mockReturnValue('/features');
      render(<PublicHeader />);

      const pricingLink = screen.getAllByRole('link', { name: /pricing/i })[0];
      expect(pricingLink).toHaveClass('text-muted-foreground');
      expect(pricingLink).not.toHaveClass('bg-primary/10');
    });
  });

  describe('CTA Buttons', () => {
    it('should render Sign In button', () => {
      render(<PublicHeader />);

      const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
      expect(signInLinks.length).toBeGreaterThan(0);
    });

    it('should render Start Free Trial button', () => {
      render(<PublicHeader />);

      const trialLinks = screen.getAllByRole('link', { name: /start free trial/i });
      expect(trialLinks.length).toBeGreaterThan(0);
    });

    it('should have Sign In link to /sign-in', () => {
      render(<PublicHeader />);

      const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
      expect(signInLinks[0]).toHaveAttribute('href', '/sign-in');
    });

    it('should have Start Free Trial link to /sign-up', () => {
      render(<PublicHeader />);

      const trialLinks = screen.getAllByRole('link', { name: /start free trial/i });
      expect(trialLinks[0]).toHaveAttribute('href', '/sign-up');
    });
  });

  describe('Mobile Menu', () => {
    it('should render mobile menu toggle button', () => {
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toBeInTheDocument();
    });

    it('should have aria-expanded attribute on toggle button', () => {
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('should show menu icon when mobile menu is closed', () => {
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toHaveTextContent('menu');
    });

    it('should show close icon when mobile menu is open', async () => {
      const user = userEvent.setup();
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      await user.click(toggleButton);

      expect(toggleButton).toHaveTextContent('close');
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');
    });

    it('should toggle mobile menu visibility on button click', async () => {
      const user = userEvent.setup();
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });

      // Initially closed - mobile nav should not be visible
      expect(screen.queryByRole('navigation', { name: /mobile/i })).not.toBeInTheDocument();

      // Click to open
      await user.click(toggleButton);

      // Mobile menu should now show navigation links
      const allNavs = screen.getAllByRole('navigation');
      expect(allNavs.length).toBeGreaterThan(1); // Desktop + Mobile nav
    });

    it('should close mobile menu when navigation link is clicked', async () => {
      const user = userEvent.setup();
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });

      // Open mobile menu
      await user.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

      // Click a navigation link in the mobile menu
      const mobileFeatureLinks = screen.getAllByRole('link', { name: /features/i });
      const mobileLink = mobileFeatureLinks[mobileFeatureLinks.length - 1]; // Get the mobile one
      await user.click(mobileLink);

      // Menu should be closed
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });

    it('should render CTA buttons in mobile menu when open', async () => {
      const user = userEvent.setup();
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      await user.click(toggleButton);

      // Should have both desktop and mobile CTA buttons
      const signInLinks = screen.getAllByRole('link', { name: /sign in/i });
      const trialLinks = screen.getAllByRole('link', { name: /start free trial/i });

      expect(signInLinks.length).toBe(2); // Desktop + Mobile
      expect(trialLinks.length).toBe(2); // Desktop + Mobile
    });
  });

  describe('Accessibility', () => {
    it('should have accessible mobile menu toggle', () => {
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });
      expect(toggleButton).toHaveAccessibleName('Toggle menu');
    });

    it('should use semantic header element', () => {
      render(<PublicHeader />);

      expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    it('should have navigation landmark', () => {
      render(<PublicHeader />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
    });

    it('should update aria-expanded when menu toggles', async () => {
      const user = userEvent.setup();
      render(<PublicHeader />);

      const toggleButton = screen.getByRole('button', { name: /toggle menu/i });

      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggleButton);
      expect(toggleButton).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('Styling', () => {
    it('should have sticky positioning', () => {
      render(<PublicHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('sticky', 'top-0');
    });

    it('should use design system colors', () => {
      render(<PublicHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('border-border');
    });

    it('should have backdrop blur effect', () => {
      render(<PublicHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('backdrop-blur');
    });

    it('should have proper z-index for overlay', () => {
      render(<PublicHeader />);

      const header = screen.getByRole('banner');
      expect(header).toHaveClass('z-50');
    });
  });

  describe('Brand Compliance', () => {
    it('should display brand logo icon', () => {
      render(<PublicHeader />);

      const logoIcon = screen.getByText('grid_view');
      expect(logoIcon).toBeInTheDocument();
      expect(logoIcon).toHaveClass('material-symbols-outlined');
    });

    it('should use primary color for logo background', () => {
      render(<PublicHeader />);

      const logoContainer = screen.getByText('grid_view').parentElement;
      expect(logoContainer).toHaveClass('bg-primary');
    });
  });
});
