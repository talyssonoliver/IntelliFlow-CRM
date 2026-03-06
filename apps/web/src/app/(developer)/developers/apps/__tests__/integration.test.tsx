import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeveloperAppsPage from '../page';
import { developerSidebarConfig } from '@/components/sidebar/configs/developer';

// Mock next/link for integration test
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Mock navigator.clipboard
Object.defineProperty(navigator, 'clipboard', {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
});

describe('DeveloperAppsPage Integration', () => {
  it('renders page with real AppList component', () => {
    render(<DeveloperAppsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Developer Apps');
    expect(screen.getByText('IntelliFlow Dashboard')).toBeInTheDocument();
  });

  it('all 3 demo app names visible', () => {
    render(<DeveloperAppsPage />);
    expect(screen.getByText('IntelliFlow Dashboard')).toBeInTheDocument();
    expect(screen.getByText('CRM Sandbox App')).toBeInTheDocument();
    expect(screen.getByText('Legacy Connector')).toBeInTheDocument();
  });

  it('API key never shown in full in rendered output', () => {
    const { container } = render(<DeveloperAppsPage />);
    const text = container.textContent || '';
    // A full key would have ifc_live_ followed by exactly 40 hex chars with no bullets
    expect(text).not.toMatch(/ifc_live_[0-9a-f]{40}/);
  });

  it('heading hierarchy: exactly one h1 and multiple h2s', () => {
    render(<DeveloperAppsPage />);
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.length).toBeGreaterThanOrEqual(3);
  });

  it('all buttons have accessible names', () => {
    render(<DeveloperAppsPage />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((button) => {
      const name = button.getAttribute('aria-label') || button.textContent?.trim();
      expect(name).toBeTruthy();
    });
  });

  it('badge elements present for status indicators', () => {
    render(<DeveloperAppsPage />);
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('Pending')).toBeInTheDocument();
  });

  it('developer sidebar config has developer-tools section with apps item at /developers/apps', () => {
    const devToolsSection = developerSidebarConfig.sections.find((s) => s.id === 'developer-tools');
    expect(devToolsSection).toBeDefined();
    const appsItem = devToolsSection?.items.find((i) => i.id === 'apps');
    expect(appsItem).toBeDefined();
    expect(appsItem?.href).toBe('/developers/apps');
  });

  it('sidebar apps item has label "My Apps"', () => {
    const devToolsSection = developerSidebarConfig.sections.find((s) => s.id === 'developer-tools');
    const appsItem = devToolsSection?.items.find((i) => i.id === 'apps');
    expect(appsItem?.label).toBe('My Apps');
  });
});
