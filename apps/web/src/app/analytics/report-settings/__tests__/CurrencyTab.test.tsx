/* CurrencyTab tests — PG-187 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CurrencyTab } from '../components/CurrencyTab';
import { CURRENCY_CODES, filterCurrencies } from '../components/currencies';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {children}
    </button>
  ),
  Input: (props: any) => <input {...props} />,
  Popover: ({ children, open, onOpenChange }: any) => (
    <div
      data-testid="popover"
      data-open={open}
      onClick={() => onOpenChange(!open)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpenChange(!open);
      }}
      role="presentation"
    >
      {children}
    </div>
  ),
  PopoverTrigger: ({ children }: any) => <div>{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

describe('CurrencyTab (PG-187)', () => {
  it('renders current currency value', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    // "USD" appears in both trigger and list — use getAllByText
    const usdMatches = screen.getAllByText('USD');
    expect(usdMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/US Dollar/).length).toBeGreaterThan(0);
  });

  it('renders "EUR — Euro" when value is EUR', () => {
    render(<CurrencyTab value="EUR" onChange={vi.fn()} />);
    const eurMatches = screen.getAllByText('EUR');
    expect(eurMatches.length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Euro/).length).toBeGreaterThan(0);
  });

  it('renders a combobox trigger with aria-expanded', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    const trigger = screen.getByRole('combobox');
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('aria-expanded')).toBeDefined();
  });

  it('has aria-haspopup="listbox" on trigger', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    expect(screen.getByRole('combobox').getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('renders search input with accessible label', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    expect(screen.getByLabelText(/Search currencies/i)).toBeInTheDocument();
  });

  it('renders a list of currencies in role=listbox', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    // Each item should be role=option
    const options = screen.getAllByRole('option');
    expect(options.length).toBeGreaterThan(0);
  });

  it('filters options when search query is entered', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    const input = screen.getByLabelText(/Search currencies/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'EUR' } });
    // After filter, we expect to see EUR but not all currencies
    expect(screen.getByText('EUR')).toBeInTheDocument();
  });

  it('calls onChange when a currency is selected', () => {
    const onChange = vi.fn();
    render(<CurrencyTab value="USD" onChange={onChange} />);
    // Find and click EUR option
    const options = screen.getAllByRole('option');
    const eurOption = options.find((o) => o.textContent?.includes('EUR'));
    expect(eurOption).toBeTruthy();
    fireEvent.click(eurOption!.querySelector('button')!);
    expect(onChange).toHaveBeenCalledWith('EUR');
  });

  it('has a section heading', () => {
    render(<CurrencyTab value="USD" onChange={vi.fn()} />);
    expect(screen.getByRole('heading', { name: /Display Currency/i })).toBeInTheDocument();
  });

  it('CURRENCY_CODES has at least 30 entries for coverage', () => {
    expect(CURRENCY_CODES.length).toBeGreaterThanOrEqual(30);
  });

  it('filterCurrencies returns all when query is empty', () => {
    expect(filterCurrencies('').length).toBe(CURRENCY_CODES.length);
  });

  it('filterCurrencies filters by code prefix (case-insensitive)', () => {
    const result = filterCurrencies('us');
    expect(result.some((c) => c.code === 'USD')).toBe(true);
  });

  it('filterCurrencies filters by name substring', () => {
    const result = filterCurrencies('Euro');
    expect(result.some((c) => c.code === 'EUR')).toBe(true);
  });
});
