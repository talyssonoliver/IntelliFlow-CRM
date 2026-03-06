import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GuidesList } from '../guides-list';
import { developerSidebarConfig } from '../../sidebar/configs/developer';

describe('GuidesList', () => {
  it('renders all 7 category sections with h2 headings (AC-002)', () => {
    render(<GuidesList />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBe(7);
    expect(h2s[0]).toHaveTextContent('Getting Started');
    expect(h2s[1]).toHaveTextContent('Development');
    expect(h2s[2]).toHaveTextContent('Testing');
    expect(h2s[3]).toHaveTextContent('AI Development');
    expect(h2s[4]).toHaveTextContent('Deployment');
    expect(h2s[5]).toHaveTextContent('Best Practices');
    expect(h2s[6]).toHaveTextContent('Contributing');
  });

  it('each category has description text (AC-003)', () => {
    render(<GuidesList />);
    expect(screen.getByText(/Quick start guide and initial setup/i)).toBeInTheDocument();
    expect(screen.getByText(/Core development workflow/i)).toBeInTheDocument();
    expect(screen.getByText(/Testing strategies and best practices/i)).toBeInTheDocument();
  });

  it('each category has colored icon with aria-hidden="true" (NF-002)', () => {
    render(<GuidesList />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('guide items render with correct titles (AC-003)', () => {
    render(<GuidesList />);
    // "Getting Started" appears as both category h2 and item title
    const gettingStartedElements = screen.getAllByText('Getting Started');
    expect(gettingStartedElements.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Development Overview')).toBeInTheDocument();
    expect(screen.getByText('Testing Overview')).toBeInTheDocument();
    expect(screen.getByText('AI Development Guide')).toBeInTheDocument();
    expect(screen.getByText('Deployment Overview')).toBeInTheDocument();
    expect(screen.getByText('Code Style')).toBeInTheDocument();
    expect(screen.getByText('Contributing Guide')).toBeInTheDocument();
  });

  it('guide items render with correct descriptions (AC-003)', () => {
    render(<GuidesList />);
    expect(screen.getByText(/Set up your development environment/i)).toBeInTheDocument();
  });

  it('"Getting Started" renders as link with correct href (AC-004)', () => {
    render(<GuidesList />);
    // "Getting Started" appears as both category h2 and item title
    // Find the item link specifically
    const links = screen.getAllByRole('link');
    const gettingStartedLink = links.find(
      (link) =>
        link.textContent?.includes('Getting Started') &&
        link.getAttribute('href')?.includes('getting-started')
    );
    expect(gettingStartedLink).toBeDefined();
    expect(gettingStartedLink).toHaveAttribute(
      'href',
      'https://intelliflow-crm.dev/guides/getting-started'
    );
  });

  it('coming-soon items render as div not link (AC-004)', () => {
    render(<GuidesList />);
    const devOverviewText = screen.getByText('Development Overview');
    const disabledCard = devOverviewText.closest('[aria-disabled="true"]');
    expect(disabledCard).toBeInTheDocument();
    expect(disabledCard?.tagName).toBe('DIV');
    expect(devOverviewText.closest('a')).toBeNull();
  });

  it('coming-soon items have aria-disabled="true" (NF-003)', () => {
    render(<GuidesList />);
    const disabledCards = document.querySelectorAll('[aria-disabled="true"]');
    // 19 items are coming-soon (20 total - 1 available)
    expect(disabledCards.length).toBe(19);
  });

  it('coming-soon items have opacity-70 cursor-not-allowed classes (AC-004)', () => {
    render(<GuidesList />);
    // opacity-70 and cursor-not-allowed are on the Card element inside the disabled div
    const devOverviewCard = screen.getByText('Development Overview').closest('.p-4');
    expect(devOverviewCard?.className).toContain('opacity-70');
    expect(devOverviewCard?.className).toContain('cursor-not-allowed');
  });

  it('coming-soon items show Coming Soon badge (AC-004)', () => {
    render(<GuidesList />);
    const comingSoonBadges = screen.getAllByText('Coming Soon');
    expect(comingSoonBadges.length).toBe(19);
  });

  it('external links have target="_blank" and rel="noopener noreferrer" (AC-005)', () => {
    render(<GuidesList />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('external links include sr-only "(opens in new tab)" text (NF-005)', () => {
    render(<GuidesList />);
    const srOnlyTexts = screen.getAllByText('(opens in new tab)');
    expect(srOnlyTexts.length).toBeGreaterThan(0);
    srOnlyTexts.forEach((el) => {
      expect(el.className).toContain('sr-only');
    });
  });

  it('responsive grid: md:grid-cols-2 class present (NF-004)', () => {
    render(<GuidesList />);
    const grids = document.querySelectorAll('.grid.gap-4');
    expect(grids.length).toBe(7);
    grids.forEach((grid) => {
      expect(grid.className).toContain('md:grid-cols-2');
    });
  });

  it('focus-visible ring classes on active link cards (NF-003)', () => {
    render(<GuidesList />);
    const links = document.querySelectorAll('a');
    expect(links.length).toBeGreaterThan(0);
    links.forEach((link) => {
      expect(link.className).toContain('focus-visible:ring-2');
    });
  });

  it('section aria-labelledby attributes link to h2 ids (NF-003)', () => {
    render(<GuidesList />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBe(7);
    sections.forEach((section) => {
      const labelledBy = section.getAttribute('aria-labelledby');
      const h2 = section.querySelector(`#${labelledBy}`);
      expect(h2).toBeInTheDocument();
      expect(h2?.tagName).toBe('H2');
    });
  });

  it('total guide card count equals 20 (AC-002)', () => {
    render(<GuidesList />);
    // Count all cards: 1 available link + 19 disabled divs
    const links = document.querySelectorAll('a');
    const disabledCards = document.querySelectorAll('[aria-disabled="true"]');
    expect(links.length + disabledCards.length).toBe(20);
  });

  it('developer sidebar config contains guides entry at /docs/guides (AC-006)', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    expect(docSection).toBeDefined();
    const guidesItem = docSection!.items.find((i) => i.id === 'guides');
    expect(guidesItem).toBeDefined();
    expect(guidesItem!.href).toBe('/docs/guides');
    expect(guidesItem!.icon).toBe('menu_book');
    expect(guidesItem!.label).toBe('Developer Guides');
  });
});
