/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EntitySearchField } from '../EntitySearchField';

const mockLeadList = vi.fn();
const mockContactList = vi.fn();
const mockOpportunityList = vi.fn();
const mockAccountList = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    lead: {
      list: {
        useQuery: (...args: unknown[]) => mockLeadList(...args),
      },
    },
    contact: {
      list: {
        useQuery: (...args: unknown[]) => mockContactList(...args),
      },
    },
    opportunity: {
      list: {
        useQuery: (...args: unknown[]) => mockOpportunityList(...args),
      },
    },
    account: {
      list: {
        useQuery: (...args: unknown[]) => mockAccountList(...args),
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
    mockLeadList.mockReturnValue({ data: { leads: [] }, isLoading: false });
    mockContactList.mockReturnValue({ data: { contacts: [] }, isLoading: false });
    mockOpportunityList.mockReturnValue({ data: { opportunities: [] }, isLoading: false });
    mockAccountList.mockReturnValue({ data: { accounts: [] }, isLoading: false });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the correct labels for lead and account search', () => {
    const { rerender } = render(<EntitySearchField {...defaultProps} entityType="lead" />);
    expect(screen.getByText('Lead')).toBeInTheDocument();

    rerender(<EntitySearchField {...defaultProps} entityType="account" />);
    expect(screen.getByText('Account')).toBeInTheDocument();
  });

  it('debounces lead searches before enabling the query', () => {
    render(<EntitySearchField {...defaultProps} />);

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'john' } });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(mockLeadList).toHaveBeenLastCalledWith(
      { search: 'john', limit: 5, page: 1 },
      { enabled: true }
    );
  });

  it('passes accountId into contact searches', () => {
    render(
      <EntitySearchField
        {...defaultProps}
        entityType="contact"
        accountId="11111111-1111-4111-8111-111111111111"
      />
    );

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'alice' } });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(mockContactList).toHaveBeenLastCalledWith(
      {
        search: 'alice',
        limit: 5,
        page: 1,
        accountId: '11111111-1111-4111-8111-111111111111',
      },
      { enabled: true }
    );
  });

  it('renders account results and returns the selected account', () => {
    mockAccountList.mockReturnValue({
      data: {
        accounts: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Acme Corp' }],
      },
      isLoading: false,
    });

    const onChange = vi.fn();
    render(<EntitySearchField {...defaultProps} entityType="account" onChange={onChange} />);

    fireEvent.focus(screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'acme' } });

    act(() => {
      vi.advanceTimersByTime(350);
    });

    fireEvent.click(screen.getByRole('option', { name: 'Acme Corp' }));

    expect(onChange).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'Acme Corp');
  });

  it('renders the selected value with a clear button', () => {
    const onChange = vi.fn();
    render(
      <EntitySearchField
        {...defaultProps}
        value="11111111-1111-4111-8111-111111111111"
        valueName="Acme Corp"
        onChange={onChange}
      />
    );

    expect(screen.getByText('Acme Corp')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Clear selection'));

    expect(onChange).toHaveBeenCalledWith('', '');
  });

  it('disables the input when requested', () => {
    render(<EntitySearchField {...defaultProps} disabled />);

    expect(screen.getByRole('combobox')).toBeDisabled();
  });
});
