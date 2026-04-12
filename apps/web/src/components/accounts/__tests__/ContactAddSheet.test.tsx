// @vitest-environment jsdom
/**
 * ContactAddSheet Tests (IFC-267)
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactAddSheet } from '../ContactAddSheet';

const mockToast = vi.fn();

vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...(actual as Record<string, unknown>),
    Sheet: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
      open ? <div data-testid="sheet">{children}</div> : null,
    SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SheetTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
    SheetDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
    Button: ({
      children,
      onClick,
      type,
      disabled,
      ...props
    }: {
      children?: React.ReactNode;
      onClick?: () => void;
      type?: string;
      disabled?: boolean;
      [key: string]: unknown;
    }) => (
      <button onClick={onClick} type={type as 'button' | 'submit'} disabled={disabled} {...props}>
        {children}
      </button>
    ),
    Input: ({ id, value, onChange, type, ...props }: Record<string, unknown>) => (
      <input
        id={id as string}
        value={value as string}
        onChange={onChange as React.ChangeEventHandler<HTMLInputElement>}
        type={(type as string) ?? 'text'}
        {...(props as Record<string, unknown>)}
      />
    ),
    Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
      <label htmlFor={htmlFor}>{children}</label>
    ),
    toast: (...args: unknown[]) => mockToast(...args),
  };
});

let mutateFn: ReturnType<typeof vi.fn>;
let mutationOpts: { onSuccess?: () => void; onError?: (err: { message: string }) => void };
let isPendingValue = false;

const mockInvalidateContacts = vi.fn();
const mockInvalidateById = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    contact: {
      create: {
        useMutation: (opts: {
          onSuccess?: () => void;
          onError?: (err: { message: string }) => void;
        }) => {
          mutationOpts = opts;
          return { mutate: mutateFn, isPending: isPendingValue };
        },
      },
    },
    useUtils: () => ({
      account: {
        getContacts: { invalidate: mockInvalidateContacts },
        getById: { invalidate: mockInvalidateById },
      },
    }),
  },
}));

const TEST_ACCOUNT_ID = '00000000-0000-4000-8000-000000000001';

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  accountId: TEST_ACCOUNT_ID,
  accountName: 'TechCorp Inc',
  onSuccess: vi.fn(),
};

describe('ContactAddSheet', () => {
  beforeEach(() => {
    mutateFn = vi.fn();
    isPendingValue = false;
    mockToast.mockReset();
    mockInvalidateContacts.mockReset();
    mockInvalidateById.mockReset();
    defaultProps.onOpenChange = vi.fn();
    defaultProps.onSuccess = vi.fn();
  });

  it('renders sheet content when open=true', () => {
    render(<ContactAddSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Add Contact' })).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<ContactAddSheet {...defaultProps} open={false} />);
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('shows "Add Contact" as sheet title', () => {
    render(<ContactAddSheet {...defaultProps} />);
    expect(screen.getByRole('heading', { name: 'Add Contact' })).toBeInTheDocument();
  });

  it('shows account name in description', () => {
    render(<ContactAddSheet {...defaultProps} />);
    expect(screen.getByText(/linked to TechCorp Inc/)).toBeInTheDocument();
  });

  it('validates firstName is required', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    // Fill other fields but leave firstName empty
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.type(screen.getByLabelText(/Email/), 'john@test.com');
    await user.type(screen.getByLabelText(/Phone/), '+15551234567');

    // Find the submit button (the one that says "Add Contact" that is a submit type)
    const form = screen.getByLabelText(/First Name/).closest('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByText('First name is required')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('validates lastName is required', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Email/), 'john@test.com');
    await user.type(screen.getByLabelText(/Phone/), '+15551234567');

    fireEvent.submit(screen.getByLabelText(/First Name/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Last name is required')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('validates email is required', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.type(screen.getByLabelText(/Phone/), '+15551234567');

    fireEvent.submit(screen.getByLabelText(/First Name/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Email is required')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('validates phone is required', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.type(screen.getByLabelText(/Email/), 'john@test.com');

    fireEvent.submit(screen.getByLabelText(/First Name/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Phone is required')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('validates email format', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.type(screen.getByLabelText(/Email/), 'not-an-email');
    await user.type(screen.getByLabelText(/Phone/), '+15551234567');

    fireEvent.submit(screen.getByLabelText(/First Name/).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Invalid email format')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('pre-fills accountId and submits with all required fields', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.type(screen.getByLabelText(/First Name/), 'John');
    await user.type(screen.getByLabelText(/Last Name/), 'Doe');
    await user.type(screen.getByLabelText(/Email/), 'john@test.com');
    await user.type(screen.getByLabelText(/Phone/), '+15551234567');

    fireEvent.submit(screen.getByLabelText(/First Name/).closest('form')!);

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalledWith({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '+15551234567',
        accountId: TEST_ACCOUNT_ID,
      });
    });
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    render(<ContactAddSheet {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('on success: closes sheet, shows toast, calls onSuccess', () => {
    render(<ContactAddSheet {...defaultProps} />);

    mutationOpts.onSuccess!();

    expect(mockInvalidateContacts).toHaveBeenCalledWith({ accountId: TEST_ACCOUNT_ID });
    expect(mockInvalidateById).toHaveBeenCalledWith({ id: TEST_ACCOUNT_ID });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contact created' }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(defaultProps.onSuccess).toHaveBeenCalled();
  });

  it('on error: shows destructive toast, sheet stays open', () => {
    render(<ContactAddSheet {...defaultProps} />);

    mutationOpts.onError!({ message: 'Something went wrong' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to create contact' })
    );
    expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('on FK error: shows "Account may have been deleted" message', () => {
    render(<ContactAddSheet {...defaultProps} />);

    mutationOpts.onError!({ message: 'Record not found' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Account may have been deleted. Please refresh.',
        variant: 'destructive',
      })
    );
  });

  it('resets form fields when sheet is reopened', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ContactAddSheet {...defaultProps} />);

    const firstNameInput = screen.getByLabelText(/First Name/) as HTMLInputElement;
    await user.type(firstNameInput, 'John');
    expect(firstNameInput.value).toBe('John');

    // Close and reopen
    rerender(<ContactAddSheet {...defaultProps} open={false} />);
    rerender(<ContactAddSheet {...defaultProps} open={true} />);

    await waitFor(() => {
      const refreshedInput = screen.getByLabelText(/First Name/) as HTMLInputElement;
      expect(refreshedInput.value).toBe('');
    });
  });

  it('submit button disabled when isPending=true', () => {
    isPendingValue = true;
    render(<ContactAddSheet {...defaultProps} />);

    const submitBtn = screen.getByText('Adding...');
    expect(submitBtn).toBeDisabled();
    isPendingValue = false;
  });

  it('has proper accessibility attributes on form fields', () => {
    render(<ContactAddSheet {...defaultProps} />);
    expect(screen.getByLabelText(/First Name/)).toHaveAttribute('id', 'contact-first-name');
    expect(screen.getByLabelText(/Last Name/)).toHaveAttribute('id', 'contact-last-name');
    expect(screen.getByLabelText(/Email/)).toHaveAttribute('id', 'contact-email');
    expect(screen.getByLabelText(/Phone/)).toHaveAttribute('id', 'contact-phone');
  });
});
