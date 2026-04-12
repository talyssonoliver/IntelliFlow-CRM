import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { renderHook, act } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(' '),
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
}));

import { ComplementarySidebar } from '../complementary-sidebar';
import { useComplementarySidebar } from '@/hooks/useComplementarySidebar';

// ---------------------------------------------------------------------------
// ComplementarySidebar component tests
// ---------------------------------------------------------------------------

describe('ComplementarySidebar', () => {
  const defaultProps = {
    isOpen: false,
    onClose: vi.fn(),
    title: 'Details',
    children: <div>Panel Content</div>,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --- Rendering ---

  it('renders with role="complementary"', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen />);
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('is aria-hidden and off-screen when closed', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen={false} />);
    const aside = screen.getByRole('complementary', { hidden: true });
    expect(aside).toHaveAttribute('aria-hidden', 'true');
    expect(aside.className).toContain('translate-x-full');
  });

  it('is visible and not aria-hidden when open', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen />);
    const aside = screen.getByRole('complementary');
    expect(aside).toHaveAttribute('aria-hidden', 'false');
    expect(aside.className).toContain('translate-x-0');
  });

  it('renders title and subtitle', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen title="Agent A" subtitle="AI Agent" />);
    expect(screen.getByText('Agent A')).toBeInTheDocument();
    expect(screen.getByText('AI Agent')).toBeInTheDocument();
  });

  it('omits title element when no title provided', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen title={undefined} />);
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
  });

  it('uses title as aria-label', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen title="Agent Details" />);
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Agent Details');
  });

  it('falls back to "Detail panel" aria-label when no title', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen title={undefined} />);
    expect(screen.getByRole('complementary')).toHaveAttribute('aria-label', 'Detail panel');
  });

  it('applies custom className', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen className="custom-panel" />);
    expect(screen.getByRole('complementary').className).toContain('custom-panel');
  });

  // --- Close interactions ---

  it('calls onClose when close button is clicked', () => {
    const onClose = vi.fn();
    render(<ComplementarySidebar {...defaultProps} isOpen onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key when open', () => {
    const onClose = vi.fn();
    render(<ComplementarySidebar {...defaultProps} isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose on Escape when closed', () => {
    const onClose = vi.fn();
    render(<ComplementarySidebar {...defaultProps} isOpen={false} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', () => {
    const onClose = vi.fn();
    render(<ComplementarySidebar {...defaultProps} isOpen onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  // --- Loading state ---

  it('shows default skeleton when isLoading=true', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen isLoading />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Panel Content')).not.toBeInTheDocument();
  });

  it('shows custom skeleton when provided', () => {
    render(
      <ComplementarySidebar
        {...defaultProps}
        isOpen
        isLoading
        skeleton={<div data-testid="custom-skeleton">Loading...</div>}
      />
    );
    expect(screen.getByTestId('custom-skeleton')).toBeInTheDocument();
  });

  it('shows children when not loading', () => {
    render(<ComplementarySidebar {...defaultProps} isOpen isLoading={false} />);
    expect(screen.getByText('Panel Content')).toBeInTheDocument();
  });

  // --- Header actions ---

  it('renders header actions', () => {
    render(
      <ComplementarySidebar
        {...defaultProps}
        isOpen
        headerActions={<button data-testid="edit-btn">Edit</button>}
      />
    );
    expect(screen.getByTestId('edit-btn')).toBeInTheDocument();
  });

  // --- Crossfade animation ---

  it('applies fade-in animation class on content wrapper', () => {
    const { container } = render(
      <ComplementarySidebar {...defaultProps} isOpen contentKey="key-1" />
    );
    const contentWrapper = container.querySelector('.animate-\\[fade-in_100ms_ease-out\\]');
    expect(contentWrapper).toBeInTheDocument();
  });

  it('remounts content wrapper when contentKey changes', () => {
    const { rerender, container } = render(
      <ComplementarySidebar {...defaultProps} isOpen contentKey="key-1">
        <span>Content A</span>
      </ComplementarySidebar>
    );

    const firstWrapper = container.querySelector('[class*="animate"]');

    rerender(
      <ComplementarySidebar {...defaultProps} isOpen contentKey="key-2">
        <span>Content B</span>
      </ComplementarySidebar>
    );

    const secondWrapper = container.querySelector('[class*="animate"]');
    expect(screen.getByText('Content B')).toBeInTheDocument();
    // Key change causes remount — different DOM node
    expect(secondWrapper).not.toBe(firstWrapper);
  });
});

// ---------------------------------------------------------------------------
// useComplementarySidebar hook tests
// ---------------------------------------------------------------------------

describe('useComplementarySidebar', () => {
  it('starts closed with no selection', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedItem).toBeNull();
    expect(result.current.contentKey).toBe('');
  });

  it('open() sets item, key, and opens', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a', 'key-a'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedItem).toBe('item-a');
    expect(result.current.contentKey).toBe('key-a');
  });

  it('open() generates key when not provided', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.contentKey).toMatch(/^cs-\d+$/);
  });

  it('close() hides sidebar but preserves selection', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a', 'key-a'));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selectedItem).toBe('item-a');
  });

  it('toggle() with same explicit key closes the sidebar', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a', 'key-a'));
    expect(result.current.isOpen).toBe(true);

    act(() => result.current.toggle('item-a', 'key-a'));
    expect(result.current.isOpen).toBe(false);
  });

  it('toggle() same key again re-opens the sidebar', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a', 'key-a'));
    act(() => result.current.toggle('item-a', 'key-a'));
    expect(result.current.isOpen).toBe(false);

    act(() => result.current.toggle('item-a', 'key-a'));
    expect(result.current.isOpen).toBe(true);
  });

  it('toggle() with different key opens with new item', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.open('item-a', 'key-a'));
    act(() => result.current.toggle('item-b', 'key-b'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedItem).toBe('item-b');
    expect(result.current.contentKey).toBe('key-b');
  });

  it('toggle() without key always opens (generates new key each call)', () => {
    const { result } = renderHook(() => useComplementarySidebar<string>());
    act(() => result.current.toggle('item-a'));
    expect(result.current.isOpen).toBe(true);
    const firstKey = result.current.contentKey;

    act(() => result.current.toggle('item-b'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.contentKey).not.toBe(firstKey);
  });

  it('open() after close() replaces the selected item', () => {
    const { result } = renderHook(() => useComplementarySidebar<{ id: number }>());
    act(() => result.current.open({ id: 1 }, 'k1'));
    act(() => result.current.close());
    act(() => result.current.open({ id: 2 }, 'k2'));

    expect(result.current.isOpen).toBe(true);
    expect(result.current.selectedItem).toEqual({ id: 2 });
    expect(result.current.contentKey).toBe('k2');
  });
});
