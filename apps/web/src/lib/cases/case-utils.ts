/**
 * Case utility functions — PG-138
 *
 * Status/priority label/color mappers for case management.
 * Matches the design mockup color system.
 */

export function getStatusConfig(status: string): { label: string; color: string; bgColor: string } {
  switch (status) {
    case 'OPEN':
      return { label: 'Open', color: 'text-slate-800', bgColor: 'bg-slate-100' };
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: 'text-blue-800', bgColor: 'bg-blue-100' };
    case 'ON_HOLD':
      return { label: 'On Hold', color: 'text-amber-800', bgColor: 'bg-amber-100' };
    case 'CLOSED':
      return { label: 'Closed', color: 'text-green-800', bgColor: 'bg-green-100' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'text-red-800', bgColor: 'bg-red-100' };
    default:
      return { label: status, color: 'text-gray-800', bgColor: 'bg-gray-100' };
  }
}

/** Priority config with dot color for the table view (colored dot + text) */
export function getPriorityConfig(priority: string): {
  label: string;
  color: string;
  bgColor: string;
  dotColor: string;
  textColor: string;
} {
  switch (priority) {
    case 'URGENT':
      return {
        label: 'Urgent',
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        dotColor: 'bg-red-600',
        textColor: 'text-red-600',
      };
    case 'HIGH':
      return {
        label: 'High',
        color: 'text-red-700',
        bgColor: 'bg-red-100',
        dotColor: 'bg-red-600',
        textColor: 'text-red-600',
      };
    case 'MEDIUM':
      return {
        label: 'Medium',
        color: 'text-amber-700',
        bgColor: 'bg-amber-100',
        dotColor: 'bg-amber-500',
        textColor: 'text-amber-600',
      };
    case 'LOW':
      return {
        label: 'Low',
        color: 'text-blue-700',
        bgColor: 'bg-blue-100',
        dotColor: 'bg-blue-500',
        textColor: 'text-blue-600',
      };
    default:
      return {
        label: priority,
        color: 'text-gray-700',
        bgColor: 'bg-gray-100',
        dotColor: 'bg-gray-400',
        textColor: 'text-slate-500',
      };
  }
}

export function getTaskStatusConfig(status: string): { label: string; color: string } {
  switch (status) {
    case 'PENDING':
      return { label: 'Pending', color: 'text-gray-600' };
    case 'IN_PROGRESS':
      return { label: 'In Progress', color: 'text-blue-600' };
    case 'COMPLETED':
      return { label: 'Completed', color: 'text-green-600' };
    case 'CANCELLED':
      return { label: 'Cancelled', color: 'text-red-600' };
    default:
      return { label: status, color: 'text-gray-600' };
  }
}

type DeadlineValue = Date | string | null;

export function formatDeadline(
  deadline: DeadlineValue,
  timezone: string = 'Europe/London'
): string {
  if (!deadline) return 'No deadline';
  const d = new Date(deadline);
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function formatDeadlineShort(
  deadline: DeadlineValue,
  timezone: string = 'Europe/London'
): { month: string; day: string } | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  return {
    month: d.toLocaleDateString('en-GB', { month: 'short', timeZone: timezone }).toUpperCase(),
    day: d.toLocaleDateString('en-GB', { day: 'numeric', timeZone: timezone }),
  };
}

export function isOverdue(deadline: Date | string | null, status: string): boolean {
  if (!deadline || status === 'CLOSED' || status === 'CANCELLED') return false;
  return new Date(deadline) < new Date();
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function timeAgo(date: Date | string, timezone: string = 'Europe/London'): string {
  const now = new Date();
  const d = new Date(date);
  const seconds = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return d.toLocaleDateString('en-GB', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: timezone,
  });
}
