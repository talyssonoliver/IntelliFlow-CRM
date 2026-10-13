/**
 * Approval escalation sweep (PG-198, AC-014): advisory lock, once-only escalation,
 * SLA clock, bounded draft window, missing target, escalate-before-expire.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AutoResponseDraft, ResponseContent, SYSTEM_APPROVAL_ACTOR } from '@intelliflow/domain';
import {
  APPROVAL_SWEEP_BATCH,
  APPROVAL_SWEEP_MAX_PAGES,
  createDefaultSweepDeps,
  resetDraftScanCursors,
  runApprovalSweep,
  type ApprovalSweepDeps,
  type SweepTx,
} from '../approval-escalation-sweep';
import { invalidateApprovalPolicyCache } from '../approval-policy-loader';

const createNotification = vi.hoisted(() => vi.fn().mockResolvedValue({}));
vi.mock('../../modules/notifications/notifications.router.js', () => ({ createNotification }));
vi.mock('@intelliflow/adapters', () => ({
  PrismaAutoResponseDraftRepository: function Repo(this: any, client: unknown) {
    this.client = client;
  },
}));

const TENANT = 'tenant-1';
const TARGET = 'manager-1';
const NOW = new Date('2026-10-13T12:00:00Z');

function policyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'p1',
    name: 'Escalating',
    scope: 'AGENT_TOOL',
    isDefault: true,
    timeoutMinutes: 240,
    minReviewerRole: 'USER',
    autoApproveEnabled: false,
    autoApproveMinConfidence: null,
    escalationEnabled: true,
    escalateAfterMinutes: 60,
    escalationTargetUserId: TARGET,
    assignments: [],
    ...overrides,
  };
}

function actionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'act-1',
    tenantId: TENANT,
    actionType: 'create_case',
    description: 'Create case "Renewal"',
    entityName: 'Renewal',
    createdAt: new Date('2026-10-13T10:30:00Z'),
    ...overrides,
  };
}

function pendingDraft(submittedAt: Date, expiresInHours = 24) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(submittedAt.getTime() - 60_000));
  const draft = AutoResponseDraft.create({
    tenantId: TENANT,
    leadId: 'lead-1',
    leadTenantId: TENANT,
    leadStatus: 'NEW',
    triggerType: 'EMAIL_RECEIVED',
    content: ResponseContent.create({ subject: 'Thanks', body: 'Body' }),
    aiConfidence: 0.5,
    modelVersion: 'm',
    recipientEmail: 'lead@example.invalid',
    expiryHours: expiresInHours,
  }).value;
  vi.setSystemTime(submittedAt);
  draft.submitForApproval('someone');
  vi.useRealTimers();
  return draft;
}

function pendingDraftCreatedAt(createdAt: Date, submittedAt: Date) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(createdAt);
  const draft = AutoResponseDraft.create({
    tenantId: TENANT,
    leadId: 'lead-1',
    leadTenantId: TENANT,
    leadStatus: 'NEW',
    triggerType: 'EMAIL_RECEIVED',
    content: ResponseContent.create({ subject: 'Thanks', body: 'Body' }),
    aiConfidence: 0.5,
    modelVersion: 'm',
    recipientEmail: 'lead@example.invalid',
    expiryHours: 48,
  }).value;
  vi.setSystemTime(submittedAt);
  draft.submitForApproval('someone');
  vi.useRealTimers();
  return draft;
}

function harness(opts: {
  locked?: boolean;
  policies?: unknown[];
  tenants?: string[];
  actions?: unknown[];
  claimCount?: number;
  user?: { id: string } | null;
  drafts?: AutoResponseDraft[];
  decidedMeanwhile?: boolean;
  notifyError?: Error;
}) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([{ locked: opts.locked ?? true }]),
    approvalPolicy: {
      findMany: vi.fn(async (args: any) =>
        args.distinct
          ? (opts.tenants ?? [TENANT]).map((tenantId) => ({ tenantId }))
          : (opts.policies ?? [policyRow()])
      ),
    },
    agentAction: {
      // Behaves like the real query: tools of the group, created before the cutoff.
      findMany: vi.fn(async (args: any) =>
        ((opts.actions ?? []) as any[]).filter(
          (a) =>
            args.where.actionType.in.includes(a.actionType) &&
            a.createdAt.getTime() <= args.where.createdAt.lte.getTime()
        )
      ),
      updateMany: vi.fn(async (args: any) =>
        args.data.status === 'EXPIRED' ? { count: 2 } : { count: opts.claimCount ?? 1 }
      ),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(opts.user === undefined ? { id: TARGET } : opts.user),
    },
  };
  const repo = {
    // Behaves like the real keyset query over the drafts still pending and unescalated.
    findPendingOlderThan: vi.fn(async (_tenant: string, filter: any, limit: number) =>
      (opts.drafts ?? [])
        .filter(
          (d) =>
            d.status === 'PENDING_APPROVAL' &&
            d.escalationCount === 0 &&
            filter.triggerTypes.includes(d.triggerType) &&
            d.createdAt < filter.before &&
            d.expiresAt > filter.notExpiredAt &&
            (!filter.after ||
              d.createdAt > filter.after.createdAt ||
              (d.createdAt.getTime() === filter.after.createdAt.getTime() &&
                d.id.toString() > filter.after.id))
        )
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            a.id.toString().localeCompare(b.id.toString())
        )
        .slice(0, limit)
    ),
    saveEscalation: vi.fn().mockResolvedValue(!opts.decidedMeanwhile),
  };
  const deps: ApprovalSweepDeps = {
    prisma: { $transaction: vi.fn(async (fn: any, _o: unknown) => fn(tx)) } as any,
    draftRepository: vi.fn(async () => repo as any),
    notify: opts.notifyError
      ? vi.fn().mockRejectedValue(opts.notifyError)
      : vi.fn().mockResolvedValue(undefined),
    log: { warn: vi.fn() },
  };
  return { tx: tx as unknown as SweepTx & typeof tx, repo, deps };
}

beforeEach(() => {
  invalidateApprovalPolicyCache();
  resetDraftScanCursors();
});

describe('runApprovalSweep', () => {
  it('runs in one transaction with a transaction-scoped advisory lock', async () => {
    const { tx, deps } = harness({});
    const report = await runApprovalSweep(deps, NOW);

    expect(deps.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 60_000,
      maxWait: 10_000,
    });
    expect(tx.$queryRaw.mock.calls[0]![0].join('?')).toContain('pg_try_advisory_xact_lock');
    expect(report.locked).toBe(true);
  });

  it('does nothing when another replica holds the lock', async () => {
    const { tx, deps } = harness({ locked: false });
    const report = await runApprovalSweep(deps, NOW);

    expect(report).toEqual({
      locked: false,
      agentActionsEscalated: 0,
      draftsEscalated: 0,
      skipped: 0,
      expired: 0,
    });
    expect(tx.approvalPolicy.findMany).not.toHaveBeenCalled();
    expect(tx.agentAction.updateMany).not.toHaveBeenCalled();
  });

  it('escalates a due agent action once, tenant-scoped, and notifies the target', async () => {
    const { tx, deps } = harness({ actions: [actionRow()] });
    const report = await runApprovalSweep(deps, NOW);

    expect(tx.agentAction.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        actionType: {
          in: [
            'create_case',
            'create_appointment',
            'update_case',
            'update_appointment',
            'draft_message',
          ],
        },
        status: 'PENDING_APPROVAL',
        escalatedAt: null,
        expiresAt: { gt: NOW },
        createdAt: { lte: new Date('2026-10-13T11:00:00Z') },
      },
      orderBy: { createdAt: 'asc' },
      take: APPROVAL_SWEEP_BATCH,
    });
    expect(tx.agentAction.updateMany).toHaveBeenCalledWith({
      where: { id: 'act-1', tenantId: TENANT, status: 'PENDING_APPROVAL', escalatedAt: null },
      data: { escalatedAt: NOW, escalatedTo: TARGET },
    });
    expect(deps.notify).toHaveBeenCalledWith({
      tenantId: TENANT,
      userId: TARGET,
      title: 'Agent Action Escalated for Your Review',
      body: '"Create case "Renewal"" has waited 60 minutes for approval.',
      entityType: 'agent_action',
      entityId: 'act-1',
      entityName: 'Renewal',
      actionUrl: '/agent-approvals/preview?actionId=act-1',
    });
    expect(report.agentActionsEscalated).toBe(1);
  });

  it('does not notify when another tick already escalated the action', async () => {
    const { deps } = harness({ actions: [actionRow()], claimCount: 0 });
    const report = await runApprovalSweep(deps, NOW);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(report.agentActionsEscalated).toBe(0);
  });

  it('queries each escalating policy with its own delay and tools', async () => {
    const { tx, deps } = harness({
      policies: [
        policyRow(),
        policyRow({
          id: 'p2',
          isDefault: false,
          escalateAfterMinutes: 200,
          assignments: [{ agentKey: 'update_case', actionType: 'UPDATE' }],
        }),
        policyRow({
          id: 'p3',
          isDefault: false,
          escalationEnabled: false,
          assignments: [{ agentKey: 'draft_message', actionType: '*' }],
        }),
      ],
      actions: [actionRow({ id: 'act-2', actionType: 'update_case' })],
    });
    await runApprovalSweep(deps, NOW);

    const wheres = tx.agentAction.findMany.mock.calls.map((c: any) => c[0].where);
    expect(wheres).toHaveLength(2);
    expect(wheres[0].actionType.in).toEqual([
      'create_case',
      'create_appointment',
      'update_appointment',
    ]);
    expect(wheres[0].createdAt.lte).toEqual(new Date('2026-10-13T11:00:00Z'));
    expect(wheres[1].actionType.in).toEqual(['update_case']);
    expect(wheres[1].createdAt.lte).toEqual(new Date('2026-10-13T08:40:00Z'));
    // act-2 (10:30) is not yet due under its 200-minute policy: only the expiry flip ran.
    expect(tx.agentAction.updateMany).toHaveBeenCalledTimes(1);
  });

  it('skips and logs when the escalation target is no longer a user (BR-9)', async () => {
    const { deps } = harness({ actions: [actionRow(), actionRow({ id: 'act-2' })], user: null });
    const report = await runApprovalSweep(deps, NOW);

    expect(report.skipped).toBe(2);
    expect(deps.notify).not.toHaveBeenCalled();
    // The target lookup is cached for the tenant.
    expect(deps.log!.warn).toHaveBeenCalledTimes(1);
  });

  it('keeps the escalation when the notification fails', async () => {
    const { deps } = harness({ actions: [actionRow()], notifyError: new Error('smtp') });
    const report = await runApprovalSweep(deps, NOW);
    expect(report.agentActionsEscalated).toBe(1);
    expect(deps.log!.warn).toHaveBeenCalledWith('[approval-sweep] notification failed: smtp');
  });

  it('delivers notifications only after the transaction commits', async () => {
    const { deps } = harness({ actions: [actionRow()] });
    const order: string[] = [];
    (deps.prisma.$transaction as any).mockImplementation(async (fn: any) => {
      const result = await fn(harness({ actions: [actionRow()] }).tx);
      order.push('commit');
      return result;
    });
    (deps.notify as any).mockImplementation(async () => {
      order.push('notify');
    });

    await runApprovalSweep(deps, NOW);

    expect(order).toEqual(['commit', 'notify']);
  });

  it('logs a non-Error notification failure too', async () => {
    const { deps } = harness({ actions: [actionRow()] });
    (deps.notify as any).mockRejectedValue('down');
    await runApprovalSweep(deps, NOW);
    expect(deps.log!.warn).toHaveBeenCalledWith('[approval-sweep] notification failed: down');
  });

  it('ignores queues without an escalating policy', async () => {
    const { tx, deps } = harness({
      policies: [policyRow({ escalationTargetUserId: null })],
    });
    await runApprovalSweep(deps, NOW);
    expect(tx.agentAction.findMany).not.toHaveBeenCalled();
    expect(deps.draftRepository).not.toHaveBeenCalled();
  });

  it('escalates before it expires, then flips overdue actions to EXPIRED', async () => {
    const { tx, deps } = harness({ actions: [actionRow()] });
    const report = await runApprovalSweep(deps, NOW);

    const calls = tx.agentAction.updateMany.mock.calls.map((c: any) => c[0].data);
    expect(calls).toEqual([{ escalatedAt: NOW, escalatedTo: TARGET }, { status: 'EXPIRED' }]);
    expect(tx.agentAction.updateMany.mock.calls[1]![0].where).toEqual({
      status: 'PENDING_APPROVAL',
      expiresAt: { lt: NOW },
    });
    expect(report.expired).toBe(2);
  });

  describe('auto-response drafts', () => {
    const draftPolicy = policyRow({ scope: 'AUTO_RESPONSE', escalateAfterMinutes: 30 });

    it('escalates a due draft as the system actor, window bounded by its expiry', async () => {
      const draft = pendingDraft(new Date('2026-10-13T11:00:00Z'), 2);
      const { repo, deps, tx } = harness({ policies: [draftPolicy], drafts: [draft] });
      // The aggregate stamps the escalation with the clock; align it with the sweep's now.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      const report = await runApprovalSweep(deps, NOW);
      vi.useRealTimers();

      expect(repo.findPendingOlderThan).toHaveBeenCalledWith(
        TENANT,
        {
          after: undefined,
          before: new Date('2026-10-13T11:30:00Z'),
          notExpiredAt: NOW,
          triggerTypes: ['EMAIL_RECEIVED', 'FORM_SUBMIT', 'CHAT_MESSAGE', 'MANUAL'],
        },
        APPROVAL_SWEEP_BATCH
      );
      expect(draft.status).toBe('ESCALATED');
      expect(draft.escalation).toMatchObject({
        escalatedBy: SYSTEM_APPROVAL_ACTOR,
        escalatedTo: TARGET,
      });
      // Draft expires 2h after it was created (10:59), so the window ends there too.
      expect(draft.escalation!.expiresAt.getTime()).toBe(draft.expiresAt.getTime());
      expect(repo.saveEscalation).toHaveBeenCalledWith(draft);
      expect(deps.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'auto_response_draft',
          actionUrl: '/agent-approvals?status=escalated',
          body: expect.stringContaining('no decision after 30 minutes'),
        })
      );
      expect(report.draftsEscalated).toBe(1);
    });

    it('measures the SLA from submission, not from drafting', async () => {
      const draft = pendingDraft(new Date('2026-10-13T11:45:00Z'));
      const { repo, deps } = harness({ policies: [draftPolicy], drafts: [draft] });
      await runApprovalSweep(deps, NOW);
      expect(draft.status).toBe('PENDING_APPROVAL');
      expect(repo.saveEscalation).not.toHaveBeenCalled();
    });

    it('does not escalate a draft that has already expired', async () => {
      const draft = pendingDraft(new Date('2026-10-13T09:00:00Z'), 1);
      const { repo, deps } = harness({ policies: [draftPolicy], drafts: [draft] });
      await runApprovalSweep(deps, NOW);
      expect(repo.saveEscalation).not.toHaveBeenCalled();
    });

    it('never opens an escalation window on a draft that expired after the query', async () => {
      const draft = pendingDraft(new Date('2026-10-13T09:00:00Z'), 1);
      const { repo, deps } = harness({ policies: [draftPolicy] });
      repo.findPendingOlderThan.mockResolvedValue([draft]);
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(NOW);
      await runApprovalSweep(deps, NOW);
      vi.useRealTimers();
      expect(draft.status).toBe('PENDING_APPROVAL');
      expect(repo.saveEscalation).not.toHaveBeenCalled();
    });

    it('skips a draft the aggregate refuses to escalate', async () => {
      const draft = pendingDraft(new Date('2026-10-13T11:00:00Z'));
      draft.escalate('someone', TARGET, 'manual', 1);
      draft.resolveEscalation(TARGET);
      // escalationCount is now 1 -> MAX is 3, so force a refusal by rejecting it.
      draft.reject(TARGET, 'no');
      const { repo, deps } = harness({ policies: [draftPolicy] });
      // Returned by a racing read even though it was decided meanwhile.
      repo.findPendingOlderThan.mockResolvedValue([draft]);
      const report = await runApprovalSweep(deps, NOW);
      expect(repo.saveEscalation).not.toHaveBeenCalled();
      expect(report.skipped).toBe(1);
    });

    it('never overwrites a draft decided or escalated meanwhile (guarded write)', async () => {
      const draft = pendingDraft(new Date('2026-10-13T11:00:00Z'));
      const { deps } = harness({
        policies: [draftPolicy],
        drafts: [draft],
        decidedMeanwhile: true,
      });
      const report = await runApprovalSweep(deps, NOW);
      expect(report).toMatchObject({ draftsEscalated: 0, skipped: 1 });
      expect(deps.notify).not.toHaveBeenCalled();
      expect(deps.log!.warn).toHaveBeenCalledWith(
        expect.stringContaining('decided or escalated meanwhile')
      );
    });

    it('does not skip drafts when earlier ones are escalated during paging (keyset)', async () => {
      // 150 overdue drafts: the first page escalates 100 of them, the second must still
      // reach the remaining 50 (an offset of 100 would skip them).
      const overdue = Array.from({ length: 150 }, (_, i) =>
        pendingDraftCreatedAt(
          new Date(Date.UTC(2026, 9, 13, 8, 0, i)),
          new Date('2026-10-13T09:00:00Z')
        )
      );
      const { deps } = harness({ policies: [draftPolicy], drafts: overdue });

      const report = await runApprovalSweep(deps, NOW);

      expect(report.draftsEscalated).toBe(150);
    });

    it('resumes a bounded scan on the next tick instead of restarting it', async () => {
      // More recently-submitted old drafts than one tick can scan, then an overdue one.
      const blocking = Array.from(
        { length: APPROVAL_SWEEP_MAX_PAGES * APPROVAL_SWEEP_BATCH },
        (_, i) =>
          pendingDraftCreatedAt(
            new Date(Date.UTC(2026, 9, 12, 0, 0, i)),
            new Date('2026-10-13T11:59:00Z')
          )
      );
      const overdue = pendingDraftCreatedAt(
        new Date('2026-10-13T09:00:00Z'),
        new Date('2026-10-13T09:01:00Z')
      );
      const { repo, deps } = harness({ policies: [draftPolicy], drafts: [...blocking, overdue] });

      const first = await runApprovalSweep(deps, NOW);
      expect(first.draftsEscalated).toBe(0);
      expect(repo.findPendingOlderThan).toHaveBeenCalledTimes(APPROVAL_SWEEP_MAX_PAGES);

      const second = await runApprovalSweep(deps, NOW);
      expect(second.draftsEscalated).toBe(1);
      expect(overdue.status).toBe('ESCALATED');

      // The second tick reached the end, so the third starts from the beginning again.
      repo.findPendingOlderThan.mockClear();
      await runApprovalSweep(deps, NOW);
      expect(repo.findPendingOlderThan.mock.calls[0]![1].after).toBeUndefined();
    });

    it('pages past drafts submitted too recently to reach an overdue one', async () => {
      // 100 old drafts submitted just now, then one created later but submitted long ago.
      const recent = Array.from({ length: 100 }, (_, i) =>
        pendingDraftCreatedAt(
          new Date(Date.UTC(2026, 9, 13, 8, 0, i)),
          new Date('2026-10-13T11:59:00Z')
        )
      );
      const overdue = pendingDraftCreatedAt(
        new Date('2026-10-13T09:00:00Z'),
        new Date('2026-10-13T09:01:00Z')
      );
      const { repo, deps } = harness({ policies: [draftPolicy], drafts: [...recent, overdue] });

      const report = await runApprovalSweep(deps, NOW);

      expect(repo.findPendingOlderThan).toHaveBeenCalledTimes(2);
      const cursor = repo.findPendingOlderThan.mock.calls[1]![1].after;
      expect(cursor.createdAt).toEqual(recent[99]!.createdAt);
      expect(report.draftsEscalated).toBe(1);
      expect(overdue.status).toBe('ESCALATED');
    });
  });
});

describe('createDefaultSweepDeps', () => {
  it('wires the shared client, the Prisma draft repository and in-app notifications', async () => {
    const deps = await createDefaultSweepDeps();

    expect(deps.prisma).toBeDefined();
    const repo: any = await deps.draftRepository({ marker: 1 } as any);
    expect(repo.client).toEqual({ marker: 1 });
    await deps.notify({
      tenantId: TENANT,
      userId: TARGET,
      title: 't',
      body: 'b',
      entityType: 'agent_action',
      entityId: 'a',
      entityName: 'n',
      actionUrl: '/x',
    });
    expect(createNotification).toHaveBeenCalledWith(
      deps.prisma,
      expect.objectContaining({
        type: 'ai_action_pending',
        priority: 'high',
        actionLabel: 'Review',
      })
    );
  });
});
