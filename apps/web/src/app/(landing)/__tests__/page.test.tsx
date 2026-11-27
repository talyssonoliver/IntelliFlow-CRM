/**
 * The landing page at `/` (signed out). It must stay prerendered: an uptime probe hits `/` every
 * minute, and a per-request render there ran a function each time.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({ getAccessToken: vi.fn() }));

vi.mock('@/lib/trpc-server', () => ({ getAccessToken: h.getAccessToken }));
vi.mock('@/lib/og-images', () => ({ OG_IMAGES: [] }));
vi.mock('@/components/home/HomePagePublicWithAuthFallback', () => ({
  HomePagePublicWithAuthFallback: () => null,
}));
vi.mock('@/components/aurora-landing/AuroraLandingPage', () => ({ AuroraLandingPage: () => null }));
vi.mock('@/components/aurora-site/AuroraSiteFooter', () => ({ AuroraSiteFooter: () => null }));
vi.mock('@/components/aurora-site/fonts', () => ({ manrope: { variable: 'font-var' } }));
vi.mock('../../(public)/_components/PublicLayoutShell', () => ({
  PublicLayoutShell: () => null,
}));

import LandingPage, { dynamic, metadata } from '../page';
import LandingLayout from '../layout';
import { HomePagePublicWithAuthFallback } from '@/components/home/HomePagePublicWithAuthFallback';
import { AuroraLandingPage } from '@/components/aurora-landing/AuroraLandingPage';
import { PublicLayoutShell } from '../../(public)/_components/PublicLayoutShell';
import { LANDING_METADATA } from '@/components/aurora-landing/landing-metadata';

describe('landing page', () => {
  it('is prerendered', () => {
    expect(dynamic).toBe('force-static');
  });

  it('renders the landing page inside the post-login fallback, and is not async', () => {
    const page = LandingPage() as ReactElement<{ children: ReactElement }>;

    expect(page).not.toBeInstanceOf(Promise);
    expect(page.type).toBe(HomePagePublicWithAuthFallback);
    expect(page.props.children.type).toBe(AuroraLandingPage);
  });

  it('keeps the home page metadata', () => {
    expect(metadata).toBe(LANDING_METADATA);
    expect(metadata.title).toEqual({ absolute: 'Aurora, the AI CRM that asks before it acts' });
  });

  it('reads no cookie, in the page or the layout', () => {
    LandingPage();
    LandingLayout({ children: null });

    expect(h.getAccessToken).not.toHaveBeenCalled();
  });
});

describe('landing layout', () => {
  it('is the signed-out public shell with the footer', () => {
    const outer = LandingLayout({ children: 'x' }) as ReactElement<{
      children: ReactElement<{ isAuthenticated: boolean; footer: unknown; children: unknown }>;
    }>;
    const shell = outer.props.children;

    expect(shell.type).toBe(PublicLayoutShell);
    expect(shell.props.isAuthenticated).toBe(false);
    expect(shell.props.footer).toBeTruthy();
    expect(shell.props.children).toBe('x');
  });
});
