/**
 * Shared date/time utilities for IntelliFlow CRM
 *
 * Extracted from duplicated implementations across:
 * - agent-approvals, contacts, blog pages
 *
 * @module date-utils
 * @implements IFC-181 (DRY extraction)
 */

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;

/**
 * Format a date as a human-readable relative time string.
 * e.g., "just now", "2 minutes ago", "3 hours ago", "5 days ago"
 */
export function formatTimeAgo(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffSeconds = Math.floor((now - d.getTime()) / 1000);

  if (diffSeconds < 0) return 'just now';
  if (diffSeconds < MINUTE) return 'just now';
  if (diffSeconds < 2 * MINUTE) return '1 minute ago';
  if (diffSeconds < HOUR) return `${Math.floor(diffSeconds / MINUTE)} minutes ago`;
  if (diffSeconds < 2 * HOUR) return '1 hour ago';
  if (diffSeconds < DAY) return `${Math.floor(diffSeconds / HOUR)} hours ago`;
  if (diffSeconds < 2 * DAY) return '1 day ago';
  if (diffSeconds < WEEK) return `${Math.floor(diffSeconds / DAY)} days ago`;
  if (diffSeconds < 2 * WEEK) return '1 week ago';
  if (diffSeconds < MONTH) return `${Math.floor(diffSeconds / WEEK)} weeks ago`;
  return d.toLocaleDateString();
}

/**
 * Format time remaining until a deadline as a human-readable string.
 * e.g., "2h 30m", "45m", "Expired"
 */
export function formatTimeRemaining(deadline: Date | string): string {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = Date.now();
  const diffMs = d.getTime() - now;

  if (diffMs <= 0) return 'Expired';

  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / HOUR);
  const minutes = Math.floor((totalSeconds % HOUR) / MINUTE);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return '<1m';
}

/**
 * Format SLA clock countdown with breach detection.
 * Returns a structured object with display string and breach status.
 *
 * - Positive: "05:30:00" with isBreached=false
 * - Negative: "-00:45:12" with isBreached=true
 * - Exactly now: "00:00:00" with isBreached=true
 */
export function formatSlaClock(deadline: Date | string): {
  display: string;
  isBreached: boolean;
} {
  const d = typeof deadline === 'string' ? new Date(deadline) : deadline;
  const now = Date.now();
  const diffMs = d.getTime() - now;
  const isBreached = diffMs <= 0;
  const absDiffMs = Math.abs(diffMs);

  const totalSeconds = Math.floor(absDiffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');

  const display = isBreached ? `-${hh}:${mm}:${ss}` : `${hh}:${mm}:${ss}`;

  return { display, isBreached };
}
