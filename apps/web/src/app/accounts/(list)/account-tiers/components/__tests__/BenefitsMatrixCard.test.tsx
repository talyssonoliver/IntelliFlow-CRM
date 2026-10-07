import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BenefitsMatrixCard } from '../BenefitsMatrixCard';
import type { TierDraft } from '../../tier-draft';

const tiers: TierDraft[] = [
  {
    id: 't1',
    key: 'ENTERPRISE',
    label: 'Enterprise',
    minRevenue: '10000000',
    colorToken: 'purple',
    benefitIds: ['b1'],
  },
  { id: 't2', key: 'SMB', label: 'SMB', minRevenue: '0', colorToken: 'green', benefitIds: [] },
];
const benefits = [
  { id: 'b1', name: 'Dedicated CSM' },
  { id: 'b2', name: '' },
];

function setup(overrides: Partial<Parameters<typeof BenefitsMatrixCard>[0]> = {}) {
  const props = {
    tiers,
    benefits,
    errors: {},
    readOnly: false,
    announcement: '',
    onRename: vi.fn(),
    onRemove: vi.fn(),
    onToggle: vi.fn(),
    ...overrides,
  };
  const view = render(<BenefitsMatrixCard {...props} />);
  return { props, ...view };
}

describe('BenefitsMatrixCard (PG-196)', () => {
  it('renders a native table: tiers as column headers, benefits as row headers', () => {
    setup();
    const table = screen.getByRole('table');
    expect(table.querySelector('caption')).toHaveTextContent('Benefits each account tier receives');
    expect(screen.getByRole('columnheader', { name: 'Enterprise' })).toHaveAttribute(
      'scope',
      'col'
    );
    expect(screen.getAllByRole('rowheader')).toHaveLength(2);
    expect(table).not.toHaveAttribute('role', 'grid');
  });

  it('labels each cell checkbox "<benefit> for <tier>" and reflects membership', () => {
    setup();
    expect(screen.getByRole('checkbox', { name: 'Dedicated CSM for Enterprise' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Dedicated CSM for SMB' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Benefit 2 for SMB' })).toBeInTheDocument();
  });

  it('toggles, renames and removes benefits', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dedicated CSM for SMB' }));
    expect(props.onToggle).toHaveBeenCalledWith('t2', 'b1', true);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Dedicated CSM for Enterprise' }));
    expect(props.onToggle).toHaveBeenCalledWith('t1', 'b1', false);
    fireEvent.change(screen.getByLabelText('Benefit 2 name'), { target: { value: 'SLA 4h' } });
    expect(props.onRename).toHaveBeenCalledWith('b2', 'SLA 4h');
    fireEvent.click(screen.getByRole('button', { name: 'Remove benefit Dedicated CSM' }));
    expect(props.onRemove).toHaveBeenCalledWith('b1');
  });

  it('wraps the table in a labelled, focusable scroll region', () => {
    setup();
    const region = screen.getByRole('region', { name: 'Benefits by tier, scrollable' });
    expect(region).toHaveAttribute('tabindex', '0');
  });

  it('announces adds and removes politely', () => {
    const { container } = setup({ announcement: 'Benefit added' });
    expect(container.querySelector('[aria-live="polite"]')).toHaveTextContent('Benefit added');
  });

  it('shows benefit errors next to the benefit', () => {
    setup({ errors: { b2: ['Benefit is required'] } });
    expect(screen.getByRole('alert')).toHaveTextContent('Benefit is required');
  });

  it('shows the passive rules empty state with no inner action', () => {
    setup({ benefits: [] });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is read-only for non-admins', () => {
    setup({ readOnly: true });
    expect(screen.getByRole('checkbox', { name: 'Dedicated CSM for Enterprise' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /remove benefit/i })).not.toBeInTheDocument();
  });
});
