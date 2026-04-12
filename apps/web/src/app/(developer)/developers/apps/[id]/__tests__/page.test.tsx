import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeveloperAppDetailPage, { generateMetadata } from '../page';

// Mock AppDashboard to isolate page shell tests
vi.mock('@/components/developer/app-dashboard', () => ({
  AppDashboard: ({ appId }: Readonly<{ appId: string }>) => (
    <div data-testid="app-dashboard" data-app-id={appId}>
      AppDashboard for {appId}
    </div>
  ),
}));

describe('DeveloperAppDetailPage', () => {
  // P-001: Renders with AppDashboard for known id app-001
  it('renders AppDashboard with appId for known id app-001', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    render(Page);
    const dashboard = screen.getByTestId('app-dashboard');
    expect(dashboard).toBeInTheDocument();
    expect(dashboard).toHaveAttribute('data-app-id', 'app-001');
  });

  // P-002: Passes correct appId prop
  it('passes correct appId prop to AppDashboard', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'app-001' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toHaveAttribute('data-app-id', 'app-001');
  });

  // P-003: Known id app-002
  it('renders AppDashboard for app-002', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'app-002' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toHaveAttribute('data-app-id', 'app-002');
  });

  // P-004: Known id app-003
  it('renders AppDashboard for app-003', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'app-003' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toHaveAttribute('data-app-id', 'app-003');
  });

  // P-005: Unknown id renders AppDashboard with unknown id (dashboard handles not-found)
  it('renders AppDashboard for unknown id', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'unknown-id' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toHaveAttribute('data-app-id', 'unknown-id');
  });

  // P-006: Invalid id renders AppDashboard with empty string
  it('renders AppDashboard with empty appId for invalid id', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'invalid<script>' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toHaveAttribute('data-app-id', '');
  });

  // P-007: AppDashboard is rendered (back link is inside dashboard)
  it('renders AppDashboard component in both found and not-found scenarios', async () => {
    const Page = await DeveloperAppDetailPage({
      params: Promise.resolve({ id: 'nonexistent' }),
    });
    render(Page);
    expect(screen.getByTestId('app-dashboard')).toBeInTheDocument();
  });

  // P-008: generateMetadata returns title with app name for known id
  it('generateMetadata returns title with app name for app-001', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'app-001' }),
    });
    expect(metadata.title).toContain('IntelliFlow Dashboard');
  });

  // P-009: generateMetadata returns "App Not Found" for unknown id
  it('generateMetadata returns "App Not Found" for unknown id', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'unknown-id' }),
    });
    expect(metadata.title).toContain('App Not Found');
  });

  // P-010: generateMetadata for invalid id returns "App Not Found"
  it('generateMetadata returns "App Not Found" for invalid characters in id', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'bad<id>' }),
    });
    expect(metadata.title).toContain('App Not Found');
  });

  // P-011: generateMetadata for app-002 contains app name
  it('generateMetadata returns title with app name for app-002', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'app-002' }),
    });
    expect(metadata.title).toContain('CRM Sandbox App');
  });

  // P-012: generateMetadata for app-003 contains app name
  it('generateMetadata returns title with app name for app-003', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ id: 'app-003' }),
    });
    expect(metadata.title).toContain('Legacy Connector');
  });
});
