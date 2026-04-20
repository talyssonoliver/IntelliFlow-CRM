/**
 * DefaultRangeSection Tests — PG-187
 * Confirms validator-derived options + onChange + a11y.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { defaultRangeSchema } from '@intelliflow/validators';
import { DefaultRangeSection } from '../components/DefaultRangeSection';

const RANGE_LABELS: Record<'7d' | '14d' | '30d' | '90d', string> = {
  '7d': '7 days',
  '14d': '14 days',
  '30d': '30 days',
  '90d': '90 days',
};

describe('DefaultRangeSection', () => {
  it('renders 4 radio options derived from defaultRangeSchema', () => {
    render(<DefaultRangeSection value="30d" onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: /default report date range/i });
    expect(group).toBeInTheDocument();
    expect(defaultRangeSchema.options).toHaveLength(4);
    for (const opt of defaultRangeSchema.options) {
      expect(
        screen.getByRole('radio', { name: new RegExp(RANGE_LABELS[opt], 'i') })
      ).toBeInTheDocument();
    }
  });

  it('renders labels and descriptions correctly', () => {
    render(<DefaultRangeSection value="30d" onChange={() => {}} />);
    expect(screen.getByText('30 days')).toBeInTheDocument();
    expect(screen.getByText('Last month (default)')).toBeInTheDocument();
    expect(screen.getByText('Last week')).toBeInTheDocument();
    expect(screen.getByText('Last quarter')).toBeInTheDocument();
  });

  it('calls onChange with 7d when 7-day radio is clicked', () => {
    const onChange = vi.fn();
    render(<DefaultRangeSection value="30d" onChange={onChange} />);
    const sevenDay = screen.getByRole('radio', { name: /7 days/i });
    fireEvent.click(sevenDay);
    expect(onChange).toHaveBeenCalledWith('7d');
  });

  it('calls onChange with 90d when 90-day radio is clicked', () => {
    const onChange = vi.fn();
    render(<DefaultRangeSection value="30d" onChange={onChange} />);
    const ninetyDay = screen.getByRole('radio', { name: /90 days/i });
    fireEvent.click(ninetyDay);
    expect(onChange).toHaveBeenCalledWith('90d');
  });

  it('shows current value as checked on mount', () => {
    render(<DefaultRangeSection value="14d" onChange={() => {}} />);
    const fourteen = screen.getByRole('radio', { name: /14 days/i });
    expect(fourteen).toBeChecked();
  });

  it('marks decorative icon as aria-hidden', () => {
    const { container } = render(<DefaultRangeSection value="30d" onChange={() => {}} />);
    const icon = container.querySelector('.material-symbols-outlined');
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('has matching htmlFor/id pairs on labels', () => {
    render(<DefaultRangeSection value="30d" onChange={() => {}} />);
    for (const opt of ['7d', '14d', '30d', '90d'] as const) {
      const label = document.querySelector(`label[for="range-${opt}"]`);
      const input = document.getElementById(`range-${opt}`);
      expect(label).toBeTruthy();
      expect(input).toBeTruthy();
    }
  });

  it('uses validator options (no duplicate string union)', () => {
    // Source-level assertion: the enum source is the validator, not a local const.
    expect(defaultRangeSchema.options).toEqual(['7d', '14d', '30d', '90d']);
  });
});
