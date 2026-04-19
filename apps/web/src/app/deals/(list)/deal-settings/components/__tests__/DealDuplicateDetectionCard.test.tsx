import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DealDuplicateDetectionCard,
  type DealDuplicateRuleRow,
} from '../DealDuplicateDetectionCard';

const rules: DealDuplicateRuleRow[] = [
  { field: 'name_account', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
  {
    field: 'name_amount_stage',
    matchStrategy: 'fuzzy',
    threshold: 85,
    isActive: false,
    sortOrder: 1,
  },
];

describe('DealDuplicateDetectionCard', () => {
  it('renders empty state with Add Rule CTA', () => {
    render(<DealDuplicateDetectionCard rules={[]} onRulesChange={vi.fn()} />);
    expect(screen.getByText(/no rules yet/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add Rule' })).toBeDefined();
  });

  it('renders rule rows with field and strategy', () => {
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={vi.fn()} />);
    expect(screen.getByText('Name + account')).toBeDefined();
    expect(screen.getByText('Name + amount + stage')).toBeDefined();
  });

  it('adds a new rule when Add Rule is clicked', () => {
    const onChange = vi.fn();
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];
    expect(next.length).toBe(3);
  });

  it('shows threshold input only for fuzzy rules', () => {
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={vi.fn()} />);
    const thresholds = screen.queryAllByLabelText(/threshold/i);
    expect(thresholds.length).toBe(1);
  });

  it('removes a rule', () => {
    const onChange = vi.fn();
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];
    expect(next.length).toBe(1);
  });
});
