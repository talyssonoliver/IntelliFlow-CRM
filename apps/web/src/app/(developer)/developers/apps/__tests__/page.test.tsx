import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import DeveloperAppsPage, { metadata } from '../page';

// Mock AppList to isolate page tests
vi.mock('@/components/developer/app-list', () => ({
  AppList: () => <div data-testid="app-list">AppList Component</div>,
}));

describe('DeveloperAppsPage', () => {
  it('renders h1 heading "Developer Apps"', () => {
    render(<DeveloperAppsPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Developer Apps');
  });

  it('renders description paragraph', () => {
    render(<DeveloperAppsPage />);
    expect(
      screen.getByText(/Manage your registered applications/)
    ).toBeInTheDocument();
  });

  it('renders AppList component', () => {
    render(<DeveloperAppsPage />);
    expect(screen.getByTestId('app-list')).toBeInTheDocument();
  });

  it('page has max-w-5xl container class', () => {
    const { container } = render(<DeveloperAppsPage />);
    expect(container.querySelector('.max-w-5xl')).toBeInTheDocument();
  });

  it('metadata export has title containing "Developer Apps"', () => {
    expect(metadata.title).toContain('Developer Apps');
  });

  it('metadata export has description field', () => {
    expect(metadata.description).toBeTruthy();
    expect(typeof metadata.description).toBe('string');
  });

  it('heading hierarchy: only one h1', () => {
    render(<DeveloperAppsPage />);
    const headings = screen.getAllByRole('heading', { level: 1 });
    expect(headings).toHaveLength(1);
  });

  it('flex flex-col gap-6 layout class on root div', () => {
    const { container } = render(<DeveloperAppsPage />);
    const rootDiv = container.firstElementChild;
    expect(rootDiv?.className).toContain('flex');
    expect(rootDiv?.className).toContain('flex-col');
    expect(rootDiv?.className).toContain('gap-6');
  });

  it('mb-8 class on heading container', () => {
    const { container } = render(<DeveloperAppsPage />);
    const headingContainer = container.querySelector('.mb-8');
    expect(headingContainer).toBeInTheDocument();
  });

  it('text-2xl font-bold class on h1', () => {
    render(<DeveloperAppsPage />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('text-2xl');
    expect(h1.className).toContain('font-bold');
  });

  it('text-muted-foreground class on description', () => {
    const { container } = render(<DeveloperAppsPage />);
    const description = container.querySelector('.text-muted-foreground');
    expect(description).toBeInTheDocument();
  });

  it('metadata title matches expected format', () => {
    expect(metadata.title).toBe('Developer Apps | IntelliFlow CRM');
  });
});
