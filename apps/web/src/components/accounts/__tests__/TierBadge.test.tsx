import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/hooks/useAccountTiers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useAccountTiers')>();
  return {
    ...actual,
    useAccountTiers: () =>
      actual.buildAccountTiersResult(
        {
          tiers: [
            { key: 'BASE', label: 'Base', minRevenue: 0, colorToken: 'teal', benefits: [] },
            { key: 'GOLD', label: 'Gold', minRevenue: 1000, colorToken: 'amber', benefits: [] },
          ],
          defaultTierKey: null,
          canManage: false,
        },
        { isLoading: false, isError: false }
      ),
  };
});

import { TierAvatar, TierBadge, TierDot } from '../TierBadge';

describe('tier display components (PG-196)', () => {
  it('TierDot uses the tenant tier colour and names the tier', () => {
    render(<TierDot revenue={5000} />);
    expect(screen.getByText('Gold tier')).toHaveClass('sr-only');
    const dot = screen.getByTestId('tier-dot');
    expect(dot.className).toContain('bg-amber-500');
    expect(dot).toHaveAttribute('aria-hidden', 'true');
    expect(dot.parentElement).toHaveAttribute('title', 'Gold');
  });

  it('TierAvatar tints the initials', () => {
    render(<TierAvatar revenue={10} initials="AC" />);
    expect(screen.getByText('AC').className).toContain('bg-teal-100');
  });

  it('TierAvatar accepts a custom size class', () => {
    render(<TierAvatar revenue={10} initials="AC" className="w-20 h-20" />);
    expect(screen.getByText('AC').className).toContain('w-20 h-20');
  });

  it('TierBadge shows Unknown for accounts without revenue', () => {
    render(<TierBadge revenue={null} />);
    expect(screen.getByText('Unknown').className).toContain('bg-slate-100');
  });
});
