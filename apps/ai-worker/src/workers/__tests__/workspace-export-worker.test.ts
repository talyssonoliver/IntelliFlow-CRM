import { describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_EXPORT_JOB,
  WORKSPACE_EXPORT_QUEUE,
  WORKSPACE_EXPORT_SWEEP_JOB,
} from '@intelliflow/adapters';

const processWorkspaceExport = vi.fn();
const sweepWorkspaceExports = vi.fn();
vi.mock('@intelliflow/adapters', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@intelliflow/adapters')>()),
  processWorkspaceExport: (...a: unknown[]) => processWorkspaceExport(...a),
  sweepWorkspaceExports: (...a: unknown[]) => sweepWorkspaceExports(...a),
}));

import { createExportMailSender, processWorkspaceExportJob } from '../workspace-export-worker.js';

const deps = {} as never;
const enqueue = vi.fn();

describe('processWorkspaceExportJob', () => {
  it('runs the export for a workspace:export job', async () => {
    processWorkspaceExport.mockResolvedValue({ status: 'ready' });
    const out = await processWorkspaceExportJob(
      { name: WORKSPACE_EXPORT_JOB, data: { requestId: 'req_1', tenantId: 't1' } },
      deps,
      enqueue
    );
    expect(out).toEqual({ status: 'ready' });
    expect(processWorkspaceExport).toHaveBeenCalledWith(deps, { requestId: 'req_1' });
  });

  it('runs the sweep for the repeatable job', async () => {
    sweepWorkspaceExports.mockResolvedValue({ requeued: 1, emailsRetried: 0, expired: 2 });
    const out = await processWorkspaceExportJob(
      { name: WORKSPACE_EXPORT_SWEEP_JOB, data: {} },
      deps,
      enqueue
    );
    expect(out).toEqual({ requeued: 1, emailsRetried: 0, expired: 2 });
    expect(sweepWorkspaceExports).toHaveBeenCalledWith(deps, enqueue);
  });

  it('rejects a malformed export job instead of running it', async () => {
    processWorkspaceExport.mockClear();
    await expect(
      processWorkspaceExportJob(
        { name: WORKSPACE_EXPORT_JOB, data: { tenantId: 't1' } },
        deps,
        enqueue
      )
    ).rejects.toThrow();
    expect(processWorkspaceExport).not.toHaveBeenCalled();
  });

  it('rejects an unknown job name', async () => {
    await expect(
      processWorkspaceExportJob({ name: 'other', data: {} }, deps, enqueue)
    ).rejects.toThrow(/Unknown workspace export job/);
  });

  it('uses the queue name the API produces to', () => {
    expect(WORKSPACE_EXPORT_QUEUE).toBe('intelliflow-workspace-export');
  });
});

describe('createExportMailSender', () => {
  const mail = {
    recipientUserId: 'u1',
    tenantId: 't1',
    subject: 's',
    body: 'b',
    dedupeKey: 'req_1-sha-u1',
  };
  const JOB_ID = 'workspace-export-mail-req_1-sha-u1';

  type FakeJob = {
    getState: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    waitUntilFinished: ReturnType<typeof vi.fn>;
    returnvalue?: unknown;
  };
  const fakeJob = (
    over: Partial<FakeJob> & { result?: unknown; fail?: boolean } = {}
  ): FakeJob => ({
    getState: vi.fn(async () => 'waiting'),
    remove: vi.fn(async () => undefined),
    waitUntilFinished: vi.fn(async () => {
      if (over.fail) throw new Error('job failed');
      return over.result;
    }),
    ...over,
  });
  const queueWith = (existing: FakeJob | null, created: FakeJob = fakeJob()) => {
    const queue = { getJob: vi.fn(async () => existing), add: vi.fn(async () => created) };
    return { queue, created, send: createExportMailSender(queue as never, {} as never, 1000) };
  };

  it('counts the mail as sent only after the notification job finished', async () => {
    const { queue, created, send } = queueWith(null, fakeJob({ result: { delivered: true } }));
    await send(mail);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(created.waitUntilFinished).toHaveBeenCalledTimes(1);
  });

  it('queues the mail under a deterministic job id, looked up first', async () => {
    const { queue, send } = queueWith(null, fakeJob({ result: { delivered: true } }));
    await send(mail);
    expect(queue.getJob).toHaveBeenCalledWith(JOB_ID);
    expect(queue.add).toHaveBeenCalledWith(
      'notification:email',
      expect.objectContaining({ recipientUserId: 'u1', type: 'workspace_export_ready' }),
      { jobId: JOB_ID }
    );
    // The id carries nothing BullMQ rejects.
    expect(JOB_ID).not.toContain(':');
  });

  it('waits on the job still on the queue after a timed-out wait, instead of queuing a copy', async () => {
    const pending = fakeJob({ result: { delivered: true } });
    for (const state of ['waiting', 'active', 'delayed']) {
      pending.getState.mockResolvedValue(state);
      const { queue, send } = queueWith(pending);
      await send(mail);
      expect(queue.add, state).not.toHaveBeenCalled();
    }
    expect(pending.waitUntilFinished).toHaveBeenCalledTimes(3);
  });

  it('treats a job that already finished with delivery as sent, with no new job', async () => {
    const done = fakeJob({ returnvalue: { delivered: true } });
    done.getState.mockResolvedValue('completed');
    const { queue, send } = queueWith(done);
    await send(mail);
    expect(queue.add).not.toHaveBeenCalled();
    expect(done.waitUntilFinished).not.toHaveBeenCalled();
  });

  it('removes a failed or undelivered job and queues a fresh one', async () => {
    for (const [state, returnvalue] of [
      ['failed', undefined],
      ['completed', { delivered: false, reason: 'bounced' }],
    ] as const) {
      const old = fakeJob({ returnvalue });
      old.getState.mockResolvedValue(state);
      const { queue, send } = queueWith(old, fakeJob({ result: { delivered: true } }));
      await send(mail);
      expect(old.remove, state).toHaveBeenCalledTimes(1);
      expect(queue.add, state).toHaveBeenCalledTimes(1);
    }
  });

  it('fails when the job fails, so the sweep retries that recipient', async () => {
    const { send } = queueWith(null, fakeJob({ fail: true }));
    await expect(send(mail)).rejects.toThrow('job failed');
  });

  it('fails when the notification worker could not deliver', async () => {
    const { send } = queueWith(
      null,
      fakeJob({ result: { delivered: false, reason: 'no-recipient-email' } })
    );
    await expect(send(mail)).rejects.toThrow(/no-recipient-email/);
  });
});
