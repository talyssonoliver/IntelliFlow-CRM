import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

vi.mock('@/lib/trpc', () => {
  const mkQuery = (data: unknown) => ({
    data,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
  const mkMutation = () => ({ mutateAsync: vi.fn(async () => ({})), isPending: false });
  const hierarchyData = {
    id: 'h-1',
    tenantId: 't',
    maxDepth: 5,
    requireParentForTiers: [] as string[],
    preventCycles: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return {
    trpc: {
      useUtils: () => ({
        accountSettings: {
          hierarchy: { get: { invalidate: vi.fn() } },
          industry: { list: { invalidate: vi.fn() } },
          customFields: { list: { invalidate: vi.fn() } },
        },
      }),
      accountSettings: {
        hierarchy: {
          get: { useQuery: () => mkQuery(hierarchyData) },
          update: { useMutation: mkMutation },
          resetToDefaults: { useMutation: mkMutation },
        },
        industry: {
          list: { useQuery: () => mkQuery([]) },
          create: { useMutation: mkMutation },
          update: { useMutation: mkMutation },
          delete: { useMutation: mkMutation },
          resetToDefaults: { useMutation: mkMutation },
        },
        customFields: {
          list: { useQuery: () => mkQuery([]) },
          create: { useMutation: mkMutation },
          update: { useMutation: mkMutation },
          delete: { useMutation: mkMutation },
        },
      },
    },
  };
});

import AccountSettingsContent from '../AccountSettingsContent';

describe('AccountSettingsContent', () => {
  it('renders the three tabs', async () => {
    render(<AccountSettingsContent />);
    expect(await screen.findByRole('tab', { name: /hierarchy/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^industry$/i })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /custom fields/i })).toBeTruthy();
  });

  it('shows the breadcrumb trail', () => {
    render(<AccountSettingsContent />);
    expect(screen.getByRole('link', { name: /dashboard/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^accounts$/i })).toBeTruthy();
    // Page title (h1) renders the title; breadcrumb also renders it. Either is fine.
    expect(screen.getAllByText(/account settings/i).length).toBeGreaterThan(0);
  });

  it('Save button is initially disabled (not dirty)', () => {
    render(<AccountSettingsContent />);
    const saveBtn = screen.getByRole('button', { name: /save changes/i });
    expect(saveBtn).toBeDisabled();
  });
});
