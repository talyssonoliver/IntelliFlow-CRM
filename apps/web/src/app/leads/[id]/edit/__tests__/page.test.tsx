/**
 * Edit Lead Page Tests
 *
 * Tests:
 * - Pre-populates form from getById data
 * - Email shown as read-only
 * - Calls api.lead.update with correct payload on submit
 * - Navigates to detail page on success
 * - Shows error toast on failure
 * - Invalidates caches on success
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const {
  mockUpdateMutate,
  mockUpdateMutation,
  mockInvalidateGetById,
  mockInvalidateList,
  mockInvalidateStats,
  mockQueryData,
  mockPush,
  mockBack,
} = vi.hoisted(() => {
  const mockUpdateMutate = vi.fn();
  const mockInvalidateGetById = vi.fn();
  const mockInvalidateList = vi.fn();
  const mockInvalidateStats = vi.fn();
  const mockPush = vi.fn();
  const mockBack = vi.fn();
  let capturedOnSuccess: (() => void) | undefined;
  let capturedOnError: ((err: { message: string }) => void) | undefined;
  return {
    mockUpdateMutate,
    mockInvalidateGetById,
    mockInvalidateList,
    mockInvalidateStats,
    mockPush,
    mockBack,
    mockQueryData: {
      id: 'test-lead-id',
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'ACME Corp',
      title: 'CTO',
      status: 'NEW',
      source: 'WEBSITE',
      score: 50,
      location: 'New York',
      website: 'https://acme.com',
      estimatedValue: 5000, // 50.00 in dollars
      tags: ['enterprise', 'saas'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    mockUpdateMutation: vi.fn(
      (opts?: { onSuccess?: () => void; onError?: (err: { message: string }) => void }) => {
        capturedOnSuccess = opts?.onSuccess;
        capturedOnError = opts?.onError;
        return {
          mutateAsync: mockUpdateMutate,
          isPending: false,
          get _onSuccess() {
            return capturedOnSuccess;
          },
          get _onError() {
            return capturedOnError;
          },
        };
      }
    ),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useParams: vi.fn(() => ({ id: 'test-lead-id' })),
  useRouter: vi.fn(() => ({
    push: mockPush,
    back: mockBack,
    replace: vi.fn(),
  })),
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({
  useFormUnsavedChanges: vi.fn(),
}));

vi.mock('@/app/leads/(list)/actions', () => ({
  invalidateLeadsCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api', () => ({
  api: {
    lead: {
      getById: {
        useQuery: vi.fn(() => ({
          data: mockQueryData,
          isLoading: false,
          error: null,
        })),
      },
      update: { useMutation: mockUpdateMutation },
    },
    useUtils: vi.fn(() => ({
      lead: {
        getById: { invalidate: mockInvalidateGetById },
        list: { invalidate: mockInvalidateList },
        stats: { invalidate: mockInvalidateStats },
      },
    })),
  },
}));

vi.mock('@intelliflow/ui', async () => {
  const React = await import('react');
  return {
    Card: ({ children, className }: any) =>
      React.createElement('div', { className, 'data-testid': 'card' }, children),
    Skeleton: ({ className }: any) =>
      React.createElement('div', { className, 'data-testid': 'skeleton' }),
    ToastProvider: ({ children }: any) => React.createElement('div', null, children),
    ToastViewport: () => null,
    Toast: ({ children, open }: any) =>
      open ? React.createElement('div', { 'data-testid': 'toast' }, children) : null,
    ToastTitle: ({ children }: any) =>
      React.createElement('span', { 'data-testid': 'toast-title' }, children),
    ToastDescription: ({ children }: any) =>
      React.createElement('span', { 'data-testid': 'toast-description' }, children),
    ToastClose: () => null,
  };
});

import { invalidateLeadsCache } from '@/app/leads/(list)/actions';
import EditLeadPage from '../page';

describe('EditLeadPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vitest.config.ts sets mockReset: true (resets implementations, not
    // just call history, before every test) — the module mock's
    // .mockResolvedValue(undefined) above only applies on first import, so
    // it must be re-armed here for every test that exercises the onSuccess
    // path (page.tsx calls invalidateLeadsCache().catch(...), which throws
    // on an undefined return otherwise).
    vi.mocked(invalidateLeadsCache).mockResolvedValue(undefined);
  });

  it('pre-populates form from getById data', () => {
    render(<EditLeadPage />);

    const firstNameInput = screen.getByLabelText('First Name') as HTMLInputElement;
    expect(firstNameInput.value).toBe('John');

    const lastNameInput = screen.getByLabelText('Last Name') as HTMLInputElement;
    expect(lastNameInput.value).toBe('Doe');

    const companyInput = screen.getByLabelText('Company') as HTMLInputElement;
    expect(companyInput.value).toBe('ACME Corp');

    const phoneInput = screen.getByLabelText('Phone') as HTMLInputElement;
    expect(phoneInput.value).toBe('+1234567890');

    const locationInput = screen.getByLabelText('Location') as HTMLInputElement;
    expect(locationInput.value).toBe('New York');
  });

  it('shows email as read-only with lock icon', () => {
    render(<EditLeadPage />);

    // Email should be displayed as text, not an editable input
    expect(screen.getByText('john@example.com')).toBeTruthy();
    expect(screen.getByText('lock')).toBeTruthy();

    // No editable email input
    const emailInputs = screen.queryAllByLabelText('Email');
    // The email label exists but the field is a read-only display, not an input
    expect(emailInputs.filter((el) => (el as HTMLInputElement).type === 'email')).toHaveLength(0);
  });

  it('displays status and source as badges', () => {
    render(<EditLeadPage />);

    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('WEBSITE')).toBeTruthy();
  });

  it('calls api.lead.update with correct payload on submit', async () => {
    mockUpdateMutate.mockResolvedValue({});

    render(<EditLeadPage />);

    // Change a field
    const firstNameInput = screen.getByLabelText('First Name') as HTMLInputElement;
    fireEvent.change(firstNameInput, { target: { value: 'Jane' } });

    // Submit form directly (fireEvent.click on submit button is unreliable in jsdom)
    const form = firstNameInput.closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-lead-id',
          firstName: 'Jane',
        })
      );
    });
  });

  it('navigates back on Cancel click', () => {
    render(<EditLeadPage />);

    const cancelButton = screen.getByText('Cancel');
    fireEvent.click(cancelButton);

    expect(mockBack).toHaveBeenCalled();
  });

  it('converts estimatedValue from cents to dollars for display', () => {
    render(<EditLeadPage />);

    const valueInput = screen.getByLabelText('Estimated Value ($)') as HTMLInputElement;
    // 5000 cents = 50.00 dollars
    expect(valueInput.value).toBe('50');
  });

  it('displays tags as comma-separated string', () => {
    render(<EditLeadPage />);

    const tagsInput = screen.getByLabelText('Tags') as HTMLInputElement;
    expect(tagsInput.value).toBe('enterprise, saas');
  });

  // IFC-249 (T9): the update mutation's onSuccess/onError callbacks were
  // captured by the mock above but never actually invoked by a test —
  // meaning the success-toast/cache-invalidation/navigation path and the
  // error-toast path were both unverified. mockUpdateMutation exposes the
  // captured callbacks via the `_onSuccess`/`_onError` getters specifically
  // so tests can drive them directly, the same way the real
  // `api.lead.update.useMutation({ onSuccess, onError })` call in page.tsx
  // would invoke them after a real mutation settles.
  describe('update mutation callbacks', () => {
    it('onSuccess: shows a success toast, invalidates caches, and navigates to the detail page', async () => {
      vi.useFakeTimers();
      render(<EditLeadPage />);

      const { _onSuccess } = mockUpdateMutation.mock.results[0]!.value as {
        _onSuccess: () => void | Promise<void>;
      };
      await act(async () => {
        await _onSuccess();
      });

      expect(mockInvalidateGetById).toHaveBeenCalledWith({ id: 'test-lead-id' });
      expect(mockInvalidateList).toHaveBeenCalled();
      expect(mockInvalidateStats).toHaveBeenCalled();

      expect(screen.getByTestId('toast-title').textContent).toBe('Lead updated');
      expect(screen.getByTestId('toast-description').textContent).toBe(
        'Changes saved successfully.'
      );

      expect(mockPush).not.toHaveBeenCalled();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      expect(mockPush).toHaveBeenCalledWith('/leads/test-lead-id');

      vi.useRealTimers();
    });

    it('onError: shows a destructive toast with the mutation error message and does not navigate', () => {
      render(<EditLeadPage />);

      const { _onError } = mockUpdateMutation.mock.results[0]!.value as {
        _onError: (err: { message: string }) => void;
      };
      act(() => {
        _onError({ message: 'Lead was updated by someone else' });
      });

      expect(screen.getByTestId('toast-title').textContent).toBe('Failed to update lead');
      expect(screen.getByTestId('toast-description').textContent).toBe(
        'Lead was updated by someone else'
      );
      expect(mockPush).not.toHaveBeenCalled();
      expect(mockInvalidateGetById).not.toHaveBeenCalled();
    });
  });
});
