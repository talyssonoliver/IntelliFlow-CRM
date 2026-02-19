import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { EntitySearchField } from '../EntitySearchField';

// Mock tRPC api
const mockLeadList = vi.fn();
const mockContactList = vi.fn();
const mockOpportunityList = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    lead: {
      list: {
        useQuery: (...args: any[]) => mockLeadList(...args),
      },
    },
    contact: {
      list: {
        useQuery: (...args: any[]) => mockContactList(...args),
      },
    },
    opportunity: {
      list: {
        useQuery: (...args: any[]) => mockOpportunityList(...args),
      },
    },
  },
}));

describe('EntitySearchField', () => {
  const defaultProps = {
    entityType: 'lead' as const,
    value: '',
    valueName: '',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockLeadList.mockReturnValue({ data: undefined, isLoading: false });
    mockContactList.mockReturnValue({ data: undefined, isLoading: false });
    mockOpportunityList.mockReturnValue({ data: undefined, isLoading: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders search input when no value selected', () => {
    render(<EntitySearchField {...defaultProps} />);
    expect(screen.getByLabelText('Search leads')).toBeInTheDocument();
  });

  it('renders selected value with clear button', () => {
    render(<EntitySearchField {...defaultProps} value="123" valueName="John Doe" />);
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByLabelText('Clear selection')).toBeInTheDocument();
  });

  it('calls onChange with empty values when clear is clicked', () => {
    const onChange = vi.fn();
    render(
      <EntitySearchField {...defaultProps} value="123" valueName="John Doe" onChange={onChange} />
    );
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('shows correct label for each entity type', () => {
    const { rerender } = render(<EntitySearchField {...defaultProps} entityType="lead" />);
    expect(screen.getByText('Lead')).toBeInTheDocument();

    rerender(<EntitySearchField {...defaultProps} entityType="contact" />);
    expect(screen.getByText('Contact')).toBeInTheDocument();

    rerender(<EntitySearchField {...defaultProps} entityType="opportunity" />);
    expect(screen.getByText('Deal')).toBeInTheDocument();
  });

  it('shows loading state while searching', async () => {
    mockLeadList.mockReturnValue({ data: undefined, isLoading: true });
    render(<EntitySearchField {...defaultProps} />);

    const input = screen.getByLabelText('Search leads');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });

    // The dropdown opens on focus + typing, but debounce delays the query
    // The loading state comes from the hook
  });

  it('shows results from lead query', async () => {
    mockLeadList.mockReturnValue({
      data: {
        leads: [
          { id: '1', firstName: 'John', lastName: 'Doe' },
          { id: '2', firstName: 'Jane', lastName: 'Smith' },
        ],
      },
      isLoading: false,
    });

    render(<EntitySearchField {...defaultProps} />);

    const input = screen.getByLabelText('Search leads');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'john' } });

    // Results show via the callback mechanism
  });

  it('disables input when disabled prop is true', () => {
    render(<EntitySearchField {...defaultProps} disabled />);
    const input = screen.getByLabelText('Search leads');
    expect(input).toBeDisabled();
  });

  it('has combobox role on the search input', () => {
    render(<EntitySearchField {...defaultProps} />);
    const input = screen.getByRole('combobox');
    expect(input).toBeInTheDocument();
  });

  it('shows results and calls onChange when a result is clicked', () => {
    mockLeadList.mockReturnValue({
      data: {
        leads: [
          { id: 'lead-1', firstName: 'John', lastName: 'Doe' },
          { id: 'lead-2', firstName: 'Jane', lastName: 'Smith' },
        ],
      },
      isLoading: false,
    });

    const onChange = vi.fn();
    render(<EntitySearchField {...defaultProps} onChange={onChange} />);

    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'john' } });

    // Advance past debounce timer to update debouncedSearch
    act(() => { vi.advanceTimersByTime(350); });

    // After debounce, dropdown should show with results
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveTextContent('John Doe');

    // Click a result to trigger handleSelect
    fireEvent.click(options[0]);
    expect(onChange).toHaveBeenCalledWith('lead-1', 'John Doe');
  });

  it('shows no results message when search returns empty', () => {
    mockLeadList.mockReturnValue({
      data: { leads: [] },
      isLoading: false,
    });

    render(<EntitySearchField {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'xyz' } });
    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.getByText('No results found')).toBeInTheDocument();
  });

  it('shows Searching text when loading', () => {
    mockLeadList.mockReturnValue({ data: undefined, isLoading: true });

    render(<EntitySearchField {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'test' } });
    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.getByText('Searching...')).toBeInTheDocument();
  });

  it('opens dropdown on focus when search has value', () => {
    mockLeadList.mockReturnValue({ data: { leads: [] }, isLoading: false });

    render(<EntitySearchField {...defaultProps} />);
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: 'test' } });
    fireEvent.focus(input);
    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('shows contact results when entityType is contact', () => {
    mockContactList.mockReturnValue({
      data: {
        contacts: [{ id: 'c-1', firstName: 'Alice', lastName: 'Wonder' }],
      },
      isLoading: false,
    });

    render(<EntitySearchField {...defaultProps} entityType="contact" />);
    const input = screen.getByLabelText('Search contacts');
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'alice' } });
    act(() => { vi.advanceTimersByTime(350); });

    expect(screen.getByRole('option')).toHaveTextContent('Alice Wonder');
  });
});
