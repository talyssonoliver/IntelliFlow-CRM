import { describe, it, expect, vi } from 'vitest';

/**
 * Mock external dependencies:
 * - @intelliflow/domain: provides const arrays
 * - @/components/shared: provides FilterOption and FilterChip types (type-only, no mock needed)
 */
vi.mock('@intelliflow/domain', () => ({
  LEAD_STATUSES: ['NEW', 'CONTACTED', 'QUALIFIED', 'NEGOTIATING', 'UNQUALIFIED', 'CONVERTED', 'LOST'] as const,
  LEAD_SOURCES: ['WEBSITE', 'REFERRAL', 'SOCIAL', 'EMAIL', 'COLD_CALL', 'EVENT', 'OTHER'] as const,
  TICKET_STATUSES: ['OPEN', 'IN_PROGRESS', 'PENDING', 'WAITING_ON_CUSTOMER', 'WAITING_ON_THIRD_PARTY', 'RESOLVED', 'CLOSED'] as const,
  TICKET_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const,
  SLA_STATUSES: ['ON_TRACK', 'AT_RISK', 'BREACHED', 'MET', 'PAUSED'] as const,
  CASE_STATUSES: ['OPEN', 'IN_PROGRESS', 'ON_HOLD', 'CLOSED', 'CANCELLED'] as const,
  CASE_PRIORITIES: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const,
}));

import {
  toFilterOptions,
  toFilterChips,
  toFilterChipsWithAll,
  formatLabel,
  formatLabelSimple,
  // Color maps
  LEAD_STATUS_COLORS,
  LEAD_SOURCE_COLORS,
  TICKET_STATUS_COLORS,
  TICKET_PRIORITY_COLORS,
  SLA_STATUS_COLORS,
  CASE_STATUS_COLORS,
  CASE_PRIORITY_COLORS,
  // Pre-built filter option functions
  leadStatusOptions,
  leadSourceOptions,
  leadStatusChips,
  leadSourceChips,
  ticketStatusOptions,
  ticketPriorityOptions,
  slaStatusOptions,
  ticketStatusChips,
  ticketPriorityChips,
  slaStatusChips,
  caseStatusOptions,
  casePriorityOptions,
  caseStatusChips,
  casePriorityChips,
} from '../filter-utils';

// ============================================
// formatLabel
// ============================================

describe('formatLabel', () => {
  it('converts SNAKE_CASE to Title Case', () => {
    expect(formatLabel('IN_PROGRESS')).toBe('In Progress');
  });

  it('converts single word to Title Case', () => {
    expect(formatLabel('NEW')).toBe('New');
  });

  it('handles multiple underscores', () => {
    expect(formatLabel('WAITING_ON_CUSTOMER')).toBe('Waiting On Customer');
  });

  it('handles already lowercase input', () => {
    expect(formatLabel('hello_world')).toBe('Hello World');
  });

  it('handles empty string', () => {
    expect(formatLabel('')).toBe('');
  });

  it('handles single character', () => {
    expect(formatLabel('A')).toBe('A');
  });
});

// ============================================
// formatLabelSimple
// ============================================

describe('formatLabelSimple', () => {
  it('replaces underscores with spaces keeping original casing', () => {
    expect(formatLabelSimple('IN_PROGRESS')).toBe('IN PROGRESS');
  });

  it('handles no underscores', () => {
    expect(formatLabelSimple('NEW')).toBe('NEW');
  });

  it('handles empty string', () => {
    expect(formatLabelSimple('')).toBe('');
  });
});

// ============================================
// toFilterOptions
// ============================================

describe('toFilterOptions', () => {
  it('converts string array to filter options with default formatter', () => {
    const values = ['NEW', 'IN_PROGRESS', 'CLOSED'] as const;
    const options = toFilterOptions(values);

    expect(options).toHaveLength(3);
    expect(options[0]).toEqual({ value: 'NEW', label: 'New' });
    expect(options[1]).toEqual({ value: 'IN_PROGRESS', label: 'In Progress' });
    expect(options[2]).toEqual({ value: 'CLOSED', label: 'Closed' });
  });

  it('uses custom label formatter when provided', () => {
    const values = ['A', 'B'] as const;
    const options = toFilterOptions(values, (v) => `Custom: ${v}`);

    expect(options[0]).toEqual({ value: 'A', label: 'Custom: A' });
    expect(options[1]).toEqual({ value: 'B', label: 'Custom: B' });
  });

  it('handles empty array', () => {
    const options = toFilterOptions([] as unknown as readonly string[]);
    expect(options).toEqual([]);
  });
});

// ============================================
// toFilterChips
// ============================================

describe('toFilterChips', () => {
  it('converts string array to filter chips', () => {
    const values = ['OPEN', 'CLOSED'] as const;
    const chips = toFilterChips(values);

    expect(chips).toHaveLength(2);
    expect(chips[0]).toEqual({ id: 'OPEN', label: 'Open' });
    expect(chips[1]).toEqual({ id: 'CLOSED', label: 'Closed' });
  });

  it('applies color map when provided', () => {
    const values = ['OPEN', 'CLOSED'] as const;
    const colorMap = { OPEN: 'bg-blue-500', CLOSED: 'bg-gray-500' };
    const chips = toFilterChips(values, colorMap);

    expect(chips[0]).toEqual({ id: 'OPEN', label: 'Open', color: 'bg-blue-500' });
    expect(chips[1]).toEqual({ id: 'CLOSED', label: 'Closed', color: 'bg-gray-500' });
  });

  it('omits color when not in color map', () => {
    const values = ['OPEN', 'UNKNOWN'] as const;
    const colorMap = { OPEN: 'bg-blue-500' } as Record<string, string>;
    const chips = toFilterChips(values, colorMap);

    expect(chips[0].color).toBe('bg-blue-500');
    expect(chips[1]).not.toHaveProperty('color');
  });

  it('uses custom label formatter', () => {
    const values = ['X'] as const;
    const chips = toFilterChips(values, undefined, () => 'Custom');

    expect(chips[0]).toEqual({ id: 'X', label: 'Custom' });
  });

  it('handles empty array', () => {
    expect(toFilterChips([] as unknown as readonly string[])).toEqual([]);
  });
});

// ============================================
// toFilterChipsWithAll
// ============================================

describe('toFilterChipsWithAll', () => {
  it('prepends an "All" chip', () => {
    const values = ['A', 'B'] as const;
    const chips = toFilterChipsWithAll(values);

    expect(chips).toHaveLength(3);
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips[1]).toEqual({ id: 'A', label: 'A' }); // formatLabel('A') = 'A'
    expect(chips[2]).toEqual({ id: 'B', label: 'B' });
  });

  it('uses custom allLabel', () => {
    const values = ['X'] as const;
    const chips = toFilterChipsWithAll(values, undefined, undefined, 'Everything');

    expect(chips[0]).toEqual({ id: 'all', label: 'Everything' });
  });

  it('passes color map through to chips', () => {
    const values = ['OPEN'] as const;
    const colorMap = { OPEN: 'bg-blue-500' };
    const chips = toFilterChipsWithAll(values, colorMap);

    expect(chips[1].color).toBe('bg-blue-500');
    expect(chips[0]).not.toHaveProperty('color'); // All chip has no color
  });

  it('passes custom formatter through', () => {
    const values = ['X'] as const;
    const chips = toFilterChipsWithAll(values, undefined, () => 'Formatted');

    expect(chips[1].label).toBe('Formatted');
  });
});

// ============================================
// Color Maps
// ============================================

describe('Color Maps', () => {
  it('LEAD_STATUS_COLORS has expected keys', () => {
    expect(LEAD_STATUS_COLORS).toHaveProperty('NEW');
    expect(LEAD_STATUS_COLORS).toHaveProperty('QUALIFIED');
    expect(LEAD_STATUS_COLORS).toHaveProperty('LOST');
    expect(LEAD_STATUS_COLORS.NEW).toBe('bg-blue-500');
  });

  it('LEAD_SOURCE_COLORS has expected keys', () => {
    expect(LEAD_SOURCE_COLORS).toHaveProperty('WEBSITE');
    expect(LEAD_SOURCE_COLORS).toHaveProperty('REFERRAL');
    expect(LEAD_SOURCE_COLORS.WEBSITE).toBe('bg-indigo-500');
  });

  it('TICKET_STATUS_COLORS has expected keys', () => {
    expect(TICKET_STATUS_COLORS).toHaveProperty('OPEN');
    expect(TICKET_STATUS_COLORS).toHaveProperty('RESOLVED');
    expect(TICKET_STATUS_COLORS.OPEN).toBe('bg-blue-500');
  });

  it('TICKET_PRIORITY_COLORS has expected keys', () => {
    expect(TICKET_PRIORITY_COLORS).toHaveProperty('LOW');
    expect(TICKET_PRIORITY_COLORS).toHaveProperty('CRITICAL');
    expect(TICKET_PRIORITY_COLORS.CRITICAL).toBe('bg-red-500');
  });

  it('SLA_STATUS_COLORS has expected keys', () => {
    expect(SLA_STATUS_COLORS).toHaveProperty('ON_TRACK');
    expect(SLA_STATUS_COLORS).toHaveProperty('BREACHED');
    expect(SLA_STATUS_COLORS.ON_TRACK).toBe('bg-green-500');
  });

  it('CASE_STATUS_COLORS has expected keys', () => {
    expect(CASE_STATUS_COLORS).toHaveProperty('OPEN');
    expect(CASE_STATUS_COLORS).toHaveProperty('CANCELLED');
  });

  it('CASE_PRIORITY_COLORS has expected keys', () => {
    expect(CASE_PRIORITY_COLORS).toHaveProperty('LOW');
    expect(CASE_PRIORITY_COLORS).toHaveProperty('URGENT');
  });
});

// ============================================
// Pre-built Filter Functions
// ============================================

describe('Pre-built filter option functions', () => {
  it('leadStatusOptions returns all lead statuses', () => {
    const options = leadStatusOptions();
    expect(options).toHaveLength(7);
    expect(options[0]).toEqual({ value: 'NEW', label: 'New' });
  });

  it('leadSourceOptions returns all lead sources', () => {
    const options = leadSourceOptions();
    expect(options).toHaveLength(7);
    expect(options[0]).toEqual({ value: 'WEBSITE', label: 'Website' });
  });

  it('leadStatusChips includes "All" chip plus all statuses', () => {
    const chips = leadStatusChips();
    expect(chips).toHaveLength(8); // 1 All + 7 statuses
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips[1].id).toBe('NEW');
    expect(chips[1].color).toBe('bg-blue-500');
  });

  it('leadSourceChips includes "All" chip plus all sources', () => {
    const chips = leadSourceChips();
    expect(chips).toHaveLength(8); // 1 All + 7 sources
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
  });

  it('ticketStatusOptions returns all ticket statuses', () => {
    const options = ticketStatusOptions();
    expect(options).toHaveLength(7);
  });

  it('ticketPriorityOptions returns all ticket priorities', () => {
    const options = ticketPriorityOptions();
    expect(options).toHaveLength(4);
  });

  it('slaStatusOptions returns all SLA statuses', () => {
    const options = slaStatusOptions();
    expect(options).toHaveLength(5);
  });

  it('ticketStatusChips includes "All" chip', () => {
    const chips = ticketStatusChips();
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips).toHaveLength(8); // 1 All + 7 statuses
  });

  it('ticketPriorityChips includes "All" chip', () => {
    const chips = ticketPriorityChips();
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips).toHaveLength(5); // 1 All + 4 priorities
  });

  it('slaStatusChips includes "All" chip with colors', () => {
    const chips = slaStatusChips();
    expect(chips).toHaveLength(6); // 1 All + 5 SLA statuses
    const onTrackChip = chips.find((c) => c.id === 'ON_TRACK');
    expect(onTrackChip?.color).toBe('bg-green-500');
  });

  it('caseStatusOptions returns all case statuses', () => {
    const options = caseStatusOptions();
    expect(options).toHaveLength(5);
  });

  it('casePriorityOptions returns all case priorities', () => {
    const options = casePriorityOptions();
    expect(options).toHaveLength(4);
  });

  it('caseStatusChips includes "All" chip', () => {
    const chips = caseStatusChips();
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips).toHaveLength(6); // 1 All + 5 statuses
  });

  it('casePriorityChips includes "All" chip', () => {
    const chips = casePriorityChips();
    expect(chips[0]).toEqual({ id: 'all', label: 'All' });
    expect(chips).toHaveLength(5); // 1 All + 4 priorities
  });
});
