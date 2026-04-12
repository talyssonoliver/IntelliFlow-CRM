/**
 * LeadSettingsContent Orchestration Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the orchestration layer: tRPC data fetching, tab wiring,
 * loading/error states, and save/reset delegation to ModuleSettingsLayout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ─── Hoisted mock references ────────────────────────────────────────────────
// vi.mock factories are hoisted before variable declarations, so all fn refs
// that the factory closes over must be created with vi.hoisted().
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

vi.mock('../components/CustomFieldsTab', () => ({
  CustomFieldsTab: ({ fields, onCreate, onUpdate, onDelete }: any) => (
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
  ),
}));

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

vi.mock('../LeadSettingsLoading', () => ({
  LeadSettingsLoading: () => <div data-testid="lead-settings-loading">Loading...</div>,
}));

vi.mock('@/components/settings/ModuleSettingsLayout', () => ({
  ModuleSettingsLayout: ({ title, tabs, onSave, onReset, isDirty, isSaving }: any) => (
    <div data-testid="module-layout">
      <h1>{title}</h1>
      <div data-testid="tab-count">{tabs?.length}</div>
      <button onClick={onSave} disabled={!isDirty || isSaving} data-testid="save-btn">
        Save
      </button>
      <button onClick={onReset} data-testid="reset-btn">
        Reset
      </button>
      <div data-testid="tabs-content">
        {tabs?.map((tab: any) => (
          <div key={tab.value} data-testid={`tab-${tab.value}`}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  ),
}));

vi.mock('@intelliflow/ui', () => ({
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

// Default mutation return value
const makeMutationReturn = () => ({
  mutateAsync: mockMutateAsync,
  mutate: mockMutate,
  isPending: false,
});

// Helper to set up standard tRPC query mocks for success scenario
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

// Import after all mocks
import LeadSettingsContent from '../LeadSettingsContent';

describe('LeadSettingsContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply default returns after clearAllMocks wipes them
    mockUseRequireAuth.mockReturnValue({ isLoading: false, isAuthenticated: true });
    setupSuccessfulMocks();
  });

  it('renders 4 tabs via the ModuleSettingsLayout mock', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('tab-count')).toHaveTextContent('4');
  });

  it('renders with title "Lead Settings"', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByRole('heading', { name: 'Lead Settings' })).toBeInTheDocument();
  });

  it('renders all 4 tab content areas', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('tab-stages')).toBeInTheDocument();
    expect(screen.getByTestId('tab-scoring')).toBeInTheDocument();
    expect(screen.getByTestId('tab-custom-fields')).toBeInTheDocument();
    expect(screen.getByTestId('tab-automation')).toBeInTheDocument();
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

  it('shows LeadSettingsLoading when auth is loading', () => {
    mockUseRequireAuth.mockReturnValue({ isLoading: true, isAuthenticated: false });

    render(<LeadSettingsContent />);

    expect(screen.getByTestId('lead-settings-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('module-layout')).not.toBeInTheDocument();
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

  it('save button is disabled initially (isDirty starts false)', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('save-btn')).toBeDisabled();
  });

  it('module layout renders with save and reset controls', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('module-layout')).toBeInTheDocument();
    expect(screen.getByTestId('save-btn')).toBeInTheDocument();
    expect(screen.getByTestId('reset-btn')).toBeInTheDocument();
  });

  it('calls reset mutations when reset button is clicked', async () => {
    render(<LeadSettingsContent />);

    fireEvent.click(screen.getByTestId('reset-btn'));

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

    // Make isDirty=true by triggering a stages change via the mock button
    fireEvent.click(screen.getByTestId('trigger-stages-change'));

    // Save button should now be enabled (isDirty=true, isSaving=false)
    const saveBtn = screen.getByTestId('save-btn');
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    await waitFor(() => {
      // stagesUpdate, scoringUpdate, automationUpdate mutateAsync all called
      expect(mockMutateAsync).toHaveBeenCalledTimes(3);
    });
  });

  it('handleSave shows error toast when a mutation throws', async () => {
    const { toast: mockToast } = await import('@intelliflow/ui');
    // Make the first mutateAsync reject
    mockMutateAsync.mockRejectedValueOnce(new Error('Save failed'));

    render(<LeadSettingsContent />);

    // Make isDirty=true to enable the save button
    fireEvent.click(screen.getByTestId('trigger-stages-change'));

    fireEvent.click(screen.getByTestId('save-btn'));

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

    fireEvent.click(screen.getByTestId('reset-btn'));

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

    // Extract and invoke the onSuccess callback passed to fieldCreate.mutate
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

  it('handleAutomationChange sets isDirty and updates localAutomation', () => {
    render(<LeadSettingsContent />);

    // Initially save button is disabled (isDirty=false)
    expect(screen.getByTestId('save-btn')).toBeDisabled();

    // Trigger automation change
    fireEvent.click(screen.getByTestId('trigger-automation-change'));

    // isDirty should now be true → save button enabled
    expect(screen.getByTestId('save-btn')).not.toBeDisabled();
  });

  it('handleRulesChange sets isDirty and enables the save button', () => {
    render(<LeadSettingsContent />);

    expect(screen.getByTestId('save-btn')).toBeDisabled();

    fireEvent.click(screen.getByTestId('trigger-rules-change'));

    expect(screen.getByTestId('save-btn')).not.toBeDisabled();
  });

  it('fieldUpdate useMutation onSuccess calls invalidate', () => {
    render(<LeadSettingsContent />);

    // Extract the onSuccess passed to fieldUpdate.useMutation
    const callArgs = mockFieldsUpdateMutation.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    callArgs.onSuccess();

    expect(mockInvalidate).toHaveBeenCalled();
  });

  it('fieldDelete useMutation onSuccess calls invalidate', () => {
    render(<LeadSettingsContent />);

    // Extract the onSuccess passed to fieldDelete.useMutation
    const callArgs = mockFieldsDeleteMutation.mock.calls[0]?.[0];
    expect(callArgs).toBeDefined();
    callArgs.onSuccess();

    expect(mockInvalidate).toHaveBeenCalled();
  });
});
