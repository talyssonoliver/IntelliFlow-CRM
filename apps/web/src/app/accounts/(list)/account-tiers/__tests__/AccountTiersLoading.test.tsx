import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AccountTiersLoading, TIER_LOADING_SECTIONS } from '../AccountTiersLoading';

describe('AccountTiersLoading (PG-196)', () => {
  it('mirrors the page bento spans so nothing shifts when data arrives', () => {
    render(<AccountTiersLoading />);
    expect(screen.getByLabelText('Loading account tiers')).toHaveAttribute('aria-busy', 'true');
    const cards = screen.getAllByTestId('tier-skeleton-card');
    expect(cards.map((c) => c.className.match(/lg:col-span-\d+/)?.[0])).toEqual([
      'lg:col-span-8',
      'lg:col-span-4',
      'lg:col-span-6',
      'lg:col-span-6',
    ]);
    expect(TIER_LOADING_SECTIONS).toHaveLength(4);
  });
});
