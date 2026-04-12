import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConflictWarning } from '../ConflictWarning';
import { mockConflict1, mockConflict2, mockConflict3 } from '@/test/fixtures/appointment-data';

describe('ConflictWarning', () => {
  it('renders nothing when no conflicts', () => {
    const { container } = render(<ConflictWarning conflicts={[]} onViewConflict={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders conflict alert with role="alert"', () => {
    render(<ConflictWarning conflicts={[mockConflict1]} onViewConflict={vi.fn()} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('displays conflict count', () => {
    render(<ConflictWarning conflicts={[mockConflict1, mockConflict2]} onViewConflict={vi.fn()} />);
    expect(screen.getByText(/2/)).toBeInTheDocument();
  });

  it('displays conflict titles', () => {
    render(<ConflictWarning conflicts={[mockConflict1, mockConflict2]} onViewConflict={vi.fn()} />);
    expect(screen.getByText(/Team Standup/)).toBeInTheDocument();
    expect(screen.getByText(/Client Call/)).toBeInTheDocument();
  });

  it('displays conflict type labels', () => {
    render(
      <ConflictWarning
        conflicts={[mockConflict1, mockConflict2, mockConflict3]}
        onViewConflict={vi.fn()}
      />
    );
    expect(screen.getByText(/Exact/i)).toBeInTheDocument();
    expect(screen.getByText(/Partial/i)).toBeInTheDocument();
    expect(screen.getByText(/Buffer/i)).toBeInTheDocument();
  });

  it('calls onViewConflict when view link clicked', () => {
    const onView = vi.fn();
    render(<ConflictWarning conflicts={[mockConflict1]} onViewConflict={onView} />);
    const viewLinks = screen.getAllByRole('button', { name: /view/i });
    fireEvent.click(viewLinks[0]);
    expect(onView).toHaveBeenCalledWith('conflict-1');
  });

  it('renders override checkbox when onOverride provided', () => {
    const onOverride = vi.fn();
    render(
      <ConflictWarning
        conflicts={[mockConflict1]}
        onViewConflict={vi.fn()}
        onOverride={onOverride}
      />
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(onOverride).toHaveBeenCalled();
  });

  it('does not render override checkbox when onOverride not provided', () => {
    render(<ConflictWarning conflicts={[mockConflict1]} onViewConflict={vi.fn()} />);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('shows overlap minutes', () => {
    render(<ConflictWarning conflicts={[mockConflict1]} onViewConflict={vi.fn()} />);
    expect(screen.getByText(/30/)).toBeInTheDocument();
  });
});
