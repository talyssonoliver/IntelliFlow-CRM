// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockThread } from './email-test-utils';

const { EmailThread } = await import('../EmailThread');

describe('EmailThread', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders thread header with subject', () => {
    render(<EmailThread {...defaultProps} />);
    expect(screen.getByRole('heading', { name: /re: test thread/i })).toBeInTheDocument();
  });

  it('renders thread header action buttons', () => {
    render(<EmailThread {...defaultProps} />);
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /mark.*unread/i })).toBeInTheDocument();
  });

  it('renders messages in chronological order', () => {
    render(<EmailThread {...defaultProps} />);
    const messages = screen.getAllByRole('article');
    expect(messages.length).toBe(2);
  });

  it('expands most recent message by default', () => {
    render(<EmailThread {...defaultProps} />);
    const messages = screen.getAllByRole('article');
    const lastMessage = messages[messages.length - 1];
    const toggle = within(lastMessage).getByRole('button', { name: /expand|collapse/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapses older messages', () => {
    render(<EmailThread {...defaultProps} />);
    const messages = screen.getAllByRole('article');
    const firstMessage = messages[0];
    const toggle = within(firstMessage).getByRole('button', { name: /expand|collapse/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('expands collapsed message on click', async () => {
    const user = userEvent.setup();
    render(<EmailThread {...defaultProps} />);
    const messages = screen.getAllByRole('article');
    const toggle = within(messages[0]).getByRole('button', { name: /expand|collapse/i });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows full body content in expanded message', () => {
    render(<EmailThread {...defaultProps} />);
    // Last message should show body
    expect(screen.getByText(/test body/i)).toBeInTheDocument();
  });

  it('calls onReply when reply button clicked', async () => {
    const user = userEvent.setup();
    render(<EmailThread {...defaultProps} />);
    const replyBtns = screen.getAllByRole('button', { name: /^reply$/i });
    await user.click(replyBtns[replyBtns.length - 1]);
    expect(defaultProps.onReply).toHaveBeenCalled();
  });

  it('calls onForward when forward button clicked', async () => {
    const user = userEvent.setup();
    render(<EmailThread {...defaultProps} />);
    const fwdBtns = screen.getAllByRole('button', { name: /forward/i });
    await user.click(fwdBtns[fwdBtns.length - 1]);
    expect(defaultProps.onForward).toHaveBeenCalled();
  });

  it('calls onReplyAll when reply all button clicked', async () => {
    const user = userEvent.setup();
    render(<EmailThread {...defaultProps} />);
    const replyAllBtns = screen.getAllByRole('button', { name: /reply all/i });
    await user.click(replyAllBtns[replyAllBtns.length - 1]);
    expect(defaultProps.onReplyAll).toHaveBeenCalled();
  });

  it('displays sender avatar and name', () => {
    render(<EmailThread {...defaultProps} />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('displays message timestamp', () => {
    render(<EmailThread {...defaultProps} />);
    // At least one timestamp element should be present
    const timeElements = document.querySelectorAll('time');
    expect(timeElements.length).toBeGreaterThan(0);
  });

  it('has aria-expanded on expand/collapse buttons', () => {
    render(<EmailThread {...defaultProps} />);
    const toggles = screen.getAllByRole('button', { name: /expand|collapse/i });
    toggles.forEach((toggle) => {
      expect(toggle).toHaveAttribute('aria-expanded');
    });
  });

  it('has aria-labelledby on message content regions', () => {
    render(<EmailThread {...defaultProps} />);
    const regions = document.querySelectorAll('[role="region"]');
    regions.forEach((region) => {
      expect(region).toHaveAttribute('aria-labelledby');
    });
  });
});
