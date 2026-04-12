/**
 * Workflow Router — Helper Unit Tests
 *
 * Direct tests for the pure helper functions exported from
 * `../workflow.router`. These cover the PG-193 audit fix: per-element
 * safeParse, step-type-to-name fallback, and the merge algorithm.
 *
 * NOTE: These tests do NOT go through the tRPC caller. They import the
 * helpers directly and exercise them as pure functions, which is the only
 * way to pin the exact logic that the frontend is not positioned to test.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { createTestContext, prismaMock, TEST_UUIDS } from '../../../test/setup';
import {
  mergeSteps,
  normalizeEntityType,
  parseStepDefinitions,
  parseStepResults,
  stepTypeToName,
  workflowRouter,
} from '../workflow.router';

// ---------------------------------------------------------------------------
// parseStepDefinitions
// ---------------------------------------------------------------------------

describe('parseStepDefinitions', () => {
  it('returns [] for non-array input', () => {
    expect(parseStepDefinitions(null)).toEqual([]);
    expect(parseStepDefinitions(undefined)).toEqual([]);
    expect(parseStepDefinitions('oops')).toEqual([]);
    expect(parseStepDefinitions({ not: 'an array' })).toEqual([]);
  });

  it('returns fully populated defs for all-valid input', () => {
    const raw = [
      { id: 1, type: 'score', config: { model: 'v2' } },
      { id: 2, type: 'assign', config: { to: 'sales' } },
    ];
    const result = parseStepDefinitions(raw);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[0].type).toBe('score');
    expect(result[0].config).toEqual({ model: 'v2' });
    expect(result[1].id).toBe(2);
  });

  it('drops invalid entries but keeps valid ones', () => {
    const raw = [
      { id: 1, type: 'score' },
      { id: 'not-a-number', type: 'assign' }, // invalid: id must be number
      { id: 3, type: 'notify' },
      { type: 'missing_id' }, // invalid: no id
    ];
    const result = parseStepDefinitions(raw);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toEqual([1, 3]);
  });

  it('defaults config to empty object when omitted', () => {
    const result = parseStepDefinitions([{ id: 1, type: 'score' }]);
    expect(result[0].config).toEqual({});
  });

  it('unwraps { nodes, edges } envelope format (IFC-031)', () => {
    const envelope = {
      nodes: [
        { id: 1, type: 'start', config: {} },
        { id: 2, type: 'action', config: { actionType: 'send_notification' } },
        { id: 3, type: 'end', config: {} },
      ],
      edges: [
        { id: 'e1', source: 'node-1', target: 'node-2' },
        { id: 'e2', source: 'node-2', target: 'node-3' },
      ],
    };
    const result = parseStepDefinitions(envelope);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.type)).toEqual(['start', 'action', 'end']);
    expect(result[1].config).toEqual({ actionType: 'send_notification' });
  });

  it('returns [] for envelope with non-array nodes', () => {
    expect(parseStepDefinitions({ nodes: 'not-an-array' })).toEqual([]);
    expect(parseStepDefinitions({ nodes: null })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// parseStepResults
// ---------------------------------------------------------------------------

describe('parseStepResults', () => {
  it('returns [] for non-array input', () => {
    expect(parseStepResults(null)).toEqual([]);
    expect(parseStepResults(undefined)).toEqual([]);
    expect(parseStepResults(42)).toEqual([]);
  });

  it('preserves result, error, startedAt, completedAt fields', () => {
    const raw = [
      {
        step: 1,
        status: 'completed',
        result: { score: 85 },
        startedAt: '2026-02-17T10:00:00Z',
        completedAt: '2026-02-17T10:00:03Z',
      },
      {
        step: 2,
        status: 'failed',
        error: 'timeout',
      },
    ];
    const result = parseStepResults(raw);
    expect(result).toHaveLength(2);
    expect(result[0].result).toEqual({ score: 85 });
    expect(result[0].startedAt).toBe('2026-02-17T10:00:00Z');
    expect(result[0].completedAt).toBe('2026-02-17T10:00:03Z');
    expect(result[1].error).toBe('timeout');
  });

  it('keeps step 1 when [valid, invalid] — regression for all-or-nothing bug', () => {
    const raw = [
      { step: 1, status: 'completed' },
      { step: 'bad', status: 'completed' }, // invalid: step must be number
    ];
    const result = parseStepResults(raw);
    expect(result).toHaveLength(1);
    expect(result[0].step).toBe(1);
  });

  it('drops rows with unknown status values', () => {
    const raw = [
      { step: 1, status: 'completed' },
      { step: 2, status: 'UNKNOWN_STATUS' },
      { step: 3, status: 'pending' },
    ];
    const result = parseStepResults(raw);
    expect(result.map((r) => r.step)).toEqual([1, 3]);
  });
});

// ---------------------------------------------------------------------------
// stepTypeToName
// ---------------------------------------------------------------------------

describe('stepTypeToName', () => {
  it('returns the canonical label for each known type', () => {
    expect(stepTypeToName('score')).toBe('Lead Scoring');
    expect(stepTypeToName('condition')).toBe('Condition Check');
    expect(stepTypeToName('assign')).toBe('Assignment');
    expect(stepTypeToName('notify')).toBe('Send Notification');
    expect(stepTypeToName('approval')).toBe('Approval Gate');
    expect(stepTypeToName('classify')).toBe('Classification');
    expect(stepTypeToName('route')).toBe('Routing');
    expect(stepTypeToName('sla')).toBe('SLA Assignment');
  });

  it('title-cases unknown snake_case types', () => {
    expect(stepTypeToName('custom_action')).toBe('Custom Action');
    expect(stepTypeToName('send_email_v2')).toBe('Send Email V2');
  });

  it('title-cases unknown single-word types', () => {
    expect(stepTypeToName('webhook')).toBe('Webhook');
  });
});

// ---------------------------------------------------------------------------
// normalizeEntityType — PG-193 wiring fix
// ---------------------------------------------------------------------------

describe('normalizeEntityType', () => {
  it('passes through canonical entity kinds unchanged', () => {
    expect(normalizeEntityType('lead')).toBe('lead');
    expect(normalizeEntityType('deal')).toBe('deal');
    expect(normalizeEntityType('ticket')).toBe('ticket');
    expect(normalizeEntityType('contact')).toBe('contact');
    expect(normalizeEntityType('opportunity')).toBe('opportunity');
    expect(normalizeEntityType('case')).toBe('case');
    expect(normalizeEntityType('account')).toBe('account');
  });

  it('maps action-qualified lead values to "lead"', () => {
    expect(normalizeEntityType('lead_qualification')).toBe('lead');
    expect(normalizeEntityType('lead_scoring')).toBe('lead');
    expect(normalizeEntityType('lead_update')).toBe('lead');
    expect(normalizeEntityType('lead_converted')).toBe('lead');
  });

  it('maps action-qualified deal values to "deal"', () => {
    expect(normalizeEntityType('deal_stage_changed')).toBe('deal');
    expect(normalizeEntityType('deal_approved')).toBe('deal');
    expect(normalizeEntityType('deal_won')).toBe('deal');
  });

  it('maps action-qualified ticket values to "ticket"', () => {
    expect(normalizeEntityType('ticket_created')).toBe('ticket');
    expect(normalizeEntityType('ticket_escalated')).toBe('ticket');
  });

  it('is case-insensitive on prefix match', () => {
    expect(normalizeEntityType('Lead_Qualification')).toBe('lead');
    expect(normalizeEntityType('DEAL_APPROVED')).toBe('deal');
  });

  it('returns the raw value when no prefix matches', () => {
    // e.g., 'email_generation' — not tied to any workflow entity kind
    expect(normalizeEntityType('email_generation')).toBe('email_generation');
    expect(normalizeEntityType('job')).toBe('job');
    expect(normalizeEntityType('workflow_trigger')).toBe('workflow_trigger');
  });
});

// ---------------------------------------------------------------------------
// mergeSteps
// ---------------------------------------------------------------------------

describe('mergeSteps', () => {
  const sampleDefs = [
    { id: 1, type: 'score', config: {} },
    { id: 2, type: 'condition', config: {} },
    { id: 3, type: 'assign', config: {} },
    { id: 4, type: 'notify', config: {} },
  ];

  it('seed fixture regression — RUNNING with partial results does NOT render a phantom running step', () => {
    // Mirrors packages/db/prisma/seed.ts:8109-8127 (leadQual2 style).
    // Execution is RUNNING with results for steps 1 and 2 only; the previous
    // implementation synthesised step 3 as "running" from currentStep+1.
    // Verify the new logic leaves step 3 (and step 4) as pending.
    const results = [
      { step: 1, status: 'completed' as const, result: { ok: true } },
      { step: 2, status: 'pending' as const, result: null },
    ];
    const merged = mergeSteps(sampleDefs, results, 'RUNNING');
    expect(merged).toHaveLength(4);
    expect(merged[0].status).toBe('completed'); // explicit
    expect(merged[1].status).toBe('pending'); // explicit
    expect(merged[2].status).toBe('pending'); // fallback, NOT 'running'
    expect(merged[3].status).toBe('pending'); // fallback
  });

  it('COMPLETED execution with all explicit step results renders every step completed', () => {
    const results = [
      { step: 1, status: 'completed' as const },
      { step: 2, status: 'completed' as const },
      { step: 3, status: 'completed' as const },
      { step: 4, status: 'completed' as const },
    ];
    const merged = mergeSteps(sampleDefs, results, 'COMPLETED');
    expect(merged.every((s) => s.status === 'completed')).toBe(true);
  });

  it('COMPLETED execution with a missing result defaults the gap to completed', () => {
    const results = [
      { step: 1, status: 'completed' as const },
      { step: 2, status: 'completed' as const },
      // step 3 missing — engine-forgot fallback
      { step: 4, status: 'completed' as const },
    ];
    const merged = mergeSteps(sampleDefs, results, 'COMPLETED');
    expect(merged[2].status).toBe('completed');
  });

  it('CANCELLED execution leaves unresulted steps as skipped', () => {
    const results = [{ step: 1, status: 'completed' as const }];
    const merged = mergeSteps(sampleDefs, results, 'CANCELLED');
    expect(merged[0].status).toBe('completed');
    expect(merged[1].status).toBe('skipped');
    expect(merged[2].status).toBe('skipped');
    expect(merged[3].status).toBe('skipped');
  });

  it('RUNNING execution with zero results renders every step pending', () => {
    const merged = mergeSteps(sampleDefs, [], 'RUNNING');
    expect(merged).toHaveLength(4);
    expect(merged.every((s) => s.status === 'pending')).toBe(true);
  });

  it('FAILED execution surfaces explicit failed status and leaves unknowns pending', () => {
    const results = [
      { step: 1, status: 'completed' as const },
      { step: 2, status: 'completed' as const },
      { step: 3, status: 'failed' as const, error: 'boom' },
    ];
    const merged = mergeSteps(sampleDefs, results, 'FAILED');
    expect(merged[0].status).toBe('completed');
    expect(merged[1].status).toBe('completed');
    expect(merged[2].status).toBe('failed');
    expect(merged[2].error).toBe('boom');
    expect(merged[3].status).toBe('pending'); // NOT 'failed', NOT 'running'
  });

  it('PAUSED execution leaves unresulted steps pending', () => {
    const results = [{ step: 1, status: 'completed' as const }];
    const merged = mergeSteps(sampleDefs, results, 'PAUSED');
    expect(merged[0].status).toBe('completed');
    expect(merged[1].status).toBe('pending');
    expect(merged[2].status).toBe('pending');
    expect(merged[3].status).toBe('pending');
  });

  it('returns an empty array when there are no definitions', () => {
    expect(mergeSteps([], [], 'RUNNING')).toEqual([]);
    expect(mergeSteps([], [{ step: 1, status: 'completed' }], 'COMPLETED')).toEqual([]);
  });

  it('silently drops results that reference a non-existent step id', () => {
    // Extra result for step 5 — not defined. Iteration is over defs, so the
    // extra result is simply ignored and merged has exactly one entry.
    const results = [
      { step: 1, status: 'completed' as const, result: { ok: true } },
      { step: 99, status: 'completed' as const }, // no matching def
    ];
    const merged = mergeSteps([{ id: 1, type: 'score', config: {} }], results, 'RUNNING');
    expect(merged).toHaveLength(1);
    expect(merged[0].status).toBe('completed');
    expect(merged[0].result).toEqual({ ok: true });
  });

  it('populates stepNumber 1-based, stepId from def, and a human label', () => {
    const merged = mergeSteps(
      [
        { id: 7, type: 'score', config: {} },
        { id: 9, type: 'send_email', config: {} },
      ],
      [],
      'RUNNING'
    );
    expect(merged[0].stepNumber).toBe(1);
    expect(merged[0].stepId).toBe(7);
    expect(merged[0].name).toBe('Lead Scoring');
    expect(merged[1].stepNumber).toBe(2);
    expect(merged[1].stepId).toBe(9);
    expect(merged[1].name).toBe('Send Email');
  });

  it('preserves startedAt and completedAt on a resulted step', () => {
    const results = [
      {
        step: 1,
        status: 'completed' as const,
        startedAt: '2026-02-17T10:00:00Z',
        completedAt: '2026-02-17T10:00:05Z',
      },
    ];
    const merged = mergeSteps([{ id: 1, type: 'score', config: {} }], results, 'RUNNING');
    expect(merged[0].startedAt).toBe('2026-02-17T10:00:00Z');
    expect(merged[0].completedAt).toBe('2026-02-17T10:00:05Z');
  });
});

// ---------------------------------------------------------------------------
// getExecutionsByEntity procedure — PG-193 wiring integration tests
// ---------------------------------------------------------------------------

describe('workflowRouter.getExecutionsByEntity — wiring resolution', () => {
  const fakeExecution = {
    id: 'exec-1',
    workflowId: 'wf-1',
    status: 'RUNNING' as const,
    currentStep: 2,
    stepResults: [
      { step: 1, status: 'completed', result: { ok: true } },
      { step: 2, status: 'pending', result: null },
    ],
    error: null,
    startedAt: new Date('2026-02-17T10:00:00Z'),
    completedAt: null,
    entityType: 'lead',
    entityId: 'lead-sarah-miller',
    workflow: {
      name: 'Lead Qualification Workflow',
      category: 'sales',
      steps: [
        { id: 1, type: 'score', config: {} },
        { id: 2, type: 'condition', config: {} },
        { id: 3, type: 'assign', config: {} },
        { id: 4, type: 'notify', config: {} },
      ],
    },
  };

  beforeEach(() => {
    // Reset the Prisma mock between tests — the shared prismaMock accumulates
    // call state across tests otherwise.
    (prismaMock.workflowExecution.findFirst as any).mockReset();
  });

  it('resolves a prefix-qualified contextType against a canonical entityType (lead_qualification → lead)', async () => {
    // Simulates the seeded `qualificationAgent` whose
    // ConversationRecord.contextType='lead_qualification' and contextId
    // points at a real lead. The prefix-normaliser rewrites the entityType
    // lookup to 'lead' and the existing WorkflowExecution for that lead
    // is returned.
    (prismaMock.workflowExecution.findFirst as any).mockResolvedValueOnce(fakeExecution);

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'lead_qualification',
      entityId: 'lead-sarah-miller',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('exec-1');
    expect(result?.workflowName).toBe('Lead Qualification Workflow');

    const firstCall = (prismaMock.workflowExecution.findFirst as any).mock.calls[0][0];
    expect(firstCall.where.tenantId).toBe(TEST_UUIDS.tenant);
    expect(firstCall.where.entityType).toEqual({ in: ['lead', 'lead_qualification'] });
    expect(firstCall.where.entityId).toBe('lead-sarah-miller');
  });

  it('resolves a task-kind contextType via entityId-only fallback (email_generation → lead via id)', async () => {
    // Simulates the seeded `emailAgent` whose
    // ConversationRecord.contextType='email_generation' cannot be mapped to
    // a known entity kind by prefix. The first pass returns null; the
    // second pass drops the entityType filter and finds the lead's workflow
    // execution by id alone.
    (prismaMock.workflowExecution.findFirst as any)
      .mockResolvedValueOnce(null) // Pass 1: no match on email_generation
      .mockResolvedValueOnce(fakeExecution); // Pass 2: entityId-only match

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'email_generation',
      entityId: 'lead-sarah-miller',
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe('exec-1');

    // Pass 1: entityType filter present
    const firstCall = (prismaMock.workflowExecution.findFirst as any).mock.calls[0][0];
    expect(firstCall.where.entityType).toEqual({ in: ['email_generation'] });

    // Pass 2: entityType filter absent (entityId-only fallback), tenantId preserved
    const secondCall = (prismaMock.workflowExecution.findFirst as any).mock.calls[1][0];
    expect(secondCall.where.tenantId).toBe(TEST_UUIDS.tenant);
    expect(secondCall.where.entityType).toBeUndefined();
    expect(secondCall.where.entityId).toBe('lead-sarah-miller');
  });

  it('resolves a canonical entityType directly without fallback', async () => {
    // Caller already passed a known entity kind ('lead'). Single query,
    // no fallback needed.
    (prismaMock.workflowExecution.findFirst as any).mockResolvedValueOnce(fakeExecution);

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'lead',
      entityId: 'lead-sarah-miller',
    });

    expect(result).not.toBeNull();
    expect((prismaMock.workflowExecution.findFirst as any).mock.calls).toHaveLength(1);
    const call = (prismaMock.workflowExecution.findFirst as any).mock.calls[0][0];
    expect(call.where.tenantId).toBe(TEST_UUIDS.tenant);
    expect(call.where.entityType).toEqual({ in: ['lead'] });
  });

  it('returns null when neither pass finds a match', async () => {
    (prismaMock.workflowExecution.findFirst as any)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'email_generation',
      entityId: 'nonexistent-id',
    });

    expect(result).toBeNull();
    expect((prismaMock.workflowExecution.findFirst as any).mock.calls).toHaveLength(2);
  });

  it('does NOT run the entityId-only fallback when the normaliser matched a prefix', async () => {
    // 'lead_qualification' normalises to 'lead', so we consider the
    // normaliser to have "recognised" the type. If pass 1 returns null,
    // we trust that the caller's entityType intent was valid and do NOT
    // widen the search — it would be unsafe to return an execution that
    // doesn't match the claimed entity kind.
    (prismaMock.workflowExecution.findFirst as any).mockResolvedValueOnce(null);

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'lead_qualification',
      entityId: 'lead-sarah-miller',
    });

    expect(result).toBeNull();
    expect((prismaMock.workflowExecution.findFirst as any).mock.calls).toHaveLength(1);
  });

  it('does NOT run the fallback for canonical entity kinds either', async () => {
    (prismaMock.workflowExecution.findFirst as any).mockResolvedValueOnce(null);

    const caller = workflowRouter.createCaller(createTestContext());
    const result = await caller.getExecutionsByEntity({
      entityType: 'lead',
      entityId: 'lead-sarah-miller',
    });

    expect(result).toBeNull();
    expect((prismaMock.workflowExecution.findFirst as any).mock.calls).toHaveLength(1);
  });
});
