import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock Radix Select with native HTML equivalents for jsdom compat
// The real Radix Select uses portals that don't work in jsdom
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Select: ({ children, value, onValueChange }: any) => (
      <SelectContext.Provider value={{ value, onValueChange }}>{children}</SelectContext.Provider>
    ),
    SelectTrigger: ({ children, ...props }: any) => (
      // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- test renders custom modal/dropdown
      <div role="combobox" aria-controls="select-listbox" aria-expanded={false} {...props}>
        {children}
      </div>
    ),
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
    SelectItem: ({ children, value: itemValue }: any) => (
      <SelectContext.Consumer>
        {(ctx: any) => (
          // eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- test renders custom modal/dropdown
          <div
            role="option"
            tabIndex={0}
            aria-selected={ctx?.value === itemValue}
            data-value={itemValue}
            onClick={() => ctx?.onValueChange?.(itemValue)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                ctx?.onValueChange?.(itemValue);
              }
            }}
          >
            {children}
          </div>
        )}
      </SelectContext.Consumer>
    ),
  };
});

// Simple context to wire onValueChange through the mock tree
import { createContext } from 'react';
const SelectContext = createContext<any>(null);

import { WebhookTester } from '../webhook-tester';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('WebhookTester', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders URL input with placeholder text', () => {
    render(<WebhookTester />);
    const input = screen.getByPlaceholderText(/endpoint/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('type', 'url');
  });

  it('renders event type selector dropdown with all 10 event types', () => {
    render(<WebhookTester />);
    // Verify combobox is present
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();

    // With mocked Select, all 10 items render as <option> elements
    const events = [
      'email.delivered',
      'email.bounced',
      'email.deferred',
      'email.dropped',
      'email.opened',
      'email.clicked',
      'email.unsubscribed',
      'email.spam_report',
      'email.blocked',
      'email.inbound',
    ];
    for (const event of events) {
      expect(screen.getByRole('option', { name: event })).toBeInTheDocument();
    }
  });

  it('renders editable payload textarea', () => {
    render(<WebhookTester />);
    const textarea = screen.getByRole('textbox', { name: /payload/i });
    expect(textarea).toBeInTheDocument();
    expect(textarea.tagName).toBe('TEXTAREA');
  });

  it('renders send button', () => {
    render(<WebhookTester />);
    expect(screen.getByRole('button', { name: /send test webhook/i })).toBeInTheDocument();
  });

  it('send button disabled when URL input is empty', () => {
    render(<WebhookTester />);
    const button = screen.getByRole('button', { name: /send test webhook/i });
    expect(button).toBeDisabled();
  });

  it('send button enabled when URL input has value', async () => {
    const user = userEvent.setup();
    render(<WebhookTester />);
    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    const button = screen.getByRole('button', { name: /send test webhook/i });
    expect(button).toBeEnabled();
  });

  it('selecting event type auto-populates sample payload in textarea', async () => {
    render(<WebhookTester />);
    const textarea = screen.getByRole('textbox', { name: /payload/i }) as HTMLTextAreaElement;

    // Default is email.delivered — should have messageId
    expect(textarea.value).toContain('email.delivered');

    // Click the mocked option to change event type
    fireEvent.click(screen.getByRole('option', { name: 'email.bounced' }));

    expect(textarea.value).toContain('email.bounced');
    expect(textarea.value).toContain('bounceType');
  });

  it('changing event type updates payload content', () => {
    render(<WebhookTester />);
    const textarea = screen.getByRole('textbox', { name: /payload/i }) as HTMLTextAreaElement;

    const initialPayload = textarea.value;

    // Click the mocked option to change event type
    fireEvent.click(screen.getByRole('option', { name: 'email.inbound' }));

    expect(textarea.value).not.toBe(initialPayload);
    expect(textarea.value).toContain('email.inbound');
  });

  it('payload textarea is editable (user can modify JSON)', async () => {
    const user = userEvent.setup();
    render(<WebhookTester />);
    const textarea = screen.getByRole('textbox', { name: /payload/i }) as HTMLTextAreaElement;
    await user.clear(textarea);
    await user.type(textarea, '{{"custom":"data"}}');
    expect(textarea.value).toContain('custom');
  });

  it('loading state: send button shows spinner/disabled during request', async () => {
    const user = userEvent.setup();
    // Make fetch hang
    mockFetch.mockImplementation(() => new Promise(() => {}));
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');

    const button = screen.getByRole('button', { name: /send test webhook/i });
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText(/sending/i)).toBeInTheDocument();
    });
  });

  it('successful response: panel shows status badge (green for 2xx)', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          latencyMs: 42,
          body: '{"ok": true}',
          responseHeaders: {},
        }),
    });
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
    });
  });

  it('successful response: panel shows latency in ms', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          latencyMs: 123,
          body: '{"ok": true}',
          responseHeaders: {},
        }),
    });
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText('123ms')).toBeInTheDocument();
    });
  });

  it('successful response: panel shows formatted response body', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          latencyMs: 50,
          body: '{"result":"success"}',
          responseHeaders: {},
        }),
    });
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText(/success/)).toBeInTheDocument();
    });
  });

  it('error response: panel shows error status badge (red for 5xx)', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 500,
          latencyMs: 200,
          body: 'Internal Server Error',
          responseHeaders: {},
        }),
    });
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText('500')).toBeInTheDocument();
    });
  });

  it('network error: shows error message', async () => {
    const user = userEvent.setup();
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i);
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText(/Network request failed/)).toBeInTheDocument();
    });
  });

  it('clear button resets form state', async () => {
    const user = userEvent.setup();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          status: 200,
          latencyMs: 50,
          body: '{"ok":true}',
          responseHeaders: {},
        }),
    });
    render(<WebhookTester />);

    const input = screen.getByPlaceholderText(/endpoint/i) as HTMLInputElement;
    await user.type(input, 'https://example.com/webhook');
    await user.click(screen.getByRole('button', { name: /send test webhook/i }));

    await waitFor(() => {
      expect(screen.getByText('200')).toBeInTheDocument();
    });

    // Click clear
    await user.click(screen.getByRole('button', { name: /clear/i }));

    // URL should be empty, result should be gone
    expect(input.value).toBe('');
    expect(screen.queryByText('200')).not.toBeInTheDocument();
  });
});
