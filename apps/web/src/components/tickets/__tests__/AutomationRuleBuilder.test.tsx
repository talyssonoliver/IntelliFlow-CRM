/**
 * @vitest-environment jsdom
 */
/**
 * AutomationRuleBuilder Component Tests - PG-173
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRule1 = {
  id: 'rule-1',
  name: 'High Priority Billing',
  description: 'Route billing to billing team',
  priority: 0,
  isActive: true,
  conditions: [
    { field: 'category', operator: 'equals', value: 'BILLING' },
    { field: 'priority', operator: 'gte', value: 'HIGH' },
  ],
  actions: [{ type: 'assign_to_skill', target: 'billing-team' }],
  createdBy: 'user-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockRule2 = {
  ...mockRule1,
  id: 'rule-2',
  name: 'Escalation Rule',
  priority: 1,
  conditions: [],
  actions: [],
};

type MockQueryReturn<T> = { data: T | undefined; isLoading: boolean };
type MockMutationReturn = { mutate: ReturnType<typeof vi.fn>; isPending: boolean };

const mockListQuery = vi.fn<
  () => MockQueryReturn<{ items: (typeof mockRule1)[]; nextCursor?: string }>
>(() => ({
  data: { items: [mockRule1, mockRule2], nextCursor: undefined },
  isLoading: false,
}));
const mockCreateMutation = vi.fn<() => MockMutationReturn>(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockUpdateMutation = vi.fn<() => MockMutationReturn>(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockDeleteMutation = vi.fn<() => MockMutationReturn>(() => ({
  mutate: vi.fn(),
  isPending: false,
}));
const mockToggleMutation = vi.fn<() => MockMutationReturn>(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ routing: { list: { invalidate: vi.fn() } } }),
    routing: {
      list: { useQuery: () => mockListQuery() },
      create: { useMutation: () => mockCreateMutation() },
      update: { useMutation: () => mockUpdateMutation() },
      delete: { useMutation: () => mockDeleteMutation() },
      toggle: { useMutation: () => mockToggleMutation() },
    },
  },
}));

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: vi.fn() };
});

import { AutomationRuleBuilder } from '../AutomationRuleBuilder';

describe('AutomationRuleBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQuery.mockReturnValue({
      data: { items: [mockRule1, mockRule2], nextCursor: undefined },
      isLoading: false,
    });
  });

  it('renders rule list with names', () => {
    render(<AutomationRuleBuilder />);
    expect(screen.getByText('High Priority Billing')).toBeInTheDocument();
    expect(screen.getByText('Escalation Rule')).toBeInTheDocument();
  });

  it('shows Create Rule button', () => {
    render(<AutomationRuleBuilder />);
    expect(screen.getByRole('button', { name: /create new automation rule/i })).toBeInTheDocument();
  });

  it('opens builder dialog when clicking Create Rule', () => {
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /create new automation rule/i }));
    expect(screen.getByText('Create Automation Rule')).toBeInTheDocument();
  });

  // Chip rendering tests
  it('renders conditions as human-readable chips', () => {
    render(<AutomationRuleBuilder />);
    // { field: "category", operator: "equals", value: "BILLING" } → "Category : BILLING"
    expect(screen.getByText('Category : BILLING')).toBeInTheDocument();
  });

  it('renders priority condition with operator chip', () => {
    render(<AutomationRuleBuilder />);
    // { field: "priority", operator: "gte", value: "HIGH" } → "Priority >= HIGH"
    expect(screen.getByText('Priority >= HIGH')).toBeInTheDocument();
  });

  it('renders action chips', () => {
    render(<AutomationRuleBuilder />);
    // { type: "assign_to_skill", target: "billing-team" } → "Assign to: billing-team"
    expect(screen.getByText('Assign to: billing-team')).toBeInTheDocument();
  });

  it('renders multiple condition chips in same row', () => {
    render(<AutomationRuleBuilder />);
    // Rule 1 has 2 conditions
    const conditionChips = screen.getAllByText(/Category|Priority/);
    expect(conditionChips.length).toBeGreaterThanOrEqual(2);
  });

  it('shows placeholder when no conditions', () => {
    render(<AutomationRuleBuilder />);
    // Rule 2 has empty conditions
    expect(screen.getByText('No conditions')).toBeInTheDocument();
  });

  it('shows placeholder when no actions', () => {
    render(<AutomationRuleBuilder />);
    // Rule 2 has empty actions
    expect(screen.getByText('No actions')).toBeInTheDocument();
  });

  it('displays priority badges', () => {
    render(<AutomationRuleBuilder />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('renders active/inactive toggle', () => {
    render(<AutomationRuleBuilder />);
    const toggles = screen.getAllByRole('switch');
    expect(toggles).toHaveLength(2);
  });

  it('renders edit and delete buttons with aria-labels', () => {
    render(<AutomationRuleBuilder />);
    expect(screen.getByLabelText('Edit High Priority Billing')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete High Priority Billing')).toBeInTheDocument();
  });

  it('shows empty state when no rules', () => {
    mockListQuery.mockReturnValue({
      data: { items: [], nextCursor: undefined },
      isLoading: false,
    });
    render(<AutomationRuleBuilder />);
    expect(screen.getByText('No Automation Rules')).toBeInTheDocument();
  });

  it('table has aria-label', () => {
    render(<AutomationRuleBuilder />);
    expect(screen.getByLabelText('Automation Rules')).toBeInTheDocument();
  });

  it('dialog has conditions and actions sections', () => {
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /create new automation rule/i }));
    // Table headers also have "Conditions" and "Actions" — use getAllByText and expect at least 2
    expect(screen.getAllByText('Conditions').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Actions').length).toBeGreaterThanOrEqual(2);
  });

  it('opens edit dialog with pre-populated data', () => {
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByLabelText('Edit High Priority Billing'));
    expect(screen.getByText('Edit Rule')).toBeInTheDocument();
    expect(screen.getByDisplayValue('High Priority Billing')).toBeInTheDocument();
  });

  it('calls toggle mutation when clicking active switch', () => {
    const mutateFn = vi.fn();
    mockToggleMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<AutomationRuleBuilder />);
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[0]);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'rule-1' }));
  });

  it('calls delete mutation when clicking delete', () => {
    const mutateFn = vi.fn();
    mockDeleteMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByLabelText('Delete High Priority Billing'));
    expect(mutateFn).toHaveBeenCalledWith({ id: 'rule-1' });
  });

  it('calls create mutation on form submit', () => {
    const mutateFn = vi.fn();
    mockCreateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /create new automation rule/i }));
    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'New Rule' } });
    // "Create Rule" text appears in header button and dialog — click dialog one
    const buttons = screen.getAllByText('Create Rule');
    fireEvent.click(buttons[buttons.length - 1]);
    expect(mutateFn).toHaveBeenCalled();
  });

  it('calls update mutation on edit submit', () => {
    const mutateFn = vi.fn();
    mockUpdateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByLabelText('Edit High Priority Billing'));
    const nameInput = screen.getByDisplayValue('High Priority Billing');
    fireEvent.change(nameInput, { target: { value: 'Updated Rule' } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(mutateFn).toHaveBeenCalled();
  });

  it('does not submit when name is empty', () => {
    const mutateFn = vi.fn();
    mockCreateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<AutomationRuleBuilder />);
    fireEvent.click(screen.getByRole('button', { name: /create new automation rule/i }));
    // Name is empty, dialog submit button should be disabled — last "Create Rule" button
    const buttons = screen.getAllByText('Create Rule');
    const submitBtn = buttons[buttons.length - 1];
    expect(submitBtn).toBeDisabled();
  });
});
