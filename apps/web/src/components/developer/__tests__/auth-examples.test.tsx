import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthExamples } from '../auth-examples';

// Ensure clipboard API is available in jsdom
beforeAll(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthExamples', () => {
  it('renders with data-testid="auth-examples"', () => {
    render(<AuthExamples />);
    expect(screen.getByTestId('auth-examples')).toBeInTheDocument();
  });

  it('shows h2 "Code Examples" with id="code-examples"', () => {
    render(<AuthExamples />);
    const h2 = screen.getByRole('heading', { level: 2, name: 'Code Examples' });
    expect(h2).toHaveAttribute('id', 'code-examples');
  });

  it('renders 4 language tabs', () => {
    render(<AuthExamples />);
    expect(screen.getByRole('tab', { name: 'TypeScript' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Python' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'cURL' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JavaScript' })).toBeInTheDocument();
  });

  it('TypeScript tab is active by default with code examples', () => {
    render(<AuthExamples />);
    expect(screen.getAllByText(/createTRPCClient/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Login with MFA Handling/).length).toBeGreaterThanOrEqual(1);
  });

  it('switches to Python tab and shows Python code', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'Python' }));
    const content = container.textContent || '';
    expect(content).toContain('import requests');
    expect(content).toContain('mfa_response');
  });

  it('switches to cURL tab and shows cURL code', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'cURL' }));
    const content = container.textContent || '';
    expect(content).toContain('curl -X POST');
  });

  it('switches to JavaScript tab and shows fetch code', async () => {
    const user = userEvent.setup();
    render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'JavaScript' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.textContent).toContain('response.json');
  });

  it('TypeScript examples use placeholder tokens (no real secrets)', () => {
    const { container } = render(<AuthExamples />);
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      const text = block.textContent || '';
      expect(text).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(text).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/);
    });
  });

  it('Python examples use placeholder tokens (no real secrets)', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'Python' }));
    const codeBlocks = container.querySelectorAll('pre code');
    codeBlocks.forEach((block) => {
      const text = block.textContent || '';
      expect(text).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(text).not.toMatch(/ghp_[a-zA-Z0-9]{20,}/);
    });
  });

  it('TypeScript tab has copy buttons with correct labels', () => {
    render(<AuthExamples />);
    const copyButtons = screen.getAllByRole('button', { name: /Copy.*to clipboard/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(3);
  });

  it('copy button click shows check icon feedback', async () => {
    const user = userEvent.setup();
    render(<AuthExamples />);
    const copyButtons = screen.getAllByRole('button', { name: /Copy.*to clipboard/i });
    await user.click(copyButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByText('check').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('sr-only live region announces copy feedback', async () => {
    const user = userEvent.setup();
    render(<AuthExamples />);
    const copyButtons = screen.getAllByRole('button', { name: /Copy.*to clipboard/i });
    await user.click(copyButtons[0]);
    await waitFor(() => {
      expect(screen.getAllByText('Copied to clipboard').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('code blocks have brand font-mono bg-muted styling', () => {
    render(<AuthExamples />);
    const pres = document.querySelectorAll('pre');
    pres.forEach((pre) => {
      expect(pre.className).toContain('font-mono');
      expect(pre.className).toContain('bg-muted');
      expect(pre.className).toContain('rounded-lg');
    });
  });

  it('Python tab has multiple code blocks with labels', async () => {
    const user = userEvent.setup();
    const { container } = render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'Python' }));
    const content = container.textContent || '';
    expect(content).toContain('Login with MFA Handling');
    expect(content).toContain('Authenticated API Call');
  });

  it('copy feedback resets after 2 seconds', async () => {
    vi.useFakeTimers();
    const { act } = await import('react');
    render(<AuthExamples />);
    const copyButtons = screen.getAllByRole('button', { name: /Copy.*to clipboard/i });
    // Use fireEvent (not userEvent) to avoid timer conflicts
    await act(async () => {
      copyButtons[0].click();
    });
    expect(screen.getAllByText('check').length).toBeGreaterThanOrEqual(1);
    // Advance past the 2s reset timeout
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(screen.queryByText('check')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('cURL tab renders code blocks with copy buttons', async () => {
    const user = userEvent.setup();
    render(<AuthExamples />);
    await user.click(screen.getByRole('tab', { name: 'cURL' }));
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelectorAll('pre code').length).toBeGreaterThanOrEqual(2);
    const copyButtons = screen.getAllByRole('button', { name: /Copy.*to clipboard/i });
    expect(copyButtons.length).toBeGreaterThanOrEqual(2);
  });
});
