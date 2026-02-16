import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking database state...\n');

  // Check leads
  const leads = await prisma.lead.findMany({
    select: { id: true, ownerId: true, email: true },
    take: 20,
  });
  console.log(`Leads in database: ${leads.length}`);
  for (const l of leads) {
    console.log(
      `  ${l.id.substring(0, 35)}... -> owner: ${l.ownerId?.substring(0, 35) || 'null'} (${l.email})`
    );
  }

  // Check users that start with UUID prefix
  const uuidUsers = await prisma.user.findMany({
    where: { id: { startsWith: '00000000-0000-4000-8000' } },
    select: { id: true, email: true },
  });
  console.log(`\nUsers with UUID prefix: ${uuidUsers.length}`);
  for (const u of uuidUsers) {
    console.log(`  ${u.id} - ${u.email}`);
  }

  // Check all users
  const allUsers = await prisma.user.findMany({
    select: { id: true, email: true },
    take: 20,
  });
  console.log(`\nAll users (first 20): ${allUsers.length}`);
  for (const u of allUsers) {
    console.log(`  ${u.id.substring(0, 35)}... - ${u.email}`);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
