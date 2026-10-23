/**
 * @vitest-environment jsdom
 *
 * PG-203 DSAR — processing-restriction banner (owner Q18; spec sign-off 3, R4 wording).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';

const h = vi.hoisted(() => ({
  result: { data: undefined as unknown },
  args: [] as unknown[],
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    privacy: {
      restrictionFor: {
        useQuery: (input: unknown, opts: unknown) => {
          h.args.push([input, opts]);
          return h.result;
        },
      },
    },
  },
}));

import { RestrictionBanner } from '../RestrictionBanner';

beforeEach(() => {
  h.result = { data: undefined };
  h.args = [];
});

describe('RestrictionBanner', () => {
  it('asks by record id, never by email', () => {
    render(<RestrictionBanner entity="lead" id="clhlead000000000000" />);
    expect(h.args[0]).toEqual([
      { entity: 'lead', id: 'clhlead000000000000' },
      expect.objectContaining({ enabled: true, retry: false }),
    ]);
  });

  it('shows nothing while loading or when the person is not restricted', () => {
    const { container, rerender } = render(<RestrictionBanner entity="contact" id="c1" />);
    expect(container.firstChild).toBeNull();
    h.result = { data: { restricted: false, blocksMarketing: false, since: null } };
    rerender(<RestrictionBanner entity="contact" id="c1" />);
    expect(container.firstChild).toBeNull();
  });

  it('names a restriction and its date, accessibly', async () => {
    h.result = {
      data: { restricted: true, blocksMarketing: false, since: '2026-10-22T10:00:00.000Z' },
    };
    const { container } = render(<RestrictionBanner entity="lead" id="l1" />);
    expect(screen.getByText('Processing restricted (data request) since 22 Oct 2026')).toBeTruthy();
    expect(screen.getByRole('status')).toBeTruthy();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it('says "Do not send marketing" for a marketing objection', () => {
    h.result = { data: { restricted: true, blocksMarketing: true, since: null } };
    render(<RestrictionBanner entity="contact" id="c1" />);
    expect(screen.getByText('Do not send marketing (data request)')).toBeTruthy();
  });
});
