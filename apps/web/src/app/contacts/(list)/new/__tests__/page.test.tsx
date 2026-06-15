/**
 * @vitest-environment jsdom
 *
 * IFC-266 — Contact CREATE page tests (T-03).
 *
 * Keeps the original IFC-253 F-07 auth-guard tests and adds wizard navigation,
 * step validation, conditional "other" branches, the submit payload mapping, the
 * success-redirect, error handling, and cancel navigation. No production code is
 * modified by this test.
 */

import * as React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

const mockPush = vi.fn();
let mockAuthState = {
  isLoading: false,
  isAuthenticated: true,
  user: { id: 'user-1', email: 'user@example.com' },
};

// Captured create-mutation lifecycle + spy (mock-prefixed so vi.mock factories may use them).
const mockCreateMutateAsync = vi.fn();
const mockCreateHandlers: {
  onSuccess?: () => void;
  onError?: (e: { message: string }) => void;
} = {};

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockUseRequireAuth = vi.fn(() => mockAuthState);
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => mockUseRequireAuth(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    contact: {
      create: {
        useMutation: (opts?: {
          onSuccess?: () => void;
          onError?: (e: { message: string }) => void;
        }) => {
          mockCreateHandlers.onSuccess = opts?.onSuccess;
          mockCreateHandlers.onError = opts?.onError;
          return { mutate: vi.fn(), mutateAsync: mockCreateMutateAsync, isPending: false };
        },
      },
    },
  },
}));

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Skeleton: ({ className }: any) => <div data-testid="skeleton" className={className} />,
  ToastProvider: ({ children }: any) => <div>{children}</div>,
  ToastViewport: () => null,
  Toast: ({ children, open }: any) => (open ? <output>{children}</output> : null),
  ToastTitle: ({ children }: any) => <div>{children}</div>,
  ToastDescription: ({ children }: any) => <div>{children}</div>,
  ToastClose: () => null,
}));

import CreateNewContactPage from '../page';

// ---------------------------------------------------------------------------
// Helpers — drive the 3-step wizard
// ---------------------------------------------------------------------------
function fillPersonalStep(overrides: Partial<Record<string, string>> = {}) {
  fireEvent.change(screen.getByLabelText(/First Name/i), {
    target: { value: overrides.firstName ?? 'Jane' },
  });
  fireEvent.change(screen.getByLabelText(/Last Name/i), {
    target: { value: overrides.lastName ?? 'Smith' },
  });
  fireEvent.change(screen.getByLabelText(/Email Address/i), {
    target: { value: overrides.email ?? 'jane@example.com' },
  });
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /Next Step/i }));
}

describe('CreateNewContactPage - Auth Guard (IFC-253 F-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHandlers.onSuccess = undefined;
    mockCreateHandlers.onError = undefined;
    mockCreateMutateAsync.mockResolvedValue(undefined);
    mockAuthState = {
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@example.com' },
    };
  });

  // F-07: the create page must invoke the useRequireAuth guard. The page delegates
  // the unauthenticated redirect to that hook (no bespoke guard in the page itself),
  // so the meaningful assertions are: the guard IS wired (called), and the form is
  // gated behind the hook's loading state. The redirect behaviour is the hook's own
  // contract, covered by AuthContext's tests — asserting "form still renders when
  // isAuthenticated:false" here would prove nothing (the hook is mocked).
  it('wires the useRequireAuth guard on mount (F-07)', () => {
    render(<CreateNewContactPage />);
    expect(mockUseRequireAuth).toHaveBeenCalled();
  });

  it('blocks the form behind a skeleton while auth is loading (F-07-NEG-01)', () => {
    mockAuthState = { isLoading: true, isAuthenticated: false, user: null as any };
    render(<CreateNewContactPage />);
    expect(screen.getAllByTestId('skeleton').length).toBeGreaterThan(0);
    expect(screen.queryByText('Personal Details')).not.toBeInTheDocument();
  });

  it('renders the form once auth resolves (authenticated)', () => {
    render(<CreateNewContactPage />);
    expect(mockUseRequireAuth).toHaveBeenCalled();
    expect(screen.getByText('Personal Details')).toBeInTheDocument();
  });
});

describe('CreateNewContactPage - Step Validation (T-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHandlers.onSuccess = undefined;
    mockCreateHandlers.onError = undefined;
    mockCreateMutateAsync.mockResolvedValue(undefined);
    mockAuthState = {
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@example.com' },
    };
  });

  it('blocks Next and shows required errors when step 1 is empty', () => {
    render(<CreateNewContactPage />);
    clickNext();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    expect(screen.getByText('Last name is required')).toBeInTheDocument();
    expect(screen.getByText('Email is required')).toBeInTheDocument();
    // Still on step 1.
    expect(screen.getByRole('heading', { name: 'Contact Information' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Company & Role' })).not.toBeInTheDocument();
  });

  it('rejects an invalid email format', () => {
    render(<CreateNewContactPage />);
    fillPersonalStep({ email: 'not-an-email' });
    clickNext();
    expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contact Information' })).toBeInTheDocument();
  });

  it('clears a field error once the user types', () => {
    render(<CreateNewContactPage />);
    clickNext();
    expect(screen.getByText('First name is required')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/First Name/i), { target: { value: 'Jane' } });
    expect(screen.queryByText('First name is required')).not.toBeInTheDocument();
  });
});

describe('CreateNewContactPage - Wizard Navigation (T-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHandlers.onSuccess = undefined;
    mockCreateHandlers.onError = undefined;
    mockCreateMutateAsync.mockResolvedValue(undefined);
    mockAuthState = {
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@example.com' },
    };
  });

  it('advances Step 1 → 2 → 3 with valid input and returns via Previous', () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    expect(screen.getByRole('heading', { name: 'Company & Role' })).toBeInTheDocument();
    clickNext();
    expect(screen.getByRole('heading', { name: 'Additional Information' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    expect(screen.getByRole('heading', { name: 'Company & Role' })).toBeInTheDocument();
  });

  it('requires departmentOther when department is "other"', () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'other' } });
    clickNext();
    expect(
      screen.getByText('Please specify the department', { selector: 'p' })
    ).toBeInTheDocument();
    // Still on step 2.
    expect(screen.getByRole('heading', { name: 'Company & Role' })).toBeInTheDocument();
  });

  it('requires contactTypeOther when contact type is "other"', () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    clickNext();
    fireEvent.change(screen.getByLabelText('Contact Type'), { target: { value: 'other' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Contact/i }));
    expect(
      screen.getByText('Please specify the contact type', { selector: 'p' })
    ).toBeInTheDocument();
    expect(mockCreateMutateAsync).not.toHaveBeenCalled();
  });
});

describe('CreateNewContactPage - Submit (T-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateHandlers.onSuccess = undefined;
    mockCreateHandlers.onError = undefined;
    mockCreateMutateAsync.mockResolvedValue(undefined);
    mockAuthState = {
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@example.com' },
    };
  });

  it('submits a correctly mapped payload (tags split, "other" department mapped)', async () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    // Step 2 — department "other" maps to the specified value.
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText(/Please specify the department/i), {
      target: { value: 'Legal' },
    });
    clickNext();
    // Step 3 — contact type + comma-separated tags.
    fireEvent.change(screen.getByLabelText('Contact Type'), { target: { value: 'customer' } });
    fireEvent.change(screen.getByLabelText(/Tags/i), { target: { value: 'vip, lead' } });
    fireEvent.click(screen.getByRole('button', { name: /Create Contact/i }));

    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
    const payload = mockCreateMutateAsync.mock.calls[0][0];
    expect(payload).toMatchObject({
      firstName: 'Jane',
      lastName: 'Smith',
      email: 'jane@example.com',
      department: 'Legal',
      contactType: 'customer',
      status: 'ACTIVE',
    });
    expect(payload.tags).toEqual(['vip', 'lead']);
  });

  it('maps contactType "other" to the literal "other"', async () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    clickNext();
    fireEvent.change(screen.getByLabelText('Contact Type'), { target: { value: 'other' } });
    fireEvent.change(screen.getByLabelText(/Please specify the contact type/i), {
      target: { value: 'Reseller' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Create Contact/i }));
    await waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockCreateMutateAsync.mock.calls[0][0].contactType).toBe('other');
  });

  it('redirects to /contacts after a successful create', async () => {
    vi.useFakeTimers();
    try {
      render(<CreateNewContactPage />);
      fillPersonalStep();
      clickNext();
      clickNext();
      fireEvent.click(screen.getByRole('button', { name: /Create Contact/i }));
      // Flush the awaited mutateAsync microtask, then fire the captured onSuccess.
      await vi.waitFor(() => expect(mockCreateMutateAsync).toHaveBeenCalled());
      act(() => mockCreateHandlers.onSuccess?.());
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(mockPush).toHaveBeenCalledWith('/contacts');
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a destructive toast on create error', async () => {
    render(<CreateNewContactPage />);
    fillPersonalStep();
    clickNext();
    clickNext();
    fireEvent.click(screen.getByRole('button', { name: /Create Contact/i }));
    await waitFor(() => expect(mockCreateHandlers.onError).toBeTypeOf('function'));
    act(() => mockCreateHandlers.onError?.({ message: 'Email already exists' }));
    expect(screen.getByText('Failed to create contact')).toBeInTheDocument();
    expect(screen.getByText('Email already exists')).toBeInTheDocument();
  });
});

describe('CreateNewContactPage - Cancel (T-03)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState = {
      isLoading: false,
      isAuthenticated: true,
      user: { id: 'user-1', email: 'user@example.com' },
    };
  });

  it('navigates back to /contacts when Cancel is clicked on step 1', () => {
    render(<CreateNewContactPage />);
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockPush).toHaveBeenCalledWith('/contacts');
  });
});
