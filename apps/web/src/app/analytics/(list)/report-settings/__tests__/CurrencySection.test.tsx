/**
 * CurrencySection Tests — PG-187
 * Popover combobox pattern: filter, select, a11y.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencySection } from '../components/CurrencySection';

describe('CurrencySection', () => {
  // Helper: the trigger button has aria-haspopup="listbox" and aria-label matching
  // "Select display currency, current value <CODE>". Query by button role + name.
  function getCurrencyTrigger() {
    return screen.getByRole('button', { name: /select display currency/i });
  }

  it('renders trigger with current code and name', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    const trigger = getCurrencyTrigger();
    expect(trigger).toBeInTheDocument();
    expect(trigger.textContent).toContain('USD');
    expect(trigger.textContent).toContain('US Dollar');
  });

  it('trigger has aria-expanded=false when closed', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    const trigger = getCurrencyTrigger();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('search input has aria-label="Search currencies"', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(getCurrencyTrigger());
    // PopoverContent is always rendered in the stub; the Input is a div with
    // aria-label forwarded as a prop — getByLabelText resolves it correctly.
    const input = screen.getByLabelText(/search currencies/i);
    expect(input).toBeInTheDocument();
  });

  it('filters list by code prefix', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(getCurrencyTrigger());
    const input = screen.getByLabelText(/search currencies/i);
    fireEvent.change(input, { target: { value: 'EU' } });
    // EUR should be visible in the list
    expect(screen.getAllByText('EUR').length).toBeGreaterThan(0);
  });

  it('shows polite empty-filter message', () => {
    render(<CurrencySection value="USD" onChange={() => {}} />);
    fireEvent.click(getCurrencyTrigger());
    const input = screen.getByLabelText(/search currencies/i);
    fireEvent.change(input, { target: { value: 'ZZZ' } });
    expect(screen.getByText(/no currencies match/i)).toBeInTheDocument();
  });

  it('calls onChange with EUR when EUR option is clicked', () => {
    const onChange = vi.fn();
    render(<CurrencySection value="USD" onChange={onChange} />);
    fireEvent.click(getCurrencyTrigger());
    // The list items are <li> elements; each contains a <button> with the currency code.
    // Query via the currency list's <ul> then find the EUR button directly.
    const currencyList = document.querySelector('ul[aria-label="Available currencies"]');
    expect(currencyList).toBeTruthy();
    const eurButton = Array.from(currencyList!.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('EUR')
    );
    expect(eurButton).toBeTruthy();
    fireEvent.click(eurButton!);
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
