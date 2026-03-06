import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { DocumentSearch } from '../DocumentSearch';
import type { DocumentFilters } from '../types';

// =============================================================================
// Mocks
// =============================================================================

vi.mock('@intelliflow/ui', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      data-variant={variant}
      className={className}
      {...props}
    >
      {children}
    </button>
  ),
  Badge: ({ children, variant, className, ...props }: any) => (
    <span data-variant={variant} className={className} {...props}>
      {children}
    </span>
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
      <DocumentSearch {...defaultProps} onSearch={onSearch} activeFilters={{ query: 'existing' }} />
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

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: ['DRAFT'] }));
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

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
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
    expect(screen.getByText('Privileged')).toBeInTheDocument();
  });

  it('calls onFilterChange when classification selected', () => {
    const onFilterChange = vi.fn();
    render(<DocumentSearch {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole('button', { name: /classification/i }));
    fireEvent.click(screen.getByText('Public'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ classification: ['PUBLIC'] })
    );
  });

  it('deselects classification filter when toggled off', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ classification: ['CONFIDENTIAL'] }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /classification/i }));
    const listbox = screen.getByRole('listbox');
    // Click the label text to toggle off the already-selected option
    fireEvent.click(within(listbox).getByText('Confidential'));

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ classification: undefined })
    );
  });

  it('shows count badge on classification button when filters active', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ classification: ['PUBLIC', 'INTERNAL'] }}
      />
    );
    const classBtn = screen.getByRole('button', { name: /classification/i });
    expect(classBtn.textContent).toContain('2');
  });

  it('toggles status filter via label click (checkbox onChange handler)', () => {
    const onFilterChange = vi.fn();
    render(<DocumentSearch {...defaultProps} onFilterChange={onFilterChange} />);

    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    const listbox = screen.getByRole('listbox');
    // Click the checkbox input directly — jsdom does not bubble label clicks, so use the input
    const checkboxes = within(listbox).getAllByRole('checkbox');
    // First checkbox corresponds to DRAFT; click it directly
    fireEvent.click(checkboxes[0]);

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: ['DRAFT'] }));
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

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ fileType: ['pdf'] }));
  });

  it('deselects file type filter when toggled off via label click', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ fileType: ['pdf'] }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /file type/i }));
    const listbox = screen.getByRole('listbox');
    // Click the label text for the already-selected PDF option to deselect it
    fireEvent.click(within(listbox).getByText('PDF'));

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ fileType: undefined }));
  });

  it('selects multiple file types and shows count badge on button', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ fileType: ['pdf', 'word'] }}
      />
    );

    const fileTypeBtn = screen.getByRole('button', { name: /file type/i });
    expect(fileTypeBtn.textContent).toContain('2');
  });

  it('shows all 5 file type options in dropdown', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /file type/i }));

    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
    expect(screen.getByText('Spreadsheet')).toBeInTheDocument();
    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('Text')).toBeInTheDocument();
  });

  // ─── Filter Chips ─────────────────────────────────────────────────────────

  it('renders chip for each active status filter', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ status: ['DRAFT', 'APPROVED'] }} />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });

  it('renders chip for each active classification filter', () => {
    render(
      <DocumentSearch {...defaultProps} activeFilters={{ classification: ['CONFIDENTIAL'] }} />
    );
    expect(screen.getByText('Confidential')).toBeInTheDocument();
  });

  it('clicking classification chip X removes that classification filter', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ classification: ['CONFIDENTIAL', 'PRIVILEGED'] }}
      />
    );

    const removeButtons = screen.getAllByLabelText(/remove.*confidential.*filter/i);
    fireEvent.click(removeButtons[0]);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ classification: ['PRIVILEGED'] })
    );
  });

  it('removing the last classification filter sets classification to undefined', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ classification: ['INTERNAL'] }}
      />
    );

    const removeBtn = screen.getByLabelText(/remove.*internal.*filter/i);
    fireEvent.click(removeBtn);

    expect(onFilterChange).toHaveBeenCalledWith(
      expect.objectContaining({ classification: undefined })
    );
  });

  it('renders chip for each active file type filter', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ fileType: ['pdf', 'word'] }} />);
    expect(screen.getByText('PDF')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
  });

  it('clicking file type chip X removes that file type filter', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ fileType: ['pdf', 'word'] }}
      />
    );

    const removeBtn = screen.getByLabelText(/remove.*pdf.*filter/i);
    fireEvent.click(removeBtn);

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ fileType: ['word'] }));
  });

  it('removing the last file type filter sets fileType to undefined', () => {
    const onFilterChange = vi.fn();
    render(
      <DocumentSearch
        {...defaultProps}
        onFilterChange={onFilterChange}
        activeFilters={{ fileType: ['pdf'] }}
      />
    );

    const removeBtn = screen.getByLabelText(/remove.*pdf.*filter/i);
    fireEvent.click(removeBtn);

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ fileType: undefined }));
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

    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({ status: ['APPROVED'] }));
  });

  it('shows "Clear all" button when filters active', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ status: ['DRAFT'] }} />);
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

  it('shows "Clear all" when fileType filter is active', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ fileType: ['pdf'] }} />);
    expect(screen.getByTestId('clear-all-filters')).toBeInTheDocument();
  });

  it('shows "Clear all" when classification filter is active', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ classification: ['PUBLIC'] }} />);
    expect(screen.getByTestId('clear-all-filters')).toBeInTheDocument();
  });

  it('shows "Clear all" when dateRange filter is active', () => {
    render(
      <DocumentSearch
        {...defaultProps}
        activeFilters={{ dateRange: { from: new Date('2024-01-01'), to: new Date('2024-12-31') } }}
      />
    );
    expect(screen.getByTestId('clear-all-filters')).toBeInTheDocument();
  });

  it('"Clear all" resets local search input value to empty', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ status: ['DRAFT'] }} />);

    // Type into search input first
    const input = screen.getByRole('searchbox');
    fireEvent.change(input, { target: { value: 'contract' } });
    expect(input).toHaveValue('contract');

    fireEvent.click(screen.getByTestId('clear-all-filters'));

    expect(input).toHaveValue('');
  });

  // ─── Dropdown Behavior ────────────────────────────────────────────────────

  it('closes dropdown on Escape key', () => {
    render(<DocumentSearch {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes open dropdown when clicking outside the filter area', () => {
    render(
      <div>
        <DocumentSearch {...defaultProps} />
        <div data-testid="outside">outside</div>
      </div>
    );

    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('toggles between dropdowns — opening a second closes the first', () => {
    render(<DocumentSearch {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: /status/i }));
    expect(screen.getByRole('listbox', { name: /status filter/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /classification/i }));
    // Classification listbox should now be open; status listbox should be gone
    expect(screen.getByRole('listbox', { name: /classification filter/i })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: /status filter/i })).not.toBeInTheDocument();
  });

  it('filter buttons have aria-expanded state', () => {
    render(<DocumentSearch {...defaultProps} />);

    const statusBtn = screen.getByRole('button', { name: /status/i });
    expect(statusBtn).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(statusBtn);
    expect(statusBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows count badge on filter button when filters active', () => {
    render(<DocumentSearch {...defaultProps} activeFilters={{ status: ['DRAFT', 'APPROVED'] }} />);
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
    render(<DocumentSearch {...defaultProps} activeFilters={{ status: ['DRAFT'] }} />);
    expect(screen.getAllByLabelText(/remove.*draft.*filter/i).length).toBeGreaterThanOrEqual(1);
  });
});
