import { Queue } from 'bullmq';

async function main() {
  const q = new Queue('ai-insights', { connection: { host: 'localhost', port: 6379 } });
  const counts = await q.getJobCounts();
  console.log('Queue counts:', JSON.stringify(counts, null, 2));

  const failed = await q.getFailed(0, 10);
  console.log(`\nFailed jobs: ${failed.length}`);
  for (const job of failed) {
    console.log(`\n--- Job #${job.id} ---`);
    console.log(`  userId: ${job.data?.userId}`);
    console.log(`  tenantId: ${job.data?.tenantId}`);
    console.log(`  attempts: ${job.attemptsMade}`);
    console.log(`  failedReason: ${job.failedReason}`);
    console.log(`  stacktrace: ${job.stacktrace?.[0]?.slice(0, 300)}`);
  }

  await q.close();
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
