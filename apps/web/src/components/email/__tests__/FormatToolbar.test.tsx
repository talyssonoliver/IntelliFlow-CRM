// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';

const { FormatToolbar } = await import('../FormatToolbar');

describe('FormatToolbar', () => {
  const defaultProps = {
    onFormat: vi.fn(),
    activeFormats: [] as string[],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock document.execCommand
    document.execCommand = vi.fn();
  });

  it('has role="toolbar" and aria-label="Text formatting"', () => {
    render(<FormatToolbar {...defaultProps} />);
    const toolbar = screen.getByRole('toolbar', { name: /text formatting/i });
    expect(toolbar).toBeInTheDocument();
  });

  it('renders Bold, Italic, Underline buttons with aria-pressed', () => {
    render(<FormatToolbar {...defaultProps} />);
    const boldBtn = screen.getByRole('button', { name: /bold/i });
    const italicBtn = screen.getByRole('button', { name: /italic/i });
    const underlineBtn = screen.getByRole('button', { name: /underline/i });
    expect(boldBtn).toHaveAttribute('aria-pressed', 'false');
    expect(italicBtn).toHaveAttribute('aria-pressed', 'false');
    expect(underlineBtn).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows aria-pressed="true" for active formats', () => {
    render(<FormatToolbar {...defaultProps} activeFormats={['bold']} />);
    const boldBtn = screen.getByRole('button', { name: /bold/i });
    expect(boldBtn).toHaveAttribute('aria-pressed', 'true');
  });

  it('implements roving tabindex: one button tabindex=0, others -1', () => {
    render(<FormatToolbar {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    const tabindex0 = buttons.filter((b) => b.getAttribute('tabindex') === '0');
    const tabindexMinus1 = buttons.filter((b) => b.getAttribute('tabindex') === '-1');
    expect(tabindex0.length).toBe(1);
    expect(tabindexMinus1.length).toBe(buttons.length - 1);
  });

  it('moves focus between buttons with arrow keys', async () => {
    const user = userEvent.setup();
    render(<FormatToolbar {...defaultProps} />);
    const buttons = screen.getAllByRole('button');
    buttons[0].focus();
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(buttons[1]);
  });

  it('calls onFormat with correct command when button clicked', async () => {
    const user = userEvent.setup();
    render(<FormatToolbar {...defaultProps} />);
    await user.click(screen.getByRole('button', { name: /bold/i }));
    expect(defaultProps.onFormat).toHaveBeenCalledWith('bold');
  });

  it('renders clear formatting button', () => {
    render(<FormatToolbar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument();
  });

  it('has aria-orientation="horizontal" on toolbar', () => {
    render(<FormatToolbar {...defaultProps} />);
    const toolbar = screen.getByRole('toolbar');
    expect(toolbar).toHaveAttribute('aria-orientation', 'horizontal');
  });
});
