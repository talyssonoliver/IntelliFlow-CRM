import { createRef } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { IndustryTab, type IndustryRow, type IndustryTabHandle } from '../IndustryTab';

describe('IndustryTab', () => {
  const rows: IndustryRow[] = [
    { id: 'a', label: 'Retail', key: 'retail', sortOrder: 0, isActive: true },
    { id: 'b', label: 'Healthcare', key: 'healthcare', sortOrder: 1, isActive: false },
  ];

  it('renders rows', () => {
    render(<IndustryTab rows={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByTestId('industry-row-retail')).toBeTruthy();
    expect(screen.getByTestId('industry-row-healthcare')).toBeTruthy();
  });

  it('renders empty state when no rows', () => {
    render(<IndustryTab rows={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/no industries yet/i)).toBeTruthy();
  });

  it('calls onDelete when delete clicked', () => {
    const onDelete = vi.fn();
    render(<IndustryTab rows={rows} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />);
    const deleteButtons = screen.getAllByRole('button', { name: /^delete$/i });
    fireEvent.click(deleteButtons[0]);
    expect(onDelete).toHaveBeenCalledWith('a');
  });

  it('exposes openCreate via ref and submits a create', () => {
    const onCreate = vi.fn();
    const ref = createRef<IndustryTabHandle>();
    render(
      <IndustryTab
        ref={ref}
        rows={rows}
        onCreate={onCreate}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    act(() => ref.current?.openCreate());
    const labelInput = screen.getByLabelText(/^label$/i) as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'Agriculture' } });
    fireEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(onCreate).toHaveBeenCalledWith('Agriculture');
  });
});
