import { Queue } from 'bullmq';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const REAL_USER_ID = '00000000-0000-4000-8000-000000000101'; // admin@intelliflow.dev
const connection = { host: 'localhost', port: 6379 };

async function main() {
  const q = new Queue('ai-insights', { connection });

  const job = await q.add('generate-insights', {
    tenantId: TENANT_ID,
    correlationId: `real-user-${Date.now()}`,
    userId: REAL_USER_ID,
    dealsAtRisk: [
      { id: 'd1', name: 'Acme Corp', daysSinceUpdate: 14, stage: 'negotiation', value: 50000 },
      { id: 'd2', name: 'GlobalTech', daysSinceUpdate: 21, stage: 'proposal', value: 120000 },
    ],
    hotLeads: [
      { id: 'l1', name: 'Jane Smith', score: 92, company: 'TechCo', status: 'new' },
      { id: 'l2', name: 'Carlos Rivera', score: 88, company: 'FinServ', status: 'contacted' },
    ],
    overdueTasksCount: 5,
    staleContacts: [
      { id: 'c1', name: 'Bob Johnson', daysSinceContact: 45, hasOpenOpportunities: true },
    ],
  });

  console.log(`Insight job #${job.id} queued for real user ${REAL_USER_ID}`);
  await q.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
