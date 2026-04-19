/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock @dnd-kit/core
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(() => ({})),
  useSensors: vi.fn(() => []),
}));

// Mock @dnd-kit/sortable
vi.mock('@dnd-kit/sortable', () => ({
  SortableContext: ({ children }: any) => <div>{children}</div>,
  verticalListSortingStrategy: {},
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
  }),
  arrayMove: vi.fn((arr: any[], from: number, to: number) => {
    const clone = [...arr];
    const [item] = clone.splice(from, 1);
    clone.splice(to, 0, item);
    return clone;
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: { Transform: { toString: () => '' } },
}));

// Mock useRouting hook
const mockCreateRule = { mutate: vi.fn(), isPending: false };
const mockUpdateRule = { mutate: vi.fn(), isPending: false };
const mockDeleteRule = { mutate: vi.fn(), isPending: false };
const mockReorderRules = { mutate: vi.fn(), isPending: false };
const mockToggleRule = { mutate: vi.fn(), isPending: false };

const mockRules = [
  {
    id: 'rule-1',
    name: 'High Score Leads',
    priority: 0,
    isActive: true,
    conditions: [{ field: 'leadScore', operator: 'greater_than', value: 80 }],
    actions: [{ type: 'assign_to_team', target: 'Senior Sales' }],
  },
  {
    id: 'rule-2',
    name: 'Website Leads',
    priority: 1,
    isActive: false,
    conditions: [{ field: 'leadSource', operator: 'equals', value: 'WEBSITE' }],
    actions: [{ type: 'notify', channels: ['email'] }],
  },
];

// Per-test mutable rules handle — flip between populated & empty before
// render(), since vi.doMock cannot retroactively replace an already-imported
// module. Tests that want a different rules array mutate `currentRules` via
// the exported setter in beforeEach.
const rulesState = { current: mockRules as typeof mockRules };

vi.mock('@/app/settings/routing/hooks/useRouting', () => ({
  useRouting: () => ({
    rules: rulesState.current,
    rulesLoading: false,
    createRule: mockCreateRule,
    updateRule: mockUpdateRule,
    deleteRule: mockDeleteRule,
    reorderRules: mockReorderRules,
    toggleRule: mockToggleRule,
  }),
}));

vi.mock('@intelliflow/ui', async () => {
  return {
    Button: ({ children, onClick, ...props }: any) => (
      <button onClick={onClick} {...props}>
        {children}
      </button>
    ),
    Card: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardHeader: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CardTitle: ({ children }: any) => <h3>{children}</h3>,
    EmptyState: ({ entity, title, description }: any) => (
      <div data-testid={`empty-state-${entity ?? 'custom'}`}>
        {title ?? (entity === 'rules' ? 'No rules' : '')}
        {description}
      </div>
    ),
    Input: (props: any) => <input {...props} />,
    Label: ({ children, ...props }: any) => <label {...props}>{children}</label>,
    Select: ({ children, value, onValueChange: _onValueChange }: any) => (
      <div data-value={value}>{children}</div>
    ),
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ children, value }: any) => <option value={value}>{children}</option>,
    SelectTrigger: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    SelectValue: () => <span />,
    Sheet: ({ children, open }: any) =>
      open ? <div data-testid="sheet">{children}</div> : <>{children}</>,
    SheetContent: ({ children }: any) => <div>{children}</div>,
    SheetHeader: ({ children }: any) => <div>{children}</div>,
    SheetTitle: ({ children }: any) => <h4>{children}</h4>,
    SheetTrigger: ({ children }: any) => <>{children}</>,
    Skeleton: ({ className }: any) => <div className={className} data-testid="skeleton" />,
    Switch: ({ checked, onCheckedChange, ...props }: any) => (
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onCheckedChange(!checked)}
        {...props}
      />
    ),
    Textarea: (props: any) => <textarea {...props} />,
    useToast: () => ({ toast: vi.fn() }),
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
  };
});

vi.mock('@intelliflow/domain', () => ({
  ROUTING_CONDITION_FIELDS: [
    'leadScore',
    'leadSource',
    'leadStatus',
    'estimatedValue',
    'location',
    'tags',
  ],
  ROUTING_CONDITION_OPERATORS: [
    'equals',
    'not_equals',
    'greater_than',
    'less_than',
    'in',
    'not_in',
    'contains',
  ],
  ROUTING_ACTION_TYPES: [
    'assign_to_user',
    'assign_to_team',
    'assign_by_skill',
    'notify',
    'escalate',
  ],
}));

vi.mock('@intelliflow/validators', () => ({
  routingConditionSchema: {},
  routingActionSchema: {},
}));

import { RoutingRulesEditor } from '../RoutingRulesEditor';

describe('RoutingRulesEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders rule list with correct data', () => {
    render(<RoutingRulesEditor />);

    expect(screen.getByText('High Score Leads')).toBeInTheDocument();
    expect(screen.getByText('Website Leads')).toBeInTheDocument();
  });

  it('renders conditions summary text', () => {
    render(<RoutingRulesEditor />);

    expect(screen.getByText(/leadScore greater_than 80/)).toBeInTheDocument();
    expect(screen.getByText(/leadSource equals WEBSITE/)).toBeInTheDocument();
  });

  it('renders actions summary text', () => {
    render(<RoutingRulesEditor />);

    expect(screen.getByText(/assign_to_team: Senior Sales/)).toBeInTheDocument();
  });

  it('shows Add Rule button', () => {
    render(<RoutingRulesEditor />);

    expect(screen.getByText('Add Rule')).toBeInTheDocument();
  });

  it('calls toggleRule on switch click', async () => {
    const user = userEvent.setup();
    render(<RoutingRulesEditor />);

    const switches = screen.getAllByRole('switch');
    await user.click(switches[0]);

    expect(mockToggleRule.mutate).toHaveBeenCalledWith({ id: 'rule-1', isActive: false });
  });

  it('calls deleteRule on delete button click', async () => {
    const user = userEvent.setup();
    render(<RoutingRulesEditor />);

    const deleteButtons = screen.getAllByLabelText(/Delete/);
    await user.click(deleteButtons[0]);

    expect(mockDeleteRule.mutate).toHaveBeenCalledWith({ id: 'rule-1' });
  });

  it('has list with aria-label on draggable rules list', () => {
    // Source uses `<ul aria-label="Routing rules list">` (implicit role="list",
    // not "listbox"). The listbox role was removed when DnD integration changed.
    render(<RoutingRulesEditor />);

    expect(screen.getByRole('list', { name: /routing rules/i })).toBeInTheDocument();
  });

  it('shows empty state when no rules', async () => {
    rulesState.current = [];
    try {
      // Re-import the component so the hook reads the flipped rulesState.
      const { RoutingRulesEditor: EmptyVariant } = await import('../RoutingRulesEditor');
      render(<EmptyVariant />);
      // EmptyState for entity="rules" renders the curated "No rules" title
      // from packages/ui entity-empty-state-config.
      expect(await screen.findByText(/no rules/i)).toBeInTheDocument();
    } finally {
      rulesState.current = mockRules;
    }
  });
});
