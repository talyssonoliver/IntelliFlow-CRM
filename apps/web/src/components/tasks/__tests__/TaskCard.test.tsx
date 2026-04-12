/**
 * TaskCard Component Tests (PG-136)
 *
 * Tests for compact task card with priority, status, due date, and entity links.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TaskCard } from '../TaskCard';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className, onClick, role, ...props }: any) => (
    <div
      className={className}
      onClick={onClick}
      role={role ?? 'button'}
      tabIndex={0}
      onKeyDown={vi.fn()}
      {...props}
    >
      {children}
    </div>
  ),
}));

const baseMockTask = {
  id: 'task-1',
  title: 'Follow up with client',
  description: 'Send the proposal document',
  dueDate: '2026-03-15T00:00:00.000Z',
  priority: 'HIGH' as const,
  status: 'IN_PROGRESS' as const,
  lead: null,
  contact: null,
  opportunity: null,
};

describe('TaskCard', () => {
  const onClick = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders task title and description', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    expect(screen.getByText('Follow up with client')).toBeInTheDocument();
    expect(screen.getByText('Send the proposal document')).toBeInTheDocument();
  });

  it('renders priority icon', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    const priorityIcon = screen.getByText('flag');
    expect(priorityIcon).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    expect(screen.getByText('IN PROGRESS')).toBeInTheDocument();
  });

  it('renders due date', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    expect(screen.getByText(/Due:/)).toBeInTheDocument();
  });

  it('hides due date when null', () => {
    const taskNoDue = { ...baseMockTask, dueDate: null };
    render(<TaskCard task={taskNoDue} onClick={onClick} />);

    expect(screen.queryByText(/Due:/)).not.toBeInTheDocument();
  });

  it('renders entity link for lead', () => {
    const taskWithLead = {
      ...baseMockTask,
      lead: { id: 'lead-1', firstName: 'John', lastName: 'Doe' },
    };
    render(<TaskCard task={taskWithLead} onClick={onClick} />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('renders entity link for contact', () => {
    const taskWithContact = {
      ...baseMockTask,
      contact: { id: 'contact-1', firstName: 'Jane', lastName: 'Smith' },
    };
    render(<TaskCard task={taskWithContact} onClick={onClick} />);

    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });

  it('renders entity link for opportunity', () => {
    const taskWithOpp = {
      ...baseMockTask,
      opportunity: { id: 'opp-1', name: 'Enterprise Deal' },
    };
    render(<TaskCard task={taskWithOpp} onClick={onClick} />);

    expect(screen.getByText('Enterprise Deal')).toBeInTheDocument();
  });

  it('calls onClick when card is clicked', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    const card = screen.getByRole('button');
    fireEvent.click(card);

    expect(onClick).toHaveBeenCalledWith('task-1');
  });

  it('calls onClick on Enter key', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    const card = screen.getByRole('button');
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(onClick).toHaveBeenCalledWith('task-1');
  });

  it('has accessible aria-label', () => {
    render(<TaskCard task={baseMockTask} onClick={onClick} />);

    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('aria-label', 'View task: Follow up with client');
  });

  it('renders URGENT priority with priority_high icon', () => {
    const urgentTask = { ...baseMockTask, priority: 'URGENT' as const };
    render(<TaskCard task={urgentTask} onClick={onClick} />);

    expect(screen.getByText('priority_high')).toBeInTheDocument();
  });

  it('hides description when null', () => {
    const taskNoDesc = { ...baseMockTask, description: null };
    render(<TaskCard task={taskNoDesc} onClick={onClick} />);

    expect(screen.queryByText('Send the proposal document')).not.toBeInTheDocument();
  });
});
