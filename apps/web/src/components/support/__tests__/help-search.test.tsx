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
    render(<HelpSearch value="" onChange={vi.fn()} placeholder="Find answers..." />);
    expect(screen.getByPlaceholderText('Find answers...')).toBeInTheDocument();
  });

  it('calls onChange with debounced value after 300ms', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: 'leads' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('leads');
  });

  it('does not call onChange before debounce timer', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: 'test' } });

    // Only advance 100ms — well before the 300ms debounce
    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('clears search on Escape key press', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="existing" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('shows result count when resultCount prop provided', () => {
    render(<HelpSearch value="test" onChange={vi.fn()} resultCount={3} />);
    expect(screen.getByText('3 results found')).toBeInTheDocument();
  });

  it('hides result count when resultCount is undefined', () => {
    render(<HelpSearch value="test" onChange={vi.fn()} />);
    expect(screen.queryByText(/results? found/)).not.toBeInTheDocument();
  });

  it('has role="search" for accessibility', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);
    expect(screen.getByRole('search')).toBeInTheDocument();
  });

  it('has aria-label on input', () => {
    render(<HelpSearch value="" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search help topics...');
    expect(input).toHaveAttribute('aria-label', 'Search help topics');
  });

  it('has aria-live="polite" region for result count', () => {
    render(<HelpSearch value="" onChange={vi.fn()} resultCount={5} />);
    const liveRegion = screen.getByText('5 results found');
    expect(liveRegion.closest('[aria-live]')).toHaveAttribute('aria-live', 'polite');
  });

  it('syncs local value when value prop changes', () => {
    const { rerender } = render(<HelpSearch value="" onChange={vi.fn()} />);
    const input = screen.getByPlaceholderText('Search help topics...') as HTMLInputElement;
    expect(input.value).toBe('');

    rerender(<HelpSearch value="updated" onChange={vi.fn()} />);
    expect(input.value).toBe('updated');
  });

  it('handles empty string input', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="existing" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: '' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('trims whitespace before calling onChange', () => {
    const onChange = vi.fn();
    render(<HelpSearch value="" onChange={onChange} />);

    const input = screen.getByPlaceholderText('Search help topics...');
    fireEvent.change(input, { target: { value: '  leads  ' } });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onChange).toHaveBeenCalledWith('leads');
  });
});
