/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import { CoverageSummary, describePreview } from '../CoverageSummary';

function setup(overrides: Partial<React.ComponentProps<typeof CoverageSummary>> = {}) {
  const onPreview =
    overrides.onPreview ??
    vi.fn().mockResolvedValue({
      territoryId: 't1',
      territoryName: 'London',
      strategy: 'ROUND_ROBIN',
      matchedBy: 'rule',
    });
  render(
    <CoverageSummary
      autoAssignOwner
      territoryCount={2}
      ruleCount={3}
      memberCount={4}
      {...overrides}
      onPreview={onPreview}
    />
  );
  return onPreview;
}

describe('describePreview', () => {
  it('names the territory, how it matched and the strategy', () => {
    expect(
      describePreview({
        territoryId: 't',
        territoryName: 'EMEA',
        strategy: 'LOAD_BALANCE',
        matchedBy: 'default',
      })
    ).toBe('EMEA (the default territory) — Load-balance.');
    expect(
      describePreview({ territoryId: null, territoryName: null, strategy: null, matchedBy: 'none' })
    ).toBe('No territory — the creator keeps the account.');
  });
});

describe('CoverageSummary', () => {
  it('shows the auto-assign state with a link to Account Settings and the counts', () => {
    setup();
    expect(screen.getByText('Auto-assign owner is on.')).toBeDefined();
    expect(
      screen.getByRole('link', { name: 'Change in Account Settings' }).getAttribute('href')
    ).toBe('/accounts/account-settings');
    expect(screen.getByText('Territories').nextSibling?.textContent).toBe('2');
    expect(screen.getByText('Rules').nextSibling?.textContent).toBe('3');
    expect(screen.getByText('Members').nextSibling?.textContent).toBe('4');
  });

  it('explains when auto-assign is off', () => {
    setup({ autoAssignOwner: false });
    expect(screen.getByText('Auto-assign owner is off.')).toBeDefined();
    expect(screen.getByText(/not used until auto-assign is turned on/)).toBeDefined();
  });

  it('tests an address and shows the result', async () => {
    const onPreview = setup();
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'GB' } });
    fireEvent.change(screen.getByLabelText('Region'), { target: { value: ' London ' } });
    fireEvent.change(screen.getByLabelText('Postal code'), { target: { value: 'SW1A 1AA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Test Address' }));
    expect(await screen.findByText('London (matched by a rule) — Round-robin.')).toBeDefined();
    expect(onPreview).toHaveBeenCalledWith({
      country: 'GB',
      region: 'London',
      postalCode: 'SW1A 1AA',
    });
  });

  it('sends an empty address and reports failures', async () => {
    const onPreview = setup({ onPreview: vi.fn().mockRejectedValue(new Error('x')) });
    fireEvent.click(screen.getByRole('button', { name: 'Test Address' }));
    await waitFor(() =>
      expect(screen.getByText('Could not test this address. Try again.')).toBeDefined()
    );
    expect(onPreview).toHaveBeenCalledWith({
      country: undefined,
      region: undefined,
      postalCode: undefined,
    });
  });
});
