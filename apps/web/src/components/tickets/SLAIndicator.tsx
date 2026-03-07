'use client';

/**
 * SLAIndicator — Unified SLA display component (PG-137)
 *
 * Combines timer, badge, and progress from lib/tickets/sla-badge.tsx
 * with client-side countdown from server timestamps.
 *
 * @implements AC-4 (SLA badges use library components)
 * @implements AC-5 (SLA timers count down client-side)
 */

import { useState, useEffect, useCallback } from 'react';
import type { TicketStatus, SLAStatus } from '@intelliflow/domain';
import { formatSLATime, getSLAConfig } from '@/lib/tickets/ticket-utils';

type DateStringNull = Date | string | null;
type SizeVariant = 'sm' | 'md' | 'lg';

interface SLAIndicatorProps {
  slaStatus: SLAStatus;
  slaTimeRemaining: number; // minutes
  slaResponseDue?: DateStringNull;
  slaResolutionDue?: DateStringNull;
  firstResponseAt?: DateStringNull;
  resolvedAt?: DateStringNull;
  ticketStatus?: TicketStatus;
  size?: SizeVariant;
  showTimer?: boolean;
  showProgress?: boolean;
}

export function SLAIndicator({
  slaStatus,
  slaTimeRemaining,
  ticketStatus,
  size = 'md',
  showTimer = true,
  showProgress = false,
}: Readonly<SLAIndicatorProps>) {
  const [remaining, setRemaining] = useState(slaTimeRemaining);
  const [currentStatus, setCurrentStatus] = useState<SLAStatus>(slaStatus);

  // Recalculate when props change (e.g., after mutation + invalidation)
  useEffect(() => {
    setRemaining(slaTimeRemaining);
    setCurrentStatus(slaStatus);
  }, [slaTimeRemaining, slaStatus]);

  const updateTimer = useCallback(() => {
    setRemaining((prev) => {
      const newVal = prev - 1;
      // Transition from ON_TRACK to AT_RISK at 30 minutes
      if (newVal <= 30 && newVal > 0 && currentStatus === 'ON_TRACK') {
        setCurrentStatus('AT_RISK');
      }
      // Transition to BREACHED
      if (
        newVal <= 0 &&
        currentStatus !== 'BREACHED' &&
        currentStatus !== 'MET' &&
        currentStatus !== 'PAUSED'
      ) {
        setCurrentStatus('BREACHED');
      }
      return newVal;
    });
  }, [currentStatus]);

  // Client-side countdown: update every 60 seconds
  useEffect(() => {
    // Don't count down for terminal states
    if (currentStatus === 'MET' || currentStatus === 'PAUSED') return;
    // Don't count down for resolved/closed tickets
    if (ticketStatus === 'RESOLVED' || ticketStatus === 'CLOSED') return;

    const interval = setInterval(updateTimer, 60 * 1000);
    return () => clearInterval(interval);
  }, [currentStatus, ticketStatus, updateTimer]);

  // Refresh on tab refocus to prevent drift
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Re-sync from props on tab refocus
        setRemaining(slaTimeRemaining);
        setCurrentStatus(slaStatus);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [slaTimeRemaining, slaStatus]);

  const config = getSLAConfig(currentStatus);
  const isBreachedOrAtRisk = currentStatus === 'BREACHED' || currentStatus === 'AT_RISK';

  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5 gap-1',
    md: 'text-sm px-2 py-1 gap-1.5',
    lg: 'text-base px-3 py-1.5 gap-2',
  };

  const iconSizes = {
    sm: 'text-[14px]',
    md: 'text-[16px]',
    lg: 'text-[20px]',
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Timer Badge */}
      {showTimer && (
        <div
          className={`inline-flex items-center font-mono font-bold rounded w-fit ${sizeClasses[size]} ${config.bg} ${config.text} ${
            isBreachedOrAtRisk ? 'animate-pulse' : ''
          }`}
          role="status" // NOSONAR typescript:S6819 — SLA timer badge; <output> is for form computation results, not status indicators
          aria-label={`SLA ${config.label}: ${formatSLATime(remaining)} remaining`}
        >
          <span className={`material-symbols-outlined ${iconSizes[size]}`}>{config.icon}</span>
          {formatSLATime(remaining)}
        </div>
      )}

      {/* Status Badge (no timer) */}
      {!showTimer && (
        <span
          className={`inline-flex items-center rounded text-xs font-bold px-2 py-0.5 w-fit ${config.bg} ${config.text}`}
          role="status" // NOSONAR typescript:S6819 — SLA status badge; <output> is for form computation results, not status indicators
          aria-label={`SLA status: ${config.label}`}
        >
          {config.label}
        </span>
      )}

      {/* Progress Bar */}
      {showProgress && (
        <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${(() => {
              if (currentStatus === 'BREACHED') return 'bg-red-500';
              if (currentStatus === 'AT_RISK') return 'bg-yellow-500';
              if (currentStatus === 'MET') return 'bg-green-500';
              if (currentStatus === 'PAUSED') return 'bg-slate-400';
              return 'bg-emerald-500';
            })()}`}
            style={{
              width: `${Math.max(0, Math.min(100, (remaining / Math.max(remaining, 1)) * 100))}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
