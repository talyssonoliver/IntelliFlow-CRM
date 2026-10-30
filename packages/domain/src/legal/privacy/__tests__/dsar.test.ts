/**
 * PG-203 DSAR (spec Addendum A, rounds 2-4; owner Q13/Q14/Q16-Q19).
 *
 * Pure rules for data subject requests: the one-calendar-month deadline (Art 12(3)),
 * extensions, late rejection, when an access request may close at verification,
 * and when a staff-logged erasure may run.
 */
import { describe, it, expect } from 'vitest';
import {
  DSAR_LIMITS,
  DSAR_REQUEST_TYPES,
  accessResolutionNote,
  DSAR_STATUSES,
  DSAR_WITHHELD_CATEGORIES,
  accessCompletesAtVerify,
  addCalendarMonths,
  canExtend,
  effectiveDeadline,
  isErasedEmail,
  isTerminalDsarStatus,
  normalizeSubjectEmail,
  rejectionIsLate,
  staffErasureMayRun,
} from '../dsar';
import { ProcessingRestrictedError } from '../errors';
import { DomainError } from '../../../shared/Result';

const HOUR = 3_600_000;

describe('constants', () => {
  it('covers the six rights and the four statuses', () => {
    expect(DSAR_REQUEST_TYPES).toEqual([
      'ACCESS',
      'RECTIFICATION',
      'ERASURE',
      'RESTRICTION',
      'PORTABILITY',
      'OBJECTION',
    ]);
    expect(DSAR_STATUSES).toEqual(['PENDING_VERIFICATION', 'VERIFIED', 'COMPLETED', 'REJECTED']);
  });

  it('keeps the limits the spec and the migration agree on', () => {
    expect(DSAR_LIMITS).toMatchObject({
      verificationHours: 24,
      exportHours: 72,
      maxExportDownloads: 5,
      capPerTenantEmailPerDay: 3,
      capPerIpPerHour: 10,
      capGlobalEmailPerDay: 3,
      capPerTenantPerDay: 50,
      pendingPurgeDays: 7,
      resendCooldownMinutes: 60,
      staffErasureDelayHours: 24,
      overdueRepeatDays: 3,
      slaWarnDays: 7,
      maxBackdateDays: 30,
      detailsMax: 2000,
      identityNoteMin: 20,
      marketingStopMethodMin: 10,
      exportRowCap: 500,
    });
  });

  it('withholds free text pending firm review (compliance R2/R3)', () => {
    expect(DSAR_WITHHELD_CATEGORIES).toEqual([
      'NOTES',
      'ACTIVITY_TEXT',
      'TICKET_SUBJECTS',
      'MESSAGE_BODIES',
      'DOCUMENTS',
      // Owner Q23/Q26 and the compliance review: descriptions of deals and tasks, AI and staff
      // free text, and records the export only counts.
      'DESCRIPTIONS',
      'AI_TEXT',
      'STAFF_TEXT',
      'OTHER_RECORDS',
      'EXCESS_ROWS',
    ]);
  });
});

describe('addCalendarMonths (Art 12(3): one month, not 30 days)', () => {
  it('adds a calendar month keeping the time of day', () => {
    expect(addCalendarMonths(new Date('2026-10-22T09:15:00Z'), 1).toISOString()).toBe(
      '2026-11-22T09:15:00.000Z'
    );
  });

  it('clamps to the last day of a shorter month', () => {
    expect(addCalendarMonths(new Date('2027-01-31T12:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T12:00:00.000Z'
    );
    expect(addCalendarMonths(new Date('2028-01-31T12:00:00Z'), 1).toISOString()).toBe(
      '2028-02-29T12:00:00.000Z'
    );
    expect(addCalendarMonths(new Date('2026-08-31T00:00:00Z'), 1).toISOString()).toBe(
      '2026-09-30T00:00:00.000Z'
    );
  });

  it('crosses the year and adds several months', () => {
    expect(addCalendarMonths(new Date('2026-12-15T00:00:00Z'), 1).toISOString()).toBe(
      '2027-01-15T00:00:00.000Z'
    );
    expect(addCalendarMonths(new Date('2026-11-30T00:00:00Z'), 3).toISOString()).toBe(
      '2027-02-28T00:00:00.000Z'
    );
  });
});

describe('deadlines', () => {
  const sla = new Date('2026-11-22T00:00:00Z');

  it('uses the extension when there is one', () => {
    expect(effectiveDeadline({ slaDeadline: sla, extendedUntil: null })).toEqual(sla);
    const ext = new Date('2027-01-22T00:00:00Z');
    expect(effectiveDeadline({ slaDeadline: sla, extendedUntil: ext })).toEqual(ext);
    expect(effectiveDeadline({ slaDeadline: null, extendedUntil: null })).toBeNull();
  });

  it('allows an extension of 1 or 2 months, only while VERIFIED and before the original deadline', () => {
    const base = { status: 'VERIFIED' as const, slaDeadline: sla, extendedUntil: null };
    expect(canExtend(base, 1, new Date('2026-11-01T00:00:00Z'))).toBe(true);
    expect(canExtend(base, 2, new Date('2026-11-01T00:00:00Z'))).toBe(true);
    expect(canExtend(base, 3, new Date('2026-11-01T00:00:00Z'))).toBe(false);
    expect(canExtend(base, 1, new Date('2026-11-23T00:00:00Z'))).toBe(false);
    expect(canExtend({ ...base, status: 'COMPLETED' }, 1, new Date('2026-11-01T00:00:00Z'))).toBe(
      false
    );
    expect(
      canExtend(
        { ...base, extendedUntil: new Date('2026-12-22T00:00:00Z') },
        1,
        new Date('2026-11-01T00:00:00Z')
      )
    ).toBe(false);
  });

  it('marks a rejection after the effective deadline as late (a breached clock)', () => {
    expect(
      rejectionIsLate({ slaDeadline: sla, extendedUntil: null }, new Date('2026-11-21T00:00:00Z'))
    ).toBe(false);
    expect(
      rejectionIsLate({ slaDeadline: sla, extendedUntil: null }, new Date('2026-11-23T00:00:00Z'))
    ).toBe(true);
    expect(
      rejectionIsLate(
        { slaDeadline: sla, extendedUntil: new Date('2026-12-22T00:00:00Z') },
        new Date('2026-11-23T00:00:00Z')
      )
    ).toBe(false);
    expect(rejectionIsLate({ slaDeadline: null, extendedUntil: null }, new Date())).toBe(false);
  });

  it('knows the terminal states', () => {
    expect(isTerminalDsarStatus('COMPLETED')).toBe(true);
    expect(isTerminalDsarStatus('REJECTED')).toBe(true);
    expect(isTerminalDsarStatus('VERIFIED')).toBe(false);
    expect(isTerminalDsarStatus('PENDING_VERIFICATION')).toBe(false);
  });
});

describe('accessCompletesAtVerify (compliance R3: only when every withheld count is zero)', () => {
  it('completes only with nothing withheld', () => {
    expect(accessCompletesAtVerify({})).toBe(true);
    expect(accessCompletesAtVerify({ NOTES: 0, ACTIVITY_TEXT: 0 })).toBe(true);
    expect(accessCompletesAtVerify({ NOTES: 0, ACTIVITY_TEXT: 2 })).toBe(false);
    expect(accessCompletesAtVerify({ DOCUMENTS: 1 })).toBe(false);
  });
});

describe('staffErasureMayRun (security R3 S5; R4)', () => {
  const createdAt = new Date('2026-10-22T09:00:00Z');

  it('with two or more admins, needs a different resolver', () => {
    const base = { adminCount: 2, createdAt, now: new Date(createdAt.getTime() + 24 * HOUR) };
    expect(staffErasureMayRun({ ...base, createdById: 'u1', resolvedById: 'u2' })).toEqual({
      allowed: true,
    });
    expect(staffErasureMayRun({ ...base, createdById: 'u1', resolvedById: 'u1' })).toEqual({
      allowed: false,
      reason: 'SECOND_ADMIN_REQUIRED',
    });
  });

  it('with a single admin, waits 24 hours from logging', () => {
    const base = { adminCount: 1, createdAt, createdById: 'u1', resolvedById: 'u1' };
    expect(staffErasureMayRun({ ...base, now: new Date(createdAt.getTime() + 23 * HOUR) })).toEqual(
      {
        allowed: false,
        reason: 'WAIT_24H',
      }
    );
    expect(staffErasureMayRun({ ...base, now: new Date(createdAt.getTime() + 24 * HOUR) })).toEqual(
      {
        allowed: true,
      }
    );
  });

  it('always waits 24 hours from the warning, even with a second admin (owner Q25)', () => {
    const base = { adminCount: 3, createdAt, createdById: 'u1', resolvedById: 'u2' };
    expect(staffErasureMayRun({ ...base, now: new Date(createdAt.getTime() + 23 * HOUR) })).toEqual(
      { allowed: false, reason: 'WAIT_24H' }
    );
    expect(staffErasureMayRun({ ...base, now: new Date(createdAt.getTime() + 24 * HOUR) })).toEqual(
      { allowed: true }
    );
  });

  it('with a deleted creator, counts as another person only when there are two or more admins', () => {
    expect(
      staffErasureMayRun({
        adminCount: 2,
        createdAt,
        createdById: null,
        resolvedById: 'u2',
        now: new Date(createdAt.getTime() + 24 * HOUR),
      })
    ).toEqual({ allowed: true });
    expect(
      staffErasureMayRun({
        adminCount: 1,
        createdAt,
        createdById: null,
        resolvedById: 'u2',
        now: new Date(createdAt.getTime() + HOUR),
      })
    ).toEqual({ allowed: false, reason: 'WAIT_24H' });
  });
});

describe('subject emails', () => {
  it('normalises by trimming and lowercasing only (no +tag folding: the subject is exact)', () => {
    expect(normalizeSubjectEmail('  Ada.Lovelace+Work@Example.INVALID ')).toBe(
      'ada.lovelace+work@example.invalid'
    );
  });

  it('recognises erased placeholders', () => {
    expect(isErasedEmail('erased-clabc123@erased.invalid')).toBe(true);
    expect(isErasedEmail('ERASED-x@Erased.Invalid')).toBe(true);
    expect(isErasedEmail('ada@example.invalid')).toBe(false);
  });
});

describe('ProcessingRestrictedError', () => {
  it('is a DomainError with a stable code', () => {
    const error = new ProcessingRestrictedError();
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('PROCESSING_RESTRICTED');
    expect(error.message).toBe('Processing is restricted for this person (data request).');
  });
});

describe('accessResolutionNote', () => {
  it('keeps a note without withholdings as written', () => {
    expect(accessResolutionNote('Sent the export.', [])).toBe('Sent the export.');
  });

  it('adds one line listing what was withheld and why', () => {
    expect(
      accessResolutionNote('Sent the export.', [
        { category: 'THIRD_PARTY', count: 2, reason: 'Names other clients' },
        { category: 'EXCESS_ROWS', count: 10, reason: 'Over the export limit' },
      ])
    ).toBe(
      'Sent the export.\nWithheld: THIRD_PARTY: 2 (Names other clients); EXCESS_ROWS: 10 (Over the export limit)'
    );
  });
});
