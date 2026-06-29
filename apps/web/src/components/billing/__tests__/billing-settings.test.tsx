/**
 * @vitest-environment jsdom
 */
/**
 * BillingSettings Component Tests
 *
 * @implements PG-172 (Billing Ghost Pages — Settings)
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockBillingInformation } from '@/test/fixtures/billing-data';

const mockBillingInfo = createMockBillingInformation();

type MockQueryReturn<T> = { data: T | null | undefined; isLoading: boolean; error: Error | null };

const mockGetBillingInfo = vi.fn<() => MockQueryReturn<typeof mockBillingInfo>>(() => ({
  data: mockBillingInfo,
  isLoading: false,
  error: null,
}));

const mockUpdateMutate = vi.fn();

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({
      billing: {
        getBillingInformation: { invalidate: vi.fn() },
      },
    }),
    billing: {
      getBillingInformation: { useQuery: () => mockGetBillingInfo() },
      updateBillingInformation: {
        useMutation: (opts?: Record<string, unknown>) => ({
          mutate: (...args: unknown[]) => {
            mockUpdateMutate(...args);
            if (opts && typeof (opts as Record<string, unknown>).onSuccess === 'function')
              (opts as { onSuccess: () => void }).onSuccess();
          },
          isPending: false,
          isSuccess: false,
          error: null,
        }),
      },
    },
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useAuth: vi.fn(() => ({ isAuthenticated: true, isLoading: false })),
}));

import { BillingSettings } from '../billing-settings';

describe('BillingSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBillingInfo.mockReturnValue({ data: mockBillingInfo, isLoading: false, error: null });
  });

  it('shows loading skeleton when data is loading', () => {
    mockGetBillingInfo.mockReturnValue({ data: undefined, isLoading: true, error: null });
    render(<BillingSettings />);
    expect(screen.queryByLabelText(/organization/i)).not.toBeInTheDocument();
  });

  it('shows error state when query fails', () => {
    mockGetBillingInfo.mockReturnValue({ data: null, isLoading: false, error: new Error('fail') });
    render(<BillingSettings />);
    expect(screen.getByText(/failed to load/i)).toBeInTheDocument();
  });

  it('displays organization name', () => {
    render(<BillingSettings />);
    const input = screen.getByLabelText(/organization/i) as HTMLInputElement;
    expect(input.value).toBe('Acme Corp');
  });

  it('displays billing email', () => {
    render(<BillingSettings />);
    const input = screen.getByLabelText(/email/i) as HTMLInputElement;
    expect(input.value).toBe('billing@acme.com');
  });

  it('displays address as read-only', () => {
    render(<BillingSettings />);
    expect(screen.getByText('123 Business St')).toBeInTheDocument();
    expect(screen.getByText(/London/)).toBeInTheDocument();
  });

  it('shows contact support note for address', () => {
    render(<BillingSettings />);
    expect(screen.getByText(/contact support to update/i)).toBeInTheDocument();
  });

  it('calls updateBillingInformation with name and email on save', () => {
    render(<BillingSettings />);
    const nameInput = screen.getByLabelText(/organization/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Corp' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({ organization: 'New Corp', email: 'billing@acme.com' })
    );
  });

  it('resets form on cancel', () => {
    render(<BillingSettings />);
    const nameInput = screen.getByLabelText(/organization/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed' } });
    expect(nameInput.value).toBe('Changed');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(nameInput.value).toBe('Acme Corp');
  });

  // PG-188: New fields — taxId and invoiceContact
  it('displays taxId from fixture', () => {
    render(<BillingSettings />);
    const input = screen.getByLabelText(/tax id/i) as HTMLInputElement;
    expect(input.value).toBe('GB123456789');
  });

  it('displays invoiceContact from fixture', () => {
    render(<BillingSettings />);
    const input = screen.getByLabelText(/invoice contact/i) as HTMLInputElement;
    expect(input.value).toBe('ap@acme.com');
  });

  it('save mutation includes taxId and invoiceContact', () => {
    render(<BillingSettings />);
    const nameInput = screen.getByLabelText(/organization/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Corp' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        organization: 'New Corp',
        taxId: 'GB123456789',
        invoiceContact: 'ap@acme.com',
      })
    );
  });

  it('cancel resets taxId and invoiceContact to loaded values', () => {
    render(<BillingSettings />);
    const taxInput = screen.getByLabelText(/tax id/i) as HTMLInputElement;
    fireEvent.change(taxInput, { target: { value: 'CHANGED' } });
    expect(taxInput.value).toBe('CHANGED');
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(taxInput.value).toBe('GB123456789');
  });

  it('handles null taxId and invoiceContact', () => {
    mockGetBillingInfo.mockReturnValue({
      data: createMockBillingInformation({ taxId: null, invoiceContact: null }),
      isLoading: false,
      error: null,
    });
    render(<BillingSettings />);
    const taxInput = screen.getByLabelText(/tax id/i) as HTMLInputElement;
    const invoiceInput = screen.getByLabelText(/invoice contact/i) as HTMLInputElement;
    expect(taxInput.value).toBe('');
    expect(invoiceInput.value).toBe('');
  });

  it('renders bento grid layout', () => {
    const { container } = render(<BillingSettings />);
    // The outer grid wrapper must have grid-cols-1
    const grid = container.querySelector('.grid-cols-1');
    expect(grid).toBeInTheDocument();
  });
});
