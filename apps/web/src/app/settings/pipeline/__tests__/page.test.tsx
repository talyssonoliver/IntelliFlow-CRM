/**
 * Pipeline Settings Page Tests
 *
 * IFC-063: FLOW-007 Pipeline Stage Customization
 *
 * Tests for the pipeline settings page component.
 * Note: We test PipelineSettingsContent directly since the page wrapper
 * just handles SSR concerns (next/dynamic with ssr:false) which aren't
 * relevant in test environment.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the hook before importing the component
const mockUpdateAll = vi.fn();
const mockResetToDefaults = vi.fn();

const mockStages = [
  {
    id: '1',
    stageKey: 'PROSPECTING',
    displayName: 'Prospecting',
    color: '#94a3b8',
    order: 0,
    probability: 10,
    isActive: true,
  },
  {
    id: '2',
    stageKey: 'QUALIFICATION',
    displayName: 'Qualification',
    color: '#60a5fa',
    order: 1,
    probability: 20,
    isActive: true,
  },
  {
    id: '3',
    stageKey: 'CLOSED_WON',
    displayName: 'Closed Won',
    color: '#22c55e',
    order: 2,
    probability: 100,
    isActive: true,
  },
];

vi.mock('@/hooks/usePipelineConfig', () => ({
  usePipelineConfig: () => ({
    stages: mockStages,
    isLoading: false,
    error: null,
    updateAll: mockUpdateAll,
    resetToDefaults: mockResetToDefaults,
    isSaving: false,
    isResetting: false,
  }),
}));

// Mock Next.js Link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock useToast
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...actual,
    useToast: () => ({ toast: vi.fn() }),
  };
});

// Import after mocks - test the content component directly (bypasses next/dynamic SSR wrapper)
import PipelineSettingsContent from '../PipelineSettingsContent';

describe('Pipeline Settings Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.confirm for reset button tests
    Object.defineProperty(window, 'confirm', {
      writable: true,
      value: vi.fn(() => true),
    });
  });

  it('renders pipeline stages header', async () => {
    render(<PipelineSettingsContent />);

    expect(screen.getByText('Pipeline Stages')).toBeInTheDocument();
    expect(
      screen.getByText('Customize your deal pipeline stages, colors, and order')
    ).toBeInTheDocument();
  });

  it('renders all pipeline stages from hook', async () => {
    render(<PipelineSettingsContent />);

    // Check that stage display names are rendered as inputs
    expect(screen.getByDisplayValue('Prospecting')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Qualification')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Closed Won')).toBeInTheDocument();
  });

  it('renders stage keys as badges', async () => {
    render(<PipelineSettingsContent />);

    expect(screen.getByText('PROSPECTING')).toBeInTheDocument();
    expect(screen.getByText('QUALIFICATION')).toBeInTheDocument();
    expect(screen.getByText('CLOSED_WON')).toBeInTheDocument();
  });

  it('renders probability inputs for each stage', async () => {
    render(<PipelineSettingsContent />);

    const probabilityInputs = screen.getAllByRole('spinbutton');
    expect(probabilityInputs.length).toBe(3); // 3 stages

    // Check default values
    expect(probabilityInputs[0]).toHaveValue(10);
    expect(probabilityInputs[1]).toHaveValue(20);
    expect(probabilityInputs[2]).toHaveValue(100);
  });

  it('renders move up/down buttons', async () => {
    render(<PipelineSettingsContent />);

    const moveUpButtons = screen.getAllByRole('button', { name: /Move up/i });
    const moveDownButtons = screen.getAllByRole('button', { name: /Move down/i });

    expect(moveUpButtons.length).toBe(3);
    expect(moveDownButtons.length).toBe(3);

    // First up button should be disabled
    expect(moveUpButtons[0]).toBeDisabled();
    // Last down button should be disabled
    expect(moveDownButtons[2]).toBeDisabled();
  });

  it('renders color picker buttons', async () => {
    render(<PipelineSettingsContent />);

    // Each stage has 14 color options
    const colorButtons = screen.getAllByRole('button', { name: /Select color/i });
    expect(colorButtons.length).toBe(14 * 3); // 14 colors × 3 stages
  });

  it('renders save and reset buttons', async () => {
    render(<PipelineSettingsContent />);

    expect(screen.getByRole('button', { name: /Save Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reset/i })).toBeInTheDocument();
  });

  it('save button is disabled when no changes made', async () => {
    render(<PipelineSettingsContent />);

    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    // Initially disabled because no changes
    expect(saveButton).toBeDisabled();
  });

  it('updates display name and enables save button', async () => {
    const user = userEvent.setup();
    render(<PipelineSettingsContent />);

    const displayNameInput = screen.getByDisplayValue('Prospecting');
    await user.clear(displayNameInput);
    await user.type(displayNameInput, 'New Name');

    // Save button should now be enabled
    const saveButton = screen.getByRole('button', { name: /Save Changes/i });
    expect(saveButton).not.toBeDisabled();
  });

  it('shows protected badge for CLOSED_WON stage', async () => {
    render(<PipelineSettingsContent />);

    expect(screen.getByText('Protected')).toBeInTheDocument();
  });

  it('renders tips section', async () => {
    render(<PipelineSettingsContent />);

    expect(screen.getByText('Tips')).toBeInTheDocument();
    // Verify the tips list contains the protected stages note
    const tipsContainer = screen.getByText('Tips').parentElement;
    expect(tipsContainer?.textContent).toContain('cannot be');
  });
});
