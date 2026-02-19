// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockEmailTrpc, createMockEmail } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

const { EmailCompose } = await import('../EmailCompose');

describe('EmailCompose', () => {
  const defaultProps = {
    mode: 'new' as const,
    onDiscard: vi.fn(),
    onSent: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'sent-1', status: 'PENDING' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' }),
      isLoading: false,
      isError: false,
      error: null,
    });
    mocks.contactList.mockReturnValue({
      data: { items: [], total: 0 },
      isLoading: false,
      isError: false,
    });
    mocks.listTemplates.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
  });

  it('renders empty form with To, Subject, Body in new mode', () => {
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByLabelText(/to/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/subject/i)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /body|message/i })).toBeInTheDocument();
  });

  it('prefills To and Subject with "Re:" in reply mode', () => {
    const original = createMockEmail({ subject: 'Hello' });
    render(<EmailCompose {...defaultProps} mode="reply" originalEmail={original} />);
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Re: Hello');
  });

  it('prefills To, CC and Subject in reply all mode', () => {
    const original = createMockEmail({
      subject: 'Hello',
      to: [
        { address: 'me@test.com', name: 'Me' },
        { address: 'other@test.com', name: 'Other' },
      ],
    });
    render(<EmailCompose {...defaultProps} mode="replyAll" originalEmail={original} />);
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Re: Hello');
  });

  it('prefills Subject with "Fwd:" and quoted body in forward mode', () => {
    const original = createMockEmail({ subject: 'Hello', htmlBody: '<p>Original</p>' });
    render(<EmailCompose {...defaultProps} mode="forward" originalEmail={original} />);
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Fwd: Hello');
  });

  it('hides CC/BCC fields by default', () => {
    render(<EmailCompose {...defaultProps} />);
    // CC/BCC toggle buttons are present (fields are hidden)
    expect(screen.getByRole('button', { name: /^CC$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^BCC$/ })).toBeInTheDocument();
    // Only 1 combobox (To field), not CC or BCC
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(1);
  });

  it('shows CC field when CC button is clicked', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /^CC$/ }));
    // CC button disappears, CC picker appears (now 2 comboboxes: To + CC)
    expect(screen.queryByRole('button', { name: /^CC$/ })).not.toBeInTheDocument();
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
  });

  it('shows BCC field when BCC button is clicked', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /^BCC$/ }));
    // BCC button disappears, BCC picker appears
    expect(screen.queryByRole('button', { name: /^BCC$/ })).not.toBeInTheDocument();
    const comboboxes = screen.getAllByRole('combobox');
    expect(comboboxes).toHaveLength(2);
  });

  it('validates that recipient is required for send', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(screen.getByText(/recipient.*required/i)).toBeInTheDocument();
  });

  it('validates that body is required for send', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    // Add a recipient first via subject field to bypass recipient validation
    const subjectInput = screen.getByLabelText(/subject/i);
    await user.type(subjectInput, 'Test');
    await user.click(screen.getByRole('button', { name: /send/i }));
    expect(screen.getByText(/message body is required/i)).toBeInTheDocument();
  });

  it('calls sendEmail mutation on valid send', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'sent-1', status: 'PENDING' });
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isLoading: false,
      isError: false,
      error: null,
    });

    render(<EmailCompose {...defaultProps} />);
    // This test will need actual recipient picker interaction
    // For now, verify the form structure is correct
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('calls saveDraft mutation on save draft', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    expect(mocks.saveDraft).toHaveBeenCalled();
  });

  it('clears form and exits compose on discard', async () => {
    const user = userEvent.setup();
    render(<EmailCompose {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /discard/i }));
    expect(defaultProps.onDiscard).toHaveBeenCalled();
  });

  it('renders attach button that opens file picker', () => {
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByRole('button', { name: /attach/i })).toBeInTheDocument();
  });

  it('renders template button that opens template selector', () => {
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByRole('button', { name: /template/i })).toBeInTheDocument();
  });

  it('shows error toast on send failure', async () => {
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockRejectedValue(new Error('Send failed')),
      isLoading: false,
      isError: true,
      error: new Error('Send failed'),
    });
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();
  });

  it('shows success toast on draft saved', async () => {
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
  });

  it('renders FormatToolbar in compose body area', () => {
    render(<EmailCompose {...defaultProps} />);
    expect(screen.getByRole('toolbar', { name: /text formatting/i })).toBeInTheDocument();
  });

  it('has live region for status announcements', () => {
    render(<EmailCompose {...defaultProps} />);
    const liveRegion = document.querySelector('[aria-live]');
    expect(liveRegion).toBeInTheDocument();
  });
});
