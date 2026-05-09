/**
 * StatusUpdater Component Tests (PG-048)
 *
 * Tests FSM-driven status transition component for support agent context.
 * ARCHIVED is excluded from all transition options.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StatusUpdater } from '../status-updater';

describe('StatusUpdater', () => {
  const mockOnStatusChange = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Status Display ───────────────────────────────────────────────────────

  it('displays current OPEN status with correct badge', () => {
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
  });

  it('displays IN_PROGRESS status correctly', () => {
    render(<StatusUpdater currentStatus="IN_PROGRESS" onStatusChange={mockOnStatusChange} />);
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
  });

  it('displays RESOLVED status correctly', () => {
    render(<StatusUpdater currentStatus="RESOLVED" onStatusChange={mockOnStatusChange} />);
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
  });

  // ─── Disabled States ──────────────────────────────────────────────────────

  it('disables interaction when CLOSED (no valid support transitions)', async () => {
    render(<StatusUpdater currentStatus="CLOSED" onStatusChange={mockOnStatusChange} />);
    const trigger = screen.getByRole('button', { name: /change status/i });
    expect(trigger).toBeDisabled();
  });

  it('disables interaction when ARCHIVED (terminal state)', () => {
    render(<StatusUpdater currentStatus="ARCHIVED" onStatusChange={mockOnStatusChange} />);
    const trigger = screen.getByRole('button', { name: /change status/i });
    expect(trigger).toBeDisabled();
  });

  // ─── Transition Options ───────────────────────────────────────────────────

  it('shows 5 valid targets for OPEN status', async () => {
    const user = userEvent.setup();
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);

    await user.click(screen.getByRole('button', { name: /change status/i }));

    const options = screen.getAllByRole('menuitem');
    expect(options).toHaveLength(5);
    expect(screen.getByText('IN_PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('WAITING_ON_CUSTOMER')).toBeInTheDocument();
    expect(screen.getByText('WAITING_ON_THIRD_PARTY')).toBeInTheDocument();
    expect(screen.getByText('RESOLVED')).toBeInTheDocument();
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
  });

  it('does NOT show ARCHIVED as transition option for OPEN', async () => {
    const user = userEvent.setup();
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);

    await user.click(screen.getByRole('button', { name: /change status/i }));

    const menu = screen.getByRole('menu');
    expect(within(menu).queryByText('ARCHIVED')).not.toBeInTheDocument();
  });

  it('shows 2 targets for RESOLVED status (OPEN and CLOSED, no ARCHIVED)', async () => {
    const user = userEvent.setup();
    render(<StatusUpdater currentStatus="RESOLVED" onStatusChange={mockOnStatusChange} />);

    await user.click(screen.getByRole('button', { name: /change status/i }));

    const options = screen.getAllByRole('menuitem');
    expect(options).toHaveLength(2);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
  });

  // ─── Interaction ──────────────────────────────────────────────────────────

  it('calls onStatusChange when selecting IN_PROGRESS', async () => {
    const user = userEvent.setup();
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);

    await user.click(screen.getByRole('button', { name: /change status/i }));
    await user.click(screen.getByRole('menuitem', { name: /IN_PROGRESS/i }));

    expect(mockOnStatusChange).toHaveBeenCalledWith('IN_PROGRESS');
  });

  it('disables interaction when isLoading is true', () => {
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} isLoading />);
    const trigger = screen.getByRole('button', { name: /change status/i });
    expect(trigger).toBeDisabled();
  });

  it('disables interaction when disabled prop is true', () => {
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} disabled />);
    const trigger = screen.getByRole('button', { name: /change status/i });
    expect(trigger).toBeDisabled();
  });

  it('uses getStatusConfig colors for status badge', () => {
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);
    // OPEN status has blue-100 bg per getStatusConfig
    const badge = screen.getByText('OPEN');
    expect(badge.className).toMatch(/blue/);
  });

  // ─── Accessibility ────────────────────────────────────────────────────────

  it('has aria-label="Change status" on trigger button (NF-004)', () => {
    render(<StatusUpdater currentStatus="OPEN" onStatusChange={mockOnStatusChange} />);
    expect(screen.getByRole('button', { name: /change status/i })).toBeInTheDocument();
  });
});
