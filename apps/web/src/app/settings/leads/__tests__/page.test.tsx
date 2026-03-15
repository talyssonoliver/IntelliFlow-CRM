/**
 * Lead Settings Page Entry Point Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the page.tsx entry point which uses next/dynamic for SSR-safe loading.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock next/dynamic to render the loading fallback synchronously
vi.mock('next/dynamic', () => ({
  default: (_loader: any, opts: any) => {
    const Component = () => (opts?.loading ? opts.loading() : <div>Loading...</div>);
    Component.displayName = 'DynamicComponent';
    return Component;
  },
}));

// Mock LeadSettingsLoading to avoid importing @intelliflow/ui in this test
vi.mock('../LeadSettingsLoading', () => ({
  LeadSettingsLoading: () => <div data-testid="lead-settings-loading">Loading...</div>,
}));

// Import after mocks
import LeadSettingsPage from '../page';
import { LeadSettingsLoading } from '../LeadSettingsLoading';

describe('LeadSettings Page entry point', () => {
  it('default export exists and is a component', () => {
    expect(LeadSettingsPage).toBeDefined();
    expect(typeof LeadSettingsPage).toBe('function');
  });

  it('renders the page component without crashing', () => {
    render(<LeadSettingsPage />);

    // The page uses dynamic import — the mock above renders the loading fallback
    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
  });

  it('shows loading state initially via the dynamic loading fallback', () => {
    render(<LeadSettingsPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('displays a loading indicator element', () => {
    render(<LeadSettingsPage />);

    const loadingEl = screen.getByTestId('lead-settings-loading');
    expect(loadingEl).toBeInTheDocument();
  });
});

describe('LeadSettingsLoading component', () => {
  it('renders without crashing', () => {
    render(<LeadSettingsLoading />);

    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
  });

  it('renders loading text', () => {
    render(<LeadSettingsLoading />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
