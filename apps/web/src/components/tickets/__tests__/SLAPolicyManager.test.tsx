/**
 * @vitest-environment jsdom
 */
/**
 * SLAPolicyManager Component Tests - PG-173
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPolicy1 = {
  id: 'sla-1',
  name: 'Standard SLA',
  description: 'Default policy',
  criticalResponseMinutes: 15,
  highResponseMinutes: 60,
  mediumResponseMinutes: 240,
  lowResponseMinutes: 480,
  criticalResolutionMinutes: 120,
  highResolutionMinutes: 480,
  mediumResolutionMinutes: 1440,
  lowResolutionMinutes: 4320,
  warningThresholdPercent: 25,
  isDefault: true,
  isActive: true,
  tenantId: 'test-tenant',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockPolicy2 = {
  ...mockPolicy1,
  id: 'sla-2',
  name: 'Premium SLA',
  isDefault: false,
  criticalResponseMinutes: 5,
};

type MockQueryReturn<T> = { data: T | undefined; isLoading: boolean };
type MockMutationReturn = { mutate: ReturnType<typeof vi.fn>; isPending: boolean };

const mockListQuery = vi.fn<() => MockQueryReturn<typeof mockPolicy1[]>>(() => ({
  data: [mockPolicy1, mockPolicy2],
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
const mockSetDefaultMutation = vi.fn<() => MockMutationReturn>(() => ({
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('@/lib/trpc', () => ({
  trpc: {
    useUtils: () => ({ ticketConfig: { slaPolicy: { list: { invalidate: vi.fn() } } } }),
    ticketConfig: {
      slaPolicy: {
        list: { useQuery: () => mockListQuery() },
        create: { useMutation: () => mockCreateMutation() },
        update: { useMutation: () => mockUpdateMutation() },
        delete: { useMutation: () => mockDeleteMutation() },
        setDefault: { useMutation: () => mockSetDefaultMutation() },
      },
    },
  },
}));

vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, toast: vi.fn() };
});

import { SLAPolicyManager } from '../SLAPolicyManager';

describe('SLAPolicyManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListQuery.mockReturnValue({ data: [mockPolicy1, mockPolicy2], isLoading: false });
  });

  it('renders policy list with names', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByText('Standard SLA')).toBeInTheDocument();
    expect(screen.getByText('Premium SLA')).toBeInTheDocument();
  });

  it('displays response times in human-readable format', () => {
    render(<SLAPolicyManager />);
    // Standard SLA: 15m/1h/4h/8h
    expect(screen.getByText(/15m\/1h\/4h\/8h/)).toBeInTheDocument();
  });

  it('shows Create Policy button', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByRole('button', { name: /create new sla policy/i })).toBeInTheDocument();
  });

  it('opens create dialog when clicking Create Policy', () => {
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByRole('button', { name: /create new sla policy/i }));
    expect(screen.getByText('Create SLA Policy')).toBeInTheDocument();
  });

  it('shows default indicator for default policy', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByLabelText('Default policy')).toBeInTheDocument();
  });

  it('shows Set Default button for non-default policy', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByLabelText(/set premium sla as default/i)).toBeInTheDocument();
  });

  it('renders active/inactive toggle for each policy', () => {
    render(<SLAPolicyManager />);
    const toggles = screen.getAllByRole('switch');
    expect(toggles).toHaveLength(2);
  });

  it('renders edit and delete buttons with aria-labels', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByLabelText('Edit Standard SLA')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete Standard SLA')).toBeInTheDocument();
  });

  it('shows empty state when no policies', () => {
    mockListQuery.mockReturnValue({ data: [], isLoading: false });
    render(<SLAPolicyManager />);
    expect(screen.getByText('No SLA Policies')).toBeInTheDocument();
  });

  it('shows loading skeleton when loading', () => {
    mockListQuery.mockReturnValue({ data: undefined, isLoading: true });
    render(<SLAPolicyManager />);
    expect(screen.queryByText('Standard SLA')).not.toBeInTheDocument();
  });

  it('table has aria-label', () => {
    render(<SLAPolicyManager />);
    expect(screen.getByLabelText('SLA Policies')).toBeInTheDocument();
  });

  it('opens edit dialog with pre-populated data when clicking edit', () => {
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByLabelText('Edit Standard SLA'));
    expect(screen.getByText('Edit SLA Policy')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Standard SLA')).toBeInTheDocument();
  });

  it('calls toggle mutation when clicking active switch', () => {
    const mutateFn = vi.fn();
    mockUpdateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<SLAPolicyManager />);
    const toggles = screen.getAllByRole('switch');
    fireEvent.click(toggles[0]);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'sla-1', isActive: false }));
  });

  it('calls setDefault mutation when clicking Set Default', () => {
    const mutateFn = vi.fn();
    mockSetDefaultMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByLabelText(/set premium sla as default/i));
    expect(mutateFn).toHaveBeenCalledWith({ id: 'sla-2' });
  });

  it('opens delete confirmation when clicking delete', () => {
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByLabelText('Delete Standard SLA'));
    expect(screen.getByText('Deactivate SLA Policy?')).toBeInTheDocument();
  });

  it('calls create mutation on form submit for new policy', () => {
    const mutateFn = vi.fn();
    mockCreateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByRole('button', { name: /create new sla policy/i }));
    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'New Policy' } });
    // Click the submit button (Create Policy in dialog footer)
    const buttons = screen.getAllByRole('button', { name: /create policy/i });
    const submitBtn = buttons.find(b => !b.getAttribute('aria-label'));
    if (submitBtn) fireEvent.click(submitBtn);
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Policy' }));
  });

  it('calls update mutation on form submit for edit', () => {
    const mutateFn = vi.fn();
    mockUpdateMutation.mockReturnValue({ mutate: mutateFn, isPending: false });
    render(<SLAPolicyManager />);
    fireEvent.click(screen.getByLabelText('Edit Standard SLA'));
    // Change the name
    const nameInput = screen.getByDisplayValue('Standard SLA');
    fireEvent.change(nameInput, { target: { value: 'Updated SLA' } });
    // Click Save Changes
    fireEvent.click(screen.getByText('Save Changes'));
    expect(mutateFn).toHaveBeenCalledWith(expect.objectContaining({ id: 'sla-1', name: 'Updated SLA' }));
  });

  it('shows resolution times in display', () => {
    render(<SLAPolicyManager />);
    // Standard SLA resolution: 2h/8h/24h/72h — both policies may match
    const cells = screen.getAllByText(/2h\/8h\/24h\/72h/);
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });

  it('shows warning threshold percentage', () => {
    render(<SLAPolicyManager />);
    // Both policies have 25% — use getAllByText
    const cells = screen.getAllByText('25%');
    expect(cells.length).toBeGreaterThanOrEqual(1);
  });
});
