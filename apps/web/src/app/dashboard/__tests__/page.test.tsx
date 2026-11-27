/**
 * The dashboard page (MVP-007): it renders the client island at once and waits for nothing on the
 * server. The page's script reference is the last thing the HTML stream delivers, so any server
 * await here delays every data request the dashboard makes.
 */
import { Suspense } from 'react';
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetchLeadStats: vi.fn(),
}));

vi.mock('@/lib/trpc-server', () => ({ getAccessToken: h.getAccessToken }));
vi.mock('@/lib/cached-queries/lead-queries', () => ({
  fetchLeadStats: h.fetchLeadStats,
  fetchLeadsFirstPage: vi.fn(),
}));
vi.mock('../DashboardClient', () => ({ default: () => null }));

import * as pageModule from '../page';
import DashboardPage from '../page';
import DashboardClient from '../DashboardClient';

describe('DashboardPage', () => {
  it('returns the dashboard client island straight away, with no props', () => {
    const element = DashboardPage();
    const island = element.props.children;

    expect(element.type).toBe(Suspense);
    expect(island.type).toBe(DashboardClient);
    expect(island.props).toEqual({});
  });

  it('is not async, so nothing can hold the page stream open', () => {
    const result = DashboardPage();

    expect(result).not.toBeInstanceOf(Promise);
  });

  it('is prerendered, not forced dynamic, so no function runs per load (Suspense covers useSearchParams)', () => {
    expect((pageModule as Record<string, unknown>).dynamic).toBeUndefined();
  });

  it('reads no token and prefetches no lead stats on the server', () => {
    DashboardPage();

    expect(h.getAccessToken).not.toHaveBeenCalled();
    expect(h.fetchLeadStats).not.toHaveBeenCalled();
  });
});
