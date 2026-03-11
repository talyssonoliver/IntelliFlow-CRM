/**
 * @vitest-environment jsdom
 */
/**
 * TicketTypeManager Component Tests - PG-173
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockParentCategory = {
  id: 'cat-1',
  name: 'Billing',
  description: 'Billing issues',
  parentId: null,
  color: '#FF5733',
  icon: 'credit-card',
  slaPolicyId: 'sla-1',
  isActive: true,
  sortOrder: 0,
  tenantId: 'test-tenant',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockChildCategory = {
  ...mockParentCategory,
  id: 'cat-2',
  name: 'Refunds',
  parentId: 'cat-1',
  color: '#33FF57',
  icon: 'undo',
  sortOrder: 1,
};

const mockSlaPolicy = {
  id: 'sla-1',
  name: 'Standard SLA',
};

type MockQueryReturn<T> = { data: T | undefined; isLoading: boolean };
type MockMutationReturn = { mutate: ReturnType<typeof vi.fn>; isPending: boolean };

const mockCategoryListQuery = vi.fn<() => MockQueryReturn<any[]>>(() => ({
  data: [mockParentCategory, mockChildCategory],
  isLoading: false,
}));
const mockSlaListQuery = vi.fn<() => MockQueryReturn<any[]>>(() => ({
  data: [mockSlaPolicy],
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

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ ticketConfig: { category: { list: { invalidate: vi.fn() } } } }),
    ticketConfig: {
      category: {
        list: { useQuery: () => mockCategoryListQuery() },
        create: { useMutation: () => mockCreateMutation() },
        update: { useMutation: () => mockUpdateMutation() },
        delete: { useMutation: () => mockDeleteMutation() },
      },
      slaPolicy: {
        list: { useQuery: () => mockSlaListQuery() },
      },
    },
  },
}));

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: vi.fn() };
});

import { TicketTypeManager } from '../TicketTypeManager';

describe('TicketTypeManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCategoryListQuery.mockReturnValue({ data: [mockParentCategory, mockChildCategory], isLoading: false });
    mockSlaListQuery.mockReturnValue({ data: [mockSlaPolicy], isLoading: false });
  });

  it('renders category list with parent and child', () => {
    render(<TicketTypeManager />);
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText(/Refunds/)).toBeInTheDocument();
  });

  it('shows hierarchical display (child indented)', () => {
    render(<TicketTypeManager />);
    // Child category prefixed with "↳"
    expect(screen.getByText(/↳ Refunds/)).toBeInTheDocument();
  });

  it('shows Add Type button', () => {
    render(<TicketTypeManager />);
    expect(screen.getByRole('button', { name: /add new ticket type/i })).toBeInTheDocument();
  });

  it('opens create dialog when clicking Add Type', () => {
    render(<TicketTypeManager />);
    fireEvent.click(screen.getByRole('button', { name: /add new ticket type/i }));
    expect(screen.getByText('Add Ticket Type')).toBeInTheDocument();
  });

  it('shows color swatches', () => {
    const { container } = render(<TicketTypeManager />);
    const swatches = container.querySelectorAll('[style*="background-color"]');
    expect(swatches.length).toBeGreaterThanOrEqual(2);
  });

  it('renders active/inactive toggle for each category', () => {
    render(<TicketTypeManager />);
    const toggles = screen.getAllByRole('switch');
    expect(toggles).toHaveLength(2);
  });

  it('shows SLA policy name for categories with slaPolicyId', () => {
    render(<TicketTypeManager />);
    const slaCells = screen.getAllByText('Standard SLA');
    expect(slaCells.length).toBeGreaterThanOrEqual(1);
  });

  it('renders edit and delete buttons with aria-labels', () => {
    render(<TicketTypeManager />);
    expect(screen.getByLabelText('Edit Billing')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete Billing')).toBeInTheDocument();
  });

  it('shows empty state when no categories', () => {
    mockCategoryListQuery.mockReturnValue({ data: [], isLoading: false });
    render(<TicketTypeManager />);
    expect(screen.getByText('No Ticket Types')).toBeInTheDocument();
  });

  it('table has aria-label', () => {
    render(<TicketTypeManager />);
    expect(screen.getByLabelText('Ticket Types')).toBeInTheDocument();
  });

  it('opens edit dialog with pre-populated data when clicking edit', () => {
    render(<TicketTypeManager />);
    fireEvent.click(screen.getByLabelText('Edit Billing'));
    expect(screen.getByText('Edit Ticket Type')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Billing')).toBeInTheDocument();
  });

  it('calls toggle mutation when clicking active switch', () => {
    const mutateFn = vi.fn();
    mockUpdateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<TicketTypeManager />);
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[0]);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat-1', isActive: false }));
  });

  it('calls delete mutation when clicking delete', () => {
    const mutateFn = vi.fn();
    mockDeleteMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<TicketTypeManager />);
    fireEvent.click(screen.getByLabelText('Delete Billing'));
    expect(mutateFn).toHaveBeenCalledWith({ id: 'cat-1' });
  });

  it('calls create mutation on form submit', () => {
    const mutateFn = vi.fn();
    mockCreateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<TicketTypeManager />);
    fireEvent.click(screen.getByRole('button', { name: /add new ticket type/i }));
    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'New Category' } });
    // "Add Type" text appears both in header button and dialog — use the last one (dialog)
    const addTypeButtons = screen.getAllByText('Add Type');
    fireEvent.click(addTypeButtons[addTypeButtons.length - 1]);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Category' }));
  });

  it('calls update mutation on edit submit', () => {
    const mutateFn = vi.fn();
    mockUpdateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<TicketTypeManager />);
    fireEvent.click(screen.getByLabelText('Edit Billing'));
    const nameInput = screen.getByDisplayValue('Billing');
    fireEvent.change(nameInput, { target: { value: 'Updated Billing' } });
    fireEvent.click(screen.getByText('Save Changes'));
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'cat-1', name: 'Updated Billing' }));
  });

  it('shows sort order for categories', () => {
    render(<TicketTypeManager />);
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('shows icon text for categories with icons', () => {
    render(<TicketTypeManager />);
    expect(screen.getByText('credit-card')).toBeInTheDocument();
  });
});
