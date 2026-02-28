import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SdkGuidesPage from '../page';
import { SDK_REGISTRY } from '@/lib/developer/sdk-downloads';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

describe('SDK Guides Integration', () => {
  it('full page renders with real SdkGuides — h1 + real sections', () => {
    render(<SdkGuidesPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('SDK Guides');
    expect(screen.getByText('About the SDK')).toBeInTheDocument();
    expect(screen.getByText('Available SDKs')).toBeInTheDocument();
    expect(screen.getByText('Prerequisites')).toBeInTheDocument();
  });

  it('all 4 tab headings visible (Overview, Installation, Quickstart, Downloads)', () => {
    render(<SdkGuidesPage />);
    expect(screen.getByRole('tab', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Installation' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Quickstart' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Downloads' })).toBeInTheDocument();
  });

  it('available SDKs rendered with correct names', () => {
    render(<SdkGuidesPage />);
    const availableSdks = SDK_REGISTRY.filter((sdk) => sdk.status !== 'coming-soon');
    for (const sdk of availableSdks) {
      expect(screen.getAllByText(sdk.name).length).toBeGreaterThanOrEqual(1);
    }
  });

  it('Coming Soon SDKs visible but not clickable', () => {
    render(<SdkGuidesPage />);
    const comingSoonSdks = SDK_REGISTRY.filter((sdk) => sdk.status === 'coming-soon');
    expect(comingSoonSdks.length).toBeGreaterThan(0);

    const disabledElements = document.querySelectorAll('[aria-disabled="true"]');
    expect(disabledElements.length).toBeGreaterThanOrEqual(comingSoonSdks.length);
  });

  it('status badges visible (Beta and Coming Soon counts)', () => {
    render(<SdkGuidesPage />);
    const betaBadges = screen.getAllByText('Beta');
    const comingSoonBadges = screen.getAllByText('Coming Soon');
    expect(betaBadges.length).toBeGreaterThanOrEqual(1);
    expect(comingSoonBadges.length).toBeGreaterThanOrEqual(1);
  });

  it('accessible structure: h1 + multiple h2s', () => {
    render(<SdkGuidesPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('SDK Guides');
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(3);
  });

  it('external links have rel="noopener noreferrer" (if applicable)', () => {
    render(<SdkGuidesPage />);
    const externalLinks = document.querySelectorAll('a[target="_blank"]');
    externalLinks.forEach((link) => {
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    });
  });

  it('developer sidebar config contains sdk item with href "/docs/sdk" (AC-007)', () => {
    const allItems = developerSidebarConfig.sections.flatMap((section) => section.items);
    const sdkItem = allItems.find((item) => item.href === '/docs/sdk');
    expect(sdkItem).toBeDefined();
    expect(sdkItem!.id).toBe('sdk');
    expect(sdkItem!.label).toBe('SDK Guides');
  });
});
