/**
 * PrismaAgentActionStore Tests
 *
 * IFC-139: Tests for Prisma-backed action store
 *
 * Validates:
 * - PendingActionsStore API: add, get (with auto-expire), update, delete,
 *   findByUser, findBySession, findPending, expireOld
 * - ExecutedActionsStore API: addExecuted, getExecuted, findByRollbackToken,
 *   disableRollback, findAllExecuted
 * - Field mapping roundtrip: PendingAction → AgentAction Prisma row
 * - Reverse mapping: AgentAction Prisma row → PendingAction
 * - Status mapping: PENDING↔PENDING_APPROVAL, APPROVED, REJECTED, EXPIRED
 * - impactToConfidence and confidenceToImpact roundtrip
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { mockDeep, mockReset, type DeepMockProxy } from 'vitest-mock-extended';
import type { PrismaClient } from '@intelliflow/db';
import { PrismaAgentActionStore } from '../prisma-action-store';
import type { PendingAction, ExecutedAction } from '../types';

// ── Constants ────────────────────────────────────────────────

const TENANT_ID = 'tenant-test-001';
const ACTION_ID = 'action-001';
const USER_ID = 'user-001';
const SESSION_ID = 'session-001';

// ── Mock helpers ─────────────────────────────────────────────

/**
 * Builds a realistic PendingAction fixture.
 */
function makePendingAction(overrides: Partial<PendingAction> = {}): PendingAction {
  const now = new Date('2026-01-15T10:00:00.000Z');
  return {
    id: ACTION_ID,
    toolName: 'create_case',
    actionType: 'CREATE',
    entityType: 'CASE',
    input: {
      entityId: 'client-001',
      title: 'Test Case',
      clientId: 'client-001',
      priority: 'MEDIUM',
    },
    preview: {
      summary: 'Create new case: "Test Case"',
      changes: [
        { field: 'title', previousValue: null, newValue: 'Test Case', changeType: 'ADD' },
        { field: 'clientId', previousValue: null, newValue: 'client-001', changeType: 'ADD' },
      ],
      affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Test Case', action: 'CREATE' }],
      warnings: ['Review before submitting'],
      estimatedImpact: 'MEDIUM',
    },
    status: 'PENDING',
    createdAt: now,
    expiresAt: new Date(now.getTime() + 30 * 60 * 1000),
    createdBy: USER_ID,
    agentSessionId: SESSION_ID,
    metadata: { source: 'crm-agent', version: '1.0' },
    ...overrides,
  };
}

/**
 * Builds a minimal AgentAction DB row (as returned by Prisma findUnique).
 * All required fields are included; optional ones default to null.
 * expiresAt defaults to 30 minutes from NOW (not a fixed past date) so
 * tests that don't override it don't accidentally trigger auto-expire.
 */
function makeAgentActionRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date('2026-01-15T10:00:00.000Z');
  return {
    id: ACTION_ID,
    actionType: 'create_case',
    description: 'Create new case: "Test Case"',
    aiReasoning: JSON.stringify({ source: 'crm-agent', version: '1.0' }),
    confidenceScore: 60, // MEDIUM → 60
    status: 'PENDING_APPROVAL',
    entityId: 'client-001',
    entityType: 'case',
    entityName: 'Test Case',
    previousState: {
      entityId: 'client-001',
      title: 'Test Case',
      clientId: 'client-001',
      priority: 'MEDIUM',
    },
    proposedState: {
      summary: 'Create new case: "Test Case"',
      changes: [
        { field: 'title', previousValue: null, newValue: 'Test Case', changeType: 'ADD' },
        { field: 'clientId', previousValue: null, newValue: 'client-001', changeType: 'ADD' },
      ],
      affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Test Case', action: 'CREATE' }],
      warnings: ['Review before submitting'],
      estimatedImpact: 'MEDIUM',
    },
    agentId: USER_ID,
    agentName: SESSION_ID,
    // Always use a future expiry by default so tests don't unintentionally trigger auto-expire
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    tenantId: TENANT_ID,
    createdAt: now,
    updatedAt: now,
    reviewedAt: null,
    reviewedBy: null,
    feedback: null,
    ...overrides,
  };
}

// ── Test setup ───────────────────────────────────────────────

let prismaMock: DeepMockProxy<PrismaClient>;
let store: PrismaAgentActionStore;

beforeEach(() => {
  prismaMock = mockDeep<PrismaClient>();
  mockReset(prismaMock);
  store = new PrismaAgentActionStore(prismaMock, TENANT_ID);
});

// ════════════════════════════════════════════════════════════
// Section A: PendingActionsStore — add
// ════════════════════════════════════════════════════════════

describe('add()', () => {
  it('A1: calls prisma.agentAction.create with correctly mapped fields', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction();
    await store.add(action);

    expect(prismaMock.agentAction.create).toHaveBeenCalledOnce();
    const callArgs = (prismaMock.agentAction.create as any).mock.calls[0][0];
    expect(callArgs.data.id).toBe(ACTION_ID);
    expect(callArgs.data.actionType).toBe('create_case'); // toolName → actionType
    expect(callArgs.data.description).toBe('Create new case: "Test Case"'); // preview.summary
    expect(callArgs.data.entityType).toBe('case'); // lowercased
    expect(callArgs.data.agentId).toBe(USER_ID); // createdBy → agentId
    expect(callArgs.data.agentName).toBe(SESSION_ID); // agentSessionId → agentName
    expect(callArgs.data.status).toBe('PENDING_APPROVAL'); // PENDING → PENDING_APPROVAL
    expect(callArgs.data.tenantId).toBe(TENANT_ID);
  });

  it('A2: maps MEDIUM estimatedImpact to confidenceScore 60', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({
      preview: { ...makePendingAction().preview, estimatedImpact: 'MEDIUM' },
    });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.confidenceScore).toBe(60);
  });

  it('A3: maps LOW estimatedImpact to confidenceScore 30', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({
      preview: { ...makePendingAction().preview, estimatedImpact: 'LOW' },
    });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.confidenceScore).toBe(30);
  });

  it('A4: maps HIGH estimatedImpact to confidenceScore 90', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({
      preview: { ...makePendingAction().preview, estimatedImpact: 'HIGH' },
    });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.confidenceScore).toBe(90);
  });

  it('A5: maps undefined estimatedImpact to confidenceScore 50', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const preview = { ...makePendingAction().preview };
    delete preview.estimatedImpact;
    const action = makePendingAction({ preview });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.confidenceScore).toBe(50);
  });

  it('A6: stores input as previousState and preview as proposedState', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction();
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.previousState).toEqual(action.input);
    expect(data.proposedState).toEqual(action.preview);
  });

  it('A7: stores metadata as JSON string in aiReasoning', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({ metadata: { source: 'crm-agent', version: '1.0' } });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.aiReasoning).toBe(JSON.stringify({ source: 'crm-agent', version: '1.0' }));
  });

  it('A8: uses entityId from input when present, falls back to action id', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({ input: { entityId: 'entity-xyz', title: 'Test' } });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.entityId).toBe('entity-xyz');
  });

  it('A9: falls back to action.id when input.entityId is missing', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({ input: { title: 'Test' } }); // no entityId
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.entityId).toBe(ACTION_ID);
  });

  it('A10: uses first affectedEntity name as entityName', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction();
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.entityName).toBe('Test Case'); // first affectedEntity.name
  });

  it('A11: falls back to entityType when affectedEntities is empty', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const action = makePendingAction({
      preview: { ...makePendingAction().preview, affectedEntities: [] },
    });
    await store.add(action);

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.entityName).toBe('CASE'); // entityType fallback
  });
});

// ════════════════════════════════════════════════════════════
// Section B: PendingActionsStore — get (with auto-expire)
// ════════════════════════════════════════════════════════════

describe('get()', () => {
  it('B1: returns undefined when row not found', async () => {
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(null);

    const result = await store.get('nonexistent');
    expect(result).toBeUndefined();
  });

  it('B2: maps AgentAction row to PendingAction correctly', async () => {
    const row = makeAgentActionRow();
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result).toBeDefined();
    expect(result!.id).toBe(ACTION_ID);
    expect(result!.toolName).toBe('create_case'); // actionType → toolName
    expect(result!.entityType).toBe('CASE'); // uppercased
    expect(result!.createdBy).toBe(USER_ID); // agentId → createdBy
    expect(result!.agentSessionId).toBe(SESSION_ID); // agentName → agentSessionId
    expect(result!.status).toBe('PENDING'); // PENDING_APPROVAL → PENDING
  });

  it('B3: maps preview fields from proposedState', async () => {
    const row = makeAgentActionRow();
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result!.preview.summary).toBe('Create new case: "Test Case"'); // from description
    expect(result!.preview.estimatedImpact).toBe('MEDIUM'); // confidenceScore 60 → MEDIUM
    expect(result!.preview.changes).toHaveLength(2);
    expect(result!.preview.affectedEntities).toHaveLength(1);
    expect(result!.preview.warnings).toContain('Review before submitting');
  });

  it('B4: maps input from previousState', async () => {
    const row = makeAgentActionRow();
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result!.input).toEqual({
      entityId: 'client-001',
      title: 'Test Case',
      clientId: 'client-001',
      priority: 'MEDIUM',
    });
  });

  it('B5: parses aiReasoning JSON into metadata', async () => {
    const row = makeAgentActionRow({ aiReasoning: JSON.stringify({ foo: 'bar' }) });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result!.metadata).toEqual({ foo: 'bar' });
  });

  it('B6: returns metadata as { raw: str } when aiReasoning is invalid JSON', async () => {
    const row = makeAgentActionRow({ aiReasoning: 'not-valid-json' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result!.metadata).toEqual({ raw: 'not-valid-json' });
  });

  it('B7: auto-expires PENDING action when expiresAt is in the past', async () => {
    const past = new Date(Date.now() - 5000);
    const row = makeAgentActionRow({ expiresAt: past });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const result = await store.get(ACTION_ID);

    expect(result!.status).toBe('EXPIRED');
    // update should have been called to persist the EXPIRED status
    expect(prismaMock.agentAction.update).toHaveBeenCalledOnce();
    const updateArgs = (prismaMock.agentAction.update as any).mock.calls[0][0];
    expect(updateArgs.data.status).toBe('EXPIRED');
  });

  it('B8: does not auto-expire non-PENDING status even if past expiresAt', async () => {
    const past = new Date(Date.now() - 5000);
    const row = makeAgentActionRow({ status: 'APPROVED', expiresAt: past });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    await store.get(ACTION_ID);

    // update should NOT have been called because status is APPROVED, not PENDING
    expect(prismaMock.agentAction.update).not.toHaveBeenCalled();
  });

  it('B9: does not auto-expire when expiresAt is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const row = makeAgentActionRow({ expiresAt: future });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);

    expect(result!.status).toBe('PENDING');
    expect(prismaMock.agentAction.update).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════
// Section C: PendingActionsStore — update
// ════════════════════════════════════════════════════════════

describe('update()', () => {
  it('C1: calls prisma.agentAction.update with correct where and data', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const action = makePendingAction({ status: 'APPROVED' });
    await store.update(action);

    expect(prismaMock.agentAction.update).toHaveBeenCalledOnce();
    const args = (prismaMock.agentAction.update as any).mock.calls[0][0];
    expect(args.where.id).toBe(ACTION_ID);
    expect(args.data.status).toBe('APPROVED');
  });

  it('C2: sets reviewedAt when status is APPROVED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const action = makePendingAction({ status: 'APPROVED' });
    await store.update(action);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
  });

  it('C3: sets reviewedAt when status is REJECTED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const action = makePendingAction({ status: 'REJECTED' });
    await store.update(action);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
  });

  it('C4: does not set reviewedAt when status is PENDING', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const action = makePendingAction({ status: 'PENDING' });
    await store.update(action);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedAt).toBeUndefined();
  });

  it('C5: does not set reviewedAt when status is EXPIRED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const action = makePendingAction({ status: 'EXPIRED' });
    await store.update(action);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedAt).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// Section D: PendingActionsStore — delete
// ════════════════════════════════════════════════════════════

describe('delete()', () => {
  it('D1: returns true when delete succeeds', async () => {
    (prismaMock.agentAction.delete as any).mockResolvedValue({ id: ACTION_ID });

    const result = await store.delete(ACTION_ID);
    expect(result).toBe(true);
    expect(prismaMock.agentAction.delete).toHaveBeenCalledWith({ where: { id: ACTION_ID } });
  });

  it('D2: returns false when delete throws (record not found)', async () => {
    (prismaMock.agentAction.delete as any).mockRejectedValue(new Error('Record not found'));

    const result = await store.delete('nonexistent');
    expect(result).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Section E: PendingActionsStore — findByUser, findBySession, findPending
// ════════════════════════════════════════════════════════════

describe('findByUser()', () => {
  it('E1: queries by agentId with PENDING_APPROVAL status and tenantId', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([makeAgentActionRow()]);

    const results = await store.findByUser(USER_ID);

    expect(results).toHaveLength(1);
    expect(results[0].createdBy).toBe(USER_ID);
    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.agentId).toBe(USER_ID);
    expect(args.where.status).toBe('PENDING_APPROVAL');
    expect(args.where.tenantId).toBe(TENANT_ID);
    expect(args.where.expiresAt).toEqual({ gt: expect.any(Date) });
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('E2: returns empty array when no rows found', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const results = await store.findByUser('no-such-user');
    expect(results).toHaveLength(0);
  });

  it('E3: maps multiple rows to PendingActions', async () => {
    const row1 = makeAgentActionRow({ id: 'action-1' });
    const row2 = makeAgentActionRow({ id: 'action-2' });
    (prismaMock.agentAction.findMany as any).mockResolvedValue([row1, row2]);

    const results = await store.findByUser(USER_ID);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('action-1');
    expect(results[1].id).toBe('action-2');
  });
});

describe('findBySession()', () => {
  it('E4: queries by agentName with PENDING_APPROVAL status and tenantId', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([makeAgentActionRow()]);

    const results = await store.findBySession(SESSION_ID);

    expect(results).toHaveLength(1);
    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.agentName).toBe(SESSION_ID);
    expect(args.where.status).toBe('PENDING_APPROVAL');
    expect(args.where.tenantId).toBe(TENANT_ID);
    expect(args.where.expiresAt).toEqual({ gt: expect.any(Date) });
  });

  it('E5: returns empty array when session has no actions', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const results = await store.findBySession('empty-session');
    expect(results).toHaveLength(0);
  });
});

describe('findPending()', () => {
  it('E6: queries with PENDING_APPROVAL status and tenantId only', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([makeAgentActionRow()]);

    const results = await store.findPending();

    expect(results).toHaveLength(1);
    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.status).toBe('PENDING_APPROVAL');
    expect(args.where.tenantId).toBe(TENANT_ID);
    expect(args.where.expiresAt).toEqual({ gt: expect.any(Date) });
    expect(args.where.agentId).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// Section F: PendingActionsStore — expireOld
// ════════════════════════════════════════════════════════════

describe('expireOld()', () => {
  it('F1: calls updateMany with correct filter and returns count', async () => {
    (prismaMock.agentAction.updateMany as any).mockResolvedValue({ count: 3 });

    const count = await store.expireOld();

    expect(count).toBe(3);
    const args = (prismaMock.agentAction.updateMany as any).mock.calls[0][0];
    expect(args.where.status).toBe('PENDING_APPROVAL');
    expect(args.where.tenantId).toBe(TENANT_ID);
    expect(args.where.expiresAt).toEqual({ lt: expect.any(Date) });
    expect(args.data.status).toBe('EXPIRED');
  });

  it('F2: returns 0 when no rows expired', async () => {
    (prismaMock.agentAction.updateMany as any).mockResolvedValue({ count: 0 });

    const count = await store.expireOld();
    expect(count).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════
// Section G: ExecutedActionsStore — addExecuted
// ════════════════════════════════════════════════════════════

describe('addExecuted()', () => {
  it('G1: calls prisma.agentAction.update with APPROVED status', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const executed: ExecutedAction = {
      ...makePendingAction({ status: 'APPROVED' }),
      executedAt: new Date('2026-01-15T10:05:00.000Z'),
      executionResult: { id: 'case-new-001' },
      executionError: undefined,
      rollbackAvailable: true,
      rollbackToken: 'rollback-token-abc',
      approval: {
        actionId: ACTION_ID,
        decision: 'APPROVE',
        decidedBy: 'manager-001',
        decidedAt: new Date('2026-01-15T10:04:00.000Z'),
        reason: 'Looks good',
      },
    };

    await store.addExecuted(executed);

    expect(prismaMock.agentAction.update).toHaveBeenCalledOnce();
    const args = (prismaMock.agentAction.update as any).mock.calls[0][0];
    expect(args.where.id).toBe(ACTION_ID);
    expect(args.data.status).toBe('APPROVED');
  });

  it('G2: stores reviewedBy from approval.decidedBy', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const executed: ExecutedAction = {
      ...makePendingAction({ status: 'APPROVED' }),
      executedAt: new Date(),
      executionResult: {},
      rollbackAvailable: false,
      approval: {
        actionId: ACTION_ID,
        decision: 'APPROVE',
        decidedBy: 'manager-001',
        decidedAt: new Date(),
      },
    };

    await store.addExecuted(executed);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedBy).toBe('manager-001');
    expect(data.feedback).toBe(undefined);
  });

  it('G3: stores feedback from approval.reason', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const executed: ExecutedAction = {
      ...makePendingAction({ status: 'APPROVED' }),
      executedAt: new Date(),
      executionResult: {},
      rollbackAvailable: false,
      approval: {
        actionId: ACTION_ID,
        decision: 'APPROVE',
        decidedBy: 'manager-001',
        decidedAt: new Date(),
        reason: 'Approved after review',
      },
    };

    await store.addExecuted(executed);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.feedback).toBe('Approved after review');
  });

  it('G4: embeds rollbackToken and rollbackAvailable in proposedState', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const executed: ExecutedAction = {
      ...makePendingAction({ status: 'APPROVED' }),
      executedAt: new Date(),
      executionResult: { id: 'case-001' },
      rollbackAvailable: true,
      rollbackToken: 'rb-token-xyz',
    };

    await store.addExecuted(executed);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    const proposedState = data.proposedState as Record<string, unknown>;
    expect(proposedState.rollbackToken).toBe('rb-token-xyz');
    expect(proposedState.rollbackAvailable).toBe(true);
  });

  it('G5: uses new Date() as reviewedAt when executedAt is missing', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const executed: ExecutedAction = {
      ...makePendingAction({ status: 'APPROVED' }),
      // no executedAt
      executionResult: {},
      rollbackAvailable: false,
    };

    const before = new Date();
    await store.addExecuted(executed);
    const after = new Date();

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.reviewedAt).toBeInstanceOf(Date);
    expect((data.reviewedAt as Date).getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect((data.reviewedAt as Date).getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

// ════════════════════════════════════════════════════════════
// Section H: ExecutedActionsStore — getExecuted
// ════════════════════════════════════════════════════════════

describe('getExecuted()', () => {
  it('H1: returns undefined when row not found', async () => {
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(null);

    const result = await store.getExecuted('nonexistent');
    expect(result).toBeUndefined();
  });

  it('H2: returns undefined when row status is not APPROVED', async () => {
    const row = makeAgentActionRow({ status: 'PENDING_APPROVAL' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.getExecuted(ACTION_ID);
    expect(result).toBeUndefined();
  });

  it('H3: returns ExecutedAction when row status is APPROVED', async () => {
    const executedAt = new Date('2026-01-15T10:05:00.000Z');
    const row = makeAgentActionRow({
      status: 'APPROVED',
      reviewedAt: executedAt,
      reviewedBy: 'manager-001',
      feedback: 'Approved',
      proposedState: {
        summary: 'Create new case: "Test Case"',
        changes: [],
        affectedEntities: [{ type: 'CASE', id: 'NEW', name: 'Test Case', action: 'CREATE' }],
        warnings: [],
        executionResult: { id: 'case-new-001' },
        rollbackAvailable: true,
        rollbackToken: 'rb-token-123',
      },
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.getExecuted(ACTION_ID);

    expect(result).toBeDefined();
    expect(result!.status).toBe('APPROVED');
    expect(result!.executedAt).toEqual(executedAt);
    expect(result!.executionResult).toEqual({ id: 'case-new-001' });
    expect(result!.rollbackAvailable).toBe(true);
    expect(result!.rollbackToken).toBe('rb-token-123');
    expect(result!.approval?.decidedBy).toBe('manager-001');
    expect(result!.approval?.reason).toBe('Approved');
    expect(result!.approval?.decision).toBe('APPROVE');
  });

  it('H4: returns ExecutedAction with undefined approval when no reviewedBy', async () => {
    const row = makeAgentActionRow({
      status: 'APPROVED',
      reviewedAt: new Date(),
      reviewedBy: null,
      feedback: null,
      proposedState: { summary: 'test', changes: [], affectedEntities: [] },
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.getExecuted(ACTION_ID);

    expect(result!.approval).toBeUndefined();
  });
});

// ════════════════════════════════════════════════════════════
// Section I: ExecutedActionsStore — findByRollbackToken
// ════════════════════════════════════════════════════════════

describe('findByRollbackToken()', () => {
  it('I1: returns undefined when no APPROVED actions found', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const result = await store.findByRollbackToken('some-token');
    expect(result).toBeUndefined();
  });

  it('I2: returns ExecutedAction matching the rollback token', async () => {
    const row = makeAgentActionRow({
      status: 'APPROVED',
      proposedState: {
        summary: 'Update case',
        changes: [],
        affectedEntities: [],
        rollbackToken: 'token-abc',
        rollbackAvailable: true,
        executionResult: { id: 'case-001' },
      },
    });
    (prismaMock.agentAction.findMany as any).mockResolvedValue([row]);

    const result = await store.findByRollbackToken('token-abc');

    expect(result).toBeDefined();
    expect(result!.id).toBe(ACTION_ID);
    expect(result!.rollbackToken).toBe('token-abc');
    expect(result!.rollbackAvailable).toBe(true);
  });

  it('I3: skips rows where token does not match', async () => {
    const row1 = makeAgentActionRow({
      id: 'action-1',
      status: 'APPROVED',
      proposedState: {
        summary: 'test',
        changes: [],
        affectedEntities: [],
        rollbackToken: 'token-wrong',
        rollbackAvailable: true,
      },
    });
    const row2 = makeAgentActionRow({
      id: 'action-2',
      status: 'APPROVED',
      proposedState: {
        summary: 'test',
        changes: [],
        affectedEntities: [],
        rollbackToken: 'token-right',
        rollbackAvailable: true,
      },
    });
    (prismaMock.agentAction.findMany as any).mockResolvedValue([row1, row2]);

    const result = await store.findByRollbackToken('token-right');

    expect(result).toBeDefined();
    expect(result!.id).toBe('action-2');
  });

  it('I4: skips rows where rollbackAvailable is false', async () => {
    const row = makeAgentActionRow({
      status: 'APPROVED',
      proposedState: {
        summary: 'test',
        changes: [],
        affectedEntities: [],
        rollbackToken: 'token-xyz',
        rollbackAvailable: false, // disabled
      },
    });
    (prismaMock.agentAction.findMany as any).mockResolvedValue([row]);

    const result = await store.findByRollbackToken('token-xyz');
    expect(result).toBeUndefined();
  });

  it('I5: queries only APPROVED actions for the tenant', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    await store.findByRollbackToken('any-token');

    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.status).toBe('APPROVED');
    expect(args.where.tenantId).toBe(TENANT_ID);
  });
});

// ════════════════════════════════════════════════════════════
// Section J: ExecutedActionsStore — disableRollback
// ════════════════════════════════════════════════════════════

describe('disableRollback()', () => {
  it('J1: sets rollbackAvailable to false in proposedState', async () => {
    const row = makeAgentActionRow({
      status: 'APPROVED',
      proposedState: {
        summary: 'test',
        changes: [],
        affectedEntities: [],
        rollbackToken: 'token-abc',
        rollbackAvailable: true,
      },
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    await store.disableRollback(ACTION_ID);

    expect(prismaMock.agentAction.update).toHaveBeenCalledOnce();
    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect((data.proposedState as Record<string, unknown>).rollbackAvailable).toBe(false);
  });

  it('J2: does nothing when row does not exist', async () => {
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(null);

    await store.disableRollback('nonexistent');

    expect(prismaMock.agentAction.update).not.toHaveBeenCalled();
  });

  it('J3: handles null proposedState gracefully', async () => {
    const row = makeAgentActionRow({ status: 'APPROVED', proposedState: null });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    await store.disableRollback(ACTION_ID);

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect((data.proposedState as Record<string, unknown>).rollbackAvailable).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════
// Section K: ExecutedActionsStore — findAllExecuted
// ════════════════════════════════════════════════════════════

describe('findAllExecuted()', () => {
  it('K1: queries with APPROVED status and tenantId, ordered by reviewedAt desc', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    await store.findAllExecuted();

    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.status).toBe('APPROVED');
    expect(args.where.tenantId).toBe(TENANT_ID);
    expect(args.orderBy).toEqual({ reviewedAt: 'desc' });
  });

  it('K2: maps all rows to ExecutedActions', async () => {
    const row1 = makeAgentActionRow({
      id: 'exec-1',
      status: 'APPROVED',
      proposedState: { summary: 'test1', changes: [], affectedEntities: [] },
    });
    const row2 = makeAgentActionRow({
      id: 'exec-2',
      status: 'APPROVED',
      proposedState: { summary: 'test2', changes: [], affectedEntities: [] },
    });
    (prismaMock.agentAction.findMany as any).mockResolvedValue([row1, row2]);

    const results = await store.findAllExecuted();

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('exec-1');
    expect(results[1].id).toBe('exec-2');
  });

  it('K3: returns empty array when no executed actions exist', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const results = await store.findAllExecuted();
    expect(results).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════
// Section L: Status mapping roundtrip
// ════════════════════════════════════════════════════════════

describe('Status mapping', () => {
  it('L1: PENDING status stored as PENDING_APPROVAL', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    await store.add(makePendingAction({ status: 'PENDING' }));

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.status).toBe('PENDING_APPROVAL');
  });

  it('L2: APPROVED status stored as APPROVED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    await store.update(makePendingAction({ status: 'APPROVED' }));

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.status).toBe('APPROVED');
  });

  it('L3: REJECTED status stored as REJECTED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    await store.update(makePendingAction({ status: 'REJECTED' }));

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.status).toBe('REJECTED');
  });

  it('L4: EXPIRED status stored as EXPIRED', async () => {
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    await store.update(makePendingAction({ status: 'EXPIRED' }));

    const data = (prismaMock.agentAction.update as any).mock.calls[0][0].data;
    expect(data.status).toBe('EXPIRED');
  });

  it('L5: PENDING_APPROVAL row status maps back to PENDING', async () => {
    const row = makeAgentActionRow({ status: 'PENDING_APPROVAL' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    // Prevent auto-expire from triggering by setting future expiresAt
    (row as any).expiresAt = new Date(Date.now() + 60_000);
    (prismaMock.agentAction.update as any).mockResolvedValue({});

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('PENDING');
  });

  it('L6: APPROVED row status maps back to APPROVED', async () => {
    const row = makeAgentActionRow({
      status: 'APPROVED',
      proposedState: { summary: 'test', changes: [], affectedEntities: [] },
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('APPROVED');
  });

  it('L7: REJECTED row status maps back to REJECTED', async () => {
    const row = makeAgentActionRow({ status: 'REJECTED' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('REJECTED');
  });

  it('L8: EXPIRED row status maps back to EXPIRED', async () => {
    const row = makeAgentActionRow({ status: 'EXPIRED' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('EXPIRED');
  });

  it('L9: ROLLED_BACK row status maps to REJECTED (closest match)', async () => {
    const row = makeAgentActionRow({ status: 'ROLLED_BACK' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('REJECTED');
  });

  it('L10: unknown row status defaults to PENDING', async () => {
    const row = makeAgentActionRow({ status: 'UNKNOWN_STATUS' });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    // Give future expiresAt to avoid auto-expire path
    (row as any).expiresAt = new Date(Date.now() + 60_000);

    const result = await store.get(ACTION_ID);
    expect(result!.status).toBe('PENDING');
  });
});

// ════════════════════════════════════════════════════════════
// Section M: impactToConfidence / confidenceToImpact roundtrip
// ════════════════════════════════════════════════════════════

describe('impact/confidence roundtrip', () => {
  it('M1: LOW impact → confidence 30 → back to LOW', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(
      makeAgentActionRow({
        confidenceScore: 30,
        status: 'PENDING_APPROVAL',
        expiresAt: new Date(Date.now() + 60_000),
      })
    );

    await store.add(
      makePendingAction({ preview: { ...makePendingAction().preview, estimatedImpact: 'LOW' } })
    );

    const addData = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(addData.confidenceScore).toBe(30);

    const retrieved = await store.get(ACTION_ID);
    expect(retrieved!.preview.estimatedImpact).toBe('LOW');
  });

  it('M2: MEDIUM impact → confidence 60 → back to MEDIUM', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(
      makeAgentActionRow({
        confidenceScore: 60,
        status: 'PENDING_APPROVAL',
        expiresAt: new Date(Date.now() + 60_000),
      })
    );

    await store.add(
      makePendingAction({ preview: { ...makePendingAction().preview, estimatedImpact: 'MEDIUM' } })
    );

    const addData = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(addData.confidenceScore).toBe(60);

    const retrieved = await store.get(ACTION_ID);
    expect(retrieved!.preview.estimatedImpact).toBe('MEDIUM');
  });

  it('M3: HIGH impact → confidence 90 → back to HIGH', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(
      makeAgentActionRow({
        confidenceScore: 90,
        status: 'PENDING_APPROVAL',
        expiresAt: new Date(Date.now() + 60_000),
      })
    );

    await store.add(
      makePendingAction({ preview: { ...makePendingAction().preview, estimatedImpact: 'HIGH' } })
    );

    const addData = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(addData.confidenceScore).toBe(90);

    const retrieved = await store.get(ACTION_ID);
    expect(retrieved!.preview.estimatedImpact).toBe('HIGH');
  });

  it('M4: confidenceScore 0 maps to LOW impact', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 0,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('LOW');
  });

  it('M5: confidenceScore 39 maps to LOW impact (boundary)', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 39,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('LOW');
  });

  it('M6: confidenceScore 40 maps to MEDIUM impact (boundary)', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 40,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('MEDIUM');
  });

  it('M7: confidenceScore 69 maps to MEDIUM impact (boundary)', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 69,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('MEDIUM');
  });

  it('M8: confidenceScore 70 maps to HIGH impact (boundary)', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 70,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('HIGH');
  });

  it('M9: confidenceScore 100 maps to HIGH impact', async () => {
    const row = makeAgentActionRow({
      confidenceScore: 100,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);

    const result = await store.get(ACTION_ID);
    expect(result!.preview.estimatedImpact).toBe('HIGH');
  });
});

// ════════════════════════════════════════════════════════════
// Section N: inferActionType from toolName
// ════════════════════════════════════════════════════════════

describe('inferActionType from toolName', () => {
  async function getActionTypeFor(toolName: string): Promise<string> {
    const row = makeAgentActionRow({
      actionType: toolName,
      status: 'PENDING_APPROVAL',
      expiresAt: new Date(Date.now() + 60_000),
    });
    (prismaMock.agentAction.findUnique as any).mockResolvedValue(row);
    const result = await store.get(ACTION_ID);
    return result!.actionType;
  }

  it('N1: toolName containing "create" infers CREATE', async () => {
    expect(await getActionTypeFor('create_case')).toBe('CREATE');
  });

  it('N2: toolName containing "add" infers CREATE', async () => {
    expect(await getActionTypeFor('add_contact')).toBe('CREATE');
  });

  it('N3: toolName containing "delete" infers DELETE', async () => {
    expect(await getActionTypeFor('delete_lead')).toBe('DELETE');
  });

  it('N4: toolName containing "remove" infers DELETE', async () => {
    expect(await getActionTypeFor('remove_tag')).toBe('DELETE');
  });

  it('N5: toolName containing "search" infers SEARCH', async () => {
    expect(await getActionTypeFor('search_leads')).toBe('SEARCH');
  });

  it('N6: toolName containing "find" infers SEARCH', async () => {
    expect(await getActionTypeFor('find_contacts')).toBe('SEARCH');
  });

  it('N7: toolName containing "draft" infers DRAFT', async () => {
    expect(await getActionTypeFor('draft_message')).toBe('DRAFT');
  });

  it('N8: toolName with no matching keyword infers UPDATE', async () => {
    expect(await getActionTypeFor('update_case')).toBe('UPDATE');
  });

  it('N9: arbitrary toolName defaults to UPDATE', async () => {
    expect(await getActionTypeFor('some_other_tool')).toBe('UPDATE');
  });
});

// ════════════════════════════════════════════════════════════
// Section O: Tenant isolation
// ════════════════════════════════════════════════════════════

describe('Tenant isolation', () => {
  it('O1: add() always includes tenantId from constructor', async () => {
    (prismaMock.agentAction.create as any).mockResolvedValue({});

    const storeForTenant2 = new PrismaAgentActionStore(prismaMock, 'tenant-xyz');
    await storeForTenant2.add(makePendingAction());

    const data = (prismaMock.agentAction.create as any).mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant-xyz');
  });

  it('O2: findPending() always scopes to constructor tenantId', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const storeForTenant2 = new PrismaAgentActionStore(prismaMock, 'tenant-abc');
    await storeForTenant2.findPending();

    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant-abc');
  });

  it('O3: expireOld() always scopes to constructor tenantId', async () => {
    (prismaMock.agentAction.updateMany as any).mockResolvedValue({ count: 0 });

    const storeForTenant2 = new PrismaAgentActionStore(prismaMock, 'tenant-def');
    await storeForTenant2.expireOld();

    const args = (prismaMock.agentAction.updateMany as any).mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant-def');
  });

  it('O4: findAllExecuted() always scopes to constructor tenantId', async () => {
    (prismaMock.agentAction.findMany as any).mockResolvedValue([]);

    const storeForTenant2 = new PrismaAgentActionStore(prismaMock, 'tenant-ghi');
    await storeForTenant2.findAllExecuted();

    const args = (prismaMock.agentAction.findMany as any).mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant-ghi');
  });
});
