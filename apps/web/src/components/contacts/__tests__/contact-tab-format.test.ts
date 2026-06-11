/**
 * contact-tab-format tests (IFC-256)
 *
 * Pure formatters + view-model transforms for the Contact 360 Tickets/Documents
 * tabs. These carry the tab logic extracted out of the route page so it stays
 * unit-tested and counted by coverage.
 */
import { describe, it, expect } from 'vitest';

import {
  formatFileSize,
  titleCaseLabel,
  formatTicketMeta,
  getTicketStatusColor,
  toTicketViewModels,
  toDocumentViewModels,
} from '../contact-tab-format';

describe('formatFileSize', () => {
  it('returns "0 B" for zero, negative, or falsy sizes', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(-100)).toBe('0 B');
    expect(formatFileSize(Number.NaN)).toBe('0 B');
  });

  it('formats bytes without decimals', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('formats kilobytes with one decimal under 10 and rounded at/above 10', () => {
    expect(formatFileSize(1500)).toBe('1.5 KB');
    expect(formatFileSize(15000)).toBe('15 KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(2_400_000)).toBe('2.3 MB');
  });

  it('formats gigabytes', () => {
    expect(formatFileSize(3 * 1024 ** 3)).toBe('3 GB');
  });

  it('caps the unit at TB for very large sizes', () => {
    expect(formatFileSize(5 * 1024 ** 4)).toBe('5 TB');
  });
});

describe('titleCaseLabel', () => {
  it('returns the value unchanged when empty', () => {
    expect(titleCaseLabel('')).toBe('');
  });

  it('title-cases a single word', () => {
    expect(titleCaseLabel('OPEN')).toBe('Open');
  });

  it('replaces underscores and lower-cases the remainder', () => {
    expect(titleCaseLabel('IN_PROGRESS')).toBe('In progress');
  });
});

describe('formatTicketMeta', () => {
  it('builds the "number • status • priority Priority" line', () => {
    expect(formatTicketMeta('T-00001', 'RESOLVED', 'MEDIUM')).toBe(
      'T-00001 • Resolved • Medium Priority'
    );
  });
});

describe('getTicketStatusColor', () => {
  it('uses green for resolved/closed (case-insensitive)', () => {
    expect(getTicketStatusColor('RESOLVED')).toContain('green');
    expect(getTicketStatusColor('CLOSED')).toContain('green');
    expect(getTicketStatusColor('resolved')).toContain('green');
  });

  it('uses the brand blue for any other status', () => {
    expect(getTicketStatusColor('OPEN')).toContain('#137fec');
    expect(getTicketStatusColor('IN_PROGRESS')).toContain('#137fec');
  });
});

describe('toTicketViewModels', () => {
  it('returns an empty array for null/undefined', () => {
    expect(toTicketViewModels(undefined)).toEqual([]);
    expect(toTicketViewModels(null)).toEqual([]);
  });

  it('normalises Date createdAt to an ISO string and preserves string dates', () => {
    const created = new Date('2025-01-10T09:00:00.000Z');
    const result = toTicketViewModels([
      {
        id: 'tk-1',
        ticketNumber: 'T-00001',
        subject: 'Integration API question',
        status: 'RESOLVED',
        priority: 'MEDIUM',
        createdAt: created,
        resolvedAt: null,
      },
      {
        id: 'tk-2',
        ticketNumber: 'T-00002',
        subject: 'Billing discrepancy',
        status: 'OPEN',
        priority: 'HIGH',
        createdAt: '2025-02-01T10:00:00.000Z',
      },
    ]);
    expect(result).toEqual([
      {
        id: 'tk-1',
        ticketNumber: 'T-00001',
        subject: 'Integration API question',
        status: 'RESOLVED',
        priority: 'MEDIUM',
        createdAt: '2025-01-10T09:00:00.000Z',
      },
      {
        id: 'tk-2',
        ticketNumber: 'T-00002',
        subject: 'Billing discrepancy',
        status: 'OPEN',
        priority: 'HIGH',
        createdAt: '2025-02-01T10:00:00.000Z',
      },
    ]);
  });
});

describe('toDocumentViewModels', () => {
  it('returns an empty array for null/undefined', () => {
    expect(toDocumentViewModels(undefined)).toEqual([]);
    expect(toDocumentViewModels(null)).toEqual([]);
  });

  it('normalises Date createdAt to an ISO string and preserves string dates', () => {
    const result = toDocumentViewModels([
      {
        id: 'doc-1',
        name: 'Enterprise License Proposal',
        fileName: 'proposal.pdf',
        fileType: 'application/pdf',
        fileSize: 2_400_000,
        fileUrl: 'https://files.example.com/proposal.pdf',
        category: 'proposal',
        createdAt: new Date('2025-01-09T09:00:00.000Z'),
      },
    ]);
    expect(result).toEqual([
      {
        id: 'doc-1',
        name: 'Enterprise License Proposal',
        fileName: 'proposal.pdf',
        fileType: 'application/pdf',
        fileSize: 2_400_000,
        fileUrl: 'https://files.example.com/proposal.pdf',
        category: 'proposal',
        createdAt: '2025-01-09T09:00:00.000Z',
      },
    ]);
  });
});
