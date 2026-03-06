import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import GuidesPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

describe('Guides Page Integration', () => {
  it('full page renders with real GuidesList (no mocks) (AC-001)', () => {
    render(<GuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Developer Guides');
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBe(7);
  });

  it('all 7 category headings visible (AC-002)', () => {
    render(<GuidesPage />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s[0]).toHaveTextContent('Getting Started');
    expect(h2s[1]).toHaveTextContent('Development');
    expect(h2s[2]).toHaveTextContent('Testing');
    expect(h2s[3]).toHaveTextContent('AI Development');
    expect(h2s[4]).toHaveTextContent('Deployment');
    expect(h2s[5]).toHaveTextContent('Best Practices');
    expect(h2s[6]).toHaveTextContent('Contributing');
  });

  it('"Getting Started" renders as link with correct href (AC-004)', () => {
    render(<GuidesPage />);
    const links = screen.getAllByRole('link');
    const gsLink = links.find(
      (l) =>
        l.textContent?.includes('Getting Started') &&
        l.getAttribute('href')?.includes('getting-started')
    );
    expect(gsLink).toBeDefined();
    expect(gsLink).toHaveAttribute('href', 'https://intelliflow-crm.dev/guides/getting-started');
  });

  it('coming-soon guides are not clickable (AC-004)', () => {
    render(<GuidesPage />);
    const devOverview = screen.getByText('Development Overview');
    expect(devOverview.closest('a')).toBeNull();
    expect(devOverview.closest('[aria-disabled="true"]')).toBeInTheDocument();
  });

  it('"Coming Soon" status badges visible for disabled items (AC-004)', () => {
    render(<GuidesPage />);
    const badges = screen.getAllByText('Coming Soon');
    expect(badges.length).toBe(19);
  });

  it('heading hierarchy correct: h1 > h2 (NF-003)', () => {
    render(<GuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h1).toBeInTheDocument();
    expect(h2s.length).toBe(7);
    // h1 should appear before h2s in the DOM
    const allHeadings = screen.getAllByRole('heading');
    expect(allHeadings[0]).toBe(h1);
  });

  it('external links have rel="noopener noreferrer" (AC-005)', () => {
    render(<GuidesPage />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBeGreaterThan(0);
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  it('sidebar config has guides entry with href: "/docs/guides" (AC-006)', () => {
    const docSection = developerSidebarConfig.sections.find((s) => s.id === 'documentation');
    expect(docSection).toBeDefined();
    const guidesItem = docSection!.items.find((i) => i.id === 'guides');
    expect(guidesItem).toBeDefined();
    expect(guidesItem!.href).toBe('/docs/guides');
  });

  it('external link sr-only "(opens in new tab)" text present (NF-005)', () => {
    render(<GuidesPage />);
    const srOnlyTexts = screen.getAllByText('(opens in new tab)');
    expect(srOnlyTexts.length).toBeGreaterThan(0);
    srOnlyTexts.forEach((el) => {
      expect(el.className).toContain('sr-only');
    });
  });
});
