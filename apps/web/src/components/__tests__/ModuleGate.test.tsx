// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockUseEnabledModules = vi.fn();

vi.mock('@/hooks/useEnabledModules', () => ({
  useEnabledModules: () => mockUseEnabledModules(),
}));

vi.mock('../ModulePaywall', () => ({
  ModulePaywall: ({ moduleId }: { moduleId: string }) => (
    <div data-testid="paywall">{moduleId} paywall</div>
  ),
}));

const { ModuleGate } = await import('../ModuleGate');

function renderGate() {
  return render(
    <ModuleGate moduleId={'LEGAL' as never}>
      <div data-testid="content">child content</div>
    </ModuleGate>
  );
}

describe('ModuleGate', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a spinner while the access query is loading', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: true,
      isError: false,
    });
    const { container } = renderGate();
    expect(screen.queryByTestId('content')).toBeNull();
    expect(screen.queryByTestId('paywall')).toBeNull();
    expect(container.querySelector('.animate-spin')).not.toBeNull();
  });

  it('renders the paywall when the module is not enabled — no tenant-admin bypass', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: false,
      isError: false,
    });
    renderGate();
    expect(screen.queryByTestId('paywall')).not.toBeNull();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('renders the paywall on an access error (fail closed)', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => true, // enabled, but the query errored
      isLoading: false,
      isError: true,
    });
    renderGate();
    expect(screen.queryByTestId('paywall')).not.toBeNull();
  });

  it('renders children when the module is enabled', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => true,
      isLoading: false,
      isError: false,
    });
    renderGate();
    expect(screen.queryByTestId('content')).not.toBeNull();
    expect(screen.queryByTestId('paywall')).toBeNull();
  });

  it('says the module is not part of the workspace (no paywall) when the business type excludes it', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: false,
      isError: false,
      businessType: 'TRADES_HOME_SERVICES',
    });
    renderGate();
    expect(screen.queryByTestId('workspace-module-notice')).not.toBeNull();
    expect(screen.getByText(/Not part of your workspace's modules/)).toBeTruthy();
    expect(screen.queryByTestId('paywall')).toBeNull();
    expect(screen.queryByTestId('content')).toBeNull();
  });

  it('treats a workspace with no business type like OTHER (notice, not paywall)', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: false,
      isError: false,
      businessType: null,
    });
    renderGate();
    expect(screen.queryByTestId('workspace-module-notice')).not.toBeNull();
  });

  it('still shows the paywall when the business type allows it but the plan does not', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: false,
      isError: false,
      businessType: 'LAW_FIRM',
    });
    renderGate();
    expect(screen.queryByTestId('paywall')).not.toBeNull();
    expect(screen.queryByTestId('workspace-module-notice')).toBeNull();
  });

  it('titles the not-in-workspace notice by the feature the user opened, not the module name', () => {
    mockUseEnabledModules.mockReturnValue({
      isModuleEnabled: () => false,
      isLoading: false,
      isError: false,
      businessType: 'TRADES_HOME_SERVICES',
    });
    const { unmount } = render(
      <ModuleGate moduleId={'LEGAL' as never} featureLabel="Cases">
        <div />
      </ModuleGate>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Cases');
    expect(screen.queryByText('Legal')).toBeNull();
    unmount();
    render(
      <ModuleGate moduleId={'SUPPORT' as never} featureLabel="Help Center">
        <div />
      </ModuleGate>
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Help Center');
  });
});
