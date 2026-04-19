import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DealScoringCard, type DealScoringRuleRow } from '../DealScoringCard';

const rules: DealScoringRuleRow[] = [
  {
    id: 's1',
    name: 'High-value deals',
    field: 'value',
    operator: 'gte',
    valueJson: { type: 'number', value: 50000 },
    points: 10,
    isActive: true,
    sortOrder: 0,
  },
];

describe('DealScoringCard', () => {
  it('renders empty state with IFC-312 note', () => {
    render(<DealScoringCard rules={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    expect(screen.getByText(/Runtime scoring engine delivered by IFC-312/i)).toBeDefined();
    expect(screen.getByText(/No scoring rules yet/i)).toBeDefined();
  });

  it('renders a rule row', () => {
    render(
      <DealScoringCard rules={rules} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />
    );
    expect(screen.getByText('High-value deals')).toBeDefined();
  });

  it('opens Add Rule dialog', () => {
    render(<DealScoringCard rules={[]} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    expect(screen.getByText(/Add scoring rule/i)).toBeDefined();
  });

  it('deletes a rule', () => {
    const onDelete = vi.fn();
    render(
      <DealScoringCard rules={rules} onCreate={vi.fn()} onUpdate={vi.fn()} onDelete={onDelete} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('s1');
  });
});
