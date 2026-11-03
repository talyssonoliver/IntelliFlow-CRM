import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const { getAccessToken, fetchWelcomeSummary, fetchAIInsights } = vi.hoisted(() => ({
  getAccessToken: vi.fn(),
  fetchWelcomeSummary: vi.fn(),
  fetchAIInsights: vi.fn(),
}));

vi.mock('@/lib/trpc-server', () => ({ getAccessToken }));
vi.mock('@/lib/auth/jwt', () => ({ decodeJwtPayload: () => ({ sub: 'user-1' }) }));
vi.mock('@/lib/cached-queries/home-queries', () => ({ fetchWelcomeSummary }));
vi.mock('@/lib/cached-queries/ai-insights-queries', () => ({ fetchAIInsights }));
vi.mock('@/lib/shared/serialize-for-client', () => ({
  serializeForClient: (value: unknown) => value,
}));
vi.mock('@/lib/og-images', () => ({ OG_IMAGES: [] }));
vi.mock('@/components/home/HomePagePublicWithAuthFallback', () => ({
  HomePagePublicWithAuthFallback: () => null,
}));
vi.mock('@/components/aurora-landing/AuroraLandingPage', () => ({ AuroraLandingPage: () => null }));
vi.mock('@/components/home/AuthenticatedHomePage', () => ({ AuthenticatedHomePage: () => null }));

import { HomePagePublicWithAuthFallback } from '@/components/home/HomePagePublicWithAuthFallback';
import { AuthenticatedHomePage } from '@/components/home/AuthenticatedHomePage';
import HomePage from '../(home)/page';

const render = () => HomePage() as Promise<ReactElement<{ initialWelcomeData?: unknown }>>;

describe('root page session check', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAccessToken.mockResolvedValue('a-token');
    fetchAIInsights.mockResolvedValue({});
  });

  it('renders the landing page with no token, and asks the API nothing', async () => {
    getAccessToken.mockResolvedValue(null);

    const page = await render();

    expect(page.type).toBe(HomePagePublicWithAuthFallback);
    expect(fetchWelcomeSummary).not.toHaveBeenCalled();
  });

  it('renders the portal only once the API has accepted the token', async () => {
    fetchWelcomeSummary.mockResolvedValue({ userName: 'A Person' });

    const page = await render();

    expect(page.type).toBe(AuthenticatedHomePage);
    expect(page.props.initialWelcomeData).toEqual({ userName: 'A Person' });
  });

  it('renders the landing page when the API rejects the token', async () => {
    fetchWelcomeSummary.mockRejectedValue(new Error('UNAUTHORIZED'));

    const page = await render();

    expect(page.type).toBe(HomePagePublicWithAuthFallback);
    expect(fetchAIInsights).not.toHaveBeenCalled();
  });

  it('keeps the portal when only the optional insights fail', async () => {
    fetchWelcomeSummary.mockResolvedValue({ userName: 'A Person' });
    fetchAIInsights.mockRejectedValue(new Error('slow'));

    const page = await render();

    expect(page.type).toBe(AuthenticatedHomePage);
  });
});
