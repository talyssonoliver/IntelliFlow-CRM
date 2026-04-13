import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HierarchyTab } from '../components/HierarchyTab';

describe('HierarchyTab', () => {
  const baseConfig = {
    maxDepth: 5,
    requireParentForTiers: [] as string[],
    preventCycles: true,
  };

  it('renders maxDepth input and emits clamped updates', () => {
    const onChange = vi.fn();
    render(<HierarchyTab config={baseConfig} onConfigChange={onChange} />);
    const input = screen.getByLabelText(/maximum hierarchy depth/i) as HTMLInputElement;
    expect(input.value).toBe('5');

    fireEvent.change(input, { target: { value: '42' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxDepth: 10 }));

    fireEvent.change(input, { target: { value: '0' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ maxDepth: 1 }));
  });

  it('toggles tier selection', () => {
    const onChange = vi.fn();
    render(<HierarchyTab config={baseConfig} onConfigChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /enterprise/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ requireParentForTiers: ['enterprise'] })
    );
  });

  it('renders preventCycles switch as disabled true', () => {
    render(<HierarchyTab config={baseConfig} onConfigChange={vi.fn()} />);
    const toggle = screen.getByLabelText(/prevent hierarchy cycles/i) as HTMLButtonElement;
    expect(toggle).toBeDisabled();
  });

  it('adds a custom tier', () => {
    const onChange = vi.fn();
    render(<HierarchyTab config={baseConfig} onConfigChange={onChange} />);
    const input = screen.getByLabelText(/add a custom tier/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'strategic' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ requireParentForTiers: ['strategic'] })
    );
  });
});
