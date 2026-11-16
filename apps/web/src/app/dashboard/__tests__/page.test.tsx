/**
 * The dashboard page (MVP-007): it renders the client island at once and waits for nothing on the
 * server. The page's script reference is the last thing the HTML stream delivers, so any server
 * await here delays every data request the dashboard makes.
 */
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

import DashboardPage, { dynamic } from '../page';
import DashboardClient from '../DashboardClient';

describe('DashboardPage', () => {
  it('returns the dashboard client island straight away, with no props', () => {
    const element = DashboardPage();

    expect(element.type).toBe(DashboardClient);
    expect(element.props).toEqual({});
  });

  it('is not async, so nothing can hold the page stream open', () => {
    const result = DashboardPage();

    expect(result).not.toBeInstanceOf(Promise);
  });

  it('is still rendered per request, so the useSearchParams tree is not prerendered', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  it('reads no token and prefetches no lead stats on the server', () => {
    DashboardPage();

    expect(h.getAccessToken).not.toHaveBeenCalled();
    expect(h.fetchLeadStats).not.toHaveBeenCalled();
  });
});
