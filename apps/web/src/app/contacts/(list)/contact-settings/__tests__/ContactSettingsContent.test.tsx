import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from '@intelliflow/ui';

const {
  mockUseRequireAuth,
  mockInvalidate,
  mockMutateAsync,
  mockRefetch,
  mockDuplicateRulesQuery,
  mockRequiredFieldsQuery,
  mockTagsListQuery,
  mockAutomationGetQuery,
  mockDuplicateRulesUpdate,
  mockDuplicateRulesReset,
  mockRequiredFieldsUpdate,
  mockRequiredFieldsReset,
  mockAutomationUpdate,
  mockTagCreate,
  mockTagUpdate,
  mockTagDelete,
} = vi.hoisted(() => {
  const makeQuery = (data: unknown) =>
    vi.fn(() => ({
      data,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }));
  const makeMutation = () =>
    vi.fn(() => ({
      mutate: vi.fn(),
      mutateAsync: vi.fn().mockResolvedValue(undefined),
      isPending: false,
    }));
  return {
    mockUseRequireAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
    mockInvalidate: vi.fn(),
    mockMutateAsync: vi.fn().mockResolvedValue(undefined),
    mockRefetch: vi.fn(),
    mockDuplicateRulesQuery: makeQuery([
      {
        field: 'email',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      },
    ]),
    mockRequiredFieldsQuery: makeQuery([{ fieldKey: 'email', isRequired: true }]),
    mockTagsListQuery: makeQuery([]),
    mockAutomationGetQuery: makeQuery({
      autoMergeOnExactEmail: false,
      notifyOnDuplicate: true,
      restrictTagCreationToAdmins: false,
      normalizePhoneNumbers: true,
      autoCapitalizeNames: true,
      preventDeleteWithOpenDeals: true,
      notifyOnOwnerChange: false,
      aiDuplicateDetection: true,
      aiEnrichment: false,
      aiTagSuggestions: true,
      aiInsightGeneration: true,
      aiAutoReplyDrafting: false,
      updatedAt: new Date('2026-04-13').toISOString(),
    }),
    mockDuplicateRulesUpdate: makeMutation(),
    mockDuplicateRulesReset: makeMutation(),
    mockRequiredFieldsUpdate: makeMutation(),
    mockRequiredFieldsReset: makeMutation(),
    mockAutomationUpdate: makeMutation(),
    mockTagCreate: makeMutation(),
    mockTagUpdate: makeMutation(),
    mockTagDelete: makeMutation(),
  };
});

vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: mockUseRequireAuth,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    contactSettings: {
      duplicateRules: {
        getAll: { useQuery: mockDuplicateRulesQuery },
        updateAll: { useMutation: mockDuplicateRulesUpdate },
        resetToDefaults: { useMutation: mockDuplicateRulesReset },
      },
      requiredFields: {
        getAll: { useQuery: mockRequiredFieldsQuery },
        updateAll: { useMutation: mockRequiredFieldsUpdate },
        resetToDefaults: { useMutation: mockRequiredFieldsReset },
      },
      tags: {
        list: { useQuery: mockTagsListQuery },
        create: { useMutation: mockTagCreate },
        update: { useMutation: mockTagUpdate },
        delete: { useMutation: mockTagDelete },
      },
      automation: {
        get: { useQuery: mockAutomationGetQuery },
        update: { useMutation: mockAutomationUpdate },
        resetToDefaults: {
          useMutation: () => ({
            mutate: () => {},
            mutateAsync: async () => undefined,
            isPending: false,
          }),
        },
      },
    },
    useUtils: () => ({
      contactSettings: {
        duplicateRules: { getAll: { invalidate: mockInvalidate } },
        requiredFields: { getAll: { invalidate: mockInvalidate } },
        tags: { list: { invalidate: mockInvalidate } },
        automation: { get: { invalidate: mockInvalidate } },
      },
    }),
  },
}));

vi.mock('@/providers/TimezoneProvider', () => ({
  useTimezoneContext: () => ({ timezone: 'UTC' }),
}));

vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual<typeof import('@intelliflow/ui')>('@intelliflow/ui');
  return { ...actual, toast: vi.fn() };
});

import ContactSettingsContent from '../ContactSettingsContent';

describe('ContactSettingsContent', () => {
  it('renders the PageHeader and four bento sections', () => {
    render(<ContactSettingsContent />);
    expect(screen.getByRole('heading', { name: 'Contact Settings', level: 1 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /Duplicate Detection/i, level: 3 })
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Required Fields/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Tags$/i, level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Automation/i, level: 3 })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /AI & Intelligence/i, level: 3 })
    ).toBeInTheDocument();
  });

  it('renders the Save Changes button as disabled when not dirty', () => {
    render(<ContactSettingsContent />);
    const saveBtn = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveBtn).toBeDisabled();
  });

  describe('Retry after a load error', () => {
    const originalImpl = mockDuplicateRulesQuery.getMockImplementation();
    afterEach(() => {
      mockDuplicateRulesQuery.mockImplementation(originalImpl as never);
      vi.mocked(toast).mockClear();
    });

    const errorQuery = (refetch: ReturnType<typeof vi.fn>) =>
      vi.fn(() => ({
        data: undefined,
        isLoading: false,
        error: new Error('load failed'),
        refetch,
      }));

    it('refetches every settings query when Retry is clicked', async () => {
      const refetch = vi.fn().mockResolvedValue({});
      mockDuplicateRulesQuery.mockImplementation(errorQuery(refetch) as never);
      render(<ContactSettingsContent />);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
      expect(refetch).toHaveBeenCalledWith({ throwOnError: true });
      expect(toast).not.toHaveBeenCalled();
    });

    it('shows a destructive toast when the retry itself fails', async () => {
      const refetch = vi.fn().mockRejectedValue(new Error('still offline'));
      mockDuplicateRulesQuery.mockImplementation(errorQuery(refetch) as never);
      render(<ContactSettingsContent />);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Error reloading settings',
            description: 'still offline',
            variant: 'destructive',
          })
        )
      );
    });

    it('falls back to a generic message for non-Error rejections', async () => {
      const refetch = vi.fn().mockRejectedValue('nope');
      mockDuplicateRulesQuery.mockImplementation(errorQuery(refetch) as never);
      render(<ContactSettingsContent />);
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() =>
        expect(toast).toHaveBeenCalledWith(
          expect.objectContaining({ description: 'An unexpected error occurred' })
        )
      );
    });
  });

  // Keep refs alive so TS does not flag unused mocks.
  it('hoisted mock references are wired', () => {
    void mockRefetch;
    void mockMutateAsync;
    expect(mockUseRequireAuth).toBeTruthy();
  });
});
