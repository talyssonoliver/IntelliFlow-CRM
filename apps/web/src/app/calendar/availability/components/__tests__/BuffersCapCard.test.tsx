/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import axe from 'axe-core';
import { BuffersCapCard, type BuffersCapValue } from '../BuffersCapCard';

const base: BuffersCapValue = { bufferBefore: '10', bufferAfter: '0', capEnabled: false, cap: '' };

function Harness(props: {
  initial?: BuffersCapValue;
  errors?: Record<string, string>;
  readOnly?: boolean;
}) {
  const [value, setValue] = React.useState(props.initial ?? base);
  return (
    <BuffersCapCard
      value={value}
      onChange={(patch) => setValue((v) => ({ ...v, ...patch }))}
      errors={props.errors ?? {}}
      readOnly={props.readOnly ?? false}
    />
  );
}

describe('BuffersCapCard', () => {
  it('renders labelled buffer inputs with help text', () => {
    render(<Harness />);
    expect(screen.getByRole('region', { name: 'Buffers & daily limit' })).toBeInTheDocument();
    const before = screen.getByLabelText('Buffer before (minutes)');
    expect(before).toHaveValue(10);
    expect(before).toHaveAttribute('min', '0');
    expect(before).toHaveAttribute('max', '240');
    expect(before).toHaveAttribute('inputmode', 'numeric');
    expect(before).toHaveAccessibleDescription(/0 to 240 minutes/);
    expect(screen.getByLabelText('Buffer after (minutes)')).toHaveValue(0);
  });

  it('keeps an empty buffer as empty (no null or 0 sent)', () => {
    const onChange = vi.fn();
    render(<BuffersCapCard value={base} onChange={onChange} errors={{}} readOnly={false} />);
    fireEvent.change(screen.getByLabelText('Buffer before (minutes)'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ bufferBefore: '' });
  });

  it('reports a typed daily limit', () => {
    render(<Harness initial={{ ...base, capEnabled: true, cap: '5' }} />);
    const cap = screen.getByLabelText('Maximum bookings per day');
    fireEvent.change(cap, { target: { value: '12' } });
    expect(cap).toHaveValue(12);
  });

  it('shows the cap input only when the limit switch is on', () => {
    render(<Harness />);
    expect(screen.queryByLabelText('Maximum bookings per day')).not.toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Limit bookings per day' });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    const cap = screen.getByLabelText('Maximum bookings per day');
    expect(cap).toHaveAttribute('min', '1');
    expect(cap).toHaveAttribute('max', '500');
    expect(
      screen.getByText(/Counts scheduled, confirmed, in-progress and completed appointments/)
    ).toBeInTheDocument();
  });

  it('wires field errors', () => {
    render(
      <Harness
        initial={{ ...base, capEnabled: true, cap: '0' }}
        errors={{
          'cap-max': 'Enter a number from 1 to 500',
          'buffer-after': 'Enter 0 to 240 minutes',
        }}
      />
    );
    const cap = screen.getByLabelText('Maximum bookings per day');
    expect(cap).toHaveAttribute('aria-invalid', 'true');
    expect(cap).toHaveAccessibleDescription(/Enter a number from 1 to 500/);
    expect(screen.getByLabelText('Buffer after (minutes)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('renders values as text when read-only', () => {
    render(<Harness readOnly initial={{ ...base, capEnabled: true, cap: '6' }} />);
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.getByText('10 minutes')).toBeInTheDocument();
    expect(screen.getByText('6 bookings per day')).toBeInTheDocument();
  });

  it('shows "No limit" when read-only without a cap', () => {
    render(<Harness readOnly />);
    expect(screen.getByText('No limit')).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(<Harness initial={{ ...base, capEnabled: true, cap: '5' }} />);
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });
});
