/**
 * Property tests for the `Ticket` aggregate root (pure domain — no infrastructure).
 *
 * Property ids sourced from race-condition-findings.json:
 *   RACE-PURE-10 — changePriority guards CLOSED but not ARCHIVED (terminal status gap)
 *   RACE-PURE-11 — slaPausedDuration accumulator can go negative on clock-skew resume
 *   RACE-PURE-M1 — assign() throws raw Error (not Result) and does not guard CLOSED;
 *                  unassign() has zero terminal-status guard
 *
 * Properties verified:
 *   1. Ticket.create always succeeds with valid props and starts OPEN / ON_TRACK.
 *   2. Status state-machine: every transition that canTransitionTicketTo permits is
 *      accepted; every transition not in the table is rejected.
 *   3. changeStatus on a terminal (ARCHIVED) status is always rejected.
 *   4. changePriority is accepted for active statuses.
 *   5. RACE-PURE-10: changePriority on ARCHIVED ticket — documents the bug (skip).
 *   6. RACE-PURE-10: changePriority on CLOSED ticket correctly rejects.
 *   7. SLA pause/resume single cycle: slaPausedDuration accumulates correctly.
 *   8. RACE-PURE-11: slaPausedDuration is non-negative for monotonic clock.
 *   9. RACE-PURE-11 bug: resume with now < pausedAt produces negative duration (skip).
 *  10. Multiple pause/resume cycles: cumulative duration equals sum of each interval.
 *  11. pauseSla on already-paused ticket is rejected (idempotency guard).
 *  12. resumeSla on non-paused ticket is rejected.
 *  13. recordFirstResponse is idempotent guard: second call rejected.
 *  14. RACE-PURE-M1: assign() on CLOSED ticket succeeds (documents bug — skip).
 *  15. RACE-PURE-M1: assign() on ARCHIVED ticket throws (raw Error, not Result — skip).
 *  16. unassign() on ARCHIVED ticket silently succeeds (documents bug — skip).
 *  17. assign() on active tickets succeeds.
 *  18. checkSlaStatus returns PAUSED when SLA is paused.
 *  19. checkSlaStatus returns BREACHED when past the deadline and no response recorded.
 *  20. checkSlaStatus returns ON_TRACK when deadline is in the future.
 *
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Ticket,
  TICKET_STATUSES,
  TICKET_PRIORITIES,
  VALID_TICKET_TRANSITIONS,
  canTransitionTicketTo,
  isTerminalStatus,
} from '@intelliflow/domain';
import type { TicketStatus, TicketPriority } from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Bounded inline arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** All valid ticket statuses. */
const anyStatus = fc.constantFrom(...TICKET_STATUSES);

/** All non-terminal ticket statuses (have valid outgoing transitions). */
const activeStatus = fc.constantFrom(
  ...TICKET_STATUSES.filter((s) => !isTerminalStatus(s))
) as fc.Arbitrary<TicketStatus>;

/** Active statuses that are not RESOLVED (can't close OPEN without going through a path). */
const nonTerminalNonResolved = fc.constantFrom(
  'OPEN' as TicketStatus,
  'IN_PROGRESS' as TicketStatus,
  'WAITING_ON_CUSTOMER' as TicketStatus,
  'WAITING_ON_THIRD_PARTY' as TicketStatus
);

/** All ticket priorities. */
const anyPriority = fc.constantFrom(...TICKET_PRIORITIES) as fc.Arbitrary<TicketPriority>;

/** Safe non-empty string (no special chars that could trip domain logic). */
const safeString = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

/** Valid UUID v4 string. */
const uuidString = fc.uuid().filter((u) => u.length > 0);

/** Valid email address. */
const emailArb = fc
  .tuple(
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s)),
    fc.string({ minLength: 1, maxLength: 10 }).filter((s) => /^[a-z]+$/.test(s))
  )
  .map(([local, domain]) => `${local}@${domain}.com`);

/** Millisecond offset within a valid range (0 to 1 hour). */
const posOffsetMs = fc.integer({ min: 1, max: 3_600_000 });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a minimal Ticket.create call with the given overrides.
 * Always succeeds (valid props guaranteed).
 */
function makeTicket(overrides: {
  subject?: string;
  contactName?: string;
  contactEmail?: string;
  priority?: TicketPriority;
  slaPolicyId?: string;
  tenantId?: string;
}) {
  const result = Ticket.create({
    subject: overrides.subject ?? 'Test ticket subject',
    contactName: overrides.contactName ?? 'Alice Smith',
    contactEmail: overrides.contactEmail ?? 'alice@example.com',
    priority: overrides.priority,
    slaPolicyId: overrides.slaPolicyId ?? 'sla-policy-001',
    tenantId: overrides.tenantId ?? 'tenant-001',
  });
  if (result.isFailure) throw new Error(`makeTicket failed: ${result.error.message}`);
  return result.value;
}

/**
 * Advance a fresh ticket's status machine step-by-step until it reaches
 * `target` (or returns null if the path is impossible from OPEN).
 * Uses a predetermined path through the state machine.
 */
/** BFS shortest path through valid ticket transitions (null if unreachable). */
function findTransitionPath(start: TicketStatus, target: TicketStatus): TicketStatus[] | null {
  if (start === target) return [start];
  const transitions = VALID_TICKET_TRANSITIONS;
  const queue: TicketStatus[][] = [[start]];
  const visited = new Set<TicketStatus>([start]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const last = current[current.length - 1];
    for (const next of transitions[last]) {
      if (next === target) return [...current, next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...current, next]);
      }
    }
  }
  return null;
}

function advanceToStatus(ticket: Ticket, target: TicketStatus): boolean {
  const path = findTransitionPath(ticket.status, target);
  if (!path) return false; // unreachable ([start] is returned when already at target)
  for (let i = 1; i < path.length; i++) {
    if (ticket.changeStatus(path[i], 'system').isFailure) return false;
  }
  return ticket.status === target;
}

// ---------------------------------------------------------------------------
// Property suite
// ---------------------------------------------------------------------------

describe('Ticket aggregate — domain property tests (RACE-PURE-10/11/M1)', () => {
  // =========================================================================
  // 1. Ticket.create — always succeeds with valid props
  // =========================================================================

  test.prop(
    [safeString, safeString, emailArb, anyPriority, safeString, safeString],
    propertyParams()
  )(
    'create always succeeds with valid props and starts OPEN with ON_TRACK SLA',
    (subject, contactName, contactEmail, priority, slaPolicyId, tenantId) => {
      const result = Ticket.create({
        subject,
        contactName,
        contactEmail,
        priority,
        slaPolicyId,
        tenantId,
      });

      expect(result.isSuccess).toBe(true);
      const ticket = result.value;
      expect(ticket.status).toBe('OPEN');
      expect(ticket.slaStatus).toBe('ON_TRACK');
      expect(ticket.priority).toBe(priority);
      expect(ticket.slaPausedDuration).toBe(0);
      expect(ticket.isSlaPaused).toBe(false);
      expect(ticket.isSlaBreached).toBe(false);
    }
  );

  // =========================================================================
  // 2. Status state-machine — valid transitions accepted
  // =========================================================================

  test.prop([activeStatus, anyStatus], propertyParams())(
    'changeStatus accepts every transition that canTransitionTicketTo permits',
    (from, to) => {
      fc.pre(canTransitionTicketTo(from, to));

      // Build a ticket already at `from` by advancing from OPEN.
      const ticket = makeTicket({});
      const reached = advanceToStatus(ticket, from);
      fc.pre(reached); // skip if we can't reach `from` (shouldn't happen for active statuses)

      const result = ticket.changeStatus(to, 'agent');
      expect(result.isSuccess).toBe(true);
      expect(ticket.status).toBe(to);
    }
  );

  // =========================================================================
  // 3. Status state-machine — invalid transitions rejected
  // =========================================================================

  test.prop([activeStatus, anyStatus], propertyParams())(
    'changeStatus rejects every transition NOT in the transition table',
    (from, to) => {
      fc.pre(!canTransitionTicketTo(from, to));

      const ticket = makeTicket({});
      const reached = advanceToStatus(ticket, from);
      fc.pre(reached);

      const result = ticket.changeStatus(to, 'agent');
      expect(result.isFailure).toBe(true);
    }
  );

  // =========================================================================
  // 4. Terminal status (ARCHIVED) — all changeStatus calls rejected
  // =========================================================================

  it('changeStatus on ARCHIVED (terminal) is always rejected for every target status', () => {
    // Only RESOLVED → ARCHIVED → is reachable. Build that path.
    const ticket = makeTicket({});
    // OPEN → RESOLVED → ARCHIVED
    expect(ticket.changeStatus('RESOLVED', 'agent').isSuccess).toBe(true);
    expect(ticket.changeStatus('ARCHIVED', 'agent').isSuccess).toBe(true);
    expect(ticket.status).toBe('ARCHIVED');

    for (const target of TICKET_STATUSES) {
      const res = ticket.changeStatus(target, 'agent');
      // ARCHIVED has no outgoing transitions — isTerminalStatus is true.
      expect(res.isFailure).toBe(true);
    }
  });

  // =========================================================================
  // 5. changePriority — accepted for non-closed active tickets
  // =========================================================================

  test.prop([nonTerminalNonResolved, anyPriority], propertyParams())(
    'changePriority is accepted for non-terminal ticket statuses',
    (status, priority) => {
      const ticket = makeTicket({});
      const reached = advanceToStatus(ticket, status);
      fc.pre(reached);

      const result = ticket.changePriority(priority, 'agent');
      expect(result.isSuccess).toBe(true);
      expect(ticket.priority).toBe(priority);
    }
  );

  // =========================================================================
  // 6. changePriority — CLOSED correctly rejected (current guard works)
  // =========================================================================

  test.prop([anyPriority], propertyParams())(
    'RACE-PURE-10 (guard works): changePriority on CLOSED ticket is rejected',
    (priority) => {
      const ticket = makeTicket({});
      // OPEN → CLOSED is a valid transition per the state machine.
      expect(ticket.changeStatus('CLOSED', 'agent').isSuccess).toBe(true);

      const result = ticket.changePriority(priority, 'agent');
      expect(result.isFailure).toBe(true);
      expect(result.error.code).toBe('TICKET_ALREADY_CLOSED');
    }
  );

  // =========================================================================
  // 7. RACE-PURE-10 bug: changePriority on ARCHIVED ticket succeeds
  //    (current guard only checks isClosed / status==='CLOSED', not ARCHIVED)
  // =========================================================================

  // BUG(RACE-PURE-10): changePriority only guards isClosed (status==='CLOSED') but
  // ARCHIVED is also a terminal status per TicketConstants.ts:51. An ARCHIVED ticket's
  // priority can be mutated. Fix: use isTerminalStatus(this.props.status) in guard.
  it('RACE-PURE-10 BUG: changePriority on ARCHIVED ticket should fail but currently succeeds', () => {
    const ticket = makeTicket({});
    // Advance to ARCHIVED: OPEN → RESOLVED → ARCHIVED
    ticket.changeStatus('RESOLVED', 'agent');
    ticket.changeStatus('ARCHIVED', 'agent');
    expect(ticket.status).toBe('ARCHIVED');

    // This should fail (ARCHIVED is terminal) but the guard only checks isClosed.
    const result = ticket.changePriority('CRITICAL', 'agent');
    expect(result.isFailure).toBe(true); // BUG: currently returns isSuccess === true
  });

  // =========================================================================
  // 8. SLA pause/resume — single cycle accumulates correctly
  // =========================================================================

  test.prop([posOffsetMs], propertyParams())(
    'single pause/resume cycle: slaPausedDuration equals the pause interval',
    (durationMs) => {
      const ticket = makeTicket({});
      const t0 = new Date(1_700_000_000_000);
      const t1 = new Date(t0.getTime() + durationMs);

      const pauseResult = ticket.pauseSla('waiting for customer', 'agent', t0);
      expect(pauseResult.isSuccess).toBe(true);
      expect(ticket.isSlaPaused).toBe(true);

      const resumeResult = ticket.resumeSla('agent', t1);
      expect(resumeResult.isSuccess).toBe(true);
      expect(ticket.isSlaPaused).toBe(false);
      expect(ticket.slaPausedDuration).toBe(durationMs);
    }
  );

  // =========================================================================
  // 9. RACE-PURE-11: slaPausedDuration is non-negative for monotonic clock
  // =========================================================================

  test.prop([fc.array(posOffsetMs, { minLength: 1, maxLength: 5 })], propertyParams())(
    'RACE-PURE-11 (monotonic): slaPausedDuration is non-negative after any N pause/resume cycles with forward clock',
    (offsets) => {
      const ticket = makeTicket({});
      let t = new Date(1_700_000_000_000);

      for (const offset of offsets) {
        const pauseAt = new Date(t.getTime());
        const pauseResult = ticket.pauseSla('waiting', 'agent', pauseAt);
        if (pauseResult.isFailure) break; // already paused from prior incomplete cycle

        const resumeAt = new Date(pauseAt.getTime() + offset);
        ticket.resumeSla('agent', resumeAt);
        t = resumeAt;

        expect(ticket.slaPausedDuration).toBeGreaterThanOrEqual(0);
      }
    }
  );

  // =========================================================================
  // 10. RACE-PURE-11 bug: resume with now < pausedAt produces negative duration
  //     The domain has no guard — it allows slaPausedDuration to go negative.
  // =========================================================================

  // BUG(RACE-PURE-11): resumeSla computes pausedDuration = now.getTime() - slaPausedAt.getTime()
  // with no guard that now >= slaPausedAt. If a past timestamp is passed, the increment is
  // negative, resulting in slaPausedDuration < 0. Fix: guard pausedDuration >= 0 in resumeSla.
  it('RACE-PURE-11 BUG: resumeSla with now < pausedAt should clamp or reject but currently produces negative duration', () => {
    const ticket = makeTicket({});
    const pauseAt = new Date(1_700_000_000_000);
    const beforePause = new Date(pauseAt.getTime() - 5_000); // 5 seconds before pause

    ticket.pauseSla('waiting', 'agent', pauseAt);
    // Resume with a time BEFORE the pause — clock went backward.
    ticket.resumeSla('agent', beforePause);

    // Should be rejected or clamped to 0, but current implementation allows negative.
    expect(ticket.slaPausedDuration).toBeGreaterThanOrEqual(0); // BUG: currently -5000
  });

  // =========================================================================
  // 11. Multiple pause/resume cycles — cumulative duration is sum of intervals
  // =========================================================================

  test.prop([fc.array(posOffsetMs, { minLength: 2, maxLength: 6 })], propertyParams())(
    'multiple pause/resume cycles: cumulative slaPausedDuration equals sum of all pause intervals',
    (offsets) => {
      const ticket = makeTicket({});
      let t = new Date(1_700_000_000_000);
      let expectedTotal = 0;

      for (const offset of offsets) {
        const pauseAt = new Date(t.getTime());
        ticket.pauseSla('waiting', 'agent', pauseAt);

        const resumeAt = new Date(pauseAt.getTime() + offset);
        ticket.resumeSla('agent', resumeAt);
        t = resumeAt;
        expectedTotal += offset;
      }

      expect(ticket.slaPausedDuration).toBe(expectedTotal);
    }
  );

  // =========================================================================
  // 12. pauseSla on already-paused ticket — rejected (idempotency guard)
  // =========================================================================

  test.prop([posOffsetMs], propertyParams())(
    'pauseSla on an already-paused ticket returns TicketSlaAlreadyPausedError',
    (offset) => {
      const ticket = makeTicket({});
      const t0 = new Date(1_700_000_000_000);
      ticket.pauseSla('reason 1', 'agent', t0);

      const secondPause = ticket.pauseSla('reason 2', 'agent', new Date(t0.getTime() + offset));
      expect(secondPause.isFailure).toBe(true);
      expect(secondPause.error.code).toBe('TICKET_SLA_ALREADY_PAUSED');
    }
  );

  // =========================================================================
  // 13. resumeSla on non-paused ticket — rejected
  // =========================================================================

  it('resumeSla on a non-paused ticket returns TicketSlaNotPausedError', () => {
    const ticket = makeTicket({});
    const result = ticket.resumeSla('agent', new Date());
    expect(result.isFailure).toBe(true);
    expect(result.error.code).toBe('TICKET_SLA_NOT_PAUSED');
  });

  // =========================================================================
  // 14. recordFirstResponse — idempotency guard
  // =========================================================================

  it('recordFirstResponse: second call returns TicketFirstResponseAlreadyRecordedError', () => {
    const ticket = makeTicket({});
    expect(ticket.recordFirstResponse('agent', new Date()).isSuccess).toBe(true);
    const second = ticket.recordFirstResponse('agent', new Date());
    expect(second.isFailure).toBe(true);
    expect(second.error.code).toBe('TICKET_FIRST_RESPONSE_ALREADY_RECORDED');
  });

  // =========================================================================
  // 15. RACE-PURE-M1 bug: assign() on CLOSED ticket succeeds
  //     (guard only checks ARCHIVED, not CLOSED)
  // =========================================================================

  // BUG(RACE-PURE-M1): assign() at Ticket.ts:519-531 guards status === 'ARCHIVED' (throws
  // raw Error) but does NOT guard 'CLOSED'. A CLOSED ticket can be assigned a new agent.
  // Fix: use isTerminalStatus(this.props.status) or add CLOSED to the guard.
  it('RACE-PURE-M1 BUG: assign() on CLOSED ticket should fail but currently succeeds', () => {
    const ticket = makeTicket({});
    // Advance to CLOSED.
    ticket.changeStatus('CLOSED', 'agent');
    expect(ticket.isClosed).toBe(true);

    // assign() should reject terminal tickets, but only rejects ARCHIVED.
    expect(() => ticket.assign('new-agent-id', 'user')).toThrow(); // BUG: it does NOT throw
  });

  // =========================================================================
  // 16. RACE-PURE-M1 bug: assign() on ARCHIVED throws raw Error (not Result)
  //     This documents the inconsistency — all other mutators return Result.
  // =========================================================================

  // BUG(RACE-PURE-M1): assign() throws new Error('Cannot assign an archived ticket')
  // rather than returning Result.fail(new TicketAlreadyClosedError()). All other
  // mutators (changeStatus, changePriority, resolve, close, reopen) return Result<void, DomainError>.
  it('RACE-PURE-M1 BUG: assign() on ARCHIVED throws raw Error instead of returning Result', () => {
    const ticket = makeTicket({});
    ticket.changeStatus('RESOLVED', 'agent');
    ticket.changeStatus('ARCHIVED', 'agent');
    expect(ticket.status).toBe('ARCHIVED');

    // Should return Result.fail(...) uniformly, but instead throws.
    // To "fix" this test once the production code is corrected, check:
    //   const result = ticket.assign('agent', 'user');
    //   expect(result.isFailure).toBe(true);
    expect(() => ticket.assign('agent-id', 'user')).toThrow('Cannot assign an archived ticket');
    // BUG: The above throw should instead be a Result.fail with a DomainError.
  });

  // =========================================================================
  // 17. RACE-PURE-M1 bug: unassign() on ARCHIVED silently succeeds
  // =========================================================================

  // BUG(RACE-PURE-M1): unassign() at Ticket.ts:536-541 has zero status guard.
  // It succeeds even on ARCHIVED and CLOSED tickets. Fix: add isTerminalStatus guard.
  it('RACE-PURE-M1 BUG: unassign() on ARCHIVED ticket should fail but silently succeeds', () => {
    const ticket = makeTicket({});
    ticket.assign('initial-agent', 'user');

    ticket.changeStatus('RESOLVED', 'agent');
    ticket.changeStatus('ARCHIVED', 'agent');
    expect(ticket.status).toBe('ARCHIVED');

    // Should reject terminal ticket but does not.
    expect(() => ticket.unassign('user')).toThrow(); // BUG: it does NOT throw, succeeds silently
  });

  // =========================================================================
  // 18. assign() on active tickets — succeeds and updates assigneeId
  // =========================================================================

  test.prop([nonTerminalNonResolved, uuidString, uuidString], propertyParams())(
    'assign() on active (non-terminal, non-RESOLVED) tickets succeeds',
    (status, agentId, userId) => {
      const ticket = makeTicket({});
      const reached = advanceToStatus(ticket, status);
      fc.pre(reached);

      // assign() has void return — any thrown error means failure.
      expect(() => ticket.assign(agentId, userId)).not.toThrow();
      expect(ticket.assigneeId).toBe(agentId);
    }
  );

  // =========================================================================
  // 19. checkSlaStatus — returns PAUSED when SLA is paused
  // =========================================================================

  it('checkSlaStatus returns PAUSED when SLA has been paused', () => {
    const ticket = makeTicket({});
    ticket.pauseSla('customer waiting', 'agent');
    expect(ticket.checkSlaStatus(new Date())).toBe('PAUSED');
  });

  // =========================================================================
  // 20. checkSlaStatus — returns BREACHED when past response deadline
  // =========================================================================

  it('checkSlaStatus returns BREACHED when past the response deadline and no response recorded', () => {
    const now = new Date(1_700_000_000_000);
    const past = new Date(now.getTime() - 60_000); // 1 minute ago

    const result = Ticket.create({
      subject: 'Urgent issue',
      contactName: 'Bob Jones',
      contactEmail: 'bob@example.com',
      slaPolicyId: 'sla-001',
      tenantId: 'tenant-001',
      slaResponseDue: past,
    });
    expect(result.isSuccess).toBe(true);

    const slaStatus = result.value.checkSlaStatus(now);
    expect(slaStatus).toBe('BREACHED');
  });

  // =========================================================================
  // 21. checkSlaStatus — returns ON_TRACK when deadline is in the future
  //     (and not within the 30-minute AT_RISK window)
  // =========================================================================

  it('checkSlaStatus returns ON_TRACK when deadline is safely in the future', () => {
    const now = new Date(1_700_000_000_000);
    const future = new Date(now.getTime() + 2 * 60 * 60 * 1000); // 2 hours from now

    const result = Ticket.create({
      subject: 'Non-urgent issue',
      contactName: 'Carol White',
      contactEmail: 'carol@example.com',
      slaPolicyId: 'sla-001',
      tenantId: 'tenant-001',
      slaResponseDue: future,
    });
    expect(result.isSuccess).toBe(true);

    const slaStatus = result.value.checkSlaStatus(now);
    expect(slaStatus).toBe('ON_TRACK');
  });

  // =========================================================================
  // 22. checkSlaStatus returns AT_RISK when within 30-minute window
  // =========================================================================

  it('checkSlaStatus returns AT_RISK when within the 30-minute pre-breach window', () => {
    const now = new Date(1_700_000_000_000);
    const nearFuture = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes from now

    const result = Ticket.create({
      subject: 'At-risk issue',
      contactName: 'Dan Brown',
      contactEmail: 'dan@example.com',
      slaPolicyId: 'sla-001',
      tenantId: 'tenant-001',
      slaResponseDue: nearFuture,
    });
    expect(result.isSuccess).toBe(true);

    const slaStatus = result.value.checkSlaStatus(now);
    expect(slaStatus).toBe('AT_RISK');
  });
});
