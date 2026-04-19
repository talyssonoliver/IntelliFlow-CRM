/**
 * LeadSettingsContent Orchestration Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the orchestration layer: tRPC data fetching, bento-grid wiring,
 * loading/error states, and save/reset delegation to PageHeader actions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Hoisted mock references ────────────────────────────────────────────────
const {
  mockUseRequireAuth,
  mockStagesGetAllQuery,
  mockScoringGetAllQuery,
  mockFieldsListQuery,
  mockAutomationGetQuery,
  mockStagesUpdateAllMutation,
  mockStagesResetMutation,
  mockScoringUpdateAllMutation,
  mockScoringResetMutation,
  mockAutomationUpdateMutation,
  mockFieldsCreateMutation,
  mockFieldsUpdateMutation,
  mockFieldsDeleteMutation,
  mockInvalidate,
  mockMutateAsync,
  mockMutate,
  mockRefetch,
} = vi.hoisted(() => ({
  mockUseRequireAuth: vi.fn(() => ({ isLoading: false, isAuthenticated: true })),
  mockStagesGetAllQuery: vi.fn(),
  mockScoringGetAllQuery: vi.fn(),
  mockFieldsListQuery: vi.fn(),
  mockAutomationGetQuery: vi.fn(),
  mockStagesUpdateAllMutation: vi.fn(),
  mockStagesResetMutation: vi.fn(),
  mockScoringUpdateAllMutation: vi.fn(),
  mockScoringResetMutation: vi.fn(),
  mockAutomationUpdateMutation: vi.fn(),
  mockFieldsCreateMutation: vi.fn(),
  mockFieldsUpdateMutation: vi.fn(),
  mockFieldsDeleteMutation: vi.fn(),
  mockInvalidate: vi.fn(),
  mockMutateAsync: vi.fn().mockResolvedValue(undefined),
  mockMutate: vi.fn(),
  mockRefetch: vi.fn(),
}));

// ─── tRPC Mock ──────────────────────────────────────────────────────────────
vi.mock('@/lib/trpc', () => ({
  trpc: {
    leadSettings: {
      stages: {
        getAll: { useQuery: mockStagesGetAllQuery },
        updateAll: { useMutation: mockStagesUpdateAllMutation },
        resetToDefaults: { useMutation: mockStagesResetMutation },
      },
      scoringRules: {
        getAll: { useQuery: mockScoringGetAllQuery },
        updateAll: { useMutation: mockScoringUpdateAllMutation },
        resetToDefaults: { useMutation: mockScoringResetMutation },
      },
      customFields: {
        list: { useQuery: mockFieldsListQuery },
        create: { useMutation: mockFieldsCreateMutation },
        update: { useMutation: mockFieldsUpdateMutation },
        delete: { useMutation: mockFieldsDeleteMutation },
      },
      automation: {
        get: { useQuery: mockAutomationGetQuery },
        update: { useMutation: mockAutomationUpdateMutation },
      },
    },
    useUtils: vi.fn(() => ({
      leadSettings: {
        stages: { getAll: { invalidate: mockInvalidate } },
        scoringRules: { getAll: { invalidate: mockInvalidate } },
        customFields: { list: { invalidate: mockInvalidate } },
        automation: { get: { invalidate: mockInvalidate } },
      },
    })),
  },
}));

// ─── Auth Mock ──────────────────────────────────────────────────────────────
vi.mock('@/lib/auth/AuthContext', () => ({
  useRequireAuth: mockUseRequireAuth,
}));

// ─── Child component mocks ──────────────────────────────────────────────────
vi.mock('../components/LeadStagesTab', () => ({
  LeadStagesTab: ({ stages, onStagesChange }: any) => (
    <div data-testid="stages-tab">
      Stages: {stages?.length ?? 0}
      <button data-testid="trigger-stages-change" onClick={() => onStagesChange(stages)}>
        TriggerStagesChange
      </button>
    </div>
  ),
}));

vi.mock('../components/ScoringRulesTab', () => ({
  ScoringRulesTab: ({ rules, onRulesChange }: any) => (
    <div data-testid="scoring-tab">
      Rules: {rules?.length ?? 0}
      <button data-testid="trigger-rules-change" onClick={() => onRulesChange(rules)}>
        TriggerRulesChange
      </button>
    </div>
  ),
}));

vi.mock('../components/CustomFieldsTab', async () => {
  const React = await import('react');
  return {
    // The real component is a forwardRef exposing `openCreate()`. Use a real
    // forwardRef in the mock too so React doesn't warn about refs and so
    // `customFieldsTabRef.current?.openCreate()` is safely callable.
    CustomFieldsTab: React.forwardRef(function CustomFieldsTabMock(
      { fields, onCreate, onUpdate, onDelete }: any,
      ref: React.Ref<{ openCreate: () => void }>
    ) {
      React.useImperativeHandle(ref, () => ({ openCreate: () => {} }), []);
      return (
        <div data-testid="custom-fields-tab">
          Fields: {fields?.length ?? 0}
          <button
            data-testid="trigger-create"
            onClick={() => onCreate({ fieldName: 'Test', dataType: 'text', isRequired: false })}
          >
            TriggerCreate
          </button>
          <button
            data-testid="trigger-update"
            onClick={() =>
              onUpdate({ id: 'f1', fieldName: 'Updated', dataType: 'text', isRequired: false })
            }
          >
            TriggerUpdate
          </button>
          <button data-testid="trigger-delete" onClick={() => onDelete('f1')}>
            TriggerDelete
          </button>
        </div>
      );
    }),
  };
});

vi.mock('../components/AutomationTab', () => ({
  AutomationTab: ({ settings, onSettingsChange }: any) => (
    <div data-testid="automation-tab">
      autoAssignment: {String(settings?.autoAssignment)}
      <button
        data-testid="trigger-automation-change"
        onClick={() =>
          onSettingsChange({
            autoAssignment: false,
            instantNotifications: true,
            leadRecurrence: false,
          })
        }
      >
        TriggerAutomationChange
      </button>
    </div>
  ),
}));

vi.mock('../components/ConfigurationSummary', () => ({
  ConfigurationSummary: ({ stages, rules, fields, isDirty }: any) => (
    <div data-testid="config-summary">
      stages={stages?.length ?? 0} rules={rules?.length ?? 0} fields={fields?.length ?? 0} dirty=
      {String(isDirty)}
    </div>
  ),
}));

vi.mock('../LeadSettingsLoading', () => ({
  LeadSettingsLoading: () => <div data-testid="lead-settings-loading">Loading...</div>,
}));

// PageHeader is a shared UI element — stub it with a lightweight fake that
// exposes the actions array so save/reset buttons are clickable in tests.
vi.mock('@/components/shared/page-header', () => ({
  PageHeader: ({ title, description, actions }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {description && <p>{description}</p>}
      <div data-testid="page-header-actions">
        {actions?.map((a: any, i: number) => (
          <button
            key={i}
            data-testid={`pg-action-${a.label.toLowerCase().replace(/\s+/g, '-')}`}
            onClick={a.onClick}
            disabled={a.disabled}
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  ),
}));

vi.mock('@intelliflow/ui', async (importOriginal) => ({
  ...((await importOriginal()) as Record<string, unknown>),
  Card: ({ children, className }: any) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
  Button: ({ children, onClick, size, ...props }: any) => (
    <button onClick={onClick} data-size={size} {...props}>
      {children}
    </button>
  ),
  ConfirmationDialog: ({ open, onConfirm }: any) =>
    open ? (
      <div data-testid="confirm-reset">
        <button onClick={onConfirm} data-testid="confirm-reset-btn">
          Confirm
        </button>
      </div>
    ) : null,
  toast: vi.fn(),
}));

// ─── Mock data ──────────────────────────────────────────────────────────────
const mockStages = [
  {
    stageKey: 'NEW',
    displayName: 'New',
    color: '#3B82F6',
    sortOrder: 0,
    isDefault: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    stageKey: 'CONTACTED',
    displayName: 'Contacted',
    color: '#F59E0B',
    sortOrder: 1,
    isDefault: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockRules = [
  { activityType: 'EMAIL_OPEN', points: 5 },
  { activityType: 'EMAIL_CLICK', points: 10 },
];

const mockFields = [
  {
    id: 'field-1',
    fieldName: 'Company Size',
    fieldKey: 'company_size',
    dataType: 'text',
    isRequired: false,
    sortOrder: 0,
    options: null,
  },
];

const mockAutomation = {
  autoAssignment: true,
  instantNotifications: false,
  leadRecurrence: true,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const makeMutationReturn = () => ({
  mutateAsync: mockMutateAsync,
  mutate: mockMutate,
  isPending: false,
});

function setupSuccessfulMocks() {
  mockStagesGetAllQuery.mockReturnValue({
    data: mockStages,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  });
  mockScoringGetAllQuery.mockReturnValue({
    data: mockRules,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  });
  mockFieldsListQuery.mockReturnValue({
    data: mockFields,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  });
  mockAutomationGetQuery.mockReturnValue({
    data: mockAutomation,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  });

  mockStagesUpdateAllMutation.mockReturnValue(makeMutationReturn());
  mockStagesResetMutation.mockReturnValue(makeMutationReturn());
  mockScoringUpdateAllMutation.mockReturnValue(makeMutationReturn());
  mockScoringResetMutation.mockReturnValue(makeMutationReturn());
  mockAutomationUpdateMutation.mockReturnValue(makeMutationReturn());
  mockFieldsCreateMutation.mockReturnValue(makeMutationReturn());
  mockFieldsUpdateMutation.mockReturnValue(makeMutationReturn());
  mockFieldsDeleteMutation.mockReturnValue(makeMutationReturn());
}

import LeadSettingsContent from '../LeadSettingsContent';

describe('LeadSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRequireAuth.mockReturnValue({ isLoading: false, isAuthenticated: true });
    setupSuccessfulMocks();
  });

  it('renders the PageHeader with "Lead Settings" title', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByRole('heading', { name: 'Lead Settings' })).toBeInTheDocument();
  });

  it('renders all 5 bento sections (stages, automation, scoring, custom fields, summary)', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('stages-tab')).toBeInTheDocument();
    expect(screen.getByTestId('automation-tab')).toBeInTheDocument();
    expect(screen.getByTestId('scoring-tab')).toBeInTheDocument();
    expect(screen.getByTestId('custom-fields-tab')).toBeInTheDocument();
    expect(screen.getByTestId('config-summary')).toBeInTheDocument();
  });

  it('passes stage data to LeadStagesTab', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('stages-tab')).toHaveTextContent('Stages: 2');
  });

  it('passes rules data to ScoringRulesTab', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('scoring-tab')).toHaveTextContent('Rules: 2');
  });

  it('passes fields data to CustomFieldsTab', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('custom-fields-tab')).toHaveTextContent('Fields: 1');
  });

  it('passes automation settings to AutomationTab', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('automation-tab')).toHaveTextContent('autoAssignment: true');
  });

  it('passes combined state to ConfigurationSummary', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('config-summary')).toHaveTextContent(
      'stages=2 rules=2 fields=1 dirty=false'
    );
  });

  it('shows LeadSettingsLoading when auth is loading', () => {
    mockUseRequireAuth.mockReturnValue({ isLoading: true, isAuthenticated: false });

    render(<LeadSettingsContent />);

    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('page-header')).not.toBeInTheDocument();
  });

  it('shows LeadSettingsLoading when queries are loading', () => {
    mockStagesGetAllQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    render(<LeadSettingsContent />);
    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
  });

  it('shows error state on query failure', () => {
    mockStagesGetAllQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
      refetch: mockRefetch,
    });

    render(<LeadSettingsContent />);

    expect(screen.getByText(/Failed to load settings/)).toBeInTheDocument();
    expect(screen.getByText(/Network error/)).toBeInTheDocument();
  });

  it('shows retry button on error', () => {
    mockStagesGetAllQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
      refetch: mockRefetch,
    });

    render(<LeadSettingsContent />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('calls refetch on all queries when retry is clicked', () => {
    const refetchStages = vi.fn();
    const refetchScoring = vi.fn();
    const refetchFields = vi.fn();
    const refetchAutomation = vi.fn();

    mockStagesGetAllQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'Network error' },
      refetch: refetchStages,
    });
    mockScoringGetAllQuery.mockReturnValue({
      data: mockRules,
      isLoading: false,
      error: null,
      refetch: refetchScoring,
    });
    mockFieldsListQuery.mockReturnValue({
      data: mockFields,
      isLoading: false,
      error: null,
      refetch: refetchFields,
    });
    mockAutomationGetQuery.mockReturnValue({
      data: mockAutomation,
      isLoading: false,
      error: null,
      refetch: refetchAutomation,
    });

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByText('Retry'));

    expect(refetchStages).toHaveBeenCalled();
    expect(refetchScoring).toHaveBeenCalled();
    expect(refetchFields).toHaveBeenCalled();
    expect(refetchAutomation).toHaveBeenCalled();
  });

  it('Save Changes button is disabled initially (isDirty starts false)', () => {
    render(<LeadSettingsContent />);
    expect(screen.getByTestId('pg-action-save-changes')).toBeDisabled();
  });

  it('PageHeader exposes Save Changes and Reset to Defaults actions', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('pg-action-save-changes')).toBeInTheDocument();
    expect(screen.getByTestId('pg-action-reset-to-defaults')).toBeInTheDocument();
  });

  it('Reset to Defaults action opens the confirmation dialog', () => {
    render(<LeadSettingsContent />);

    expect(screen.queryByTestId('confirm-reset')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('pg-action-reset-to-defaults'));

    expect(screen.getByTestId('confirm-reset')).toBeInTheDocument();
  });

  it('Confirming reset calls stages and scoring reset mutations', async () => {
    render(<LeadSettingsContent />);

    fireEvent.click(screen.getByTestId('pg-action-reset-to-defaults'));
    fireEvent.click(screen.getByTestId('confirm-reset-btn'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalled();
    });
  });

  it('handleFieldCreate calls fieldCreate.mutate with field data', () => {
    render(<LeadSettingsContent />);

    fireEvent.click(screen.getByTestId('trigger-create'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ fieldName: 'Test', dataType: 'text' }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('handleFieldUpdate calls fieldUpdate.mutate with updated field data', () => {
    render(<LeadSettingsContent />);

    fireEvent.click(screen.getByTestId('trigger-update'));

    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'f1', fieldName: 'Updated' }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('handleFieldDelete calls fieldDelete.mutate with field id', () => {
    render(<LeadSettingsContent />);

    fireEvent.click(screen.getByTestId('trigger-delete'));

    expect(mockMutate).toHaveBeenCalledWith(
      { id: 'f1' },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) })
    );
  });

  it('handleSave calls all 3 mutateAsync calls (stages, scoring, automation)', async () => {
    render(<LeadSettingsContent />);

    // Mark dirty via stages change
    fireEvent.click(screen.getByTestId('trigger-stages-change'));

    const saveBtn = screen.getByTestId('pg-action-save-changes');
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    });
  });

  it('handleSave shows error toast when a mutation throws', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');
    mockMutateAsync.mockRejectedValueOnce(new Error('Save failed'));

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-stages-change'));
    fireEvent.click(screen.getByTestId('pg-action-save-changes'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error saving settings',
          variant: 'destructive',
        })
      );
    });
  });

  it('handleReset shows error toast when reset mutation throws', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');
    mockMutateAsync.mockRejectedValueOnce(new Error('Reset failed'));

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('pg-action-reset-to-defaults'));
    fireEvent.click(screen.getByTestId('confirm-reset-btn'));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Error resetting settings',
          variant: 'destructive',
        })
      );
    });
  });

  it('handleFieldCreate onSuccess callback calls toast with field created message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-create'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onSuccess } = mutateCall[1];
    onSuccess();

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Field created' }));
  });

  it('handleFieldCreate onError callback calls toast with error message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-create'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onError } = mutateCall[1];
    onError({ message: 'Create failed' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: 'Create failed',
        variant: 'destructive',
      })
    );
  });

  it('handleFieldUpdate onError callback calls toast with error message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-update'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onError } = mutateCall[1];
    onError({ message: 'Update failed' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: 'Update failed',
        variant: 'destructive',
      })
    );
  });

  it('handleFieldDelete onError callback calls toast with error message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-delete'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onError } = mutateCall[1];
    onError({ message: 'Delete failed' });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Error',
        description: 'Delete failed',
        variant: 'destructive',
      })
    );
  });

  it('handleFieldUpdate onSuccess callback calls toast with field updated message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-update'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onSuccess } = mutateCall[1];
    onSuccess();

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Field updated' }));
  });

  it('handleFieldDelete onSuccess callback calls toast with field deleted message', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');

    render(<LeadSettingsContent />);
    fireEvent.click(screen.getByTestId('trigger-delete'));

    const mutateCall = mockMutate.mock.calls[0];
    const { onSuccess } = mutateCall[1];
    onSuccess();

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Field deleted' }));
  });

  it('handleAutomationChange sets isDirty and enables the save button', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('pg-action-save-changes')).toBeDisabled();

    fireEvent.click(screen.getByTestId('trigger-automation-change'));

    expect(screen.getByTestId('pg-action-save-changes')).not.toBeDisabled();
  });

  it('handleRulesChange sets isDirty and enables the save button', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('pg-action-save-changes')).toBeDisabled();

    fireEvent.click(screen.getByTestId('trigger-rules-change'));

    expect(screen.getByTestId('pg-action-save-changes')).not.toBeDisabled();
  });

  it('fieldUpdate useMutation onSuccess calls invalidate', () => {
    render(<LeadSettingsContent />);

    const callArgs = mockFieldsUpdateMutation.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    callArgs.onSuccess();

    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('fieldDelete useMutation onSuccess calls invalidate', () => {
    render(<LeadSettingsContent />);

    const callArgs = mockFieldsDeleteMutation.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    callArgs.onSuccess();

    expect(mockInvalidate).toHaveBeenCalled();
  });
});
