/**
 * DocumentSettingsContent - error-state "Retry" handling (SonarCloud S9383).
 *
 * The Retry button refetches every settings query. The refetch promises are
 * awaited, and a rejection is reported to the user instead of floating.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const refetchers = vi.hoisted(() => ({
  general: vi.fn(),
  duplicateRules: vi.fn(),
  requiredFields: vi.fn(),
  tags: vi.fn(),
  automation: vi.fn(),
  retention: vi.fn(),
}));

const stableMutation = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const stableUtils = vi.hoisted(() => ({
  documentSettings: {
    general: { get: { invalidate: vi.fn() } },
    duplicateRules: { getAll: { invalidate: vi.fn() } },
    requiredFields: { getAll: { invalidate: vi.fn() } },
    tags: { list: { invalidate: vi.fn() } },
    automation: { get: { invalidate: vi.fn() } },
    retentionPolicies: { getAll: { invalidate: vi.fn() } },
  },
}));
const generalError = vi.hoisted(() => new Error('settings backend down'));

const queries = vi.hoisted(() => ({
  general: {
    data: null,
    isLoading: false,
    isFetching: false,
    error: null as unknown,
    refetch: null as unknown,
  },
  duplicateRules: {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: null as unknown,
  },
  requiredFields: {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: null as unknown,
  },
  tags: { data: [], isLoading: false, isFetching: false, error: null, refetch: null as unknown },
  automation: {
    data: null,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: null as unknown,
  },
  retention: {
    data: [],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: null as unknown,
  },
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    documentSettings: {
      general: {
        get: { useQuery: () => queries.general },
        update: { useMutation: () => stableMutation },
        resetToDefaults: { useMutation: () => stableMutation },
      },
      duplicateRules: {
        getAll: { useQuery: () => queries.duplicateRules },
        updateAll: { useMutation: () => stableMutation },
        resetToDefaults: { useMutation: () => stableMutation },
      },
      requiredFields: {
        getAll: { useQuery: () => queries.requiredFields },
        updateAll: { useMutation: () => stableMutation },
        resetToDefaults: { useMutation: () => stableMutation },
      },
      tags: {
        list: { useQuery: () => queries.tags },
        create: { useMutation: () => stableMutation },
        update: { useMutation: () => stableMutation },
        delete: { useMutation: () => stableMutation },
      },
      automation: {
        get: { useQuery: () => queries.automation },
        update: { useMutation: () => stableMutation },
        resetToDefaults: { useMutation: () => stableMutation },
      },
      retentionPolicies: {
        getAll: { useQuery: () => queries.retention },
        updateAll: { useMutation: () => stableMutation },
        resetToDefaults: { useMutation: () => stableMutation },
      },
    },
    useUtils: () => stableUtils,
  },
}));

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: () => ({ isLoading: false, isAuthenticated: true }),
}));

vi.mock('@intelliflow/ui', async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, toast: vi.fn() };
});

import DocumentSettingsContent from '../DocumentSettingsContent';

describe('DocumentSettingsContent - Retry', () => {
  beforeEach(() => {
    for (const [key, fn] of Object.entries(refetchers)) {
      fn.mockReset();
      fn.mockResolvedValue({ data: key });
      (queries[key as keyof typeof queries] as { refetch: unknown }).refetch = fn;
    }
    queries.general.error = generalError;
  });

  it('refetches every settings query when Retry is clicked', async () => {
    render(<DocumentSettingsContent />);

    expect(screen.getByText(/Failed to load settings: settings backend down/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => {
      for (const fn of Object.values(refetchers)) {
        expect(fn).toHaveBeenCalledTimes(1);
      }
    });
    const { toast } = await import('@intelliflow/ui');
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows a destructive toast when a refetch rejects', async () => {
    refetchers.tags.mockRejectedValue(new Error('network down'));
    const { toast } = await import('@intelliflow/ui');

    render(<DocumentSettingsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error reloading settings',
          description: 'network down',
          variant: 'destructive',
        })
      )
    );
  });

  it('falls back to "Unknown error" for non-Error rejections', async () => {
    refetchers.general.mockRejectedValue('boom');
    const { toast } = await import('@intelliflow/ui');

    render(<DocumentSettingsContent />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Unknown error', variant: 'destructive' })
      )
    );
  });
});
