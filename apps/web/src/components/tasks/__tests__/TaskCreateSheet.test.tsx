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
});
