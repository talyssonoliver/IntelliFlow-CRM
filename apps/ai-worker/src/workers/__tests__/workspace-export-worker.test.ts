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

import { processWorkspaceExportJob } from '../workspace-export-worker.js';

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
