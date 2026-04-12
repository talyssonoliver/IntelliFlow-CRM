/**
 * LeadStagesTab Component Tests
 *
 * PG-178: Lead Settings
 *
 * Tests the drag-and-drop stage list, add/remove actions,
 * and default stage badge rendering.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { StageItem } from '../components/SortableStageItem';

// ─── dnd-kit mocks ──────────────────────────────────────────────────────────

// Capture the latest onDragEnd so tests can invoke it directly
let capturedOnDragEnd: ((event: any) => void) | null = null;

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragEnd }: any) => {
    capturedOnDragEnd = onDragEnd;
    return <div data-testid="dnd-context">{children}</div>;
  },
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

// Mutable return for useSortable so tests can override isDragging
const mockUseSortableReturn = {
  attributes: {} as any,
  listeners: {} as any,
  setNodeRef: vi.fn(),
  transform: null,
  transition: null,
  isDragging: false,
};

vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: 'vertical',
  arrayMove: vi.fn((arr: any[], from: number, to: number) => {
    const result = [...arr];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  }),
  useSortable: vi.fn(() => ({ ...mockUseSortableReturn })),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: vi.fn(() => '') } },
}));

// ─── @intelliflow/ui mock ───────────────────────────────────────────────────
vi.mock('@intelliflow/ui', () => ({
  Tabs: ({ children, ...props }: any) => (
    <div data-testid="tabs" {...props}>
      {children}
    </div>
  ),
  TabsList: ({ children }: any) => <div role="tablist">{children}</div>,
  TabsTrigger: ({ children, value, ...props }: any) => (
    <button role="tab" data-value={value} {...props}>
      {children}
    </button>
  ),
  TabsContent: ({ children, value }: any) => (
    <div role="tabpanel" data-value={value}>
      {children}
    </div>
  ),
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  Button: ({ children, onClick, disabled, variant, size, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      data-size={size}
      {...props}
    >
      {children}
    </button>
  ),
  Input: ({ value, onChange, className, 'aria-label': ariaLabel, ...props }: any) => (
    <input
      value={value}
      onChange={onChange}
      className={className}
      aria-label={ariaLabel}
      {...props}
    />
  ),
  ConfirmationDialog: ({ open, onConfirm, title, onOpenChange }: any) =>
    open ? (
      <div data-testid="confirmation-dialog">
        <p>{title}</p>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={() => onOpenChange(false)}>Cancel</button>
      </div>
    ) : null,
  Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
}));

// Import after mocks
import { LeadStagesTab } from '../components/LeadStagesTab';
import { SortableStageItem } from '../components/SortableStageItem';

const mockStages: StageItem[] = [
  {
    stageKey: 'NEW',
    displayName: 'New',
    color: '#3B82F6',
    sortOrder: 0,
    isDefault: true,
  },
  {
    stageKey: 'CONTACTED',
    displayName: 'Contacted',
    color: '#F59E0B',
    sortOrder: 1,
    isDefault: false,
  },
  {
    stageKey: 'QUALIFIED',
    displayName: 'Qualified',
    color: '#22C55E',
    sortOrder: 2,
    isDefault: false,
  },
];

describe('LeadStagesTab', () => {
  let onStagesChange: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onStagesChange = vi.fn();
  });

  it('renders stages with display names', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Contacted')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Qualified')).toBeInTheDocument();
  });

  it('renders Pipeline Stages heading', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    expect(screen.getByText('Pipeline Stages')).toBeInTheDocument();
  });

  it('shows "Default Stage" badge on the default stage', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    expect(screen.getByText('Default Stage')).toBeInTheDocument();
  });

  it('does not show "Default Stage" badge on non-default stages', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Only one Default Stage badge total
    const badges = screen.getAllByText('Default Stage');
    expect(badges).toHaveLength(1);
  });

  it('shows "Set Default" button for non-default stages', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // 2 non-default stages → 2 Set Default buttons
    const setDefaultBtns = screen.getAllByText('Set Default');
    expect(setDefaultBtns).toHaveLength(2);
  });

  it('Add Stage button calls onStagesChange with new stage appended', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    fireEvent.click(screen.getByText('Add Stage'));

    expect(onStagesChange).toHaveBeenCalledOnce();
    const newStages: StageItem[] = onStagesChange.mock.calls[0][0];
    expect(newStages).toHaveLength(mockStages.length + 1);
    expect(newStages[newStages.length - 1].stageKey).toMatch(/^CUSTOM_/);
    expect(newStages[newStages.length - 1].isDefault).toBe(false);
  });

  it('Delete button removes the stage from the list', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Only non-default stages have a remove button
    const removeBtns = screen.getAllByRole('button', { name: /Remove/ });
    fireEvent.click(removeBtns[0]);

    expect(onStagesChange).toHaveBeenCalledOnce();
    const updatedStages: StageItem[] = onStagesChange.mock.calls[0][0];
    expect(updatedStages).toHaveLength(mockStages.length - 1);
  });

  it('default stage does not have a remove button', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Only non-default stages get remove buttons; "New" is default
    const removeBtns = screen.getAllByRole('button', { name: /Remove/ });
    // 2 non-default stages → 2 remove buttons
    expect(removeBtns).toHaveLength(2);
  });

  it('renders stages in a list container', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    const list = screen.getByRole('list', { name: 'Lead stages' });
    expect(list).toBeInTheDocument();
  });

  it('renders correct number of list items', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Each stage renders an input; verify count by display values
    const inputs = screen.getAllByRole('textbox');
    // One input per stage (the displayName input)
    expect(inputs).toHaveLength(mockStages.length);
  });

  it('renders with empty stages list without crashing', () => {
    render(<LeadStagesTab stages={[]} onStagesChange={onStagesChange} />);

    expect(screen.getByText('Pipeline Stages')).toBeInTheDocument();
    expect(screen.getByText('Add Stage')).toBeInTheDocument();
  });

  it('clicking Set Default calls onStagesChange with updated isDefault flags', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    const setDefaultBtns = screen.getAllByText('Set Default');
    fireEvent.click(setDefaultBtns[0]);

    expect(onStagesChange).toHaveBeenCalledOnce();
    const updated: StageItem[] = onStagesChange.mock.calls[0][0];
    // Exactly one stage should be default
    const defaults = updated.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
  });

  it('handleAddStage assigns the next color in the palette based on stage count', () => {
    // With 3 stages, the new stage should get STAGE_COLORS[3 % 10] = '#6366F1'
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    fireEvent.click(screen.getByText('Add Stage'));

    const newStages: StageItem[] = onStagesChange.mock.calls[0][0];
    const addedStage = newStages[newStages.length - 1];
    expect(addedStage.color).toBe('#6366F1');
    expect(addedStage.sortOrder).toBe(mockStages.length);
  });

  it('handleAddStage sets displayName to empty string', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    fireEvent.click(screen.getByText('Add Stage'));

    const newStages: StageItem[] = onStagesChange.mock.calls[0][0];
    const addedStage = newStages[newStages.length - 1];
    expect(addedStage.displayName).toBe('');
  });

  it('handleDragEnd reorders stages when active and over are different', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Simulate a drag-end event: move CONTACTED (index 1) before NEW (index 0)
    expect(capturedOnDragEnd).not.toBeNull();
    capturedOnDragEnd!({
      active: { id: 'CONTACTED' },
      over: { id: 'NEW' },
    });

    expect(onStagesChange).toHaveBeenCalledOnce();
    const reordered: StageItem[] = onStagesChange.mock.calls[0][0];
    expect(reordered[0].stageKey).toBe('CONTACTED');
    expect(reordered[0].sortOrder).toBe(0);
    expect(reordered[1].stageKey).toBe('NEW');
    expect(reordered[1].sortOrder).toBe(1);
  });

  it('handleDragEnd does nothing when over is null', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    expect(capturedOnDragEnd).not.toBeNull();
    capturedOnDragEnd!({ active: { id: 'NEW' }, over: null });

    expect(onStagesChange).not.toHaveBeenCalled();
  });

  it('handleDragEnd does nothing when active and over are the same', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    expect(capturedOnDragEnd).not.toBeNull();
    capturedOnDragEnd!({ active: { id: 'NEW' }, over: { id: 'NEW' } });

    expect(onStagesChange).not.toHaveBeenCalled();
  });

  it('editing a stage display name calls onStagesChange with updated stage via handleUpdateStage', () => {
    render(<LeadStagesTab stages={mockStages} onStagesChange={onStagesChange} />);

    // Change the 'Contacted' stage name input
    const contactedInput = screen.getByDisplayValue('Contacted');
    fireEvent.change(contactedInput, { target: { value: 'Reached Out' } });

    expect(onStagesChange).toHaveBeenCalledOnce();
    const updated: StageItem[] = onStagesChange.mock.calls[0][0];
    const contactedStage = updated.find((s) => s.stageKey === 'CONTACTED');
    expect(contactedStage?.displayName).toBe('Reached Out');
  });
});

// ─── SortableStageItem direct tests ─────────────────────────────────────────

describe('SortableStageItem', () => {
  const baseStage: StageItem = {
    stageKey: 'NEW',
    displayName: 'New',
    color: '#3B82F6',
    sortOrder: 0,
    isDefault: false,
  };

  let onRemove: any;
  let onUpdate: any;
  let onSetDefault: any;

  beforeEach(() => {
    vi.clearAllMocks();
    onRemove = vi.fn();
    onUpdate = vi.fn();
    onSetDefault = vi.fn();
  });

  it('renders the stage display name input', () => {
    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    expect(screen.getByDisplayValue('New')).toBeInTheDocument();
  });

  it('clicking the color dot calls onUpdate with the next color in the cycle', () => {
    // baseStage.color = '#3B82F6' which is index 0 in STAGE_COLORS
    // next color should be '#F59E0B' (index 1)
    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Change color for New/ }));

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({ color: '#F59E0B' });
  });

  it('clicking the color dot wraps around to the first color when at the last color', () => {
    const stageAtLastColor: StageItem = { ...baseStage, color: '#8B5CF6' }; // last in STAGE_COLORS

    render(
      <SortableStageItem
        stage={stageAtLastColor}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Change color/ }));

    expect(onUpdate).toHaveBeenCalledWith({ color: '#3B82F6' }); // wraps back to index 0
  });

  it('clicking Set Default button calls onSetDefault', () => {
    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    fireEvent.click(screen.getByText('Set Default'));

    expect(onSetDefault).toHaveBeenCalledOnce();
  });

  it('clicking Remove button calls onRemove', () => {
    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /Remove New/ }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('default stage shows "Default Stage" badge instead of Set Default button', () => {
    const defaultStage: StageItem = { ...baseStage, isDefault: true };

    render(
      <SortableStageItem
        stage={defaultStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    expect(screen.getByText('Default Stage')).toBeInTheDocument();
    expect(screen.queryByText('Set Default')).not.toBeInTheDocument();
  });

  it('default stage does not show a remove button', () => {
    const defaultStage: StageItem = { ...baseStage, isDefault: true };

    render(
      <SortableStageItem
        stage={defaultStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
  });

  it('changing the display name input calls onUpdate with the new displayName', () => {
    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    const nameInput = screen.getByDisplayValue('New');
    fireEvent.change(nameInput, { target: { value: 'In Progress' } });

    expect(onUpdate).toHaveBeenCalledOnce();
    expect(onUpdate).toHaveBeenCalledWith({ displayName: 'In Progress' });
  });

  it('applies opacity class when isDragging is true', () => {
    // Set isDragging=true on the shared mock return object
    mockUseSortableReturn.isDragging = true;

    render(
      <SortableStageItem
        stage={baseStage}
        onRemove={onRemove}
        onUpdate={onUpdate}
        onSetDefault={onSetDefault}
      />
    );

    // Reset after render
    mockUseSortableReturn.isDragging = false;

    // The root container div has the opacity-50 class when dragging
    const container = screen.getByDisplayValue('New').closest('[class*="rounded-lg"]');
    expect(container?.className).toMatch(/opacity-50/);
  });
});
