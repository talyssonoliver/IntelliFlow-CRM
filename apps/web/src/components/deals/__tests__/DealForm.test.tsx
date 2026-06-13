/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const ACCOUNT_ID_1 = '11111111-1111-4111-8111-111111111111';
const ACCOUNT_ID_2 = '22222222-2222-4222-8222-222222222222';
const CONTACT_ID_1 = '33333333-3333-4333-8333-333333333333';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  Button: ({
    children,
    asChild,
    ...props
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean;
    variant?: string;
  }) => {
    if (asChild) {
      return <>{children}</>;
    }

    return <button {...props}>{children}</button>;
  },
  Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
    (props, ref) => <input ref={ref} {...props} />
  ),
  Label: ({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
  Textarea: React.forwardRef<
    HTMLTextAreaElement,
    React.TextareaHTMLAttributes<HTMLTextAreaElement>
  >((props, ref) => <textarea ref={ref} {...props} />),
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => (
    <div data-testid="stage-select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children, id }: { children: React.ReactNode; id?: string }) => (
    <div id={id}>{children}</div>
  ),
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <div data-testid={`stage-option-${value}`}>{children}</div>
  ),
}));

vi.mock('@/components/tasks/EntitySearchField', () => ({
  EntitySearchField: (props: {
    entityType: 'account' | 'contact';
    value: string;
    valueName: string;
    onChange: (id: string, name: string) => void;
    accountId?: string;
    disabled?: boolean;
  }) => {
    return (
      <div
        data-testid={`entity-search-${props.entityType}`}
        data-value={props.value}
        data-account-id={props.accountId ?? ''}
        data-disabled={String(Boolean(props.disabled))}
      >
        <span>{props.valueName || `Search ${props.entityType}s...`}</span>
        {props.entityType === 'account' ? (
          <>
            <button type="button" onClick={() => props.onChange(ACCOUNT_ID_1, 'Acme Corp')}>
              Pick account
            </button>
            <button type="button" onClick={() => props.onChange(ACCOUNT_ID_2, 'Beta Corp')}>
              Switch account
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => props.onChange(CONTACT_ID_1, 'Alice Doe')}
          >
            Pick contact
          </button>
        )}
      </div>
    );
  },
}));

vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
  } & Record<string, unknown>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { DealForm, type DealFormProps } from '../DealForm';

const defaultProps: DealFormProps = {
  onSubmit: vi.fn(),
  isSubmitting: false,
  mode: 'create',
};

function renderDealForm(overrides?: Partial<DealFormProps>) {
  return render(<DealForm {...defaultProps} {...overrides} />);
}

describe('DealForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the create form with default prospecting values', () => {
    renderDealForm();

    expect(screen.getByLabelText(/deal name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/deal value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/probability/i)).toHaveValue(10);
    expect(screen.getByText(/select an account before linking a contact/i)).toBeInTheDocument();
    expect(screen.getByTestId('entity-search-contact')).toHaveAttribute('data-disabled', 'true');
  });

  it('reports dirty state when the user edits the form', async () => {
    const onDirtyChange = vi.fn();
    renderDealForm({ onDirtyChange });

    fireEvent.change(screen.getByLabelText(/deal name/i), {
      target: { value: 'Enterprise Expansion' },
    });

    await waitFor(() => {
      expect(onDirtyChange).toHaveBeenLastCalledWith(true);
    });
  });

  it('validates account selection before submit', async () => {
    const onSubmit = vi.fn();
    renderDealForm({ onSubmit });

    fireEvent.change(screen.getByLabelText(/deal name/i), {
      target: { value: 'Enterprise Expansion' },
    });
    fireEvent.change(screen.getByLabelText(/deal value/i), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByText('Create Deal'));

    await waitFor(() => {
      expect(screen.getByText('Account is required')).toBeInTheDocument();
    });

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the selected account and contact when the form is valid', async () => {
    const onSubmit = vi.fn();
    renderDealForm({ onSubmit });

    fireEvent.change(screen.getByLabelText(/deal name/i), {
      target: { value: 'Enterprise Expansion' },
    });
    fireEvent.change(screen.getByLabelText(/deal value/i), {
      target: { value: '50000' },
    });
    fireEvent.change(screen.getByLabelText(/expected close date/i), {
      target: { value: '2026-07-01' },
    });
    fireEvent.change(screen.getByLabelText(/description/i), {
      target: { value: 'Strategic expansion into EMEA' },
    });

    fireEvent.click(screen.getByText('Pick account'));

    await waitFor(() => {
      expect(screen.getByTestId('entity-search-contact')).toHaveAttribute(
        'data-account-id',
        ACCOUNT_ID_1
      );
      expect(screen.getByTestId('entity-search-contact')).toHaveAttribute('data-disabled', 'false');
    });

    fireEvent.click(screen.getByText('Pick contact'));
    fireEvent.click(screen.getByText('Create Deal'));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Enterprise Expansion',
      value: { amount: 50000, currency: 'GBP' },
      stage: 'PROSPECTING',
      probability: 10,
      expectedCloseDate: '2026-07-01',
      accountId: ACCOUNT_ID_1,
      accountName: 'Acme Corp',
      contactId: CONTACT_ID_1,
      contactName: 'Alice Doe',
      description: 'Strategic expansion into EMEA',
    });
  });

  it('clears the selected contact when the account changes', async () => {
    renderDealForm({
      initialData: {
        accountId: ACCOUNT_ID_1,
        accountName: 'Acme Corp',
        contactId: CONTACT_ID_1,
        contactName: 'Alice Doe',
      },
    });

    expect(screen.getByTestId('entity-search-contact')).toHaveAttribute('data-value', CONTACT_ID_1);

    fireEvent.click(screen.getByText('Switch account'));

    await waitFor(() => {
      expect(screen.getByTestId('entity-search-contact')).toHaveAttribute('data-value', '');
      expect(screen.getByTestId('entity-search-contact')).toHaveAttribute(
        'data-account-id',
        ACCOUNT_ID_2
      );
      expect(screen.getByText('Search contacts...')).toBeInTheDocument();
    });
  });

  it('disables submit while the create mutation is pending', () => {
    renderDealForm({ isSubmitting: true });

    expect(screen.getByText('Creating...')).toBeDisabled();
  });

  it('keeps the cancel action pointed at /deals', () => {
    renderDealForm();

    expect(screen.getByText('Cancel').closest('a')).toHaveAttribute('href', '/deals');
  });

  // IFC-280 — edit-mode label + dialog-friendly onCancel.
  it('renders "Saving..." while an edit submission is pending', () => {
    renderDealForm({ mode: 'edit', isSubmitting: true });

    expect(screen.getByText('Saving...')).toBeDisabled();
  });

  it('renders Cancel as a button calling onCancel when provided (dialog mode)', () => {
    const onCancel = vi.fn();
    renderDealForm({ mode: 'edit', onCancel });

    const cancel = screen.getByText('Cancel');
    expect(cancel.closest('a')).toBeNull();
    fireEvent.click(cancel);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
