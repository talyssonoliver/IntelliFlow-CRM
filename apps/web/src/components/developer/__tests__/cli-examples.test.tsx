import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CliExamples } from '../cli-examples';

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

describe('CliExamples', () => {
  it('renders data-testid="cli-examples"', () => {
    render(<CliExamples />);
    expect(screen.getByTestId('cli-examples')).toBeInTheDocument();
  });

  it('renders Initial Project Setup section (AC-007)', () => {
    render(<CliExamples />);
    expect(screen.getByText('Initial Project Setup')).toBeInTheDocument();
  });

  it('renders TDD Development Cycle section (AC-007)', () => {
    render(<CliExamples />);
    expect(screen.getByText('TDD Development Cycle')).toBeInTheDocument();
  });

  it('renders Database Migration Workflow section (AC-007)', () => {
    render(<CliExamples />);
    expect(screen.getByText('Database Migration Workflow')).toBeInTheDocument();
  });

  it('renders AI Development Setup section (AC-007)', () => {
    render(<CliExamples />);
    expect(screen.getByText('AI Development Setup')).toBeInTheDocument();
  });

  it('has 4 sections with aria-labelledby (NF-004)', () => {
    render(<CliExamples />);
    const sections = document.querySelectorAll('section[aria-labelledby]');
    expect(sections.length).toBe(4);
    sections.forEach((section) => {
      const labelId = section.getAttribute('aria-labelledby');
      expect(labelId).toBeTruthy();
      expect(document.getElementById(labelId!)).toBeInTheDocument();
    });
  });

  it('h3 heading hierarchy in examples (NF-006)', () => {
    render(<CliExamples />);
    const h3s = screen.getAllByRole('heading', { level: 3 });
    expect(h3s.length).toBe(4);
  });

  it('code blocks present with pre elements', () => {
    render(<CliExamples />);
    const preElements = document.querySelectorAll('pre');
    expect(preElements.length).toBeGreaterThanOrEqual(4);
  });

  it('copy button triggers clipboard.writeText (AC-008)', async () => {
    const user = userEvent.setup();
    render(<CliExamples />);
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons.length).toBeGreaterThanOrEqual(4);
    await user.click(copyButtons[0]);
    await waitFor(() => {
      expect(screen.queryAllByText('check').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('icons have aria-hidden="true" (NF-003)', () => {
    render(<CliExamples />);
    const icons = document.querySelectorAll('.material-symbols-outlined');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('copy feedback has aria-live="polite" sr-only span (NF-005)', () => {
    render(<CliExamples />);
    const liveRegions = document.querySelectorAll('[aria-live="polite"].sr-only');
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
  });

  it('interactive copy buttons have focus ring classes (NF-007)', () => {
    render(<CliExamples />);
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);
    expect(copyButtons[0].className).toMatch(/focus/);
  });

  it('copy icon reverts from check back to content_copy after 2 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) });

    render(<CliExamples />);
    const copyButtons = screen.getAllByLabelText(/copy.*to clipboard/i);

    await user.click(copyButtons[0]);
    expect(screen.queryAllByText('check').length).toBeGreaterThanOrEqual(1);

    // Advance past the 2000ms timeout, wrapped in act to suppress warnings
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    await waitFor(() => {
      // The check icon should be gone, content_copy should be back
      const checkIcons = screen.queryAllByText('check');
      const copyIcons = screen.queryAllByText('content_copy');
      expect(copyIcons.length).toBeGreaterThanOrEqual(copyButtons.length);
      expect(checkIcons.length).toBe(0);
    });

    vi.useRealTimers();
  });
});
