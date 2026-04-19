// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMockTemplate, createMockEmailTrpc } from './email-test-utils';

const { trpc: mockTrpc, mocks } = createMockEmailTrpc();

vi.mock('@/lib/trpc', () => ({ trpc: mockTrpc }));

const { TemplateSelector } = await import('../TemplateSelector');

describe('TemplateSelector', () => {
  const templates = [
    createMockTemplate({ id: 't1', name: 'Follow Up', category: 'sales' }),
    createMockTemplate({ id: 't2', name: 'Welcome', category: 'onboarding' }),
    createMockTemplate({ id: 't3', name: 'Meeting Invite', category: 'scheduling' }),
  ];

  const defaultProps = {
    onSelect: vi.fn(),
    currentBody: '',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listTemplates.mockReturnValue({
      data: templates,
      isLoading: false,
      isError: false,
    });
  });

  it('renders template button', () => {
    render(<TemplateSelector {...defaultProps} />);
    expect(screen.getByRole('button', { name: /template/i })).toBeInTheDocument();
  });

  it('opens template dropdown on click', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    expect(screen.getByText('Follow Up')).toBeInTheDocument();
  });

  it('loads templates from API', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    expect(mocks.listTemplates).toHaveBeenCalled();
    expect(screen.getByText('Follow Up')).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.getByText('Meeting Invite')).toBeInTheDocument();
  });

  it('calls onSelect when template is selected', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    await user.click(screen.getByText('Follow Up'));
    expect(defaultProps.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1', name: 'Follow Up' })
    );
  });

  it('shows confirmation dialog if body is non-empty', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} currentBody="Some existing text" />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    await user.click(screen.getByText('Follow Up'));
    expect(screen.getByText(/replace.*existing/i)).toBeInTheDocument();
  });

  it('shows merge variables as highlighted chips', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    // Each template with variables shows {{var}} chips
    const chips = screen.getAllByText(/\{\{contact\.\w+\}\}/);
    expect(chips.length).toBeGreaterThanOrEqual(2);
  });

  it('shows template preview on hover/focus', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    // All templates show a preview snippet of body text
    const previews = screen.getAllByText(/following up/i);
    expect(previews.length).toBeGreaterThanOrEqual(1);
  });

  it('filters templates by name', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    const searchInput = screen.getByPlaceholderText(/search.*template/i);
    await user.type(searchInput, 'Welcome');
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(screen.queryByText('Follow Up')).not.toBeInTheDocument();
  });

  it('shows empty state when no templates match', async () => {
    mocks.listTemplates.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    expect(screen.getByText(/no templates/i)).toBeInTheDocument();
  });

  it('supports keyboard navigation in template list', async () => {
    const user = userEvent.setup();
    render(<TemplateSelector {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /template/i }));
    // TemplateSelector's handleKeyDown lives on the search input (line 118).
    // After clicking the toggle, focus stays on the button — explicitly focus
    // the search input so ArrowDown dispatches through handleKeyDown.
    const searchInput = screen.getByPlaceholderText(/search templates/i);
    searchInput.focus();
    await user.keyboard('{ArrowDown}');
    // First template should be highlighted via data-highlighted attr.
    expect(screen.getByText('Follow Up').closest('[data-highlighted]')).toBeTruthy();
  });
});
