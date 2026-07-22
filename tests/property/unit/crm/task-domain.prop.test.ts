/**
 * Property tests for the Task aggregate (pure domain — no infrastructure).
 *
 * Property ids: RACE-PURE-09, RACE-PURE-M2
 *
 * RACE-PURE-09: Task.complete() bypasses any IN_PROGRESS requirement;
 *   Task.changeStatus() has no transition table and allows arbitrary status hops.
 *   Business rule: ARCHIVED is only reachable from COMPLETED or CANCELLED via
 *   archive(); changeStatus() must not be a back-door to ARCHIVED.
 *
 * RACE-PURE-M2: Task.assignToLead / assignToContact / assignToOpportunity have
 *   no status guard — completed/cancelled/archived tasks can be re-linked.
 *   Business rule: terminal tasks must not be re-linked to a different CRM entity.
 *
 * Additional properties assert general Task invariants:
 *  - create() always starts in PENDING status
 *  - create() defaults priority to MEDIUM when omitted
 *  - complete() on a fresh task succeeds (no IN_PROGRESS requirement enforced today —
 *    documented as known gap per RACE-PURE-09)
 *  - cancel() is idempotent in the sense that a second cancel is rejected
 *  - complete() on a cancelled task is rejected
 *  - assignTo() is idempotent when assignee unchanged
 *  - entity linkage is mutually exclusive (assignToLead clears contactId/opportunityId)
 *  - toJSON() snapshot reflects the aggregate's current state
 *  - reconstitute() preserves every prop
 *  - updatedAt advances (or stays the same timestamp) after mutating commands
 *
 * @see docs/operations/property-testing/race-condition-findings.json
 */

import { describe, expect } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  Task,
  TaskAlreadyCompletedError,
  TaskAlreadyCancelledError,
  TaskCannotBeArchivedError,
  TaskId,
  TASK_STATUSES,
  TASK_PRIORITIES,
  VALID_TASK_TRANSITIONS,
  canTransitionTaskTo,
} from '@intelliflow/domain';
import { propertyParams } from '../../support';

// ---------------------------------------------------------------------------
// Inline bounded arbitraries (do NOT edit support/arbitraries)
// ---------------------------------------------------------------------------

/** Non-empty title that does not get trimmed to empty. */
const arbTitle = fc.string({ minLength: 1, maxLength: 80 });

/** A "user ID" — we just need a non-empty opaque string. */
const arbUserId = fc.string({ minLength: 1, maxLength: 36 });

/** A "tenant ID" — same shape as user IDs for our purposes. */
const arbTenantId = fc.string({ minLength: 1, maxLength: 36 });

/** One of the four valid priorities. */
const arbPriority = fc.constantFrom(...TASK_PRIORITIES);

/** One of the five valid statuses. */
const arbStatus = fc.constantFrom(...TASK_STATUSES);

/** A non-empty entity ID string (lead / contact / opportunity). */
const arbEntityId = fc.string({ minLength: 1, maxLength: 36 });

/** Optional description. */
const arbDescription = fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: undefined });

/** Minimal valid CreateTaskProps. */
const arbCreateProps = fc.record({
  title: arbTitle,
  description: arbDescription,
  priority: fc.option(arbPriority, { nil: undefined }),
  ownerId: arbUserId,
  tenantId: arbTenantId,
});

// Helper: build a fresh Task from arbitrary props (always succeeds).
function makeTask(props: {
  title: string;
  description?: string;
  priority?: (typeof TASK_PRIORITIES)[number];
  ownerId: string;
  tenantId: string;
}): Task {
  const result = Task.create(props);
  // Task.create never fails (no validation on title/ownerId in domain).
  return result.value;
}

// ---------------------------------------------------------------------------
// 1. Creation invariants
// ---------------------------------------------------------------------------

describe('Task.create — creation invariants (RACE-PURE-09 / RACE-PURE-M2)', () => {
  test.prop([arbCreateProps], propertyParams())(
    'new task always starts in PENDING status',
    (props) => {
      const task = makeTask(props);
      expect(task.status).toBe('PENDING');
    }
  );

  test.prop([arbCreateProps], propertyParams())(
    'new task uses MEDIUM as default priority when none supplied',
    (props) => {
      const noP = { ...props, priority: undefined };
      const task = makeTask(noP);
      expect(task.priority).toBe('MEDIUM');
    }
  );

  test.prop([arbCreateProps, arbPriority], propertyParams())(
    'new task stores the supplied priority verbatim',
    (props, priority) => {
      const task = makeTask({ ...props, priority });
      expect(task.priority).toBe(priority);
    }
  );

  test.prop([arbCreateProps], propertyParams())(
    'new task emits exactly one TaskCreatedEvent',
    (props) => {
      const task = makeTask(props);
      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('task.created');
    }
  );

  test.prop([arbCreateProps], propertyParams())(
    'new task is neither completed, cancelled, nor archived',
    (props) => {
      const task = makeTask(props);
      expect(task.isCompleted).toBe(false);
      expect(task.isCancelled).toBe(false);
      expect(task.isArchived).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 2. Status state-machine: VALID_TASK_TRANSITIONS table
// ---------------------------------------------------------------------------

describe('Task status state-machine invariants', () => {
  test.prop([arbCreateProps], propertyParams())(
    'canTransitionTaskTo is consistent with VALID_TASK_TRANSITIONS record',
    (props) => {
      for (const from of TASK_STATUSES) {
        for (const to of TASK_STATUSES) {
          const expected = VALID_TASK_TRANSITIONS[from].includes(to);
          expect(canTransitionTaskTo(from, to)).toBe(expected);
        }
      }
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'complete() always succeeds on a fresh PENDING task',
    (props, user) => {
      // NOTE: RACE-PURE-09 identifies this as a domain gap — complete() bypasses
      // IN_PROGRESS. This property documents the CURRENT behaviour (succeeds),
      // not the desired behaviour. The skip below covers the stricter invariant.
      const task = makeTask(props);
      const result = task.complete(user);
      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('COMPLETED');
      expect(task.completedAt).toBeInstanceOf(Date);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'complete() on an already-COMPLETED task is rejected with TaskAlreadyCompletedError',
    (props, user) => {
      const task = makeTask(props);
      task.complete(user);
      const result = task.complete(user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'cancel() on an already-CANCELLED task is rejected with TaskAlreadyCancelledError',
    (props, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      const result = task.cancel('again', user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCancelledError);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'complete() on a CANCELLED task is rejected',
    (props, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      const result = task.complete(user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCancelledError);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'cancel() on a COMPLETED task is rejected',
    (props, user) => {
      const task = makeTask(props);
      task.complete(user);
      const result = task.cancel('too late', user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'archive() succeeds on a COMPLETED task',
    (props, user) => {
      const task = makeTask(props);
      task.complete(user);
      task.clearDomainEvents();
      const result = task.archive(user);
      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('ARCHIVED');
      expect(task.isArchived).toBe(true);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'archive() succeeds on a CANCELLED task',
    (props, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      task.clearDomainEvents();
      const result = task.archive(user);
      expect(result.isSuccess).toBe(true);
      expect(task.status).toBe('ARCHIVED');
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'archive() on a fresh PENDING task is rejected with TaskCannotBeArchivedError',
    (props, user) => {
      const task = makeTask(props);
      const result = task.archive(user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskCannotBeArchivedError);
      expect(result.error.code).toBe('TASK_CANNOT_BE_ARCHIVED');
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'archive() on an IN_PROGRESS task is rejected',
    (props, user) => {
      const task = makeTask(props);
      task.start(user);
      const result = task.archive(user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskCannotBeArchivedError);
    }
  );

  // BUG(RACE-PURE-09): changeStatus('ARCHIVED', user) on an IN_PROGRESS task
  // succeeds — it bypasses the archive() guard which requires COMPLETED or
  // CANCELLED. The state-machine table (VALID_TASK_TRANSITIONS) says ARCHIVED
  // is not reachable from IN_PROGRESS, but changeStatus() does not consult the
  // table — it only checks isCompleted/isCancelled.
  // DEFERRED (ENG-OPS-002.R10): enforcing VALID_TASK_TRANSITIONS in changeStatus/complete tightens the
  // contract (breaks the 'complete on PENDING succeeds' property + needs service-caller verification) — tracked separately from the terminal-guard fixes.
  test.skip('RACE-PURE-09: changeStatus("ARCHIVED", user) on IN_PROGRESS task must be rejected (transition table not consulted)', () => {
    const task = Task.create({ title: 'test', ownerId: 'u1', tenantId: 't1' }).value;
    task.start('u1');
    const result = task.changeStatus('ARCHIVED', 'u1');
    // This SHOULD fail — ARCHIVED is not in VALID_TASK_TRANSITIONS.IN_PROGRESS.
    expect(result.isFailure).toBe(true);
  });

  // BUG(RACE-PURE-09): Task.complete() does not require IN_PROGRESS — a PENDING
  // task can be completed directly, bypassing the intent that work must start
  // before it ends.  The business rule is noted in race-condition-findings.json.
  // The property above documents this succeeds today; the skip below documents
  // what the stricter rule SHOULD enforce.
  test.skip('RACE-PURE-09: complete() on a PENDING task (not started) must be rejected per intended state machine', () => {
    const task = Task.create({ title: 'test', ownerId: 'u1', tenantId: 't1' }).value;
    const result = task.complete('u1');
    // Should fail — PENDING → COMPLETED is not in VALID_TASK_TRANSITIONS.
    expect(result.isFailure).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. RACE-PURE-M2: entity linkage must be guarded on terminal tasks
// ---------------------------------------------------------------------------

describe('RACE-PURE-M2 — entity linkage guards on terminal tasks', () => {
  // BUG(RACE-PURE-M2): assignToLead/assignToContact/assignToOpportunity have no
  // status guard. Completed, cancelled, and archived tasks can have their CRM
  // entity linkage changed without restriction.  The three skip blocks below
  // document the broken invariants.

  test('RACE-PURE-M2: assignToLead() on a COMPLETED task must be rejected', () => {
    const task = Task.create({ title: 't', ownerId: 'u', tenantId: 'T' }).value;
    task.complete('u');
    // Currently succeeds — no status guard.
    expect(() => task.assignToLead('lead-new', 'u')).toThrow();
  });

  test('RACE-PURE-M2: assignToContact() on a CANCELLED task must be rejected', () => {
    const task = Task.create({ title: 't', ownerId: 'u', tenantId: 'T' }).value;
    task.cancel('reason', 'u');
    expect(() => task.assignToContact('contact-new', 'u')).toThrow();
  });

  test('RACE-PURE-M2: assignToOpportunity() on an ARCHIVED task must be rejected', () => {
    const task = Task.create({ title: 't', ownerId: 'u', tenantId: 'T' }).value;
    task.complete('u');
    task.archive('u');
    expect(() => task.assignToOpportunity('opp-new', 'u')).toThrow();
  });

  // RACE-PURE-M2 is now FIXED (ENG-OPS-002.R10): assignTo* rejects terminal tasks.
  // The three "current broken behaviour" companion properties that documented the
  // pre-fix behaviour (linkage succeeding on terminal tasks) were removed — the
  // three un-skipped tests above now assert the correct (throwing) behaviour.
});

// ---------------------------------------------------------------------------
// 4. Entity linkage mutual exclusivity
// ---------------------------------------------------------------------------

describe('Task entity linkage — mutual exclusivity', () => {
  test.prop([arbCreateProps, arbEntityId, arbUserId], propertyParams())(
    'assignToLead clears contactId and opportunityId',
    (props, entityId, user) => {
      const task = makeTask(props);
      task.assignToContact('contact-prev', user);
      task.assignToOpportunity('opp-prev', user);
      task.assignToLead(entityId, user);
      expect(task.leadId).toBe(entityId);
      expect(task.contactId).toBeUndefined();
      expect(task.opportunityId).toBeUndefined();
    }
  );

  test.prop([arbCreateProps, arbEntityId, arbUserId], propertyParams())(
    'assignToContact clears leadId and opportunityId',
    (props, entityId, user) => {
      const task = makeTask(props);
      task.assignToLead('lead-prev', user);
      task.assignToOpportunity('opp-prev', user);
      task.assignToContact(entityId, user);
      expect(task.contactId).toBe(entityId);
      expect(task.leadId).toBeUndefined();
      expect(task.opportunityId).toBeUndefined();
    }
  );

  test.prop([arbCreateProps, arbEntityId, arbUserId], propertyParams())(
    'assignToOpportunity clears leadId and contactId',
    (props, entityId, user) => {
      const task = makeTask(props);
      task.assignToLead('lead-prev', user);
      task.assignToContact('contact-prev', user);
      task.assignToOpportunity(entityId, user);
      expect(task.opportunityId).toBe(entityId);
      expect(task.leadId).toBeUndefined();
      expect(task.contactId).toBeUndefined();
    }
  );
});

// ---------------------------------------------------------------------------
// 5. User assignment idempotency
// ---------------------------------------------------------------------------

describe('Task.assignTo — user assignment idempotency', () => {
  test.prop([arbCreateProps, arbUserId, arbUserId], propertyParams())(
    'assignTo is idempotent: re-assigning same assigneeId emits no additional event',
    (props, actor, assignee) => {
      const task = makeTask(props);
      task.assignTo(assignee, actor);
      task.clearDomainEvents();
      task.assignTo(assignee, actor);
      expect(task.getDomainEvents()).toHaveLength(0);
    }
  );

  test.prop([arbCreateProps, arbUserId, arbUserId], propertyParams())(
    'assignTo with a different assignee emits exactly one TaskAssignedEvent',
    (props, actor, assignee) => {
      fc.pre(actor !== assignee);
      const task = makeTask(props);
      task.assignTo(assignee, actor);
      task.clearDomainEvents();
      task.assignTo(actor, assignee); // swap — different
      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('task.assigned');
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'assignTo(null) unassigns and records previousAssigneeId',
    (props, actor) => {
      const task = makeTask(props);
      task.assignTo(actor, actor);
      task.clearDomainEvents();
      task.assignTo(null, actor);
      expect(task.assigneeId).toBeNull();
      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      const ev = events[0] as unknown as {
        assigneeId: string | null;
        previousAssigneeId: string | null;
      };
      expect(ev.previousAssigneeId).toBe(actor);
      expect(ev.assigneeId).toBeNull();
    }
  );
});

// ---------------------------------------------------------------------------
// 6. Priority and due-date mutations on terminal states
// ---------------------------------------------------------------------------

describe('Mutation guards on terminal tasks', () => {
  test.prop([arbCreateProps, arbPriority, arbUserId], propertyParams())(
    'changePriority is rejected on a COMPLETED task',
    (props, priority, user) => {
      const task = makeTask(props);
      task.complete(user);
      const result = task.changePriority(priority, user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    }
  );

  test.prop([arbCreateProps, arbPriority, arbUserId], propertyParams())(
    'changePriority is rejected on a CANCELLED task',
    (props, priority, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      const result = task.changePriority(priority, user);
      expect(result.isFailure).toBe(true);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'updateDueDate is rejected on a COMPLETED task',
    (props, user) => {
      const task = makeTask(props);
      task.complete(user);
      const result = task.updateDueDate(new Date(), user);
      expect(result.isFailure).toBe(true);
      expect(result.error).toBeInstanceOf(TaskAlreadyCompletedError);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'updateDueDate is rejected on a CANCELLED task',
    (props, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      const result = task.updateDueDate(new Date(), user);
      expect(result.isFailure).toBe(true);
    }
  );
});

// ---------------------------------------------------------------------------
// 7. Serialisation (toJSON) consistency
// ---------------------------------------------------------------------------

describe('Task.toJSON — serialisation consistency', () => {
  test.prop([arbCreateProps], propertyParams())(
    'toJSON always includes id, title, status, priority, ownerId, createdAt, updatedAt',
    (props) => {
      const task = makeTask(props);
      const json = task.toJSON();
      expect(typeof json.id).toBe('string');
      expect(json.title).toBe(task.title);
      expect(json.status).toBe(task.status);
      expect(json.priority).toBe(task.priority);
      expect(json.ownerId).toBe(task.ownerId);
      expect(typeof json.createdAt).toBe('string');
      expect(typeof json.updatedAt).toBe('string');
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'toJSON reflects COMPLETED status and sets completedAt after complete()',
    (props, user) => {
      const task = makeTask(props);
      task.complete(user);
      const json = task.toJSON();
      expect(json.status).toBe('COMPLETED');
      expect(typeof json.completedAt).toBe('string');
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'toJSON reflects CANCELLED status after cancel()',
    (props, user) => {
      const task = makeTask(props);
      task.cancel('reason', user);
      const json = task.toJSON();
      expect(json.status).toBe('CANCELLED');
    }
  );

  test.prop([arbCreateProps], propertyParams())(
    'toJSON isOverdue is false for tasks without a dueDate',
    (props) => {
      const noDueDate = { ...props, dueDate: undefined };
      const task = Task.create(noDueDate).value;
      const json = task.toJSON();
      expect(json.isOverdue).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 8. Reconstitute preserves props
// ---------------------------------------------------------------------------

describe('Task.reconstitute — round-trip preservation', () => {
  test.prop([arbTitle, arbUserId, arbPriority, arbStatus, arbTenantId], propertyParams())(
    'reconstitute preserves title, priority, status, ownerId, tenantId',
    (title, ownerId, priority, status, tenantId) => {
      const id = TaskId.generate();
      const now = new Date();
      const task = Task.reconstitute(id, {
        title,
        priority,
        status,
        ownerId,
        tenantId,
        createdAt: now,
        updatedAt: now,
      });
      expect(task.id).toBe(id);
      expect(task.title).toBe(title);
      expect(task.priority).toBe(priority);
      expect(task.status).toBe(status);
      expect(task.ownerId).toBe(ownerId);
      expect(task.tenantId).toBe(tenantId);
    }
  );

  test.prop([arbTitle, arbUserId, arbTenantId], propertyParams())(
    'reconstituted COMPLETED task reports isCompleted=true and has completedAt',
    (title, ownerId, tenantId) => {
      const id = TaskId.generate();
      const now = new Date();
      const completedAt = new Date();
      const task = Task.reconstitute(id, {
        title,
        priority: 'MEDIUM',
        status: 'COMPLETED',
        ownerId,
        tenantId,
        createdAt: now,
        updatedAt: now,
        completedAt,
      });
      expect(task.isCompleted).toBe(true);
      expect(task.completedAt).toBe(completedAt);
    }
  );

  test.prop([arbTitle, arbUserId, arbTenantId], propertyParams())(
    'reconstituted ARCHIVED task reports isArchived=true and isOverdue=false',
    (title, ownerId, tenantId) => {
      const id = TaskId.generate();
      const past = new Date(Date.now() - 86400_000); // yesterday
      const task = Task.reconstitute(id, {
        title,
        priority: 'LOW',
        status: 'ARCHIVED',
        dueDate: past, // past due but archived — must not be overdue
        ownerId,
        tenantId,
        createdAt: past,
        updatedAt: new Date(),
      });
      expect(task.isArchived).toBe(true);
      expect(task.isOverdue).toBe(false);
    }
  );
});

// ---------------------------------------------------------------------------
// 9. updateTaskInfo selective update
// ---------------------------------------------------------------------------

describe('Task.updateTaskInfo — selective field updates', () => {
  test.prop([arbCreateProps, arbTitle], propertyParams())(
    'updating title preserves description and emits task.updated',
    (props, newTitle) => {
      const task = makeTask({ ...props, description: 'original-desc' });
      task.clearDomainEvents();
      task.updateTaskInfo({ title: newTitle });
      expect(task.title).toBe(newTitle);
      expect(task.description).toBe('original-desc');
      const events = task.getDomainEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('task.updated');
    }
  );

  test.prop([arbCreateProps], propertyParams())(
    'calling updateTaskInfo with no changes emits no event',
    (props) => {
      const task = makeTask(props);
      task.clearDomainEvents();
      task.updateTaskInfo({});
      expect(task.getDomainEvents()).toHaveLength(0);
    }
  );
});

// ---------------------------------------------------------------------------
// 10. updatedAt advances after mutations
// ---------------------------------------------------------------------------

describe('Task updatedAt — advances after mutations', () => {
  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'updatedAt after start() is >= createdAt',
    (props, user) => {
      const task = makeTask(props);
      const createdAt = task.createdAt.getTime();
      task.start(user);
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'updatedAt after complete() is >= createdAt',
    (props, user) => {
      const task = makeTask(props);
      const createdAt = task.createdAt.getTime();
      task.complete(user);
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt);
    }
  );

  test.prop([arbCreateProps, arbUserId], propertyParams())(
    'updatedAt after cancel() is >= createdAt',
    (props, user) => {
      const task = makeTask(props);
      const createdAt = task.createdAt.getTime();
      task.cancel('reason', user);
      expect(task.updatedAt.getTime()).toBeGreaterThanOrEqual(createdAt);
    }
  );
});
