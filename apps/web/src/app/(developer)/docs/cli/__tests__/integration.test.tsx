import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CliDocsPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

describe('CLI Docs Integration', () => {
  it('full page renders data-testid="cli-docs" without component mocks (AC-001)', () => {
    render(<CliDocsPage />);
    expect(screen.getByTestId('cli-docs')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('CLI Reference');
  });

  it('developerSidebarConfig contains "cli" section item (AC-009)', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const cliItem = allItems.find((item) => item.id === 'cli');
    expect(cliItem).toBeDefined();
  });

  it('CLI sidebar entry has href "/docs/cli" (AC-009)', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const cliItem = allItems.find((item) => item.id === 'cli');
    expect(cliItem!.href).toBe('/docs/cli');
  });

  it('CLI sidebar entry has label "CLI Reference" (AC-009)', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const cliItem = allItems.find((item) => item.id === 'cli');
    expect(cliItem!.label).toBe('CLI Reference');
  });

  it('heading hierarchy: h1 + multiple h2s present', () => {
    render(<CliDocsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('CLI Reference');
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(2);
  });

  it('no external links present — CLI docs is internal-only content (NF-008 vacuity guard)', () => {
    render(<CliDocsPage />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    // CLI docs has no external links — this test ensures NF-008 is satisfied trivially
    // If external links are added later, they must have rel="noopener noreferrer"
    expect(externalLinks.length).toBe(0);
  });

  it('code blocks present (pre elements >= 1)', async () => {
    const user = userEvent.setup();
    render(<CliDocsPage />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));
    const preElements = document.querySelectorAll('pre');
    expect(preElements.length).toBeGreaterThanOrEqual(1);
  });
});
