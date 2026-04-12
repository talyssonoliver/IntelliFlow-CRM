// @vitest-environment jsdom
/**
 * OpportunityCreateSheet Tests (IFC-267)
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpportunityCreateSheet } from '../OpportunityCreateSheet';

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

vi.mock('@intelliflow/domain', () => ({
  OPPORTUNITY_STAGES: [
    'PROSPECTING',
    'QUALIFICATION',
    'PROPOSAL',
    'NEGOTIATION',
    'CLOSED_WON',
    'CLOSED_LOST',
  ],
}));

let mutateFn: ReturnType<typeof vi.fn>;
let mutationOpts: { onSuccess?: () => void; onError?: (err: { message: string }) => void };
let isPendingValue = false;

const mockInvalidateOpportunities = vi.fn();
const mockInvalidateById = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    opportunity: {
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
        getOpportunities: { invalidate: mockInvalidateOpportunities },
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

describe('OpportunityCreateSheet', () => {
  beforeEach(() => {
    mutateFn = vi.fn();
    isPendingValue = false;
    mockToast.mockReset();
    mockInvalidateOpportunities.mockReset();
    mockInvalidateById.mockReset();
    defaultProps.onOpenChange = vi.fn();
    defaultProps.onSuccess = vi.fn();
  });

  it('renders sheet content when open=true', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    expect(screen.getByTestId('sheet')).toBeInTheDocument();
    expect(screen.getByText('New Deal')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<OpportunityCreateSheet {...defaultProps} open={false} />);
    expect(screen.queryByTestId('sheet')).not.toBeInTheDocument();
  });

  it('shows "New Deal" as sheet title', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    expect(screen.getByText('New Deal')).toBeInTheDocument();
  });

  it('shows account name in description', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    expect(screen.getByText(/linked to TechCorp Inc/)).toBeInTheDocument();
  });

  it('validates name is required — empty name shows error', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);

    // Fill value but leave name empty
    const valueInput = screen.getByLabelText(/Value/);
    await user.type(valueInput, '10000');

    // Submit
    fireEvent.submit(screen.getByText('Create Deal').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('validates value is required — empty value shows error', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);

    // Fill name but leave value empty
    const nameInput = screen.getByLabelText(/Name/);
    await user.type(nameInput, 'Test Deal');

    fireEvent.submit(screen.getByText('Create Deal').closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Value must be a non-negative number')).toBeInTheDocument();
    });
    expect(mutateFn).not.toHaveBeenCalled();
  });

  it('pre-fills accountId and submits with minimum required fields', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);

    const nameInput = screen.getByLabelText(/Name/);
    const valueInput = screen.getByLabelText(/Value/);
    await user.type(nameInput, 'Big Deal');
    await user.type(valueInput, '50000');

    fireEvent.submit(screen.getByText('Create Deal').closest('form')!);

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Big Deal',
          value: { amount: 50000, currency: 'USD' },
          stage: 'PROSPECTING',
          probability: 10,
          accountId: TEST_ACCOUNT_ID,
        })
      );
    });
  });

  it('cancel button calls onOpenChange(false)', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);

    await user.click(screen.getByText('Cancel'));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
  });

  it('on success: closes sheet, shows toast, calls onSuccess', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);

    // Trigger the onSuccess callback from the mutation
    mutationOpts.onSuccess!();

    expect(mockInvalidateOpportunities).toHaveBeenCalledWith({ accountId: TEST_ACCOUNT_ID });
    expect(mockInvalidateById).toHaveBeenCalledWith({ id: TEST_ACCOUNT_ID });
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Deal created' }));
    expect(defaultProps.onOpenChange).toHaveBeenCalledWith(false);
    expect(defaultProps.onSuccess).toHaveBeenCalled();
  });

  it('on error: shows destructive toast, sheet stays open', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);

    mutationOpts.onError!({ message: 'Something went wrong' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'destructive', title: 'Failed to create deal' })
    );
    // onOpenChange should NOT have been called with false on error
    expect(defaultProps.onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('on FK error: shows "Account may have been deleted" message', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);

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
    const { rerender } = render(<OpportunityCreateSheet {...defaultProps} />);

    // Fill in fields
    const nameInput = screen.getByLabelText(/Name/) as HTMLInputElement;
    await user.type(nameInput, 'Test');
    expect(nameInput.value).toBe('Test');

    // Close and reopen
    rerender(<OpportunityCreateSheet {...defaultProps} open={false} />);
    rerender(<OpportunityCreateSheet {...defaultProps} open={true} />);

    await waitFor(() => {
      const refreshedInput = screen.getByLabelText(/Name/) as HTMLInputElement;
      expect(refreshedInput.value).toBe('');
    });
  });

  it('submit button disabled when isPending=true', () => {
    isPendingValue = true;
    render(<OpportunityCreateSheet {...defaultProps} />);

    const submitBtn = screen.getByText('Creating...');
    expect(submitBtn).toBeDisabled();
    isPendingValue = false;
  });

  it('renders stage select with PROSPECTING as default', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    const stageSelect = screen.getByLabelText(/Stage/) as HTMLSelectElement;
    expect(stageSelect.value).toBe('PROSPECTING');
  });

  it('has proper accessibility attributes on form fields', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    const nameInput = screen.getByLabelText(/Name/);
    expect(nameInput).toHaveAttribute('id', 'opp-name');
    const valueInput = screen.getByLabelText(/Value/);
    expect(valueInput).toHaveAttribute('id', 'opp-value');
  });

  it('updates stage select value', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    const stageSelect = screen.getByLabelText(/Stage/) as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: 'PROPOSAL' } });
    expect(stageSelect.value).toBe('PROPOSAL');
  });

  it('updates expected close date field', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);
    const dateInput = screen.getByLabelText(/Expected Close Date/) as HTMLInputElement;
    await user.type(dateInput, '2026-06-01');
    expect(dateInput.value).toBe('2026-06-01');
  });

  it('updates description field', () => {
    render(<OpportunityCreateSheet {...defaultProps} />);
    const desc = screen.getByLabelText(/Description/) as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'Test description' } });
    expect(desc.value).toBe('Test description');
  });

  it('submits with optional fields included', async () => {
    const user = userEvent.setup();
    render(<OpportunityCreateSheet {...defaultProps} />);
    await user.type(screen.getByLabelText(/Name/), 'Full Deal');
    await user.type(screen.getByLabelText(/Value/), '25000');
    fireEvent.change(screen.getByLabelText(/Stage/), { target: { value: 'NEGOTIATION' } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: 'Important deal' } });

    fireEvent.submit(screen.getByText('Create Deal').closest('form')!);

    await waitFor(() => {
      expect(mutateFn).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Full Deal',
          value: { amount: 25000, currency: 'USD' },
          stage: 'NEGOTIATION',
          description: 'Important deal',
        })
      );
    });
  });
});
