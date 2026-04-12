/**
 * EscalationAlert Component Tests (PG-137)
 *
 * Tests for SLA breach escalation alert banner.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EscalationAlert } from '../EscalationAlert';

describe('EscalationAlert', () => {
  it('renders alert banner for BREACHED status', () => {
    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="resolution"
        breachedDuration="02h 14m"
        ticketPriority="HIGH"
        onEscalate={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/SLA Breached/i)).toBeInTheDocument();
  });

  it('renders warning banner for AT_RISK status', () => {
    render(
      <EscalationAlert
        slaStatus="AT_RISK"
        breachedMetric="resolution"
        breachedDuration="00h 20m"
        ticketPriority="MEDIUM"
        onEscalate={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toBeInTheDocument();
    expect(screen.getByText(/SLA At Risk/i)).toBeInTheDocument();
  });

  it('does not render for ON_TRACK status', () => {
    render(
      <EscalationAlert
        slaStatus="ON_TRACK"
        breachedMetric="resolution"
        breachedDuration="02h 00m"
        ticketPriority="LOW"
        onEscalate={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('does not render for MET status', () => {
    render(
      <EscalationAlert
        slaStatus="MET"
        breachedMetric="resolution"
        breachedDuration="00h 00m"
        ticketPriority="LOW"
        onEscalate={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('calls onEscalate when escalate button clicked', () => {
    const onEscalate = vi.fn();

    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="resolution"
        breachedDuration="02h 14m"
        ticketPriority="CRITICAL"
        onEscalate={onEscalate}
      />
    );

    const escalateButton = screen.getByRole('button', { name: /escalate ticket/i });
    fireEvent.click(escalateButton);

    expect(onEscalate).toHaveBeenCalledTimes(1);
  });

  it('dismisses when dismiss button clicked', () => {
    const onDismiss = vi.fn();

    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="resolution"
        breachedDuration="02h 14m"
        ticketPriority="HIGH"
        onEscalate={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const dismissButton = screen.getByRole('button', { name: /dismiss alert/i });
    fireEvent.click(dismissButton);

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('has alert role and aria-live', () => {
    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="resolution"
        breachedDuration="02h 14m"
        ticketPriority="HIGH"
        onEscalate={vi.fn()}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('aria-live', 'assertive');
  });

  it('does not render for PAUSED status', () => {
    render(
      <EscalationAlert
        slaStatus="PAUSED"
        breachedMetric="resolution"
        breachedDuration="01h 00m"
        ticketPriority="MEDIUM"
        onEscalate={vi.fn()}
      />
    );

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows breached metric in message', () => {
    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="response"
        breachedDuration="01h 30m"
        ticketPriority="HIGH"
        onEscalate={vi.fn()}
      />
    );

    expect(screen.getByText(/Response time exceeded/i)).toBeInTheDocument();
  });

  it('mentions CRITICAL priority in message', () => {
    render(
      <EscalationAlert
        slaStatus="BREACHED"
        breachedMetric="resolution"
        breachedDuration="02h 00m"
        ticketPriority="CRITICAL"
        onEscalate={vi.fn()}
      />
    );

    expect(screen.getByText(/CRITICAL priority ticket/i)).toBeInTheDocument();
  });
});
