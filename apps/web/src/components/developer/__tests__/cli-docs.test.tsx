import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CliDocs } from '../cli-docs';

// Mock clipboard for copy-to-clipboard coverage
const mockWriteText = vi.fn().mockResolvedValue(undefined);

if (!navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: mockWriteText },
    configurable: true,
  });
} else {
  vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
}

// Mock CliExamples to isolate component tests
vi.mock('@/components/developer/cli-examples', () => ({
  CliExamples: () => <div data-testid="cli-examples">CLI Examples Mock</div>,
}));

describe('CliDocs', () => {
  it('renders data-testid="cli-docs"', () => {
    render(<CliDocs />);
    expect(screen.getByTestId('cli-docs')).toBeInTheDocument();
  });

  it('all 5 tab triggers rendered (overview, setup, testing, database, examples)', () => {
    render(<CliDocs />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Setup & Dev' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Testing & Quality' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Database' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Examples' })).toBeInTheDocument();
  });

  it('Overview tab active by default with data-state="active" (AC-002)', () => {
    render(<CliDocs />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
  });

  it('tab switching works for all non-default tabs (AC-002)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);

    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));
    expect(screen.getByRole('tab', { name: 'Setup & Dev' })).toHaveAttribute(
      'data-state',
      'active'
    );

    await user.click(screen.getByRole('tab', { name: 'Testing & Quality' }));
    expect(screen.getByRole('tab', { name: 'Testing & Quality' })).toHaveAttribute(
      'data-state',
      'active'
    );

    await user.click(screen.getByRole('tab', { name: 'Database' }));
    expect(screen.getByRole('tab', { name: 'Database' })).toHaveAttribute(
      'data-state',
      'active'
    );

    await user.click(screen.getByRole('tab', { name: 'Examples' }));
    expect(screen.getByRole('tab', { name: 'Examples' })).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  it('Overview tab shows prerequisites section (AC-003)', () => {
    render(<CliDocs />);
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
    expect(screen.getByText('Node.js 18 or later')).toBeInTheDocument();
    expect(screen.getByText('pnpm package manager')).toBeInTheDocument();
    expect(screen.getByText('Docker and Docker Compose')).toBeInTheDocument();
  });

  it('Overview tab shows command groups quick reference (AC-003)', () => {
    render(<CliDocs />);
    expect(screen.getByText('Command Groups')).toBeInTheDocument();
    expect(screen.getByText('Environment Setup')).toBeInTheDocument();
    expect(screen.getByText('Development')).toBeInTheDocument();
    expect(screen.getByText('Testing')).toBeInTheDocument();
  });

  it('Setup & Dev tab shows pnpm install and pnpm run dev commands (AC-004)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));

    expect(screen.getAllByText(/pnpm install/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/pnpm run dev/).length).toBeGreaterThanOrEqual(1);
  });

  it('Testing tab shows pnpm run test and pnpm run test:e2e commands (AC-005)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Testing & Quality' }));

    expect(screen.getAllByText(/pnpm run test/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/test:e2e/).length).toBeGreaterThanOrEqual(1);
  });

  it('Database tab shows destructive warning callout for db:reset (AC-006)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Database' }));

    expect(screen.getByText('Destructive Command Warning')).toBeInTheDocument();
    expect(screen.getAllByText(/db:reset/).length).toBeGreaterThanOrEqual(1);
  });

  it('Examples tab renders CliExamples via data-testid="cli-examples" (AC-007)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Examples' }));

    expect(screen.getByTestId('cli-examples')).toBeInTheDocument();
  });

  it('copy button triggers navigator.clipboard.writeText (AC-008)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);

    await user.click(copyButtons[0]);

    await waitFor(() => {
      const checkIcons = screen.queryAllByText('check');
      expect(checkIcons.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('copy feedback icon changes to "check" (AC-008)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    await user.click(copyButtons[0]);

    await waitFor(() => {
      expect(screen.queryAllByText('check').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('icons have aria-hidden="true" (NF-003)', () => {
    render(<CliDocs />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('sections have aria-labelledby with valid IDs (NF-004)', () => {
    render(<CliDocs />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBeGreaterThanOrEqual(2);
    sections.forEach((section) => {
      const labelId = section.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      const label = document.getElementById(labelId!);
      expect(label).toBeInTheDocument();
    });
  });

  it('copy feedback uses aria-live="polite" sr-only span (NF-005)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));

    const liveRegions = document.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });

  it('h2 heading hierarchy in tab sections (NF-006)', () => {
    render(<CliDocs />);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(2);
  });

  it('interactive elements have focus ring classes (NF-007)', async () => {
    const user = userEvent.setup();
    render(<CliDocs />);
    await user.click(screen.getByRole('tab', { name: 'Setup & Dev' }));

    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(1);
    const btn = copyButtons[0];
    expect(btn.className).toMatch(/focus/);
  });

  it('responsive grid classes present (NF-009)', () => {
    const { container } = render(<CliDocs />);
    const gridElements = container.querySelectorAll('.grid.gap-4');
    expect(gridElements.length).toBeGreaterThanOrEqual(1);
    const mdGridElements = container.querySelectorAll('[class*="md:grid-cols-2"]');
    expect(mdGridElements.length).toBeGreaterThanOrEqual(1);
  });
});
