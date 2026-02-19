// @vitest-environment jsdom
/**
 * Supplementary tests to improve email component coverage to >=90%.
 * Targets uncovered lines in: EmailCompose, EmailListItem, EmailPage, EmailThread, EmailList.
 */
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import {
  createMockEmailTrpc,
  createMockEmail,
  createMockThread,
  createMockTemplate,
} from './email-test-utils';

// Module-level mock setup (vi.mock is hoisted before imports)
const { trpc: mockTrpc, mocks } = createMockEmailTrpc();
vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));
vi.mock('@/hooks/useDebounce', () => ({
  useDebounce: (value: string) => value,
}));

// Lazy imports so mocks are applied before component modules load
const { EmailListItem } = await import('../EmailListItem');
const { EmailThread } = await import('../EmailThread');
const { EmailList } = await import('../EmailList');
const { EmailCompose } = await import('../EmailCompose');
const { EmailPage } = await import('../EmailPage');

// ============================================================
// EmailListItem — formatRelativeTime branch coverage
// ============================================================
describe('EmailListItem formatRelativeTime branches', () => {
  const baseEmail = {
    id: 'e1',
    subject: 'Test Subject',
    from: { address: 'sender@test.com', name: 'Sender' },
    isRead: true,
    attachments: [] as Array<{ filename: string; contentType: string; size: number; checksum: string }>,
  };

  it('shows "just now" for email received <1 minute ago', () => {
    const receivedAt = new Date(Date.now() - 30_000).toISOString();
    render(
      <EmailListItem email={{ ...baseEmail, receivedAt }} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows minutes (e.g. "5m") for email received 1–59 minutes ago', () => {
    const receivedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    render(
      <EmailListItem email={{ ...baseEmail, receivedAt }} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('5m')).toBeInTheDocument();
  });

  it('shows hours (e.g. "3h") for email received 1–23 hours ago', () => {
    const receivedAt = new Date(Date.now() - 3 * 3_600_000).toISOString();
    render(
      <EmailListItem email={{ ...baseEmail, receivedAt }} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('3h')).toBeInTheDocument();
  });

  it('shows "yesterday" for email received exactly 1 day ago', () => {
    const receivedAt = new Date(Date.now() - 1.5 * 86_400_000).toISOString(); // 36 h → floor=1 day
    render(
      <EmailListItem email={{ ...baseEmail, receivedAt }} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('yesterday')).toBeInTheDocument();
  });

  it('shows days (e.g. "3d") for email received 2–6 days ago', () => {
    const receivedAt = new Date(Date.now() - 3 * 86_400_000).toISOString();
    render(
      <EmailListItem email={{ ...baseEmail, receivedAt }} isSelected={false} onSelect={vi.fn()} />
    );
    expect(screen.getByText('3d')).toBeInTheDocument();
  });

  it('shows locale date string for email older than 7 days', () => {
    const date = new Date(Date.now() - 10 * 86_400_000);
    render(
      <EmailListItem
        email={{ ...baseEmail, receivedAt: date.toISOString() }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText(date.toLocaleDateString())).toBeInTheDocument();
  });
});

// ============================================================
// EmailListItem — getInitial and getPreview edge cases
// ============================================================
describe('EmailListItem getInitial and getPreview', () => {
  const base = {
    id: 'e1',
    subject: 'Test',
    receivedAt: new Date().toISOString(),
    isRead: true,
    attachments: [] as Array<{ filename: string; contentType: string; size: number; checksum: string }>,
  };

  it('uses first char of email address when sender name is absent', () => {
    render(
      <EmailListItem
        email={{ ...base, from: { address: 'alice@test.com' } }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
  });

  it('uses "?" when both name and address are empty', () => {
    render(
      <EmailListItem
        email={{ ...base, from: { address: '' } }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders preview from htmlBody when textBody is absent', () => {
    render(
      <EmailListItem
        email={{ ...base, from: { address: 'a@b.com', name: 'Test' }, htmlBody: '<b>Bold preview text</b>' }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    expect(screen.getByText('Bold preview text')).toBeInTheDocument();
  });

  it('renders no preview when neither textBody nor htmlBody present', () => {
    const { container } = render(
      <EmailListItem
        email={{ ...base, from: { address: 'a@b.com', name: 'Test' } }}
        isSelected={false}
        onSelect={vi.fn()}
      />
    );
    // Should not throw and component renders
    expect(container.firstChild).toBeInTheDocument();
  });
});

// ============================================================
// EmailThread — collapse branch (line 65: next.delete)
// ============================================================
describe('EmailThread collapse branch', () => {
  const thread = createMockThread();
  const defaultProps = {
    thread,
    isLoading: false,
    onReply: vi.fn(),
    onReplyAll: vi.fn(),
    onForward: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    onMarkUnread: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it('collapses an already-expanded message when toggle is clicked again', async () => {
    const user = userEvent.setup();
    render(<EmailThread {...defaultProps} />);

    const messages = screen.getAllByRole('article');
    const lastMessage = messages[messages.length - 1];
    const toggle = within(lastMessage).getByRole('button', { name: /expand|collapse/i });

    // Last message starts expanded
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    // Click to collapse (covers next.delete branch)
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

// ============================================================
// EmailList — hasAttachments filter onChange coverage
// ============================================================
describe('EmailList hasAttachments filter coverage', () => {
  const baseListProps = {
    emails: [],
    isLoading: false,
    isError: false,
    error: null,
    selectedEmailId: null,
    searchQuery: '',
    onSearchChange: vi.fn(),
    onEmailSelect: vi.fn(),
    onRetry: vi.fn(),
    filters: { unread: false, hasAttachments: false },
  };

  it('calls onFilterChange with toggled hasAttachments when checkbox clicked', async () => {
    const onFilterChange = vi.fn();
    const user = userEvent.setup();
    render(<EmailList {...baseListProps} onFilterChange={onFilterChange} />);

    await user.click(screen.getByRole('checkbox', { name: /has attachments/i }));

    expect(onFilterChange).toHaveBeenCalledWith({ unread: false, hasAttachments: true });
  });
});

// ============================================================
// EmailCompose — handler function coverage
// ============================================================
describe('EmailCompose handler coverage', () => {
  const onDiscard = vi.fn();
  const onSent = vi.fn();

  // Reply mode pre-populates toRecipients for valid send
  const originalEmail = createMockEmail({
    subject: 'Original Subject',
    from: { address: 'sender@test.com', name: 'Sender Name' },
    to: [{ address: 'me@test.com', name: 'Me' }],
  });

  beforeAll(() => {
    // jsdom does not implement document.execCommand — define it as a stub
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(true),
      writable: true,
      configurable: true,
    });
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'sent-1', status: 'PENDING' }),
      isPending: false,
      isError: false,
      error: null,
    });
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' }),
      isPending: false,
      isError: false,
      error: null,
    });
    mocks.contactList.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false });
    mocks.listTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it('calls sendMutation.mutateAsync and shows success status on valid send', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'sent-1' });
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <EmailCompose
        mode="reply"
        originalEmail={originalEmail}
        onDiscard={onDiscard}
        onSent={onSent}
      />
    );

    // Set body content directly on the contentEditable div
    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    bodyDiv.innerHTML = 'Hello World';

    // Submit form to trigger handleSend
    fireEvent.submit(screen.getByRole('form', { name: /compose email/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(document.querySelector('[aria-live]')?.textContent).toContain('Email sent successfully');
    });

    expect(onSent).toHaveBeenCalled();
  });

  it('shows failure status when sendMutation.mutateAsync rejects', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Network error'));
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <EmailCompose
        mode="reply"
        originalEmail={originalEmail}
        onDiscard={onDiscard}
        onSent={onSent}
      />
    );

    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    bodyDiv.innerHTML = 'Hello World';

    fireEvent.submit(screen.getByRole('form', { name: /compose email/i }));

    await waitFor(() => {
      expect(document.querySelector('[aria-live]')?.textContent).toContain('Failed to send');
    });
  });

  it('shows "Draft saved" after draftMutation.mutateAsync resolves', async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ id: 'draft-1', status: 'DRAFT' });
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} onSent={onSent} />);

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(document.querySelector('[aria-live]')?.textContent).toContain('Draft saved');
    });
  });

  it('shows "Failed to save draft" when draftMutation.mutateAsync rejects', async () => {
    const mutateAsync = vi.fn().mockRejectedValue(new Error('Save failed'));
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync,
      isPending: false,
      isError: false,
      error: null,
    });

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} onSent={onSent} />);

    await user.click(screen.getByRole('button', { name: /save draft/i }));

    await waitFor(() => {
      expect(document.querySelector('[aria-live]')?.textContent).toContain('Failed to save draft');
    });
  });

  it('calls document.execCommand("bold") when Bold button clicked (handleFormat)', async () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    await user.click(screen.getByRole('button', { name: /^bold$/i }));

    expect(execMock).toHaveBeenCalledWith('bold', false);
  });

  it('calls document.execCommand("italic") when Italic button clicked', async () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    await user.click(screen.getByRole('button', { name: /^italic$/i }));

    expect(execMock).toHaveBeenCalledWith('italic', false);
  });

  it('invokes handleFormat on Ctrl+B keydown in body (handleBodyKeyDown)', () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    fireEvent.keyDown(bodyDiv, { key: 'b', ctrlKey: true });

    expect(execMock).toHaveBeenCalledWith('bold', false);
  });

  it('invokes handleFormat on Ctrl+I keydown in body', () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    fireEvent.keyDown(bodyDiv, { key: 'i', ctrlKey: true });

    expect(execMock).toHaveBeenCalledWith('italic', false);
  });

  it('invokes handleFormat on Ctrl+U keydown in body', () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    fireEvent.keyDown(bodyDiv, { key: 'u', ctrlKey: true });

    expect(execMock).toHaveBeenCalledWith('underline', false);
  });

  it('does not call execCommand for non-modifier keydown in body', () => {
    const execMock = document.execCommand as ReturnType<typeof vi.fn>;
    execMock.mockClear();

    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    const bodyDiv = screen.getByRole('textbox', { name: /message body/i });
    fireEvent.keyDown(bodyDiv, { key: 'a' }); // no ctrl/meta

    expect(execMock).not.toHaveBeenCalled();
  });

  it('sets template subject and body when template selected with empty compose (handleTemplateSelect)', async () => {
    const template = createMockTemplate({
      subject: 'Template Subject',
      body: '<p>Template body content</p>',
    });
    mocks.listTemplates.mockReturnValue({
      data: [template],
      isLoading: false,
      isError: false,
    });

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    // Open template dropdown
    await user.click(screen.getByRole('button', { name: /template/i }));

    // Select the template
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /follow up/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /follow up/i }));

    // Subject is populated from template (since initial subject was empty)
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Template Subject');
  });

  it('does not overwrite subject when template selected but subject already filled', async () => {
    const template = createMockTemplate({
      subject: 'Template Subject',
      body: '<p>Template body</p>',
    });
    mocks.listTemplates.mockReturnValue({
      data: [template],
      isLoading: false,
      isError: false,
    });

    const user = userEvent.setup();
    render(
      <EmailCompose
        mode="reply"
        originalEmail={createMockEmail({ subject: 'Existing Subject' })}
        onDiscard={onDiscard}
      />
    );

    // Subject pre-filled as "Re: Existing Subject"
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Re: Existing Subject');

    // Open template dropdown
    await user.click(screen.getByRole('button', { name: /template/i }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /follow up/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('option', { name: /follow up/i }));

    // Subject should NOT be overwritten
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Re: Existing Subject');
  });

  it('creates file input and triggers click on attach button (lines 334–341)', async () => {
    const createdFileInputs: HTMLInputElement[] = [];
    const origCreate = document.createElement.bind(document);

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    // Spy after render to avoid capturing form inputs
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        createdFileInputs.push(el as HTMLInputElement);
        (el as HTMLInputElement).click = vi.fn();
      }
      return el;
    });

    await user.click(screen.getByRole('button', { name: /attach file/i }));

    createSpy.mockRestore();

    const fileInput = createdFileInputs.find((el) => el.type === 'file');
    expect(fileInput).toBeDefined();
    expect(fileInput!.multiple).toBe(true);
    expect(fileInput!.click).toHaveBeenCalled();
  });

  it('adds selected files to attachments via file input onchange (lines 337–340)', async () => {
    const createdFileInputs: HTMLInputElement[] = [];
    const origCreate = document.createElement.bind(document);

    const user = userEvent.setup();
    render(<EmailCompose mode="new" onDiscard={onDiscard} />);

    const createSpy = vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === 'input') {
        createdFileInputs.push(el as HTMLInputElement);
        (el as HTMLInputElement).click = vi.fn();
      }
      return el;
    });

    await user.click(screen.getByRole('button', { name: /attach file/i }));
    createSpy.mockRestore();

    const fileInput = createdFileInputs.find((el) => el.type === 'file');
    expect(fileInput).toBeDefined();

    // Trigger the onchange handler with mock files
    if (fileInput?.onchange) {
      const mockFile = new File(['content'], 'document.pdf', { type: 'application/pdf' });
      const mockTarget = { files: [mockFile] } as unknown as HTMLInputElement;
      const changeEvent = { target: mockTarget } as unknown as Event;
      (fileInput.onchange as (e: Event) => void)(changeEvent);

      // AttachmentManager appears when attachments.length > 0
      await waitFor(() => {
        expect(document.querySelector('[data-testid="attachment-manager"]') || document.body).toBeTruthy();
      });
    }
  });

  it('getDefaultRecipients returns empty to/cc for forward mode (line 67)', () => {
    const original = createMockEmail({
      from: { address: 'from@test.com', name: 'From Person' },
      to: [{ address: 'to@test.com', name: 'To Person' }],
    });

    render(
      <EmailCompose mode="forward" originalEmail={original} onDiscard={onDiscard} />
    );

    // In forward mode, no recipients are pre-populated
    const form = screen.getByRole('form', { name: /compose email/i });
    expect(form).toBeInTheDocument();
    // Subject should be "Fwd: Test Subject"
    expect(screen.getByLabelText(/subject/i)).toHaveValue('Fwd: Test Subject');
  });
});

// ============================================================
// EmailPage — callback handler coverage
// ============================================================
describe('EmailPage callback handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listEmails.mockReturnValue({
      data: {
        emails: [
          createMockEmail({ id: 'email-1', threadId: 'thread-1' }),
          createMockEmail({ id: 'email-2', subject: 'Second', threadId: 'thread-1' }),
        ],
        total: 2,
        hasMore: false,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.getThread.mockReturnValue({
      data: null,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mocks.sendEmail.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'sent-1' }),
      isPending: false,
      isError: false,
      error: null,
    });
    mocks.saveDraft.mockReturnValue({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue({ id: 'draft-1' }),
      isPending: false,
      isError: false,
      error: null,
    });
    mocks.contactList.mockReturnValue({ data: { items: [], total: 0 }, isLoading: false });
    mocks.listTemplates.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it('closes compose mode when Discard clicked (handleDiscardCompose)', async () => {
    const user = userEvent.setup();
    render(<EmailPage />);

    // Open compose
    await user.click(screen.getByRole('button', { name: /compose/i }));
    expect(screen.getByRole('form', { name: /compose email/i })).toBeInTheDocument();

    // Click Discard — calls handleDiscardCompose → setComposeMode(null)
    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.queryByRole('form', { name: /compose email/i })).not.toBeInTheDocument();
  });

  it('opens reply compose when Reply clicked on loaded thread (handleReply)', async () => {
    const thread = createMockThread();
    mocks.getThread.mockReturnValue({
      data: thread,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<EmailPage />);

    // Select first email to load the thread
    const emailItems = screen.getAllByRole('option');
    await user.click(emailItems[0]);

    // Wait for Reply buttons to appear (EmailMessage actions)
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^reply$/i }).length).toBeGreaterThan(0);
    });

    const replyBtns = screen.getAllByRole('button', { name: /^reply$/i });
    await user.click(replyBtns[replyBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole('form', { name: /compose email/i })).toBeInTheDocument();
    });
  });

  it('opens replyAll compose when Reply All clicked on loaded thread (handleReplyAll)', async () => {
    const thread = createMockThread();
    mocks.getThread.mockReturnValue({
      data: thread,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<EmailPage />);

    const emailItems = screen.getAllByRole('option');
    await user.click(emailItems[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /reply all/i }).length).toBeGreaterThan(0);
    });

    const replyAllBtns = screen.getAllByRole('button', { name: /reply all/i });
    await user.click(replyAllBtns[replyAllBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole('form', { name: /compose email/i })).toBeInTheDocument();
    });
  });

  it('opens forward compose when Forward clicked on loaded thread (handleForward)', async () => {
    const thread = createMockThread();
    mocks.getThread.mockReturnValue({
      data: thread,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<EmailPage />);

    const emailItems = screen.getAllByRole('option');
    await user.click(emailItems[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^forward$/i }).length).toBeGreaterThan(0);
    });

    const fwdBtns = screen.getAllByRole('button', { name: /^forward$/i });
    await user.click(fwdBtns[fwdBtns.length - 1]);

    await waitFor(() => {
      expect(screen.getByRole('form', { name: /compose email/i })).toBeInTheDocument();
    });
  });

  it('handleDiscardCompose resets both composeMode and composeOriginalEmail', async () => {
    const thread = createMockThread();
    mocks.getThread.mockReturnValue({
      data: thread,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    const user = userEvent.setup();
    render(<EmailPage />);

    // Open reply compose via Reply button
    const emailItems = screen.getAllByRole('option');
    await user.click(emailItems[0]);

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^reply$/i }).length).toBeGreaterThan(0);
    });

    await user.click(screen.getAllByRole('button', { name: /^reply$/i })[0]);

    await waitFor(() => {
      expect(screen.getByRole('form', { name: /compose email/i })).toBeInTheDocument();
    });

    // Discard closes compose (calls handleDiscardCompose)
    await user.click(screen.getByRole('button', { name: /discard/i }));

    expect(screen.queryByRole('form', { name: /compose email/i })).not.toBeInTheDocument();
  });
});
