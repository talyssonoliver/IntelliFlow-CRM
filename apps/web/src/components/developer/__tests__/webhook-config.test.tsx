import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WebhookConfig } from '../webhook-config';

describe('WebhookConfig', () => {
  const defaultProps = {
    value: '',
    onChange: vi.fn(),
    environment: 'production' as const,
  };

  // WC-001: Renders with data-testid="webhook-config"
  it('WC-001: renders with data-testid="webhook-config"', () => {
    render(<WebhookConfig {...defaultProps} />);
    expect(screen.getByTestId('webhook-config')).toBeInTheDocument();
  });

  // WC-002: Renders URL input with placeholder
  it('WC-002: renders URL input with placeholder "https://example.com/webhooks"', () => {
    render(<WebhookConfig {...defaultProps} />);
    expect(screen.getByPlaceholderText('https://example.com/webhooks')).toBeInTheDocument();
  });

  // WC-003: Displays production hint text
  it('WC-003: displays production hint text', () => {
    render(<WebhookConfig {...defaultProps} environment="production" />);
    expect(screen.getByText('Production webhooks require HTTPS.')).toBeInTheDocument();
  });

  // WC-004: Displays sandbox hint text
  it('WC-004: displays sandbox hint text', () => {
    render(<WebhookConfig {...defaultProps} environment="sandbox" />);
    expect(screen.getByText('Sandbox allows HTTP for local development.')).toBeInTheDocument();
  });

  // WC-005: Calls onChange when URL is typed
  it('WC-005: calls onChange when URL is typed', async () => {
    const onChange = vi.fn();
    render(<WebhookConfig {...defaultProps} onChange={onChange} />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(input, { target: { value: 'https://test.com/hook' } });
    expect(onChange).toHaveBeenCalledWith('https://test.com/hook');
  });

  // WC-006: Displays error message with role="alert"
  it('WC-006: displays error message with role="alert"', () => {
    render(<WebhookConfig {...defaultProps} error="Invalid URL" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid URL');
  });

  // WC-007: Sets aria-invalid="true" when error prop is provided
  it('WC-007: sets aria-invalid="true" when error prop is provided', () => {
    render(<WebhookConfig {...defaultProps} error="Invalid URL" />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  // WC-008: Sets aria-describedby linking to error message
  it('WC-008: sets aria-describedby linking to error message', () => {
    render(<WebhookConfig {...defaultProps} error="Invalid URL" />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    const errorId = input.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    const errorEl = document.getElementById(errorId!);
    expect(errorEl).toHaveTextContent('Invalid URL');
  });

  // WC-009: No error displayed when error prop is undefined
  it('WC-009: no error displayed when error prop is undefined', () => {
    render(<WebhookConfig {...defaultProps} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // WC-010: Input has associated label via htmlFor/id
  it('WC-010: input has associated label via htmlFor/id', () => {
    render(<WebhookConfig {...defaultProps} />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    const label = screen.getByText(/webhook url/i);
    expect(label).toHaveAttribute('for', input.id);
  });

  // WC-011: Empty value renders correctly
  it('WC-011: empty value renders correctly', () => {
    render(<WebhookConfig {...defaultProps} value="" />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  // WC-012: Pre-populated URL renders in input
  it('WC-012: pre-populated URL renders in input', () => {
    render(<WebhookConfig {...defaultProps} value="https://existing.com/hook" />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks') as HTMLInputElement;
    expect(input.value).toBe('https://existing.com/hook');
  });

  // WC-013: Focus on input shows focus-visible:ring-2
  it('WC-013: input has focus-visible ring class', () => {
    render(<WebhookConfig {...defaultProps} />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    expect(input.className).toMatch(/focus-visible/);
  });

  // WC-014: Error message not present when no error
  it('WC-014: error message not present when no error', () => {
    render(<WebhookConfig {...defaultProps} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  // WC-015: Correct input type is "url"
  it('WC-015: correct input type is "url"', () => {
    render(<WebhookConfig {...defaultProps} />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    expect(input).toHaveAttribute('type', 'url');
  });

  // WC-016: Handles rapid value changes
  it('WC-016: handles rapid value changes', () => {
    const onChange = vi.fn();
    render(<WebhookConfig {...defaultProps} onChange={onChange} />);
    const input = screen.getByPlaceholderText('https://example.com/webhooks');
    fireEvent.change(input, { target: { value: 'h' } });
    fireEvent.change(input, { target: { value: 'ht' } });
    fireEvent.change(input, { target: { value: 'htt' } });
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  // WC-017: Environment change updates hint text dynamically
  it('WC-017: environment change updates hint text dynamically', () => {
    const { rerender } = render(<WebhookConfig {...defaultProps} environment="production" />);
    expect(screen.getByText('Production webhooks require HTTPS.')).toBeInTheDocument();
    rerender(<WebhookConfig {...defaultProps} environment="sandbox" />);
    expect(screen.getByText('Sandbox allows HTTP for local development.')).toBeInTheDocument();
  });

  // WC-018: Error clears when error prop changes to undefined
  it('WC-018: error clears when error prop changes to undefined', () => {
    const { rerender } = render(<WebhookConfig {...defaultProps} error="Bad URL" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<WebhookConfig {...defaultProps} error={undefined} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
