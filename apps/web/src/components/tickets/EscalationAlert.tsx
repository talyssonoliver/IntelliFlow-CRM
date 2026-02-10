'use client';

/**
 * EscalationAlert — SLA breach/at-risk alert banner (PG-137)
 *
 * @implements AC-9 (Escalation alert banner for BREACHED tickets)
 */

import { useState } from 'react';
import type { SLAStatus, TicketPriority } from '@intelliflow/domain';
import { getSLAConfig } from '@/lib/tickets/ticket-utils';

interface EscalationAlertProps {
  slaStatus: SLAStatus;
  breachedMetric: 'response' | 'resolution';
  breachedDuration: string;
  ticketPriority: TicketPriority;
  onEscalate?: () => void;
  onDismiss?: () => void;
}

export function EscalationAlert({
  slaStatus,
  breachedMetric,
  breachedDuration,
  ticketPriority,
  onEscalate,
  onDismiss,
}: EscalationAlertProps) {
  const [dismissed, setDismissed] = useState(false);

  // Only show for BREACHED or AT_RISK
  if (slaStatus !== 'BREACHED' && slaStatus !== 'AT_RISK') return null;
  if (dismissed) return null;

  const config = getSLAConfig(slaStatus);
  const isBreached = slaStatus === 'BREACHED';

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex items-center gap-3 p-4 rounded-lg border ${config.bg} ${config.border}`}
    >
      <span className={`material-symbols-outlined text-2xl ${config.text}`}>
        {isBreached ? 'timer_off' : 'timelapse'}
      </span>
      <div className="flex-1">
        <p className={`font-bold ${config.text}`}>
          {isBreached ? 'SLA Breached' : 'SLA At Risk'}
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {isBreached
            ? `${breachedMetric === 'response' ? 'Response' : 'Resolution'} time exceeded by ${breachedDuration}. Immediate action required.`
            : `${breachedMetric === 'response' ? 'Response' : 'Resolution'} SLA approaching breach. ${breachedDuration} remaining.`}
          {ticketPriority === 'CRITICAL' && ' This is a CRITICAL priority ticket.'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <div className={`font-mono text-xl font-bold ${config.text}`}>
          {isBreached ? `-${breachedDuration}` : breachedDuration}
        </div>
        {onEscalate && (
          <button
            onClick={onEscalate}
            className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
            aria-label="Escalate ticket"
          >
            Escalate
          </button>
        )}
        <button
          onClick={handleDismiss}
          className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          aria-label="Dismiss alert"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    </div>
  );
}
