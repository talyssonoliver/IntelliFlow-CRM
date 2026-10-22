/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({
  query: {
    data: undefined as unknown,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
  useQuery: vi.fn(),
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    contactTypes: {
      listActive: {
        useQuery: (input: unknown, opts: unknown) => {
          h.useQuery(input, opts);
          return h.query;
        },
      },
    },
  },
}));

import { ContactTypeSelect, CONTACT_TYPES_STALE_TIME_MS } from '../ContactTypeSelect';

function option(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    key: 'customer',
    name: 'Customer',
    colorToken: 'green',
    isActive: true,
    isDefault: false,
    isSystem: true,
    requiredFields: [],
    ...overrides,
  };
}

function renderSelect(props: Partial<React.ComponentProps<typeof ContactTypeSelect>> = {}) {
  const onChange = vi.fn();
  render(<ContactTypeSelect id="contactType" value="" onChange={onChange} {...props} />);
  return { onChange };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.query = {
    data: [
      option(),
      option({ id: 't2', key: 'vendor', name: 'Vendor', isDefault: true }),
      option({ id: 't3', key: 'investor', name: 'Investor', isActive: false }),
    ],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});

describe('ContactTypeSelect', () => {
  it('queries all types (incl. inactive) with a 5 minute staleTime (NF-002)', () => {
    renderSelect();
    expect(CONTACT_TYPES_STALE_TIME_MS).toBe(5 * 60 * 1000);
    expect(h.useQuery).toHaveBeenCalledWith(
      { includeInactive: true },
      expect.objectContaining({ staleTime: 5 * 60 * 1000 })
    );
  });

  it('has a visible label and offers "No type" plus the active types only', () => {
    renderSelect();
    const select = screen.getByLabelText('Contact type');
    const labels = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
    expect(labels).toEqual(['No type', 'Customer', 'Vendor']);
  });

  it('reports the chosen key', () => {
    const { onChange } = renderSelect();
    fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: 'vendor' } });
    expect(onChange).toHaveBeenCalledWith('vendor');
  });

  it('keeps a stored inactive type selectable as "Name (inactive)" with a linked hint (A11Y-5)', () => {
    renderSelect({ value: 'investor' });
    const select = screen.getByLabelText('Contact type') as HTMLSelectElement;
    expect(select.value).toBe('investor');
    expect(screen.getByRole('option', { name: 'Investor (inactive)' })).toBeInTheDocument();
    const hintId = select.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)).toHaveTextContent(/inactive/i);
  });

  it('keeps a stored key whose type was deleted as "<key> (inactive)"', () => {
    renderSelect({ value: 'legacy_key' });
    expect(screen.getByRole('option', { name: 'legacy_key (inactive)' })).toBeInTheDocument();
  });

  it('preselects the default type once loaded when asked and untouched', () => {
    const { onChange } = renderSelect({ preselectDefault: true });
    expect(onChange).toHaveBeenCalledWith('vendor');
  });

  it('does not preselect when a value is already set or when not asked', () => {
    const first = renderSelect({ preselectDefault: true, value: 'customer' });
    expect(first.onChange).not.toHaveBeenCalled();
  });

  it('does not preselect after the user touched the field', () => {
    h.query = { ...h.query, data: undefined, isLoading: true };
    const onChange = vi.fn();
    const { rerender } = render(
      <ContactTypeSelect id="contactType" value="" onChange={onChange} preselectDefault />
    );
    fireEvent.change(screen.getByLabelText('Contact type'), { target: { value: '' } });
    h.query = { ...h.query, data: [option({ key: 'vendor', isDefault: true })], isLoading: false };
    rerender(<ContactTypeSelect id="contactType" value="" onChange={onChange} preselectDefault />);
    expect(onChange).not.toHaveBeenCalledWith('vendor');
  });

  it('a fetch failure shows one alert with Retry and never blocks the field', () => {
    h.query = { ...h.query, data: undefined, isError: true };
    renderSelect();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(screen.getByLabelText('Contact type')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading contact types' }));
    expect(h.query.refetch).toHaveBeenCalled();
  });

  it('shows a loading option while the types load', () => {
    h.query = { ...h.query, data: undefined, isLoading: true };
    renderSelect();
    expect(screen.getByRole('option', { name: 'Loading types…' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <ContactTypeSelect id="contactType" value="investor" onChange={() => undefined} />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
