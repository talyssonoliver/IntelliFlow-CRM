import { Queue } from 'bullmq';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const connection = { host: 'localhost', port: 6379 };

const insightPayloads = [
  {
    userId: 'user-001',
    dealsAtRisk: [
      { id: 'd1', name: 'Acme Corp', daysSinceUpdate: 14, stage: 'negotiation', value: 50000 },
      { id: 'd2', name: 'GlobalTech', daysSinceUpdate: 21, stage: 'proposal', value: 120000 },
    ],
    hotLeads: [
      { id: 'l1', name: 'Jane Smith', score: 92, company: 'TechCo', status: 'new' },
    ],
    overdueTasksCount: 5,
    staleContacts: [
      { id: 'c1', name: 'Bob Johnson', daysSinceContact: 45, hasOpenOpportunities: true },
    ],
  },
  {
    userId: 'user-002',
    dealsAtRisk: [
      { id: 'd3', name: 'MediHealth Inc', daysSinceUpdate: 30, stage: 'discovery', value: 75000 },
    ],
    hotLeads: [
      { id: 'l2', name: 'Carlos Rivera', score: 88, company: 'FinServ', status: 'contacted' },
      { id: 'l3', name: 'Amy Chen', score: 95, company: 'DataPrime', status: 'new' },
    ],
    overdueTasksCount: 2,
    staleContacts: [
      { id: 'c2', name: 'Dana White', daysSinceContact: 60, hasOpenOpportunities: true },
      { id: 'c3', name: 'Eric Fox', daysSinceContact: 35, hasOpenOpportunities: false },
    ],
  },
  {
    userId: 'user-003',
    dealsAtRisk: [],
    hotLeads: [
      { id: 'l4', name: 'Priya Patel', score: 85, company: 'CloudNine', status: 'qualified' },
    ],
    overdueTasksCount: 0,
    staleContacts: [],
  },
];

async function main() {
  const q = new Queue('ai-insights', { connection });

  for (let i = 0; i < insightPayloads.length; i++) {
    const job = await q.add('generate-insights', {
      tenantId: TENANT_ID,
      correlationId: `batch-${Date.now()}-${i}`,
      ...insightPayloads[i],
    });
    console.log(`insight job #${job.id} queued (user: ${insightPayloads[i].userId})`);
  }

  await q.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
