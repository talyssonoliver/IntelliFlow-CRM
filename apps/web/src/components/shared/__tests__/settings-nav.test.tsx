import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SettingsNav } from '../settings-nav';
import { SETTINGS_ITEMS, SETTINGS_CATEGORIES } from '@/lib/shared/settings-search';

describe('SettingsNav', () => {
  describe('Rendering', () => {
    it('renders all 4 category headings', () => {
      render(<SettingsNav />);
      for (const cat of SETTINGS_CATEGORIES) {
        // Use heading role to target category h2 specifically
        const headings = screen.getAllByRole('heading', { level: 2 });
        const match = headings.find((h) => h.textContent === cat.title);
        expect(match).toBeTruthy();
      }
    });

    it('renders all 7 settings items as links', () => {
      render(<SettingsNav />);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(SETTINGS_ITEMS.length);
    });

    it('each card shows correct title and description', () => {
      render(<SettingsNav />);
      for (const item of SETTINGS_ITEMS) {
        // Item titles are h3 elements
        const h3s = screen.getAllByRole('heading', { level: 3 });
        const titleMatch = h3s.find((h) => h.textContent === item.title);
        expect(titleMatch).toBeTruthy();
        expect(screen.getByText(item.description)).toBeInTheDocument();
      }
    });

    it('each card links to correct href', () => {
      render(<SettingsNav />);
      for (const item of SETTINGS_ITEMS) {
        // Find the link by href directly
        const link = screen.getAllByRole('link').find((a) => a.getAttribute('href') === item.href);
        expect(link).toBeTruthy();
      }
    });

    it('each card has chevron_right icon', () => {
      render(<SettingsNav />);
      const chevrons = screen.getAllByText('chevron_right');
      expect(chevrons).toHaveLength(SETTINGS_ITEMS.length);
    });

    it('renders with optional className prop', () => {
      const { container } = render(<SettingsNav className="mt-4" />);
      expect(container.firstChild).toHaveClass('mt-4');
    });
  });

  describe('Search Filtering', () => {
    it('shows all categories when searchQuery is empty', () => {
      render(<SettingsNav searchQuery="" />);
      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s).toHaveLength(SETTINGS_CATEGORIES.length);
    });

    it('filters to matching items only', () => {
      render(<SettingsNav searchQuery="security" />);
      // "Security" appears as both category heading (h2) and item title (h3)
      const securityElements = screen.getAllByText('Security');
      expect(securityElements.length).toBeGreaterThanOrEqual(1);
      // Category heading should exist
      const h2s = screen.getAllByRole('heading', { level: 2 });
      const securityHeading = h2s.find((h) => h.textContent === 'Security');
      expect(securityHeading).toBeTruthy();
    });

    it('hides categories with no matching items', () => {
      render(<SettingsNav searchQuery="pipeline" />);
      // Only AI & Automation category should show
      expect(screen.getByText('AI & Automation')).toBeInTheDocument();
      expect(screen.queryByText('Account & Profile')).not.toBeInTheDocument();
    });

    it('shows empty state when no items match', () => {
      render(<SettingsNav searchQuery="zzzznonexistent" />);
      // EmptyState entity="search" → canonical 'No results found'.
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('category headings are h2 elements', () => {
      render(<SettingsNav />);
      const headings = screen.getAllByRole('heading', { level: 2 });
      expect(headings).toHaveLength(SETTINGS_CATEGORIES.length);
    });

    it('all cards are keyboard-focusable links', () => {
      render(<SettingsNav />);
      const links = screen.getAllByRole('link');
      for (const link of links) {
        expect(link.tagName).toBe('A');
      }
    });

    it('empty state has aria-live for screen readers', () => {
      render(<SettingsNav searchQuery="zzzznonexistent" />);
      const status = screen.getByRole('status');
      expect(status).toHaveAttribute('aria-live', 'polite');
    });
  });
});
