// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const { FolderSidebar } = await import('../FolderSidebar');

describe('FolderSidebar', () => {
  const defaultProps = {
    activeFolder: 'inbox',
    onFolderSelect: vi.fn(),
    onCompose: vi.fn(),
    unreadCounts: { inbox: 5, drafts: 2 } as Record<string, number>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all 6 folders', () => {
    render(<FolderSidebar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /inbox/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sent/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /archive/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /spam/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /trash/i })).toBeInTheDocument();
  });

  it('highlights active folder with primary color', () => {
    render(<FolderSidebar {...defaultProps} activeFolder="inbox" />);
    const inboxBtn = screen.getByRole('button', { name: /inbox/i });
    expect(inboxBtn.className).toMatch(/primary/);
  });

  it('calls onFolderSelect when folder is clicked', async () => {
    const user = userEvent.setup();
    render(<FolderSidebar {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /sent/i }));
    expect(defaultProps.onFolderSelect).toHaveBeenCalledWith('sent');
  });

  it('renders compose button that triggers onCompose', async () => {
    const user = userEvent.setup();
    render(<FolderSidebar {...defaultProps} />);
    const composeBtn = screen.getByRole('button', { name: /compose/i });
    await user.click(composeBtn);
    expect(defaultProps.onCompose).toHaveBeenCalled();
  });

  it('shows unread count badge for folders with unread emails', () => {
    render(<FolderSidebar {...defaultProps} />);
    expect(screen.getByText('5')).toBeInTheDocument(); // inbox unread
    expect(screen.getByText('2')).toBeInTheDocument(); // drafts
  });

  it('renders labels section with color indicators', () => {
    render(<FolderSidebar {...defaultProps} />);
    expect(screen.getByText(/labels/i)).toBeInTheDocument();
  });

  it('shows storage usage indicator', () => {
    render(<FolderSidebar {...defaultProps} />);
    expect(screen.getByText(/storage/i)).toBeInTheDocument();
  });

  it('supports keyboard navigation between folders', async () => {
    const user = userEvent.setup();
    render(<FolderSidebar {...defaultProps} />);
    const inboxBtn = screen.getByRole('button', { name: /inbox/i });
    inboxBtn.focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).not.toBe(inboxBtn);
  });

  it('sets aria-current on active folder', () => {
    render(<FolderSidebar {...defaultProps} activeFolder="inbox" />);
    const inboxBtn = screen.getByRole('button', { name: /inbox/i });
    expect(inboxBtn).toHaveAttribute('aria-current', 'page');
  });

  it('wraps navigation in accessible nav element', () => {
    render(<FolderSidebar {...defaultProps} />);
    expect(screen.getByRole('navigation', { name: /email folders/i })).toBeInTheDocument();
  });
});
