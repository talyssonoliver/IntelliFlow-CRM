/**
 * SLAIndicator Component Tests (PG-137)
 *
 * Tests for SLA indicator component with countdown timer and status badges.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { SLAIndicator } from '../SLAIndicator';
// Test utils available if needed
// import { createMockTicket } from './ticket-test-utils';

describe('SLAIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders timer with remaining time for ON_TRACK ticket', () => {
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} />);

    expect(screen.getByText(/02h 00m/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SLA On Track: 02h 00m remaining/i)).toBeInTheDocument();
  });

  it('renders BREACHED status with negative time', () => {
    render(<SLAIndicator slaStatus="BREACHED" slaTimeRemaining={-134} />);

    expect(screen.getByText(/-02h 14m/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SLA Breached: -02h 14m remaining/i)).toBeInTheDocument();
  });

  it('renders PAUSED state', () => {
    render(<SLAIndicator slaStatus="PAUSED" slaTimeRemaining={60} />);

    expect(screen.getByText(/01h 00m/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SLA Paused: 01h 00m remaining/i)).toBeInTheDocument();
  });

  it('renders MET state', () => {
    render(<SLAIndicator slaStatus="MET" slaTimeRemaining={0} />);

    expect(screen.getByText(/00h 00m/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/SLA Met: 00h 00m remaining/i)).toBeInTheDocument();
  });

  it('updates countdown every 60 seconds', () => {
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} />);

    // Initial render
    expect(screen.getByText(/02h 00m/i)).toBeInTheDocument();

    // Advance timer by 60 seconds (1 minute)
    act(() => {
      vi.advanceTimersByTime(60000);
    });

    // Should show updated time (01h 59m)
    expect(screen.getByText(/01h 59m/i)).toBeInTheDocument();
  });

  it('transitions from ON_TRACK to AT_RISK at 30 minutes', () => {
    const { rerender } = render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={31} />);

    expect(screen.getByLabelText(/SLA On Track/i)).toBeInTheDocument();

    // Update to 29 minutes (below threshold)
    rerender(<SLAIndicator slaStatus="AT_RISK" slaTimeRemaining={29} />);

    expect(screen.getByLabelText(/SLA At Risk/i)).toBeInTheDocument();
  });

  it('shows emerald color for ON_TRACK', () => {
    const { container } = render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} />);

    const badge = container.querySelector('[class*="bg-emerald"]');
    expect(badge).toBeInTheDocument();
  });

  it('shows red color and pulse animation for BREACHED', () => {
    const { container } = render(<SLAIndicator slaStatus="BREACHED" slaTimeRemaining={-60} />);

    const badge = container.querySelector('[class*="bg-red"]');
    expect(badge).toBeInTheDocument();

    const pulseElement = container.querySelector('[class*="animate-pulse"]');
    expect(pulseElement).toBeInTheDocument();
  });

  it('shows yellow color for AT_RISK', () => {
    const { container } = render(<SLAIndicator slaStatus="AT_RISK" slaTimeRemaining={25} />);

    const badge = container.querySelector('[class*="bg-yellow"]');
    expect(badge).toBeInTheDocument();
  });

  it('has aria-label describing SLA status with timer', () => {
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} />);

    const indicator = screen.getByLabelText(/SLA On Track: 02h 00m remaining/i);
    expect(indicator).toBeInTheDocument();
  });

  it('has aria-label without timer when showTimer is false', () => {
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} showTimer={false} />);

    const indicator = screen.getByLabelText(/SLA status: On Track/i);
    expect(indicator).toBeInTheDocument();
  });

  it('transitions ON_TRACK to AT_RISK via timer countdown at 30 minutes', () => {
    // Start at 31 minutes, advance by 1 tick (60s) to hit 30 min threshold
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={31} />);

    expect(screen.getByLabelText(/SLA On Track/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60000); // 1 minute tick
    });

    // Should transition to AT_RISK at exactly 30 minutes
    expect(screen.getByLabelText(/SLA At Risk/i)).toBeInTheDocument();
  });

  it('transitions AT_RISK to BREACHED via timer countdown at 0', () => {
    // Start AT_RISK at 1 minute remaining
    render(<SLAIndicator slaStatus="AT_RISK" slaTimeRemaining={1} />);

    expect(screen.getByLabelText(/SLA At Risk/i)).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(60000); // 1 minute tick - remaining goes to 0
    });

    expect(screen.getByLabelText(/SLA Breached/i)).toBeInTheDocument();
  });

  it('handles visibility change to re-sync timer', () => {
    render(<SLAIndicator slaStatus="ON_TRACK" slaTimeRemaining={120} />);

    // Simulate tab becoming hidden then visible
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', writable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    // Should re-sync from props (still 120 min)
    expect(screen.getByText(/02h 00m/i)).toBeInTheDocument();
  });
});
