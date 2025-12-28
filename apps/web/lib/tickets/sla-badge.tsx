'use client';

/**
 * SLA Badge Component - IFC-093
 *
 * Displays SLA status with color-coded badges based on breach status:
 * - Green (On Track): Plenty of time remaining
 * - Yellow (At Risk): Approaching SLA breach threshold
 * - Red (Breached): SLA has been violated
 *
 * @implements FLOW-011 (Ticket creation flow)
 * @implements FLOW-013 (SLA management flow)
 */

import { useEffect, useState } from 'react';
import { SLAStatus, SLATimerResult, slaTrackingService, SLAPolicy, TicketStatus } from './sla-service';

interface SLABadgeProps {
  dueTime: Date;
  policy: SLAPolicy;
  ticketStatus: TicketStatus;
  showTimer?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * SLA Timer Badge - Shows remaining time with status-based colors
 */
export function SLATimerBadge({
  dueTime,
  policy,
  ticketStatus,
  showTimer = true,
  size = 'md',
  className = '',
}: SLABadgeProps) {
  const [timerResult, setTimerResult] = useState<SLATimerResult>(() =>
    slaTrackingService.calculateSLATimer(dueTime, policy, ticketStatus)
  );

  // Update timer every 30 seconds for real-time display
  useEffect(() => {
    const updateTimer = () => {
      setTimerResult(slaTrackingService.calculateSLATimer(dueTime, policy, ticketStatus));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30 * 1000);
    return () => clearInterval(interval);
  }, [dueTime, policy, ticketStatus]);

  const colors = slaTrackingService.getSLABadgeColor(timerResult.status);
  const icon = slaTrackingService.getSLATimerIcon(timerResult.status);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const iconSizes = {
    sm: '14px',
    md: '16px',
    lg: '18px',
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 font-mono font-bold rounded w-fit border
        ${colors.bg} ${colors.text} ${colors.border}
        ${colors.darkBg} ${colors.darkText} ${colors.darkBorder}
        ${sizeClasses[size]} ${className}`}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: iconSizes[size] }}
      >
        {icon}
      </span>
      {showTimer && <span>{timerResult.remainingFormatted}</span>}
    </div>
  );
}

interface SLAStatusBadgeProps {
  status: SLAStatus;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * SLA Status Badge - Shows status label with color
 */
export function SLAStatusBadge({
  status,
  size = 'md',
  className = '',
}: SLAStatusBadgeProps) {
  const colors = slaTrackingService.getSLABadgeColor(status);

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  const labels: Record<SLAStatus, string> = {
    ON_TRACK: 'On Track',
    AT_RISK: 'At Risk',
    BREACHED: 'Breached',
    PAUSED: 'Paused',
    MET: 'SLA Met',
  };

  return (
    <span
      className={`inline-flex items-center rounded-full font-bold border
        ${colors.bg} ${colors.text} ${colors.border}
        ${colors.darkBg} ${colors.darkText} ${colors.darkBorder}
        ${sizeClasses[size]} ${className}`}
    >
      {labels[status]}
    </span>
  );
}

interface SLAProgressBarProps {
  timerResult: SLATimerResult;
  height?: 'xs' | 'sm' | 'md';
  showLabel?: boolean;
  className?: string;
}

/**
 * SLA Progress Bar - Visual representation of SLA time remaining
 */
export function SLAProgressBar({
  timerResult,
  height = 'sm',
  showLabel = false,
  className = '',
}: SLAProgressBarProps) {
  const colors = slaTrackingService.getSLABadgeColor(timerResult.status);
  const progressPercent = Math.max(0, Math.min(100, timerResult.percentRemaining));

  const heightClasses = {
    xs: 'h-1',
    sm: 'h-2',
    md: 'h-3',
  };

  // Determine progress bar color based on status
  const progressColors: Record<SLAStatus, string> = {
    ON_TRACK: 'bg-emerald-500',
    AT_RISK: 'bg-yellow-500',
    BREACHED: 'bg-red-500',
    PAUSED: 'bg-slate-400',
    MET: 'bg-blue-500',
  };

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between text-xs mb-1">
          <span className={`font-medium ${colors.text} ${colors.darkText}`}>
            {timerResult.remainingFormatted}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {timerResult.percentRemaining.toFixed(0)}%
          </span>
        </div>
      )}
      <div className={`w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden ${heightClasses[height]}`}>
        <div
          className={`${progressColors[timerResult.status]} ${heightClasses[height]} transition-all duration-500 ease-out`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
    </div>
  );
}

interface SLAIndicatorDotProps {
  status: SLAStatus;
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
  className?: string;
}

/**
 * SLA Indicator Dot - Simple colored dot indicator for SLA status
 */
export function SLAIndicatorDot({
  status,
  size = 'md',
  pulse = true,
  className = '',
}: SLAIndicatorDotProps) {
  const dotColors: Record<SLAStatus, string> = {
    ON_TRACK: 'bg-emerald-500',
    AT_RISK: 'bg-yellow-500',
    BREACHED: 'bg-red-500',
    PAUSED: 'bg-slate-400',
    MET: 'bg-blue-500',
  };

  const sizeClasses = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-3 h-3',
  };

  const shouldPulse = pulse && (status === 'AT_RISK' || status === 'BREACHED');

  return (
    <span className={`relative inline-flex ${className}`}>
      <span className={`rounded-full ${dotColors[status]} ${sizeClasses[size]}`} />
      {shouldPulse && (
        <span
          className={`absolute inset-0 rounded-full ${dotColors[status]} animate-ping opacity-75`}
        />
      )}
    </span>
  );
}

interface SLAQuickViewProps {
  dueTime: Date;
  policy: SLAPolicy;
  ticketStatus: TicketStatus;
  ticketNumber: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  className?: string;
}

/**
 * SLA Quick View - Compact summary card for SLA status
 */
export function SLAQuickView({
  dueTime,
  policy,
  ticketStatus,
  ticketNumber,
  priority,
  className = '',
}: SLAQuickViewProps) {
  const [timerResult, setTimerResult] = useState<SLATimerResult>(() =>
    slaTrackingService.calculateSLATimer(dueTime, policy, ticketStatus)
  );

  useEffect(() => {
    const updateTimer = () => {
      setTimerResult(slaTrackingService.calculateSLATimer(dueTime, policy, ticketStatus));
    };

    updateTimer();
    const interval = setInterval(updateTimer, 30 * 1000);
    return () => clearInterval(interval);
  }, [dueTime, policy, ticketStatus]);

  const colors = slaTrackingService.getSLABadgeColor(timerResult.status);
  const priorityColors = {
    CRITICAL: 'text-red-600 dark:text-red-400',
    HIGH: 'text-orange-600 dark:text-orange-400',
    MEDIUM: 'text-slate-600 dark:text-slate-400',
    LOW: 'text-slate-500 dark:text-slate-500',
  };

  return (
    <div
      className={`p-3 rounded-lg border ${colors.bg} ${colors.border} ${colors.darkBg} ${colors.darkBorder} ${className}`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-primary">{ticketNumber}</span>
        <SLAIndicatorDot status={timerResult.status} />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <SLATimerBadge
          dueTime={dueTime}
          policy={policy}
          ticketStatus={ticketStatus}
          size="sm"
        />
        <span className={`text-xs font-semibold uppercase ${priorityColors[priority]}`}>
          {priority}
        </span>
      </div>
      <SLAProgressBar timerResult={timerResult} height="xs" />
    </div>
  );
}
