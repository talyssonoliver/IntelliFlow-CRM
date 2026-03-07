import { Queue } from 'bullmq';

async function main() {
  const q = new Queue('ai-insights', { connection: { host: 'localhost', port: 6379 } });

  const counts = await q.getJobCounts();
  console.log('Queue counts:', JSON.stringify(counts, null, 2));

  // Check the latest jobs
  for (const id of ['191', '190', '189', '188', '187']) {
    const job = await q.getJob(id);
    if (!job) continue;
    const state = await job.getState();
    const userId = job.data?.userId ?? 'N/A';
    console.log(`Job #${id}: state=${state}, userId=${userId}`);
    if (state === 'failed') console.log(`  reason: ${job.failedReason?.slice(0, 200)}`);
    if (state === 'completed') console.log(`  result: ${JSON.stringify(job.returnvalue)?.slice(0, 200)}`);
  }

  await q.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
