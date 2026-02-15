/**
 * Ticket Utility Functions (PG-137)
 *
 * Shared utility functions for ticket list and detail components.
 * Eliminates duplication between page files.
 */

import type { TicketStatus, TicketPriority, SLAStatus } from '@intelliflow/domain';

// ─── SLA Utilities ──────────────────────────────────────────────────────────

export function formatSLATime(minutes: number): string {
  const safeMinutes = Number.isFinite(minutes) ? minutes : 0;
  const absMinutes = Math.abs(safeMinutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;
  const sign = safeMinutes < 0 ? '-' : '';
  return `${sign}${hours.toString().padStart(2, '0')}h ${mins.toString().padStart(2, '0')}m`;
}

export function getSLAConfig(status: SLAStatus) {
  switch (status) {
    case 'BREACHED':
      return {
        bg: 'bg-red-50 dark:bg-red-900/20',
        text: 'text-red-600 dark:text-red-400',
        border: 'border-red-200 dark:border-red-800',
        label: 'Breached',
        icon: 'timer_off',
      };
    case 'AT_RISK':
      return {
        bg: 'bg-yellow-50 dark:bg-yellow-900/20',
        text: 'text-yellow-700 dark:text-yellow-400',
        border: 'border-yellow-200 dark:border-yellow-800',
        label: 'At Risk',
        icon: 'timelapse',
      };
    case 'ON_TRACK':
      return {
        bg: 'bg-emerald-50 dark:bg-emerald-900/20',
        text: 'text-emerald-600 dark:text-emerald-400',
        border: 'border-emerald-200 dark:border-emerald-800',
        label: 'On Track',
        icon: 'schedule',
      };
    case 'MET':
      return {
        bg: 'bg-green-50 dark:bg-green-900/20',
        text: 'text-green-600 dark:text-green-400',
        border: 'border-green-200 dark:border-green-800',
        label: 'Met',
        icon: 'check_circle',
      };
    case 'PAUSED':
      return {
        bg: 'bg-slate-50 dark:bg-slate-900/20',
        text: 'text-slate-600 dark:text-slate-400',
        border: 'border-slate-200 dark:border-slate-700',
        label: 'Paused',
        icon: 'pause_circle',
      };
  }
}

// ─── Status Utilities ───────────────────────────────────────────────────────

export function getStatusConfig(status: TicketStatus) {
  switch (status) {
    case 'OPEN':
      return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', label: 'Open' };
    case 'IN_PROGRESS':
      return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-400', label: 'In Progress' };
    case 'WAITING_ON_CUSTOMER':
      return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-400', label: 'Waiting on Customer' };
    case 'WAITING_ON_THIRD_PARTY':
      return { bg: 'bg-indigo-100 dark:bg-indigo-900/30', text: 'text-indigo-700 dark:text-indigo-400', label: 'Waiting on Third Party' };
    case 'RESOLVED':
      return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', label: 'Resolved' };
    case 'CLOSED':
      return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', label: 'Closed' };
  }
}

// ─── Priority Utilities ─────────────────────────────────────────────────────

export function getPriorityConfig(priority: TicketPriority) {
  switch (priority) {
    case 'CRITICAL':
      return { bg: 'bg-red-50 dark:bg-red-900/20', text: 'text-red-600 dark:text-red-400', icon: 'priority_high', label: 'Critical' };
    case 'HIGH':
      return { bg: 'bg-orange-50 dark:bg-orange-900/20', text: 'text-orange-600 dark:text-orange-400', icon: 'arrow_upward', label: 'High' };
    case 'MEDIUM':
      return { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-600 dark:text-slate-400', icon: 'remove', label: 'Medium' };
    case 'LOW':
      return { bg: 'bg-slate-50 dark:bg-slate-800', text: 'text-slate-500 dark:text-slate-400', icon: 'arrow_downward', label: 'Low' };
  }
}

// ─── Channel Utilities ──────────────────────────────────────────────────────

export function getChannelIcon(channel: string) {
  switch (channel) {
    case 'email': return 'mail';
    case 'phone': return 'call';
    case 'chat': return 'chat';
    case 'portal': return 'language';
    default: return 'help';
  }
}
