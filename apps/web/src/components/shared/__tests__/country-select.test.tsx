/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Native <select> stand-in for the Radix Select so options are queryable.
vi.mock('@intelliflow/ui', () => {
  const Ctx = React.createContext<{ value: string; onValueChange: (v: string) => void } | null>(
    null
  );
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (v: string) => void;
      children: React.ReactNode;
    }) => <Ctx.Provider value={{ value, onValueChange }}>{children}</Ctx.Provider>,
    SelectTrigger: (props: Record<string, unknown>) => <span data-testid="trigger" {...props} />,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => {
      const ctx = React.useContext(Ctx)!;
      return (
        <select
          aria-label="country"
          value={ctx.value}
          onChange={(e) => ctx.onValueChange(e.target.value)}
        >
          {children}
        </select>
      );
    },
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => (
      <option value={value}>{children}</option>
    ),
  };
});

import { CountrySelect, countryLabel, getCountryOptions } from '../country-select';

describe('CountrySelect', () => {
  it('lists the 249 ISO codes labelled with Intl.DisplayNames, sorted by name', () => {
    const options = getCountryOptions();
    expect(options).toHaveLength(249);
    expect(options.find((o) => o.code === 'GB')?.label).toBe('United Kingdom');
    expect(options.some((o) => o.code === 'UK')).toBe(false);
    const labels = options.map((o) => o.label);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it('renders a "No country" option and returns the chosen code', () => {
    const onChange = vi.fn();
    render(<CountrySelect id="c" value={null} onChange={onChange} ariaLabel="Country" />);

    expect(screen.getByRole('option', { name: 'No country' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'United Kingdom (GB)' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('country'), { target: { value: 'GB' } });
    expect(onChange).toHaveBeenCalledWith('GB');
  });

  it('clears to null', () => {
    const onChange = vi.fn();
    render(<CountrySelect value="GB" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('country'), { target: { value: '__none__' } });
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('wires id, aria-label, aria-invalid and aria-describedby on the trigger', () => {
    render(
      <CountrySelect
        id="rule-1-country"
        value="US"
        onChange={() => {}}
        ariaLabel="Rule 1 country"
        ariaInvalid
        ariaDescribedBy="err"
        allowClear={false}
      />
    );
    const trigger = screen.getByTestId('trigger');
    expect(trigger.getAttribute('id')).toBe('rule-1-country');
    expect(trigger.getAttribute('aria-label')).toBe('Rule 1 country');
    expect(trigger.getAttribute('aria-invalid')).toBe('true');
    expect(trigger.getAttribute('aria-describedby')).toBe('err');
    expect(screen.queryByRole('option', { name: 'No country' })).toBeNull();
  });

  it('formats a label and falls back to the code', () => {
    expect(countryLabel('FR')).toBe('France');
    expect(countryLabel('not-a-code')).toBe('not-a-code');
  });
});
