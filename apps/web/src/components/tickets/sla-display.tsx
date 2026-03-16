'use client';

/**
 * SLADisplay — Dual-track SLA metrics display (PG-046)
 *
 * Shows First Response and Resolution SLA tracks with progress bars,
 * status badges, and overdue formatting. WCAG 2.1 AA compliant.
 *
 * Runtime wiring: Unit-tested in this task. Consumed by PG-048 (/support/tickets/[id]/page.tsx).
 * The list view (TicketList) internally uses SLAIndicator for compact table cells.
 */

import type { SLAStatus } from '@intelliflow/domain';
import { formatSLATime, getSLAConfig } from '@/lib/tickets/ticket-utils';
import { useTimezoneContext } from '@/providers/TimezoneProvider';

interface SLADisplayProps {
  slaStatus: SLAStatus;
  slaTimeRemaining: number; // minutes (negative = overdue)
  slaResponseDue?: string | null;
  slaResolutionDue?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  ticketStatus: string;
  policyName?: string;
  size?: 'sm' | 'md' | 'lg';
  mode?: 'inline' | 'card';
}

/**
 * Formats overdue SLA time as "Overdue by Xh Ym" instead of "-Xh Ym".
 * Required by AC-005 / spec:87.
 */
function formatOverdueSLA(minutes: number): string {
  if (minutes < 0) {
    return `Overdue by ${formatSLATime(Math.abs(minutes))}`;
  }
  return formatSLATime(minutes);
}

function getAriaLive(status: Readonly<SLAStatus>): 'assertive' | 'polite' | 'off' {
  if (status === 'BREACHED') return 'assertive';
  if (status === 'AT_RISK') return 'polite';
  return 'off';
}

interface SLATrackProps {
  label: string;
  trackId: 'first-response' | 'resolution';
  isPrimary: boolean;
  slaStatus: SLAStatus;
  timeRemaining: number;
  targetDue?: string | null;
}

function SLATrack({
  label,
  trackId,
  isPrimary,
  slaStatus,
  timeRemaining,
  targetDue,
}: Readonly<SLATrackProps>) {
  const { timezone } = useTimezoneContext();
  const config = getSLAConfig(slaStatus);
  const ariaLive = getAriaLive(slaStatus);
  const timeText = formatOverdueSLA(timeRemaining);
  // Simple progress: 0 when fully remaining, 100 when breached
  const progressPct =
    timeRemaining < 0
      ? 100
      : Math.min(
          100,
          Math.max(0, 100 - Math.round((timeRemaining / Math.max(timeRemaining + 60, 1)) * 100))
        );

  return (
    <div
      data-track={trackId}
      data-primary={String(isPrimary)}
      className={`flex flex-col gap-1.5 ${isPrimary ? 'opacity-100' : 'opacity-70'}`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text}`}
          aria-live={ariaLive === 'off' ? undefined : ariaLive}
        >
          <span className="material-symbols-outlined text-sm" aria-hidden="true">
            {config.icon}
          </span>
          {config.label}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <div
          role="progressbar" // NOSONAR typescript:S6819 — custom styled progress bar with overflow:hidden child; <progress> cannot contain child elements
          aria-valuenow={progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuetext={`${label} SLA: ${config.label}, ${timeText}`}
          className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"
        >
          <div
            className={`h-full rounded-full transition-all ${(() => {
              if (slaStatus === 'BREACHED') return 'bg-red-500';
              if (slaStatus === 'AT_RISK') return 'bg-yellow-500';
              if (slaStatus === 'MET') return 'bg-green-500';
              if (slaStatus === 'PAUSED') return 'bg-slate-400';
              return 'bg-emerald-500';
            })()}`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
          {timeText}
        </span>
      </div>

      {targetDue && (
        <span className="text-[10px] text-muted-foreground">
          Target: {new Date(targetDue).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: timezone })}
        </span>
      )}
    </div>
  );
}

export function SLADisplay({
  slaStatus,
  slaTimeRemaining,
  slaResponseDue,
  slaResolutionDue,
  firstResponseAt,
  ticketStatus: _ticketStatus,
  policyName,
  mode = 'card',
}: Readonly<SLADisplayProps>) {
  // Derive which track is primary: if firstResponseAt is null, response track is primary
  const isResponsePrimary = !firstResponseAt;

  return (
    <div
      data-mode={mode}
      className={mode === 'inline' ? 'flex gap-4 items-center' : 'flex flex-col gap-3'}
    >
      {policyName && (
        <span className="text-xs font-medium text-muted-foreground">{policyName}</span>
      )}

      <SLATrack
        label="First Response"
        trackId="first-response"
        isPrimary={isResponsePrimary}
        slaStatus={slaStatus}
        timeRemaining={slaTimeRemaining}
        targetDue={slaResponseDue}
      />

      <SLATrack
        label="Resolution"
        trackId="resolution"
        isPrimary={!isResponsePrimary}
        slaStatus={slaStatus}
        timeRemaining={slaTimeRemaining}
        targetDue={slaResolutionDue}
      />
    </div>
  );
}
