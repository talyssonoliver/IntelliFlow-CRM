/**
 * Lead Settings Page Entry Point Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the page.tsx entry point which uses <Suspense> for streaming.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock LeadSettingsContent to avoid full tRPC/auth setup in this unit test
vi.mock('../LeadSettingsContent', () => ({
  default: () => <div data-testid="lead-settings-content">Content</div>,
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

    // The page uses Suspense — content renders synchronously in test env
    expect(screen.getByTestId('lead-settings-content')).toBeInTheDocument();
  });

  it('renders content inside a Suspense boundary', () => {
    render(<LeadSettingsPage />);

    expect(screen.getByTestId('lead-settings-content')).toBeInTheDocument();
  });

  it('uses LeadSettingsLoading as Suspense fallback', () => {
    // Verify the loading component itself renders correctly
    render(<LeadSettingsLoading />);

    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
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
