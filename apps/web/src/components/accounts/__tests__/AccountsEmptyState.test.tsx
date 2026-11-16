import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AccountsEmptyState } from '../AccountsEmptyState';

describe('AccountsEmptyState', () => {
  it('says accounts come from converted leads and links to Leads', () => {
    render(<AccountsEmptyState hasFilters={false} onClearFilters={vi.fn()} />);
    expect(screen.getByText('No accounts yet')).toBeTruthy();
    expect(
      screen.getByText(
        'Companies appear here when you convert one of their leads. You can also add an account by hand.'
      )
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /Go to Leads/ }).getAttribute('href')).toBe('/leads');
  });

  it('keeps the create-account action for adding one by hand', () => {
    render(<AccountsEmptyState hasFilters={false} onClearFilters={vi.fn()} />);
    const region = screen.getByRole('region', { name: 'accounts empty state' });
    fireEvent.mouseEnter(region);
    expect(screen.getByRole('link', { name: /Create account/ }).getAttribute('href')).toBe(
      '/accounts/new'
    );
  });

  it('with filters on, offers Clear filters and no Leads link', () => {
    const onClear = vi.fn();
    render(<AccountsEmptyState hasFilters onClearFilters={onClear} />);
    expect(screen.getByText('No accounts found')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Go to Leads/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
