import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HierarchyTab } from '../HierarchyTab';

// PG-196: tier options come from the tenant's Account Tiers configuration.
const tierOptions = [
  { key: 'ENTERPRISE', label: 'Enterprise' },
  { key: 'MID_MARKET', label: 'Mid-Market' },
  { key: 'SMB', label: 'SMB' },
  { key: 'STARTUP', label: 'Startup' },
];

describe('HierarchyTab', () => {
  const baseConfig = {
    maxDepth: 5,
    requireParentForTiers: [] as string[],
    preventCycles: true,
  };

  it('renders maxDepth input and emits clamped updates', () => {
    const onChange = vi.fn();
    render(
      <HierarchyTab config={baseConfig} onConfigChange={onChange} tierOptions={tierOptions} />
    );
    const input = screen.getByLabelText(/maximum hierarchy depth/i) as HTMLInputElement;
    expect(input.value).toBe('5');

    fireEvent.change(input, { target: { value: '42' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxDepth: 10 }));

    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxDepth: 1 }));
  });

  it('ignores a non-numeric depth', () => {
    const onChange = vi.fn();
    render(
      <HierarchyTab config={baseConfig} onConfigChange={onChange} tierOptions={tierOptions} />
    );
    fireEvent.change(screen.getByLabelText(/maximum hierarchy depth/i), { target: { value: '' } });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lists the tenant tiers by label and toggles by key', () => {
    const onChange = vi.fn();
    render(
      <HierarchyTab config={baseConfig} onConfigChange={onChange} tierOptions={tierOptions} />
    );
    const button = screen.getByRole('button', { name: 'Mid-Market' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ requireParentForTiers: ['MID_MARKET'] })
    );
  });

  it('deselects an active tier', () => {
    const onChange = vi.fn();
    render(
      <HierarchyTab
        config={{ ...baseConfig, requireParentForTiers: ['ENTERPRISE'] }}
        onConfigChange={onChange}
        tierOptions={tierOptions}
      />
    );
    const button = screen.getByRole('button', { name: 'Enterprise' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ requireParentForTiers: [] }));
  });

  it('shows stored values that match no tier as removable legacy values', () => {
    const onChange = vi.fn();
    render(
      <HierarchyTab
        config={{ ...baseConfig, requireParentForTiers: ['SMB', 'STRATEGIC'] }}
        onConfigChange={onChange}
        tierOptions={tierOptions}
      />
    );
    expect(screen.getByText(/legacy values/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove legacy tier STRATEGIC' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ requireParentForTiers: ['SMB'] })
    );
  });

  it('has no free-text tier input and links to the Account Tiers page', () => {
    render(<HierarchyTab config={baseConfig} onConfigChange={vi.fn()} tierOptions={tierOptions} />);
    expect(screen.queryByLabelText(/add a custom tier/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Manage account tiers' })).toHaveAttribute(
      'href',
      '/accounts/account-tiers'
    );
  });

  it('renders preventCycles switch as disabled true', () => {
    render(<HierarchyTab config={baseConfig} onConfigChange={vi.fn()} tierOptions={tierOptions} />);
    const toggle = screen.getByLabelText(/prevent hierarchy cycles/i) as HTMLButtonElement;
    expect(toggle).toBeDisabled();
  });
});
