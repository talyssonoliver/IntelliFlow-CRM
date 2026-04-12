import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AuthGuidesPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

describe('Auth Guides Integration', () => {
  it('full page renders with real AuthGuides — h1 + tab triggers visible', () => {
    render(<AuthGuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Authentication');
    expect(screen.getByTestId('auth-guides')).toBeInTheDocument();
  });

  it('all 5 tab triggers visible', () => {
    render(<AuthGuidesPage />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'OAuth 2.0' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'JWT / Bearer' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'MFA' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Sessions & Keys' })).toBeInTheDocument();
  });

  it('Overview section shows real content', () => {
    render(<AuthGuidesPage />);
    expect(screen.getAllByText(/OAuth 2\.0/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/JWT/).length).toBeGreaterThanOrEqual(1);
  });

  it('accessible structure: h1 + multiple h2s', () => {
    render(<AuthGuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Authentication');
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(2);
  });

  it('no external links exist (all auth content is inline)', () => {
    render(<AuthGuidesPage />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    expect(externalLinks.length).toBe(0);
  });

  it('developer sidebar config contains auth item at /docs/auth', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const authItem = allItems.find((item) => item.href === '/docs/auth');
    expect(authItem).toBeDefined();
    expect(authItem!.id).toBe('auth');
    expect(authItem!.label).toBe('Authentication');
  });

  it('developer sidebar config auth item has lock icon', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const authItem = allItems.find((item) => item.href === '/docs/auth');
    expect(authItem).toBeDefined();
    expect(authItem!.icon).toBe('lock');
  });

  it('integration-list OAuth and MFA items link to /docs/auth (no external: true)', async () => {
    // Dynamically import integration-list data to verify href values
    const mod = await import('@/components/developer/integration-list');
    // Render the component and check link targets
    const { IntegrationList } = mod;
    const { container } = render(<IntegrationList />);

    // Find OAuth link — should point to /docs/auth, not external
    const oauthLink = container.querySelector('a[href="/docs/auth"]');
    expect(oauthLink).toBeInTheDocument();
    // Should not have target="_blank" (internal link)
    expect(oauthLink).not.toHaveAttribute('target', '_blank');

    // MFA link — should also point to /docs/auth
    const allAuthLinks = container.querySelectorAll('a[href="/docs/auth"]');
    expect(allAuthLinks.length).toBeGreaterThanOrEqual(2);
  });
});
