import { Queue } from 'bullmq';
const c = { host: 'localhost', port: 6379 };

async function main() {
  const iq = new Queue('ai-insights', { connection: c });
  const j1 = await iq.add('generate-insights', {
    tenantId: 'test-tenant-001',
    userId: 'test-user-001',
    correlationId: 'ollama-test-' + Date.now(),
    dealsAtRisk: [{ id: 'd1', name: 'Acme Corp', daysSinceUpdate: 14 }],
    hotLeads: [{ id: 'l1', name: 'Jane Smith', score: 92, company: 'TechCo' }],
    overdueTasksCount: 3,
    staleContacts: [{ id: 'c1', name: 'Bob J', daysSinceContact: 45 }],
  });
  console.log('insight job queued: #' + j1.id);

  const sq = new Queue('ai-scoring', { connection: c });
  const j2 = await sq.add('score-lead', {
    tenantId: 'test-tenant-001',
    lead: {
      email: 'cto@enterprise.com',
      firstName: 'Sarah',
      lastName: 'Connor',
      company: 'Enterprise Corp',
      title: 'CTO',
      source: 'website',
    },
    correlationId: 'scoring-test-' + Date.now(),
  });
  console.log('scoring job queued: #' + j2.id);

  await iq.close();
  await sq.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
