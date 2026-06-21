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
});
