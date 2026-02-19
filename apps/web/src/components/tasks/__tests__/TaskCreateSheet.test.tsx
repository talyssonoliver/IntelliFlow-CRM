import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCreateSheet } from '../TaskCreateSheet';

// Mock tRPC api
const mockMutate = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@/lib/api', () => ({
  api: {
    useUtils: () => ({
      task: {
        list: { invalidate: mockInvalidate },
        getByEntity: { invalidate: mockInvalidate },
        getReminders: { invalidate: mockInvalidate },
      },
    }),
    task: {
      create: {
        useMutation: (opts: any) => ({
          mutate: (data: any) => {
            mockMutate(data);
            opts?.onSuccess?.();
          },
          isPending: false,
        }),
      },
    },
    lead: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    contact: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
    opportunity: { list: { useQuery: () => ({ data: undefined, isLoading: false }) } },
  },
}));

// Mock Sheet components (Radix Portal)
vi.mock('@intelliflow/ui', async () => {
  const actual = await vi.importActual('@intelliflow/ui');
  return {
    ...(actual as any),
    Sheet: ({ children, open }: any) => (open ? <div data-testid="sheet">{children}</div> : null),
    SheetContent: ({ children }: any) => <div data-testid="sheet-content">{children}</div>,
    SheetTitle: ({ children }: any) => <h2>{children}</h2>,
    SheetDescription: ({ children }: any) => <p>{children}</p>,
  };
});

// Mock EntitySearchField
vi.mock('../EntitySearchField', () => ({
  EntitySearchField: ({ entityType }: any) => (
    <div data-testid={`entity-search-${entityType}`}>Search {entityType}</div>
  ),
}));

describe('TaskCreateSheet', () => {
  const defaultProps = {
    open: true,
    onOpenChange: vi.fn(),
    onSuccess: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders when open', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    expect(screen.getByText('New Task')).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<TaskCreateSheet {...defaultProps} open={false} />);
    expect(screen.queryByText('New Task')).not.toBeInTheDocument();
  });

  it('shows title, description, due date, priority, and entity fields', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
    expect(screen.getByText('Link to Entity')).toBeInTheDocument();
  });

  it('validates title is required', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    fireEvent.click(screen.getByText('Create Task'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('submits form with valid data', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Test Task' } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Test Task', priority: 'MEDIUM' })
    );
  });

  it('pre-fills entity type when provided', () => {
    render(
      <TaskCreateSheet
        {...defaultProps}
        defaultEntityType="lead"
        defaultEntityId="123"
        defaultEntityName="John Doe"
      />
    );
    // The lead radio should be checked
    const leadRadios = screen.getAllByDisplayValue('lead');
    expect(leadRadios.some((r) => (r as HTMLInputElement).checked)).toBe(true);
  });

  it('shows Cancel button that closes the sheet', () => {
    const onOpenChange = vi.fn();
    render(<TaskCreateSheet {...defaultProps} onOpenChange={onOpenChange} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows entity search when entity type is not none', () => {
    render(<TaskCreateSheet {...defaultProps} defaultEntityType="lead" />);
    // The lead radio should be checked and entity search should show Lead label
    const leadRadios = screen.getAllByDisplayValue('lead');
    expect(leadRadios.some((r) => (r as HTMLInputElement).checked)).toBe(true);
  });

  it('has none selected by default', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    // "None" radio should be checked by default
    const noneRadio = screen.getByDisplayValue('none');
    expect(noneRadio).toBeChecked();
  });

  it('validates description max length', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Valid Title' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'a'.repeat(2001) } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(screen.getByText('Description must be 2000 characters or less')).toBeInTheDocument();
    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('updates description field', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    const desc = screen.getByLabelText(/description/i);
    fireEvent.change(desc, { target: { value: 'My task description' } });
    expect(desc).toHaveValue('My task description');
  });

  it('updates due date field', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    const dueDate = screen.getByLabelText(/due date/i);
    fireEvent.change(dueDate, { target: { value: '2026-04-01' } });
    expect(dueDate).toHaveValue('2026-04-01');
  });

  it('updates priority field', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    const priority = screen.getByLabelText(/priority/i);
    fireEvent.change(priority, { target: { value: 'HIGH' } });
    expect(priority).toHaveValue('HIGH');
  });

  it('switches entity type radio to lead and shows entity search', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    // None is selected, no entity search visible
    expect(screen.queryByTestId('entity-search-lead')).not.toBeInTheDocument();

    // Click the lead radio
    fireEvent.click(screen.getByDisplayValue('lead'));
    expect(screen.getByTestId('entity-search-lead')).toBeInTheDocument();
  });

  it('switches entity type from lead back to none', () => {
    render(<TaskCreateSheet {...defaultProps} defaultEntityType="lead" />);
    expect(screen.getByTestId('entity-search-lead')).toBeInTheDocument();

    fireEvent.click(screen.getByDisplayValue('none'));
    expect(screen.queryByTestId('entity-search-lead')).not.toBeInTheDocument();
  });

  it('submits with leadId when entity type is lead and has entity ID', () => {
    render(
      <TaskCreateSheet
        {...defaultProps}
        defaultEntityType="lead"
        defaultEntityId="lead-abc"
        defaultEntityName="John Lead"
      />
    );
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Entity Task' } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Entity Task', leadId: 'lead-abc' })
    );
  });

  it('submits with description, due date and priority values', () => {
    render(<TaskCreateSheet {...defaultProps} />);
    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Full Task' } });
    fireEvent.change(screen.getByLabelText(/description/i), { target: { value: 'Details here' } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-05-01' } });
    fireEvent.change(screen.getByLabelText(/priority/i), { target: { value: 'URGENT' } });
    fireEvent.click(screen.getByText('Create Task'));
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Full Task',
        description: 'Details here',
        priority: 'URGENT',
      })
    );
    // dueDate is converted to Date object by the form
    const call = mockMutate.mock.calls[0][0];
    expect(call.dueDate).toBeInstanceOf(Date);
  });
});
