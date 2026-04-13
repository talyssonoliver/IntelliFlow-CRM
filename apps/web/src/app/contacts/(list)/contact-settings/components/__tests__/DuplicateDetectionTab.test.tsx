import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DuplicateDetectionTab,
  type DuplicateRuleRow,
} from '../DuplicateDetectionTab';

const baseRules: DuplicateRuleRow[] = [
  {
    field: 'email',
    matchStrategy: 'exact',
    threshold: 100,
    isActive: true,
    sortOrder: 0,
  },
  {
    field: 'phone',
    matchStrategy: 'normalized',
    threshold: 100,
    isActive: true,
    sortOrder: 1,
  },
];

describe('DuplicateDetectionTab', () => {
  it('renders one row per rule', () => {
    render(<DuplicateDetectionTab rules={baseRules} onRulesChange={() => {}} />);
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
  });

  it('clamps threshold to 0..100', () => {
    const onRulesChange = vi.fn();
    render(<DuplicateDetectionTab rules={baseRules} onRulesChange={onRulesChange} />);
    const input = screen.getAllByLabelText('Threshold')[0] as HTMLInputElement;
    fireEvent.change(input, { target: { value: '250' } });
    expect(onRulesChange).toHaveBeenCalled();
    const latest = onRulesChange.mock.calls.at(-1)?.[0] as DuplicateRuleRow[];
    expect(latest[0].threshold).toBeLessThanOrEqual(100);
  });

  it('toggling active fires onRulesChange', () => {
    const onRulesChange = vi.fn();
    render(<DuplicateDetectionTab rules={baseRules} onRulesChange={onRulesChange} />);
    const switches = screen.getAllByLabelText('Active');
    fireEvent.click(switches[0]);
    expect(onRulesChange).toHaveBeenCalled();
  });

  it('removes a rule when trash is clicked', () => {
    const onRulesChange = vi.fn();
    render(<DuplicateDetectionTab rules={baseRules} onRulesChange={onRulesChange} />);
    fireEvent.click(screen.getByLabelText(/Remove Email rule/i));
    expect(onRulesChange).toHaveBeenCalledWith([baseRules[1]]);
  });

  it('shows empty state when no rules exist', () => {
    render(<DuplicateDetectionTab rules={[]} onRulesChange={() => {}} />);
    expect(screen.getByText(/No rules yet/i)).toBeInTheDocument();
  });
});
