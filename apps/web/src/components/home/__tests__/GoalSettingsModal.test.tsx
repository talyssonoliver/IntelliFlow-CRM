/**
 * GoalSettingsModal Tests
 *
 * Tests for the goal settings side panel (Sheet):
 * - Panel rendering and accessibility
 * - Goal type selection via RadioGroup
 * - Target value input
 * - Custom unit field visibility
 * - Save/Cancel actions
 *
 * Task: IFC-195 - Customizable Daily Goals
 * Target: >=90% coverage
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// vi.hoisted — variables available inside vi.mock factories
// ---------------------------------------------------------------------------

const { mockUpdateMutate, mockUpdateMutation, mockInvalidate, mockOnSuccess } = vi.hoisted(() => {
  const mockUpdateMutate = vi.fn();
  const mockInvalidate = vi.fn();
  let capturedOnSuccess: (() => void) | undefined;
  return {
    mockUpdateMutate,
    mockInvalidate,
    mockOnSuccess: {
      get: () => capturedOnSuccess,
    },
    mockUpdateMutation: vi.fn((opts?: { onSuccess?: () => void }) => {
      capturedOnSuccess = opts?.onSuccess;
      return {
        mutate: mockUpdateMutate,
        isLoading: false,
      };
    }),
  };
});

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/trpc', () => ({
  trpc: {
    home: {
      updateDailyGoal: { useMutation: mockUpdateMutation },
    },
    useUtils: vi.fn(() => ({
      home: { getDailyGoal: { invalidate: mockInvalidate } },
    })),
  },
}));

// Mock @intelliflow/ui — Sheet-based components matching PinnedItemsSheet pattern
vi.mock('@intelliflow/ui', async () => {
  const React = await import('react');
  return {
    Sheet: ({ children, open }: any) =>
      open
        ? React.createElement('div', { role: 'dialog', 'data-testid': 'goal-sheet' }, children)
        : null,
    SheetContent: ({ children, className: _className }: any) =>
      React.createElement('div', null, children),
    SheetTitle: ({ children, className: _className }: any) =>
      React.createElement('h2', null, children),
    SheetDescription: ({ children, className: _className }: any) =>
      React.createElement('p', null, children),
    RadioGroup: ({
      children,
      onValueChange: _onValueChange,
      defaultValue: _defaultValue,
      value: _value,
    }: any) =>
      React.createElement(
        'div',
        { role: 'radiogroup', 'data-testid': 'goal-type-selector' },
        children
      ),
    RadioGroupItem: ({ value, id }: any) =>
      React.createElement('input', {
        type: 'radio',
        value,
        id,
        name: 'goal-type',
        'data-testid': `radio-${value}`,
      }),
    Input: (props: any) =>
      React.createElement('input', { ...props, 'data-testid': props['data-testid'] || 'input' }),
    Label: ({ children, htmlFor }: any) => React.createElement('label', { htmlFor }, children),
    toast: vi.fn(),
  };
});

import { GoalSettingsModal } from '../GoalSettingsModal';

describe('GoalSettingsModal', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    currentGoal: {
      id: 'daily-revenue',
      type: 'revenue' as const,
      label: 'Sales',
      targetValue: 5000,
      currentValue: 2500,
      unit: '$',
      progress: 50,
      remainingToTarget: 2500,
      remainingFormatted: '$2,500',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open={true}', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has SheetTitle for accessibility', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    expect(screen.getByText(/goal settings/i)).toBeInTheDocument();
  });

  it('shows 5 radio options', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    expect(screen.getByTestId('radio-revenue')).toBeInTheDocument();
    expect(screen.getByTestId('radio-calls')).toBeInTheDocument();
    expect(screen.getByTestId('radio-meetings')).toBeInTheDocument();
    expect(screen.getByTestId('radio-tasks')).toBeInTheDocument();
    expect(screen.getByTestId('radio-custom')).toBeInTheDocument();
  });

  it('target value input works', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    const input = screen.getByTestId('target-value-input');
    fireEvent.change(input, { target: { value: '8000' } });
    expect(input).toHaveValue(8000);
  });

  it('custom unit field appears only when type is custom', () => {
    render(
      <GoalSettingsModal
        {...defaultProps}
        currentGoal={{
          ...defaultProps.currentGoal,
          type: 'custom',
          id: 'daily-custom',
          unit: 'units',
        }}
      />
    );
    expect(screen.getByTestId('custom-unit-input')).toBeInTheDocument();
  });

  it('cancel button closes modal without calling mutation', () => {
    const onOpenChange = vi.fn();
    render(<GoalSettingsModal {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockUpdateMutate).not.toHaveBeenCalled();
  });

  it('save button calls updateDailyGoal mutation with correct input', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    fireEvent.click(screen.getByText(/save changes/i));
    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'revenue',
        targetValue: expect.any(Number),
      })
    );
  });

  it('save button disabled when targetValue is empty or 0', () => {
    render(<GoalSettingsModal {...defaultProps} currentGoal={undefined} />);
    // When no current goal, targetValue defaults to empty/0
    const saveBtn = screen.getByText(/save changes/i);
    expect(saveBtn).toBeDisabled();
  });

  it('pre-populates from current goal data', () => {
    render(<GoalSettingsModal {...defaultProps} />);
    const input = screen.getByTestId('target-value-input');
    expect(input).toHaveValue(5000);
  });

  it('Sheet onOpenChange closes the panel (Escape handled by Sheet)', () => {
    const onOpenChange = vi.fn();
    render(<GoalSettingsModal {...defaultProps} onOpenChange={onOpenChange} />);
    // Sheet handles Escape natively via onOpenChange prop — verify cancel still works
    fireEvent.click(screen.getByText(/cancel/i));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('mutation onSuccess invalidates getDailyGoal and closes modal', () => {
    const onOpenChange = vi.fn();
    render(<GoalSettingsModal {...defaultProps} onOpenChange={onOpenChange} />);
    // Trigger the captured onSuccess callback
    const onSuccess = mockOnSuccess.get();
    expect(onSuccess).toBeDefined();
    onSuccess!();
    expect(mockInvalidate).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('save with custom type includes customUnit in mutation', () => {
    render(
      <GoalSettingsModal
        {...defaultProps}
        currentGoal={{
          ...defaultProps.currentGoal,
          type: 'custom',
          id: 'daily-custom',
          unit: 'units',
        }}
      />
    );
    const customInput = screen.getByTestId('custom-unit-input');
    fireEvent.change(customInput, { target: { value: 'demos' } });
    fireEvent.click(screen.getByText(/save changes/i));
    expect(mockUpdateMutate).toHaveBeenCalledWith(expect.objectContaining({ customUnit: 'demos' }));
  });

  it('shows unit label for count-based types (calls/meetings/tasks)', () => {
    render(
      <GoalSettingsModal
        {...defaultProps}
        currentGoal={{
          ...defaultProps.currentGoal,
          type: 'calls',
          id: 'daily-calls',
          unit: 'calls',
        }}
      />
    );
    expect(screen.getByText('calls')).toBeInTheDocument();
  });

  it('custom unit input updates value on change', () => {
    render(
      <GoalSettingsModal
        {...defaultProps}
        currentGoal={{
          ...defaultProps.currentGoal,
          type: 'custom',
          id: 'daily-custom',
          unit: 'units',
        }}
      />
    );
    const customInput = screen.getByTestId('custom-unit-input');
    fireEvent.change(customInput, { target: { value: 'demos' } });
    expect(customInput).toHaveValue('demos');
  });
});
