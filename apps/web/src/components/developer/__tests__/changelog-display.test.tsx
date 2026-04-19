import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ChangelogDisplay, CHANGELOG_ENTRIES } from '../changelog-display';
import type { ChangelogEntry } from '@/lib/developer/rss-feed';

const mockEntriesWithBreaking: ChangelogEntry[] = [
  {
    version: '1.0.0',
    date: '2026-03-01',
    title: 'Major Release',
    changes: [
      { type: 'breaking', description: 'Removed deprecated API' },
      { type: 'feature', description: 'New dashboard' },
    ],
  },
  {
    version: '0.9.0',
    date: '2026-02-15',
    title: 'Minor Release',
    changes: [
      { type: 'fix', description: 'Fixed login bug' },
      { type: 'performance', description: 'Improved load time' },
    ],
  },
];

const mockEntriesNoBreaking: ChangelogEntry[] = [
  {
    version: '0.8.0',
    date: '2026-02-01',
    title: 'Patch Release',
    changes: [
      { type: 'feature', description: 'Added export feature' },
      { type: 'deprecation', description: 'Old format deprecated' },
      { type: 'security', description: 'Patched XSS vulnerability' },
    ],
  },
];

describe('ChangelogDisplay', () => {
  // Static data rendering (9)
  describe('static data rendering', () => {
    it('renders all changelog entries by version number', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
      expect(screen.getByText('v0.9.0')).toBeInTheDocument();
    });

    it('each version entry shows date string', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      expect(screen.getByText('2026-03-01')).toBeInTheDocument();
      expect(screen.getByText('2026-02-15')).toBeInTheDocument();
    });

    it('entry descriptions are rendered', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      expect(screen.getByText('Removed deprecated API')).toBeInTheDocument();
      expect(screen.getByText('New dashboard')).toBeInTheDocument();
      expect(screen.getByText('Fixed login bug')).toBeInTheDocument();
    });

    it('breaking change badge rendered with variant="destructive" (bg-destructive)', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const breakingBadge = screen.getByText('breaking');
      const classes = breakingBadge.closest('[class]')?.className ?? breakingBadge.className;
      expect(classes).toMatch(/bg-destructive/);
    });

    it('feature badge rendered with variant="success" (green styling)', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const featureBadge = screen.getByText('feature');
      const classes = featureBadge.closest('[class]')?.className ?? featureBadge.className;
      expect(classes).toMatch(/bg-green/);
    });

    it('fix badge rendered with variant="secondary" (bg-secondary)', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const fixBadge = screen.getByText('fix');
      const classes = fixBadge.closest('[class]')?.className ?? fixBadge.className;
      expect(classes).toMatch(/bg-secondary/);
    });

    it('deprecation badge rendered with variant="warning" (yellow styling)', () => {
      render(<ChangelogDisplay entries={mockEntriesNoBreaking} />);
      const deprecationBadge = screen.getByText('deprecation');
      const classes = deprecationBadge.closest('[class]')?.className ?? deprecationBadge.className;
      expect(classes).toMatch(/bg-yellow/);
    });

    it('security badge rendered with variant="outline" (text-foreground, no colored bg)', () => {
      render(<ChangelogDisplay entries={mockEntriesNoBreaking} />);
      const securityBadge = screen.getByText('security');
      const classes = securityBadge.closest('[class]')?.className ?? securityBadge.className;
      expect(classes).toMatch(/text-foreground/);
      // outline variant should NOT have colored background
      expect(classes).not.toMatch(/bg-(green|yellow|destructive|secondary|primary)/);
    });

    it('performance badge rendered with variant="secondary" (bg-secondary)', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const performanceBadge = screen.getByText('performance');
      const classes = performanceBadge.closest('[class]')?.className ?? performanceBadge.className;
      expect(classes).toMatch(/bg-secondary/);
    });
  });

  // ARIA and accessibility (5)
  describe('ARIA and accessibility', () => {
    it('<h2> heading per version entry', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.length).toBe(2);
    });

    it('Material Symbols icons have aria-hidden="true"', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const icons = document.querySelectorAll('.material-symbols-outlined');
      icons.forEach((icon) => {
        expect(icon).toHaveAttribute('aria-hidden', 'true');
      });
    });

    it('RSS link has aria-label="Subscribe to changelog RSS feed"', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const rssLink = screen.getByLabelText('Subscribe to changelog RSS feed');
      expect(rssLink).toBeInTheDocument();
    });

    it('breaking change callout has appropriate semantic markup', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const alert = document.querySelector('[role="alert"]');
      expect(alert).toBeInTheDocument();
    });

    it('section elements have meaningful structure', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const sections = document.querySelectorAll('section');
      expect(sections.length).toBe(2);
      expect(sections[0].id).toBe('v1.0.0');
      expect(sections[1].id).toBe('v0.9.0');
    });
  });

  // Interactive elements (3)
  describe('interactive elements', () => {
    it('RSS subscription link has correct href="/api/developer/changelog-rss"', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const rssLink = screen.getByLabelText('Subscribe to changelog RSS feed');
      expect(rssLink).toHaveAttribute('href', '/api/developer/changelog-rss');
    });

    it('RSS link has rss_feed icon', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const rssLink = screen.getByLabelText('Subscribe to changelog RSS feed');
      const icon = rssLink.querySelector('.material-symbols-outlined');
      expect(icon).toBeInTheDocument();
      expect(icon?.textContent?.trim()).toBe('rss_feed');
    });

    it('interactive elements have focus-visible:ring-2 classes', () => {
      render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const rssLink = screen.getByLabelText('Subscribe to changelog RSS feed');
      expect(rssLink.className).toContain('focus-visible:ring-2');
    });
  });

  // Responsive and layout (4)
  describe('responsive and layout', () => {
    it('container has appropriate Tailwind responsive classes', () => {
      const { container } = render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const wrapper = container.firstElementChild;
      expect(wrapper?.className).toContain('flex');
      expect(wrapper?.className).toContain('flex-col');
    });

    it('date displayed in human-readable format (not raw ISO) for default entries', () => {
      render(<ChangelogDisplay />);
      // Default CHANGELOG_ENTRIES use pre-formatted dates via DISPLAY_DATES map
      expect(screen.getByText('February 24, 2026')).toBeInTheDocument();
    });

    it('separator between version entries', () => {
      const { container } = render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      // Separator renders as an <hr> or div with role="separator"
      const separators = container.querySelectorAll('[role="separator"], [data-orientation]');
      expect(separators.length).toBeGreaterThanOrEqual(1);
    });

    it('breaking change callout has border-l-4 border-yellow-500 when latest entry has breaking changes', () => {
      const { container } = render(<ChangelogDisplay entries={mockEntriesWithBreaking} />);
      const callout = container.querySelector('.border-l-4.border-yellow-500');
      expect(callout).toBeInTheDocument();
    });
  });

  // Edge cases (3)
  describe('edge cases', () => {
    it('empty entries array renders gracefully (empty state message)', () => {
      render(<ChangelogDisplay entries={[]} />);
      // EmptyState entity="insights" → canonical 'No insights yet'.
      expect(screen.getByText('No insights yet')).toBeInTheDocument();
    });

    it('single entry renders without layout breakage', () => {
      render(<ChangelogDisplay entries={[mockEntriesNoBreaking[0]]} />);
      expect(screen.getByText('v0.8.0')).toBeInTheDocument();
      expect(screen.getByText('Added export feature')).toBeInTheDocument();
    });

    it('entry with no breaking changes shows no breaking-change callout', () => {
      const { container } = render(<ChangelogDisplay entries={mockEntriesNoBreaking} />);
      const callout = container.querySelector('.border-l-4.border-yellow-500');
      expect(callout).not.toBeInTheDocument();
    });
  });

  // Verify default static data
  describe('default static data', () => {
    it('CHANGELOG_ENTRIES has at least 5 entries', () => {
      expect(CHANGELOG_ENTRIES.length).toBeGreaterThanOrEqual(5);
    });
  });
});
