import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import {
  CustomFieldsTab,
  type CustomFieldRow,
  type CustomFieldsTabHandle,
} from '../CustomFieldsTab';

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

  it('calls onDelete when delete clicked', () => {
    const onDelete = vi.fn();
    render(
      <CustomFieldsTab rows={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    expect(onDelete).toHaveBeenCalledWith('f1');
  });

  it('exposes openCreate via ref', () => {
    const onCreate = vi.fn();
    const ref = createRef<CustomFieldsTabHandle>();
    render(
      <CustomFieldsTab
        ref={ref}
        rows={rows}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    act(() => ref.current?.openCreate());
    const nameInput = screen.getByLabelText(/field name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Segment Code' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalled();
  });
});
