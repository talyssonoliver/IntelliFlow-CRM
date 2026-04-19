import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SLADisplay } from '../sla-display';
import type { SLAStatus } from '@intelliflow/domain';

// Mock ticket-utils
vi.mock('@/lib/tickets/ticket-utils', () => ({
  formatSLATime: (minutes: number) => {
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    const sign = minutes < 0 ? '-' : '';
    return `${sign}${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m`;
  },
  getSLAConfig: (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string; icon: string }> = {
      ON_TRACK: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-600',
        label: 'On Track',
        icon: 'schedule',
      },
      AT_RISK: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'At Risk', icon: 'timelapse' },
      BREACHED: { bg: 'bg-red-50', text: 'text-red-600', label: 'Breached', icon: 'timer_off' },
      MET: { bg: 'bg-green-50', text: 'text-green-600', label: 'Met', icon: 'check_circle' },
      PAUSED: { bg: 'bg-slate-50', text: 'text-slate-600', label: 'Paused', icon: 'pause_circle' },
    };
    return configs[status];
  },
  getStatusConfig: () => ({ bg: 'bg-blue-100', text: 'text-blue-700', label: 'Open' }),
}));

const baseProps = {
  slaStatus: 'ON_TRACK' as SLAStatus,
  slaTimeRemaining: 120, // 2 hours
  slaResponseDue: '2026-03-03T12:00:00Z',
  slaResolutionDue: '2026-03-04T12:00:00Z',
  firstResponseAt: null,
  resolvedAt: null,
  ticketStatus: 'OPEN',
};

describe('SLADisplay', () => {
  it('renders two SLA tracks: First Response and Resolution', () => {
    render(<SLADisplay {...baseProps} />);
    expect(screen.getByText('First Response')).toBeDefined();
    expect(screen.getByText('Resolution')).toBeDefined();
  });

  it('shows ON_TRACK status with correct text label', () => {
    render(<SLADisplay {...baseProps} slaStatus={'ON_TRACK' as SLAStatus} />);
    expect(screen.getAllByText('On Track').length).toBeGreaterThan(0);
  });

  it('shows AT_RISK status with correct text label', () => {
    render(<SLADisplay {...baseProps} slaStatus={'AT_RISK' as SLAStatus} />);
    expect(screen.getAllByText('At Risk').length).toBeGreaterThan(0);
  });

  it('shows BREACHED status with correct text label', () => {
    render(<SLADisplay {...baseProps} slaStatus={'BREACHED' as SLAStatus} />);
    expect(screen.getAllByText('Breached').length).toBeGreaterThan(0);
  });

  it('shows MET status with correct text label', () => {
    render(<SLADisplay {...baseProps} slaStatus={'MET' as SLAStatus} />);
    expect(screen.getAllByText('Met').length).toBeGreaterThan(0);
  });

  it('shows PAUSED status with correct text label', () => {
    render(<SLADisplay {...baseProps} slaStatus={'PAUSED' as SLAStatus} />);
    expect(screen.getAllByText('Paused').length).toBeGreaterThan(0);
  });

  it('displays time remaining in "Xh Ym" format when positive', () => {
    render(<SLADisplay {...baseProps} slaTimeRemaining={150} />);
    expect(screen.getAllByText(/02h 30m/).length).toBeGreaterThan(0);
  });

  it('displays "Overdue by Xh Ym" when time is negative', () => {
    render(
      <SLADisplay {...baseProps} slaTimeRemaining={-150} slaStatus={'BREACHED' as SLAStatus} />
    );
    expect(screen.getAllByText(/Overdue by 02h 30m/).length).toBeGreaterThan(0);
  });

  it('renders progress bar with role="progressbar"', () => {
    render(<SLADisplay {...baseProps} />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars.length).toBeGreaterThan(0);
  });

  it('progress bar has value and max attributes', () => {
    // Native <progress value max> (no aria-valuenow/valuemin/valuemax).
    render(<SLADisplay {...baseProps} />);
    const progressBars = screen.getAllByRole('progressbar');
    const bar = progressBars[0];
    expect(bar).toHaveAttribute('value');
    expect(bar).toHaveAttribute('max', '100');
  });

  it('progress bar has descriptive aria-valuetext', () => {
    render(<SLADisplay {...baseProps} />);
    const progressBars = screen.getAllByRole('progressbar');
    expect(progressBars[0].getAttribute('aria-valuetext')).toBeTruthy();
  });

  it('BREACHED status uses aria-live="assertive"', () => {
    const { container } = render(
      <SLADisplay {...baseProps} slaStatus={'BREACHED' as SLAStatus} slaTimeRemaining={-60} />
    );
    const liveRegions = container.querySelectorAll('[aria-live="assertive"]');
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  it('AT_RISK status uses aria-live="polite"', () => {
    const { container } = render(<SLADisplay {...baseProps} slaStatus={'AT_RISK' as SLAStatus} />);
    const liveRegions = container.querySelectorAll('[aria-live="polite"]');
    expect(liveRegions.length).toBeGreaterThan(0);
  });

  it('when firstResponseAt is null, response track is marked as primary', () => {
    const { container } = render(<SLADisplay {...baseProps} firstResponseAt={null} />);
    const firstResponseSection = container.querySelector('[data-track="first-response"]');
    expect(firstResponseSection?.getAttribute('data-primary')).toBe('true');
  });

  it('when firstResponseAt is set, resolution track is marked as primary', () => {
    const { container } = render(
      <SLADisplay {...baseProps} firstResponseAt="2026-03-02T10:00:00Z" />
    );
    const resolutionSection = container.querySelector('[data-track="resolution"]');
    expect(resolutionSection?.getAttribute('data-primary')).toBe('true');
  });

  it('renders policyName when provided', () => {
    render(<SLADisplay {...baseProps} policyName="Premium Support" />);
    expect(screen.getByText('Premium Support')).toBeDefined();
  });

  it('mode="inline" renders compact layout', () => {
    const { container } = render(<SLADisplay {...baseProps} mode="inline" />);
    expect(container.querySelector('[data-mode="inline"]')).toBeTruthy();
  });

  it('mode="card" renders expanded layout', () => {
    const { container } = render(<SLADisplay {...baseProps} mode="card" />);
    expect(container.querySelector('[data-mode="card"]')).toBeTruthy();
  });

  it('color is never the only means of conveying status — text label always present', () => {
    const statuses: SLAStatus[] = ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'];
    const labels = ['On Track', 'At Risk', 'Breached', 'Met', 'Paused'];

    statuses.forEach((status, idx) => {
      const { unmount } = render(<SLADisplay {...baseProps} slaStatus={status} />);
      expect(screen.getAllByText(labels[idx]).length).toBeGreaterThan(0);
      unmount();
    });
  });

  it('Material Symbols icons use aria-hidden="true" when adjacent to descriptive text', () => {
    const { container } = render(<SLADisplay {...baseProps} />);
    const icons = container.querySelectorAll('.material-symbols-outlined');
    icons.forEach((icon) => {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    });
  });
});
