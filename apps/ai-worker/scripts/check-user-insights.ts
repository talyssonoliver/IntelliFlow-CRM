import '../src/env';
import { prisma } from '@intelliflow/db';

async function main() {
  const insights = await prisma.aIInsight.findMany({
    where: {
      metadata: { path: ['userId'], equals: '00000000-0000-4000-8000-000000000101' },
    },
    select: { id: true, title: true, type: true, category: true, status: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Insights for admin user: ${insights.length}`);
  for (const i of insights) {
    console.log(`  - [${i.type}] ${i.category} | ${i.title} | ${i.status}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}
main();
