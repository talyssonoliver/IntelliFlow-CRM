/**
 * Ticket Automation Tests - PG-185 (R-3)
 *
 * Covers: loadTicketAutomation fallback, resolveDefaultSlaPolicyId,
 * assertCanCreateTicketOrMerge, assertCanDeleteTicket, assertCanCreateTag,
 * normalizeTicketSubject, trimTicketDescription, notification helpers,
 * SLA breach/warning gating predicates.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  loadTicketAutomation,
  resolveDefaultSlaPolicyId,
  assertCanCreateTicketOrMerge,
  assertCanDeleteTicket,
  assertCanCreateTag,
  normalizeTicketSubject,
  trimTicketDescription,
  notifyTicketReassignment,
  notifyTicketResolved,
  notifyTicketEscalated,
  notifyTicketDuplicate,
  shouldWriteSlaBreachNotification,
  shouldWriteSlaWarningNotification,
  AUTOMATION_FACTORY_DEFAULTS,
} from '../ticket-automation';

// ─── loadTicketAutomation ───────────────────────────────────────────────────

describe('loadTicketAutomation', () => {
  it('returns factory defaults when no row exists', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        ticketAutomationSetting: { findUnique: vi.fn().mockResolvedValue(null) },
        ticketRequiredField: { findMany: vi.fn().mockResolvedValue([]) },
        sLAPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };
    const flags = await loadTicketAutomation(ctx as any);
    expect(flags.notifyOnSlaBreach).toBe(true); // preserves existing behavior
    expect(flags.aiDuplicateDetection).toBe(false);
    expect(flags.autoCloseIdleDays).toBe(7);
    expect(flags.defaultSlaPolicyId).toBeNull();
  });

  it('returns row values when row exists', async () => {
    const row = {
      ...AUTOMATION_FACTORY_DEFAULTS,
      notifyOnSlaBreach: false,
      autoCloseIdleDays: 14,
      defaultSlaPolicyId: 'sla-1',
    };
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        ticketAutomationSetting: { findUnique: vi.fn().mockResolvedValue(row) },
        ticketRequiredField: { findMany: vi.fn().mockResolvedValue([]) },
        sLAPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };
    const flags = await loadTicketAutomation(ctx as any);
    expect(flags.notifyOnSlaBreach).toBe(false);
    expect(flags.autoCloseIdleDays).toBe(14);
    expect(flags.defaultSlaPolicyId).toBe('sla-1');
  });
});

// ─── resolveDefaultSlaPolicyId ──────────────────────────────────────────────

describe('resolveDefaultSlaPolicyId', () => {
  it('returns defaultSlaPolicyId when set', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        ticketAutomationSetting: { findUnique: vi.fn() },
        ticketRequiredField: { findMany: vi.fn() },
        sLAPolicy: { findFirst: vi.fn() },
      },
    };
    const id = await resolveDefaultSlaPolicyId(ctx as any, { defaultSlaPolicyId: 'sla-42' });
    expect(id).toBe('sla-42');
    expect(ctx.prismaWithTenant.sLAPolicy.findFirst).not.toHaveBeenCalled();
  });

  it('falls back to isDefault=true SLA when null', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        ticketAutomationSetting: { findUnique: vi.fn() },
        ticketRequiredField: { findMany: vi.fn() },
        sLAPolicy: { findFirst: vi.fn().mockResolvedValue({ id: 'sla-default' }) },
      },
    };
    const id = await resolveDefaultSlaPolicyId(ctx as any, { defaultSlaPolicyId: null });
    expect(id).toBe('sla-default');
  });

  it('returns null when no default exists', async () => {
    const ctx = {
      tenant: { tenantId: 't1' },
      prismaWithTenant: {
        ticketAutomationSetting: { findUnique: vi.fn() },
        ticketRequiredField: { findMany: vi.fn() },
        sLAPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    };
    const id = await resolveDefaultSlaPolicyId(ctx as any, { defaultSlaPolicyId: null });
    expect(id).toBeNull();
  });
});

// ─── normalizeTicketSubject ─────────────────────────────────────────────────

describe('normalizeTicketSubject', () => {
  it('capitalizes first letter and collapses whitespace when enabled', () => {
    expect(normalizeTicketSubject('  hello   world  ', { normalizeSubjectCasing: true })).toBe(
      'Hello world'
    );
  });

  it('returns unchanged when disabled', () => {
    expect(normalizeTicketSubject('hello world', { normalizeSubjectCasing: false })).toBe(
      'hello world'
    );
  });

  it('returns null for empty string after trim', () => {
    expect(normalizeTicketSubject('   ', { normalizeSubjectCasing: true })).toBeNull();
  });

  it('returns null for null input', () => {
    expect(normalizeTicketSubject(null, { normalizeSubjectCasing: true })).toBeNull();
  });
});

// ─── trimTicketDescription ──────────────────────────────────────────────────

describe('trimTicketDescription', () => {
  it('trims whitespace when enabled', () => {
    expect(trimTicketDescription('  hello  ', { trimDescriptionWhitespace: true })).toBe('hello');
  });

  it('returns null for whitespace-only string', () => {
    expect(trimTicketDescription('   ', { trimDescriptionWhitespace: true })).toBeNull();
  });

  it('returns unchanged when disabled', () => {
    expect(trimTicketDescription('  hello  ', { trimDescriptionWhitespace: false })).toBe(
      '  hello  '
    );
  });
});

// ─── assertCanCreateTicketOrMerge ───────────────────────────────────────────

describe('assertCanCreateTicketOrMerge', () => {
  const input = { subject: 'Login issue', contactEmail: 'user@test.com' };

  it('returns CREATE when no candidates', () => {
    const result = assertCanCreateTicketOrMerge(input, [], {
      autoMergeOnExactContactSubject: true,
    });
    expect(result.action).toBe('CREATE');
  });

  it('returns MERGE on exact match when enabled', () => {
    const candidates = [{ id: 't-1', subject: 'Login issue', contactEmail: 'user@test.com' }];
    const result = assertCanCreateTicketOrMerge(input, candidates, {
      autoMergeOnExactContactSubject: true,
    });
    expect(result.action).toBe('MERGE');
    if (result.action === 'MERGE') expect(result.targetId).toBe('t-1');
  });

  it('returns CREATE with duplicates list when disabled', () => {
    const candidates = [{ id: 't-1', subject: 'Login issue', contactEmail: 'user@test.com' }];
    const result = assertCanCreateTicketOrMerge(input, candidates, {
      autoMergeOnExactContactSubject: false,
    });
    expect(result.action).toBe('CREATE');
    if (result.action === 'CREATE') expect(result.duplicates).toHaveLength(1);
  });

  it('case-insensitive email match', () => {
    const candidates = [{ id: 't-1', subject: 'Login issue', contactEmail: 'USER@TEST.COM' }];
    const result = assertCanCreateTicketOrMerge(input, candidates, {
      autoMergeOnExactContactSubject: true,
    });
    expect(result.action).toBe('MERGE');
  });
});

// ─── assertCanDeleteTicket ──────────────────────────────────────────────────

describe('assertCanDeleteTicket', () => {
  it('allows delete when no open children', () => {
    expect(() =>
      assertCanDeleteTicket(
        { openRelatedTickets: 0, openActivities: 0 },
        { preventDeleteWithOpenChildren: true }
      )
    ).not.toThrow();
  });

  it('blocks delete when open children exist and flag is on', () => {
    expect(() =>
      assertCanDeleteTicket(
        { openRelatedTickets: 2, openActivities: 0 },
        { preventDeleteWithOpenChildren: true }
      )
    ).toThrow('open child record');
  });

  it('allows delete when flag is off regardless of children', () => {
    expect(() =>
      assertCanDeleteTicket(
        { openRelatedTickets: 5, openActivities: 3 },
        { preventDeleteWithOpenChildren: false }
      )
    ).not.toThrow();
  });
});

// ─── assertCanCreateTag ─────────────────────────────────────────────────────

describe('assertCanCreateTag', () => {
  it('allows when restriction is off', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: false })
    ).not.toThrow();
  });

  it('allows ADMIN when restriction is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'ADMIN' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('allows OWNER when restriction is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'OWNER' } }, { restrictTagCreationToAdmins: true })
    ).not.toThrow();
  });

  it('blocks USER when restriction is on', () => {
    expect(() =>
      assertCanCreateTag({ user: { role: 'USER' } }, { restrictTagCreationToAdmins: true })
    ).toThrow('restricted to workspace admins');
  });
});

// ─── Notification helpers ───────────────────────────────────────────────────

describe('notifyTicketReassignment', () => {
  const base = {
    tenantId: 't1',
    ticketId: 'tk-1',
    ticketNumber: 'T-001',
    subject: 'Bug',
    actingUserId: 'u1',
  };
  const createNotification = vi.fn().mockResolvedValue(undefined);

  it('emits when flag is on and assignees differ', async () => {
    await notifyTicketReassignment(
      { ...base, previousAssigneeId: 'a1', nextAssigneeId: 'a2' },
      { notifyOnAssigneeChange: true },
      createNotification
    );
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it('skips when flag is off', async () => {
    createNotification.mockClear();
    await notifyTicketReassignment(
      { ...base, previousAssigneeId: 'a1', nextAssigneeId: 'a2' },
      { notifyOnAssigneeChange: false },
      createNotification
    );
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('skips when same assignee', async () => {
    createNotification.mockClear();
    await notifyTicketReassignment(
      { ...base, previousAssigneeId: 'a1', nextAssigneeId: 'a1' },
      { notifyOnAssigneeChange: true },
      createNotification
    );
    expect(createNotification).not.toHaveBeenCalled();
  });
});

describe('notifyTicketResolved', () => {
  it('emits when flag is on and reporter exists', async () => {
    const cn = vi.fn().mockResolvedValue(undefined);
    await notifyTicketResolved(
      {
        tenantId: 't1',
        ticketId: 'tk-1',
        ticketNumber: 'T-001',
        subject: 'Bug',
        actingUserId: 'u1',
        reporterUserId: 'r1',
      },
      { notifyOnStatusResolved: true },
      cn
    );
    expect(cn).toHaveBeenCalledTimes(1);
    expect(cn.mock.calls[0][0].type).toBe('ticket_resolved');
  });

  it('skips when flag is off', async () => {
    const cn = vi.fn();
    await notifyTicketResolved(
      {
        tenantId: 't1',
        ticketId: 'tk-1',
        ticketNumber: 'T-001',
        subject: 'Bug',
        actingUserId: 'u1',
        reporterUserId: 'r1',
      },
      { notifyOnStatusResolved: false },
      cn
    );
    expect(cn).not.toHaveBeenCalled();
  });
});

describe('notifyTicketEscalated', () => {
  it('emits to all recipients when flag is on', async () => {
    const cn = vi.fn().mockResolvedValue(undefined);
    await notifyTicketEscalated(
      {
        tenantId: 't1',
        ticketId: 'tk-1',
        ticketNumber: 'T-001',
        subject: 'Bug',
        actingUserId: 'u1',
        recipientUserIds: ['a1', 'a2'],
      },
      { notifyOnEscalation: true },
      cn
    );
    expect(cn).toHaveBeenCalledTimes(2);
    expect(cn.mock.calls[0][0].priority).toBe('high');
  });
});

describe('notifyTicketDuplicate', () => {
  it('emits when flag is on and duplicates exist', async () => {
    const cn = vi.fn().mockResolvedValue(undefined);
    await notifyTicketDuplicate(
      {
        tenantId: 't1',
        ticketId: 'tk-1',
        ticketNumber: 'T-001',
        subject: 'Bug',
        actingUserId: 'u1',
        reporterUserId: 'r1',
        duplicates: [{ id: 'dup-1', subject: 'Bug', contactEmail: 'x@y.com' }],
      },
      { notifyOnDuplicate: true },
      cn
    );
    expect(cn).toHaveBeenCalledTimes(1);
    expect(cn.mock.calls[0][0].type).toBe('ticket_duplicate_suspected');
  });
});

// ─── SLA gating predicates ──────────────────────────────────────────────────

describe('shouldWriteSlaBreachNotification', () => {
  it('returns true when flag is on (default)', () => {
    expect(shouldWriteSlaBreachNotification({ notifyOnSlaBreach: true })).toBe(true);
  });

  it('returns false when flag is off', () => {
    expect(shouldWriteSlaBreachNotification({ notifyOnSlaBreach: false })).toBe(false);
  });
});

describe('shouldWriteSlaWarningNotification', () => {
  it('returns false when flag is off (default)', () => {
    expect(shouldWriteSlaWarningNotification({ notifyOnSlaWarning: false })).toBe(false);
  });

  it('returns true when flag is on', () => {
    expect(shouldWriteSlaWarningNotification({ notifyOnSlaWarning: true })).toBe(true);
  });
});
