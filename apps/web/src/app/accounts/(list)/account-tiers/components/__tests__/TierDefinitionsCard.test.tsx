import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { TierDefinitionsCard } from '../TierDefinitionsCard';
import type { TierDraft } from '../../tier-draft';

const tiers: TierDraft[] = [
  {
    id: 't1',
    key: 'ENTERPRISE',
    label: 'Enterprise',
    minRevenue: '10000000',
    colorToken: 'purple',
    benefitIds: [],
  },
  { id: 't2', label: 'Startup', minRevenue: '0', colorToken: 'yellow', benefitIds: [] },
  { id: 't3', label: '', minRevenue: 'abc', colorToken: 'blue', benefitIds: [] },
];

function setup(overrides: Partial<Parameters<typeof TierDefinitionsCard>[0]> = {}) {
  const props = {
    tiers,
    errors: {},
    readOnly: false,
    onChange: vi.fn(),
    onRemove: vi.fn(),
    ...overrides,
  };
  render(<TierDefinitionsCard {...props} />);
  return props;
}

describe('TierDefinitionsCard (PG-196)', () => {
  it('renders a labelled name and minimum revenue input per tier', () => {
    setup();
    expect(screen.getByLabelText('Name of tier 1')).toHaveValue('Enterprise');
    const min = screen.getByLabelText('Minimum annual revenue for Enterprise');
    expect(min).toHaveAttribute('inputmode', 'decimal');
    expect(screen.getByText('Accounts from 10,000,000')).toBeInTheDocument();
    expect(screen.getByText('Accounts from 0')).toBeInTheDocument();
    expect(screen.getByText('Enter a number')).toBeInTheDocument();
    expect(screen.getByText('ENTERPRISE')).toBeInTheDocument();
  });

  it('emits label and revenue edits', () => {
    const props = setup();
    fireEvent.change(screen.getByLabelText('Name of tier 2'), { target: { value: 'Seed' } });
    expect(props.onChange).toHaveBeenCalledWith('t2', { label: 'Seed' });
    fireEvent.change(screen.getByLabelText('Minimum annual revenue for Startup'), {
      target: { value: '5' },
    });
    expect(props.onChange).toHaveBeenCalledWith('t2', { minRevenue: '5' });
  });

  it('names untitled tiers by position and removes by id', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Tier 3' }));
    expect(props.onRemove).toHaveBeenCalledWith('t3');
  });

  it('opens the colour palette as a radio group and emits the chosen colour', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Colour for Enterprise: purple' }));
    const group = screen.getByRole('radiogroup', { name: 'Colour for Enterprise' });
    expect(within(group).getAllByRole('radio')).toHaveLength(18);
    fireEvent.click(within(group).getByRole('radio', { name: 'rose' }));
    expect(props.onChange).toHaveBeenCalledWith('t1', { colorToken: 'rose' });
  });

  it('shows row errors as an alert linked to the name input', () => {
    setup({ errors: { t1: ['Tier names must be unique'] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Tier names must be unique');
    expect(screen.getByLabelText('Name of tier 1')).toHaveAttribute('aria-invalid', 'true');
  });

  it('is read-only without remove buttons for non-admins', () => {
    setup({ readOnly: true });
    expect(screen.getByLabelText('Name of tier 1')).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });

  it('cannot remove the last tier', () => {
    setup({ tiers: [tiers[1]] });
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
  });
});
