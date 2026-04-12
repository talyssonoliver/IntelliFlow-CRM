import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { HelpSearch } from '@/components/support/help-search';

describe('HelpSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input with default placeholder', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);

    expect(screen.getByPlaceholderText('Search help topics...')).toBeInTheDocument();
  });

  it('renders search input with custom placeholder', () => {
    render(<HelpSearch value="" onChange={vi.fn()} placeholder="Find articles..." />);

    expect(screen.getByPlaceholderText('Find articles...')).toBeInTheDocument();
  });

  it('calls onChange with debounced value after 300ms', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: 'billing' } });

    // Not called yet (debounce pending)
    expect(onChange).not.toHaveBeenCalledWith('billing');

    // Advance past debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('billing');
  });

  it('does not call onChange before debounce timer', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: 'test' } });

    // Advance only 200ms (less than 300ms debounce)
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(onChange).not.toHaveBeenCalledWith('test');
  });

  it('clears search on Escape key press', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="billing" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows result count when resultCount prop provided', () => {
    render(<HelpSearch value="" onChange={vi.fn()} resultCount={5} />);

    expect(screen.getByText('5 results found')).toBeInTheDocument();
  });

  it('hides result count when resultCount is undefined', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);

    expect(screen.queryByText(/results? found/)).not.toBeInTheDocument();
  });

  it('has role="search" for accessibility', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);

    // The component wraps in a div with role="search", and SearchInput also has role="search"
    const searchRegions = screen.getAllByRole('search');
    expect(searchRegions.length).toBeGreaterThanOrEqual(1);
  });

  it('has aria-label on input', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);

    const input = screen.getByLabelText('Search help topics');
    expect(input).toBeInTheDocument();
  });

  it('has aria-live="polite" region for result count', () => {
    const { container } = render(<HelpSearch value="" onChange={vi.fn()} resultCount={3} />);

    const liveRegion = container.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
    expect(liveRegion).toHaveTextContent('3 results found');
  });

  it('syncs local value when value prop changes', () => {
    const { rerender } = render(<HelpSearch value="old" onChange={vi.fn()} />);

    const input = screen.getByPlaceholderText('Search help topics...') as HTMLInputElement;
    expect(input.value).toBe('old');

    rerender(<HelpSearch value="new" onChange={vi.fn()} />);
    expect(input.value).toBe('new');
  });

  it('handles empty string input', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="test" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: '' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows singular "result" for resultCount of 1', () => {
    render(<HelpSearch value="" onChange={vi.fn()} resultCount={1} />);

    expect(screen.getByText('1 result found')).toBeInTheDocument();
  });
});
