import '../src/env';
import { prisma } from '@intelliflow/db';

async function main() {
  try {
    const insights = await prisma.aIInsight.findMany({
      select: {
        id: true,
        type: true,
        category: true,
        title: true,
        confidence: true,
        priority: true,
        entityType: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    console.log(`Found ${insights.length} insights:`);
    for (const i of insights) {
      console.log(`  [${i.priority}] ${i.type}/${i.category}: "${i.title}" (${i.confidence}% confidence, entity: ${i.entityType})`);
    }
  } catch (err) {
    console.error('Error:', (err as Error).message.substring(0, 300));
  }
  await prisma.$disconnect();
  process.exit(0);
}
main();
