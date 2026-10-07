import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Radix Select does not open in jsdom; a native select exercises the same props.
vi.mock('@intelliflow/ui', () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value: string;
    disabled?: boolean;
    onValueChange: (v: string) => void;
    children: React.ReactNode;
  }) => (
    <select
      aria-label="Default tier"
      value={value}
      disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}));

import { DefaultTierCard, NO_DEFAULT_TIER } from '../DefaultTierCard';
import type { TierDraft } from '../../tier-draft';

const tiers: TierDraft[] = [
  { id: 't1', key: 'SMB', label: 'SMB', minRevenue: '100000', colorToken: 'green', benefitIds: [] },
  { id: 't2', key: 'STARTUP', label: '  ', minRevenue: '0', colorToken: 'yellow', benefitIds: [] },
  { id: 't3', label: 'Unsaved', minRevenue: '5', colorToken: 'blue', benefitIds: [] },
];

describe('DefaultTierCard (PG-196)', () => {
  it('offers Unknown plus saved tiers only, falling back to the key for blank names', () => {
    render(<DefaultTierCard tiers={tiers} value={null} readOnly={false} onChange={vi.fn()} />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Unknown (no tier)', 'SMB', 'STARTUP']);
    expect(screen.getByLabelText('Default tier')).toHaveValue(NO_DEFAULT_TIER);
    expect(
      screen.getByText(/used when an account has no annual revenue recorded/i)
    ).toBeInTheDocument();
  });

  it('emits the chosen key, and null for Unknown', () => {
    const onChange = vi.fn();
    render(<DefaultTierCard tiers={tiers} value="SMB" readOnly={false} onChange={onChange} />);
    const select = screen.getByLabelText('Default tier');
    fireEvent.change(select, { target: { value: 'STARTUP' } });
    expect(onChange).toHaveBeenLastCalledWith('STARTUP');
    fireEvent.change(select, { target: { value: NO_DEFAULT_TIER } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('is disabled when read-only', () => {
    render(<DefaultTierCard tiers={tiers} value={null} readOnly onChange={vi.fn()} />);
    expect(screen.getByLabelText('Default tier')).toBeDisabled();
  });
});
