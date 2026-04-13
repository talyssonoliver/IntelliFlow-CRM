/**
 * Cleanup Dead Jobs
 *
 * Removes failed jobs with invalid tenantId or that hit non-retryable errors.
 * Preserves jobs with valid tenant IDs for forensic inspection.
 *
 * Usage: npx tsx scripts/cleanup-dead-jobs.ts [--dry-run]
 */

import { Queue } from 'bullmq';

const VALID_TENANT_ID = '00000000-0000-4000-8000-000000000001';
const connection = { host: 'localhost', port: 6379 };

const DEAD_TENANT_IDS = new Set(['344b1756-0000-4000-8000-344b17560000', 'test-tenant', 'default']);

const NON_RETRYABLE_ERRORS = [
  'does not exist in the current database',
  'Foreign key constraint violated',
];

async function processFailedJob(
  job: Awaited<ReturnType<Queue['getFailed']>>[number],
  dryRun: boolean
): Promise<'removed' | 'kept'> {
  const tenantId = job.data?.tenantId ?? job.data?.context?.tenantId;
  const reason = job.failedReason || '';
  const isDeadTenant = DEAD_TENANT_IDS.has(tenantId);
  const isNonRetryable = NON_RETRYABLE_ERRORS.some((e) => reason.includes(e));

  if (isDeadTenant || isNonRetryable) {
    if (!dryRun) {
      await job.remove();
    }
    console.log(
      `  ${dryRun ? '[WOULD REMOVE]' : '[REMOVED]'} Job #${job.id} (tenant: ${tenantId}, reason: ${reason.slice(0, 80)})`
    );
    return 'removed';
  }

  console.log(`  [KEPT] Job #${job.id} (tenant: ${tenantId}, reason: ${reason.slice(0, 80)})`);
  return 'kept';
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('[DRY RUN] No jobs will be removed.\n');

  for (const queueName of ['ai-insights', 'ai-prediction', 'ai-scoring']) {
    const q = new Queue(queueName, { connection });
    const counts = await q.getJobCounts();
    console.log(`\n=== ${queueName} ===`);
    console.log(
      `  Completed: ${counts.completed}, Failed: ${counts.failed}, Active: ${counts.active}, Waiting: ${counts.waiting}`
    );

    if (counts.failed === 0) {
      await q.close();
      continue;
    }

    const failed = await q.getFailed(0, counts.failed);
    let removed = 0;
    let kept = 0;

    for (const job of failed) {
      const outcome = await processFailedJob(job, dryRun);
      if (outcome === 'removed') removed++;
      else kept++;
    }

    console.log(`  Summary: ${removed} removed, ${kept} kept`);
    await q.close();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
