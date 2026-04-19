/**
 * CustomFieldsTab Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests empty state, table rendering, add/edit dialog flows,
 * and delete confirmation trigger.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { CustomField } from '../components/CustomFieldsTab';

// ─── @intelliflow/ui mock (partial — preserve real exports like EmptyState) ─
vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({
    children,
    onClick,
    disabled,
    variant,
    size,
    className,
    'aria-label': ariaLabel,
    ...props
  }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      data-size={size}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </button>
  ),
  Input: ({ value, onChange, id, placeholder, className, ...props }: any) => (
    <input
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      {...props}
    />
  ),
  Dialog: ({ children, open, onOpenChange }: any) =>
    // happy-dom's implicit `role="dialog"` on `<dialog>` only applies when the
    // element is actually open, so add the `open` attribute explicitly rather
    // than relying on the conditional render.
    open ? (
      <dialog data-testid="dialog" open role="dialog">
        {typeof children === 'function' ? children({ onOpenChange }) : children}
      </dialog>
    ) : null,
  DialogContent: ({ children }: any) => <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogFooter: ({ children }: any) => <div data-testid="dialog-footer">{children}</div>,
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {React.Children.map(children, (child: any) => React.cloneElement(child, { onValueChange }))}
    </div>
  ),
  SelectTrigger: ({ children, id }: any) => (
    <button data-testid="select-trigger" id={id}>
      {children}
    </button>
  ),
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children, onValueChange }: any) => (
    <div data-testid="select-content">
      {React.Children.map(children, (child: any) => React.cloneElement(child, { onValueChange }))}
    </div>
  ),
  SelectItem: ({ children, value, onValueChange }: any) => (
    <option
      data-testid="select-item"
      data-value={value}
      aria-selected={false}
      tabIndex={0}
      onClick={() => onValueChange?.(value)}
      onKeyDown={(e: any) => {
        if (e.key === 'Enter') onValueChange?.(value);
      }}
    >
      {children}
    </option>
  ),
  ConfirmationDialog: ({ open, onConfirm, title, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm Delete</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
}));

// Need React for the Select mock's React.Children.map
import React from 'react';

// Import after mocks
import { CustomFieldsTab } from '../components/CustomFieldsTab';

const mockFields: CustomField[] = [
  {
    id: 'field-1',
    fieldName: 'Company Size',
    fieldKey: 'company_size',
    dataType: 'text',
    isRequired: false,
    sortOrder: 0,
    options: null,
  },
  {
    id: 'field-2',
    fieldName: 'Annual Revenue',
    fieldKey: 'annual_revenue',
    dataType: 'currency',
    isRequired: true,
    sortOrder: 1,
    options: null,
  },
  {
    id: 'field-3',
    fieldName: 'Industry',
    fieldKey: 'industry',
    dataType: 'dropdown',
    isRequired: false,
    sortOrder: 2,
    options: { values: ['Tech', 'Finance', 'Healthcare'] },
  },
];

describe('CustomFieldsTab', () => {
  let onCreate: any;
  let onUpdate: any;
  let onDelete: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onCreate = vi.fn();
    onUpdate = vi.fn();
    onDelete = vi.fn();
  });

  // ─── Empty state ──────────────────────────────────────────────────────────

  it('shows empty state message when no fields', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    // EmptyState entity="rules" → canonical 'No rules configured' (semantic
    // misuse for custom fields — dedicated 'custom-fields' entity follow-up).
    expect(screen.getByText('No rules configured')).toBeInTheDocument();
  });

  it('shows Add Field button even in empty state', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    expect(screen.getByText('Add Field')).toBeInTheDocument();
  });

  it('does not render table in empty state', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // ─── Table rendering ──────────────────────────────────────────────────────

  it('renders table with field data when fields are provided', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Company Size')).toBeInTheDocument();
    expect(screen.getByText('Annual Revenue')).toBeInTheDocument();
    expect(screen.getByText('Industry')).toBeInTheDocument();
  });

  it('renders table headers', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Field Name')).toBeInTheDocument();
    expect(screen.getByText('Data Type')).toBeInTheDocument();
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('renders data types for each field', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('text')).toBeInTheDocument();
    expect(screen.getByText('currency')).toBeInTheDocument();
    expect(screen.getByText('dropdown')).toBeInTheDocument();
  });

  it('renders Yes/No for isRequired correctly', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    // Annual Revenue is required
    expect(screen.getByText('Yes')).toBeInTheDocument();
    // Company Size and Industry are not required
    const noCells = screen.getAllByText('No');
    expect(noCells).toHaveLength(2);
  });

  it('renders edit and delete buttons for each field', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const editBtns = screen.getAllByRole('button', { name: /Edit/ });
    expect(editBtns).toHaveLength(mockFields.length);

    const deleteBtns = screen.getAllByRole('button', { name: /Delete/ });
    expect(deleteBtns).toHaveLength(mockFields.length);
  });

  // ─── Add Field dialog ──────────────────────────────────────────────────────

  it('Add Field button opens the create dialog', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Add Field'));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Add Custom Field')).toBeInTheDocument();
  });

  it('Add Field dialog contains a field name input', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));

    expect(screen.getByPlaceholderText('e.g., Company Size')).toBeInTheDocument();
  });

  it('Create button is disabled when field name is empty', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));

    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).toBeDisabled();
  });

  it('Create button is enabled when field name is filled in', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));

    const nameInput = screen.getByPlaceholderText('e.g., Company Size');
    fireEvent.change(nameInput, { target: { value: 'New Field' } });

    const createBtn = screen.getByRole('button', { name: 'Create' });
    expect(createBtn).not.toBeDisabled();
  });

  it('Submitting add form calls onCreate with field data', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));

    const nameInput = screen.getByPlaceholderText('e.g., Company Size');
    fireEvent.change(nameInput, { target: { value: 'Budget Range' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledOnce();
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: 'Budget Range',
        dataType: 'text',
      })
    );
  });

  // ─── Edit dialog ──────────────────────────────────────────────────────────

  it('Edit button opens dialog pre-filled with field data', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const editBtns = screen.getAllByRole('button', { name: /Edit Company Size/ });
    fireEvent.click(editBtns[0]);

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Edit Custom Field')).toBeInTheDocument();

    // The input should be pre-filled with the existing field name
    const nameInput = screen.getByDisplayValue('Company Size');
    expect(nameInput).toBeInTheDocument();
  });

  it('Submitting edit form calls onUpdate with field id and updated data', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const editBtns = screen.getAllByRole('button', { name: /Edit Company Size/ });
    fireEvent.click(editBtns[0]);

    const nameInput = screen.getByDisplayValue('Company Size');
    fireEvent.change(nameInput, { target: { value: 'Company Size Updated' } });

    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'field-1',
        fieldName: 'Company Size Updated',
      })
    );
  });

  // ─── Delete confirmation ───────────────────────────────────────────────────

  it('Delete button triggers confirmation dialog', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const deleteBtns = screen.getAllByRole('button', { name: /Delete Company Size/ });
    fireEvent.click(deleteBtns[0]);

    expect(screen.getByTestId('confirmation-dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete Custom Field')).toBeInTheDocument();
  });

  it('Confirming delete calls onDelete with the field id', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const deleteBtns = screen.getAllByRole('button', { name: /Delete Annual Revenue/ });
    fireEvent.click(deleteBtns[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Confirm Delete' }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(onDelete).toHaveBeenCalledWith('field-2');
  });

  it('Cancelling delete does not call onDelete', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const deleteBtns = screen.getAllByRole('button', { name: /Delete Company Size/ });
    fireEvent.click(deleteBtns[0]);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByTestId('confirmation-dialog')).not.toBeInTheDocument();
  });

  // ─── Dialog cancel ────────────────────────────────────────────────────────

  it('Cancel button in the create dialog closes the dialog', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('Cancel button in the edit dialog closes the dialog without calling onUpdate', () => {
    render(
      <CustomFieldsTab
        fields={mockFields}
        onCreate={onCreate}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    );

    const editBtns = screen.getAllByRole('button', { name: /Edit Company Size/ });
    fireEvent.click(editBtns[0]);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  // ─── Data type selection ──────────────────────────────────────────────────

  it('clicking a SelectItem calls onValueChange and updates the dataType passed to onCreate', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    fireEvent.click(screen.getByText('Add Field'));

    // Fill in the field name
    const nameInput = screen.getByPlaceholderText('e.g., Company Size');
    fireEvent.change(nameInput, { target: { value: 'Budget' } });

    // The Select mock now passes onValueChange down through SelectContent to SelectItem.
    // Clicking the 'number' option fires onValueChange('number').
    const numberItem = screen
      .getAllByRole('option')
      .find((el) => el.getAttribute('data-value') === 'number');
    expect(numberItem).toBeTruthy();
    fireEvent.click(numberItem!);

    // Submit — dataType should now be 'number'
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: 'Budget', dataType: 'number' })
    );
  });

  // ─── Heading ──────────────────────────────────────────────────────────────

  it('renders Custom Fields heading', () => {
    render(
      <CustomFieldsTab fields={[]} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} />
    );

    expect(screen.getByText('Custom Fields')).toBeInTheDocument();
  });
});
