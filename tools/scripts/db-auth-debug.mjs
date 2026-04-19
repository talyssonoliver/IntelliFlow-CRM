import fs from 'node:fs/promises';
import { PrismaClient } from '../../packages/db/generated/prisma/client.js';
import { createClient } from '../../packages/db/node_modules/@supabase/supabase-js/dist/index.mjs';
import { PrismaPg } from '../../packages/db/node_modules/@prisma/adapter-pg/dist/index.mjs';

const envText = await fs.readFile(new URL('../../.env', import.meta.url), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  if (!line || line.trim().startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  const value = line.slice(idx + 1).trim();
  if (!(key in process.env)) process.env[key] = value;
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

try {
  const counts = {
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    leads: await prisma.lead.count(),
    accounts: await prisma.account.count(),
    tickets: await prisma.ticket.count(),
    emailRecords: await prisma.emailRecord.count(),
    aiInsights: await prisma.aIInsight.count(),
    agentSkills: await prisma.agentSkill.count(),
    tasks: await prisma.task.count(),
    opportunities: await prisma.opportunity.count(),
  };

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      tenantId: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const tenants = await prisma.tenant.findMany({
    select: { id: true, name: true, slug: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
    take: 20,
  });

  const supabase = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (error) throw error;

  const authMatches = (data?.users || [])
    .filter((u) => {
      const blob = JSON.stringify({
        email: u.email,
        user_metadata: u.user_metadata,
        identities: u.identities,
      }).toLowerCase();
      return blob.includes('taly') || blob.includes('oliveira');
    })
    .map((u) => ({
      id: u.id,
      email: u.email,
      user_metadata: u.user_metadata,
      app_metadata: u.app_metadata,
      created_at: u.created_at,
    }));

  const talysson = await prisma.user.findUnique({
    where: { email: 'talyssondasilvaoliveira@gmail.com' },
    select: { id: true, email: true, name: true, role: true, tenantId: true },
  });

  const talyssonOwned = talysson
    ? {
        leads: await prisma.lead.count({ where: { ownerId: talysson.id } }),
        accounts: await prisma.account.count({ where: { ownerId: talysson.id } }),
        opportunities: await prisma.opportunity.count({ where: { ownerId: talysson.id } }),
        tasks: await prisma.task.count({ where: { ownerId: talysson.id } }),
        ticketsAssigned: await prisma.ticket.count({ where: { assigneeId: talysson.id } }),
      }
    : null;

  console.log(
    JSON.stringify(
      {
        counts,
        tenants,
        users,
        authMatches,
        talysson,
        talyssonOwned,
      },
      null,
      2
    )
  );
} finally {
  await prisma.$disconnect();
}
