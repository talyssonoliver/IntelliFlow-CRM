import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
import { DocumentSearch } from '../DocumentSearch';
import type { DocumentFilters } from '../types';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button onClick={onClick} disabled={disabled} data-variant={variant} className={className} {...props}>
      {children}
    </button>
  ),
  Badge: ({ children, variant, className, ...props }: any) => (
    <span data-variant={variant} className={className} {...props}>{children}</span>
  ),
}));

// =============================================================================
// Tests
// =============================================================================

describe('DocumentSearch', () => {
  const defaultProps = {
    onSearch: vi.fn(),
    onFilterChange: vi.fn(),
    activeFilters: {} as DocumentFilters,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── Rendering ────────────────────────────────────────────────────────────

  it('renders search component', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.getByTestId('document-search')).toBeInTheDocument();
  });

  it('renders search input', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('renders filter dropdown buttons', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.getByRole('button', { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /classification/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /file type/i })).toBeInTheDocument();
  });

  it('shows result count when provided', () => {
    render(<DocumentSearch {...defaultProps} resultCount={42} />);
    expect(screen.getByTestId('result-count')).toHaveTextContent('42 results');
  });

  it('shows "No results" when resultCount is 0', () => {
    render(<DocumentSearch {...defaultProps} resultCount={0} />);
    expect(screen.getByTestId('result-count')).toHaveTextContent('No results');
  });

  it('shows singular "result" for count of 1', () => {
    render(<DocumentSearch {...defaultProps} resultCount={1} />);
    expect(screen.getByTestId('result-count')).toHaveTextContent('1 result');
  });

  // ─── Debounced Search ─────────────────────────────────────────────────────

  it('calls onSearch with debounced value after 300ms', async () => {
    const onSearch = vi.fn();
    render(<DocumentSearch {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'contract' } });

    // Should NOT have called yet
    expect(onSearch).not.toHaveBeenCalledWith('contract');

    // Advance timers past debounce
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(onSearch).toHaveBeenCalledWith('contract');
  });

  it('does NOT call onSearch before debounce period', () => {
    const onSearch = vi.fn();
    render(<DocumentSearch {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'test' } });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 100ms < 300ms debounce, should not be called with "test" yet
    expect(onSearch).not.toHaveBeenCalledWith('test');
  });

  it('calls onSearch immediately on Enter key', () => {
    const onSearch = vi.fn();
    render(<DocumentSearch {...defaultProps} onSearch={onSearch} />);

    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'urgent' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSearch).toHaveBeenCalledWith('urgent');
  });

  it('clears search on clear button click', () => {
    const onSearch = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onSearch={onSearch}
        activeFilters={{ query: 'existing' }}
      />
    );

    // Type something to show clear button
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'something' } });

    const clearBtn = screen.getByLabelText(/clear search/i);
    fireEvent.click(clearBtn);

    expect(onSearch).toHaveBeenCalledWith('');
  });

  // ─── Status Filter ────────────────────────────────────────────────────────

  it('opens status dropdown on click', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    expect(screen.getByRole('listbox', { name: /status filter/i })).toBeInTheDocument();
  });

  it('shows all 6 status options', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /status/i }));

    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('In Review')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Signed')).toBeInTheDocument();
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.getByText('Superseded')).toBeInTheDocument();
  });

  it('calls onFilterChange when status selected', () => {
    const onFilterChange = vi.fn();
    render(<DocumentSearch {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    fireEvent.click(screen.getByText('Draft'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['DRAFT'] })
    );
  });

  it('deselects status filter when clicked again', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ status: ['DRAFT'] }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    // Multiple "Draft" elements may exist (chip + dropdown option). Click the checkbox label in dropdown.
    const listbox = screen.getByRole('listbox');
    const draftCheckbox = within(listbox).getByText('Draft');
    fireEvent.click(draftCheckbox);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined })
    );
  });

  // ─── Classification Filter ────────────────────────────────────────────────

  it('opens classification dropdown', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /classification/i }));
    expect(screen.getByRole('listbox', { name: /classification filter/i })).toBeInTheDocument();
  });

  it('shows all 4 classification options', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /classification/i }));

    expect(screen.getByText('Public')).toBeInTheDocument();
    expect(screen.getByText('Internal')).toBeInTheDocument();
    expect(screen.getByText('Confidential')).toBeInTheDocument();
    expect(screen.getByText('Restricted')).toBeInTheDocument();
  });

  // ─── File Type Filter ─────────────────────────────────────────────────────

  it('opens file type dropdown', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /file type/i }));
    expect(screen.getByRole('listbox', { name: /file type filter/i })).toBeInTheDocument();
  });

  it('calls onFilterChange when file type selected', () => {
    const onFilterChange = vi.fn();
    render(<DocumentSearch {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole('button', { name: /file type/i }));
    fireEvent.click(screen.getByText('PDF'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ fileType: ['pdf'] })
    );
  });

  // ─── Filter Chips ─────────────────────────────────────────────────────────

  it('renders chip for each active status filter', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ status: ['DRAFT', 'APPROVED'] }}
      />
    );
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders chip for each active classification filter', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ classification: ['CONFIDENTIAL'] }}
      />
    );
    expect(screen.getByText('Confidential')).toBeInTheDocument();
  });

  it('clicking chip X removes that filter', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ status: ['DRAFT', 'APPROVED'] }}
      />
    );

    // Find the remove button inside the Draft chip
    const removeButtons = screen.getAllByLabelText(/remove.*draft.*filter/i);
    fireEvent.click(removeButtons[0]);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: ['APPROVED'] })
    );
  });

  it('shows "Clear all" button when filters active', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ status: ['DRAFT'] }}
      />
    );
    expect(screen.getByTestId('clear-all-filters')).toBeInTheDocument();
  });

  it('clears all filters on "Clear all" click', () => {
    const onFilterChange = vi.fn();
    const onSearch = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onSearch={onSearch}
        onFilterChange={onFilterChange}
        activeFilters={{ status: ['DRAFT'], classification: ['INTERNAL'] }}
      />
    );

    fireEvent.click(screen.getByTestId('clear-all-filters'));

    expect(onFilterChange).toHaveBeenCalledWith({});
    expect(onSearch).toHaveBeenCalledWith('');
  });

  it('hides "Clear all" when no filters active', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.queryByTestId('clear-all-filters')).not.toBeInTheDocument();
  });

  // ─── Dropdown Behavior ────────────────────────────────────────────────────

  it('closes dropdown on Escape key', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filter buttons have aria-expanded state', () => {
    render(<DocumentSearch {...defaultProps} />);

    const statusBtn = screen.getByRole('button', { name: /status/i });
    expect(statusBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(statusBtn);
    expect(statusBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows count badge on filter button when filters active', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ status: ['DRAFT', 'APPROVED'] }}
      />
    );
    // The status button should show count "2"
    const statusBtn = screen.getByRole('button', { name: /status/i });
    expect(statusBtn.textContent).toContain('2');
  });

  // ─── Search Input Accessibility ───────────────────────────────────────────

  it('search input has role="searchbox"', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('search input has aria-label', () => {
    render(<DocumentSearch {...defaultProps} />);
    expect(screen.getByLabelText(/search documents/i)).toBeInTheDocument();
  });

  it('filter chips have aria-label', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ status: ['DRAFT'] }}
      />
    );
    expect(screen.getAllByLabelText(/remove.*draft.*filter/i).length).toBeGreaterThanOrEqual(1);
  });
});
