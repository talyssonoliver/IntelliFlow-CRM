import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomFieldsTab, type CustomFieldRow } from '../CustomFieldsTab';

describe('CustomFieldsTab', () => {
  const rows: CustomFieldRow[] = [
    {
      id: 'f1',
      fieldName: 'Region',
      fieldKey: 'region',
      dataType: 'text',
      isRequired: false,
      options: null,
    },
  ];

  it('renders rows', () => {
    render(
      <CustomFieldsTab rows={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByTestId('field-row-region')).toBeTruthy();
  });

  it('renders empty state when no rows', () => {
    render(<CustomFieldsTab rows={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no custom fields yet/i)).toBeTruthy();
  });

  it('opens add dialog and submits create', () => {
    const onCreate = vi.fn();
    render(<CustomFieldsTab rows={[]} onCreate={onCreate} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /add field/i }));
    const nameInput = screen.getByLabelText(/field name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Segment Code' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldName: 'Segment Code',
        dataType: 'text',
        isRequired: false,
      })
    );
  });

  it('calls onDelete when delete clicked', () => {
    const onDelete = vi.fn();
    render(
      <CustomFieldsTab rows={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('f1');
  });
});
