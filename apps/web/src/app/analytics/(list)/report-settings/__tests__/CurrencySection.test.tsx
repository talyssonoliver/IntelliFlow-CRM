/**
 * CurrencySection Tests — PG-187
 * Popover combobox pattern: filter, select, a11y.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencySection } from '../components/CurrencySection';

describe('CurrencySection', () => {
  it('renders trigger with current code and name', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toContain('USD');
    expect(trigger.textContent).toContain('US Dollar');
  });

  it('trigger has aria-expanded=false when closed', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('search input has aria-label="Search currencies"', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByLabelText(/search currencies/i);
    expect(input).toBeInTheDocument();
  });

  it('filters list by code prefix', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByLabelText(/search currencies/i);
    fireEvent.change(input, { target: { value: 'EU' } });
    // EUR should be visible in the listbox
    expect(screen.getAllByText('EUR').length).toBeGreaterThan(0);
  });

  it('shows polite empty-filter message', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByLabelText(/search currencies/i);
    fireEvent.change(input, { target: { value: 'ZZZ' } });
    expect(screen.getByText(/no currencies match/i)).toBeInTheDocument();
  });

  it('calls onChange with EUR when EUR option is clicked', () => {
    const onChange = vi.fn();
    render(<CurrencySection value="USD" onChange={onChange} />);
    fireEvent.click(screen.getByRole('combobox'));
    const eurOptions = screen.getAllByRole('option', { name: /EUR/i });
    fireEvent.click(eurOptions[0].querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith('EUR');
  });

  it('marks unfold icon as aria-hidden', () => {
    const { container } = render(<CurrencySection value="USD" onChange={() => {}} />);
    const icons = container.querySelectorAll('[aria-hidden="true"]');
    expect(icons.length).toBeGreaterThan(0);
  });

  it('label has htmlFor matching trigger id', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    const label = document.querySelector('label[for="currency-trigger"]');
    const trigger = document.getElementById('currency-trigger');
    expect(label).toBeTruthy();
    expect(trigger).toBeTruthy();
  });
});
