import '../src/env';
import { prisma } from '@intelliflow/db';

async function main() {
  // Check userIds stored in insight metadata
  const insights = await prisma.aIInsight.findMany({
    select: { id: true, metadata: true, title: true },
    take: 5,
  });
  console.log('=== Insight userIds ===');
  for (const i of insights) {
    const meta = i.metadata as Record<string, unknown> | null;
    console.log(`  "${i.title}" -> userId: ${meta?.userId}`);
  }

  // Check real users in DB
  const users = await prisma.user.findMany({
    select: { id: true, email: true },
    take: 5,
  });
  console.log('\n=== Real users ===');
  for (const u of users) {
    console.log(`  ${u.id} (${u.email})`);
  }

  await prisma.$disconnect();
  process.exit(0);
}
main();
