/**
 * Filter Utilities
 *
 * Utility functions for deriving filter options from domain constants.
 * Uses the single source of truth pattern - domain const arrays are
 * converted to UI filter options programmatically.
 */

import type { FilterOption, FilterChip } from '@/components/shared';

// =============================================================================
// Generic Converters
// =============================================================================

/**
 * Convert a domain const array to filter options
 *
 * @example
 * ```tsx
 * import { LEAD_STATUSES } from '@intelliflow/domain';
 *
 * const statusOptions = toFilterOptions(LEAD_STATUSES);
 * // [{ value: 'NEW', label: 'New' }, { value: 'CONTACTED', label: 'Contacted' }, ...]
 * ```
 */
export function toFilterOptions<T extends readonly string[]>(
  values: T,
  labelFormatter?: (value: T[number]) => string
): FilterOption[] {
  const formatter = labelFormatter ?? formatLabel;
  return values.map((value) => ({
    value,
    label: formatter(value),
  }));
}

/**
 * Convert a domain const array to filter chips with optional color mapping
 *
 * @example
 * ```tsx
 * import { SLA_STATUSES } from '@intelliflow/domain';
 *
 * const slaChips = toFilterChips(SLA_STATUSES, SLA_COLORS);
 * // [{ id: 'ON_TRACK', label: 'On Track', color: 'bg-green-500' }, ...]
 * ```
 */
export function toFilterChips<T extends readonly string[]>(
  values: T,
  colorMap?: Partial<Record<T[number], string>>,
  labelFormatter?: (value: T[number]) => string
): FilterChip[] {
  const formatter = labelFormatter ?? formatLabel;
  return values.map((value) => {
    const color = colorMap?.[value as keyof typeof colorMap];
    return {
      id: value,
      label: formatter(value),
      ...(color && { color }),
    };
  });
}

/**
 * Create filter chips with an "All" option prepended
 *
 * @example
 * ```tsx
 * const chips = toFilterChipsWithAll(SLA_STATUSES, SLA_COLORS);
 * // [{ id: 'all', label: 'All' }, { id: 'ON_TRACK', label: 'On Track', color: '...' }, ...]
 * ```
 */
export function toFilterChipsWithAll<T extends readonly string[]>(
  values: T,
  colorMap?: Partial<Record<T[number], string>>,
  labelFormatter?: (value: T[number]) => string,
  allLabel = 'All'
): FilterChip[] {
  return [
    { id: 'all', label: allLabel },
    ...toFilterChips(values, colorMap, labelFormatter),
  ];
}

// =============================================================================
// Label Formatters
// =============================================================================

/**
 * Default label formatter - converts SNAKE_CASE to Title Case
 *
 * @example
 * formatLabel('IN_PROGRESS') // 'In Progress'
 * formatLabel('NEW') // 'New'
 */
export function formatLabel(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Simple label formatter - keeps original casing
 */
export function formatLabelSimple(value: string): string {
  return value.replace(/_/g, ' ');
}

// =============================================================================
// Domain-Specific Color Mappings
// =============================================================================

// These color maps use Tailwind classes that work with our design system

/** Lead status colors */
export const LEAD_STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500',
  CONTACTED: 'bg-yellow-500',
  QUALIFIED: 'bg-green-500',
  UNQUALIFIED: 'bg-gray-500',
  NEGOTIATING: 'bg-purple-500',
  CONVERTED: 'bg-emerald-500',
  LOST: 'bg-red-500',
};

/** Lead source colors */
export const LEAD_SOURCE_COLORS: Record<string, string> = {
  WEBSITE: 'bg-indigo-500',
  REFERRAL: 'bg-purple-500',
  SOCIAL: 'bg-pink-500',
  EMAIL: 'bg-blue-500',
  COLD_CALL: 'bg-orange-500',
  EVENT: 'bg-cyan-500',
  OTHER: 'bg-gray-500',
};

/** Ticket status colors */
export const TICKET_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  PENDING: 'bg-amber-500',
  WAITING_ON_CUSTOMER: 'bg-orange-500',
  WAITING_ON_THIRD_PARTY: 'bg-purple-500',
  RESOLVED: 'bg-green-500',
  CLOSED: 'bg-gray-500',
};

/** Ticket priority colors */
export const TICKET_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-500',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-orange-500',
  CRITICAL: 'bg-red-500',
};

/** SLA status colors */
export const SLA_STATUS_COLORS: Record<string, string> = {
  ON_TRACK: 'bg-green-500',
  AT_RISK: 'bg-yellow-500',
  BREACHED: 'bg-red-500',
  MET: 'bg-emerald-500',
  PAUSED: 'bg-gray-500',
};

/** Case status colors */
export const CASE_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-blue-500',
  IN_PROGRESS: 'bg-yellow-500',
  ON_HOLD: 'bg-orange-500',
  CLOSED: 'bg-gray-500',
  CANCELLED: 'bg-red-500',
};

/** Case priority colors */
export const CASE_PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-500',
  MEDIUM: 'bg-yellow-500',
  HIGH: 'bg-orange-500',
  URGENT: 'bg-red-500',
};

// =============================================================================
// Pre-built Filter Options (convenience exports)
// =============================================================================

// These are lazily evaluated when imported to work with the domain constants

import {
  LEAD_STATUSES,
  LEAD_SOURCES,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  SLA_STATUSES,
  CASE_STATUSES,
  CASE_PRIORITIES,
} from '@intelliflow/domain';

// Lead filters
export const leadStatusOptions = () => toFilterOptions(LEAD_STATUSES);
export const leadSourceOptions = () => toFilterOptions(LEAD_SOURCES);
export const leadStatusChips = () =>
  toFilterChipsWithAll(LEAD_STATUSES, LEAD_STATUS_COLORS);
export const leadSourceChips = () =>
  toFilterChipsWithAll(LEAD_SOURCES, LEAD_SOURCE_COLORS);

// Ticket filters
export const ticketStatusOptions = () => toFilterOptions(TICKET_STATUSES);
export const ticketPriorityOptions = () => toFilterOptions(TICKET_PRIORITIES);
export const slaStatusOptions = () => toFilterOptions(SLA_STATUSES);
export const ticketStatusChips = () =>
  toFilterChipsWithAll(TICKET_STATUSES, TICKET_STATUS_COLORS);
export const ticketPriorityChips = () =>
  toFilterChipsWithAll(TICKET_PRIORITIES, TICKET_PRIORITY_COLORS);
export const slaStatusChips = () =>
  toFilterChipsWithAll(SLA_STATUSES, SLA_STATUS_COLORS);

// Case filters
export const caseStatusOptions = () => toFilterOptions(CASE_STATUSES);
export const casePriorityOptions = () => toFilterOptions(CASE_PRIORITIES);
export const caseStatusChips = () =>
  toFilterChipsWithAll(CASE_STATUSES, CASE_STATUS_COLORS);
export const casePriorityChips = () =>
  toFilterChipsWithAll(CASE_PRIORITIES, CASE_PRIORITY_COLORS);
