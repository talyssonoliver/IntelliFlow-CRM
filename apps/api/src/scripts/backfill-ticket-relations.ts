/**
 * Backfill script for existing tickets:
 * 1. Finds related tickets by subject word overlap (>= 30% similarity)
 * 2. Creates default next steps for tickets that have none
 *
 * Run via: npx tsx apps/api/src/scripts/backfill-ticket-relations.ts
 */

import { PrismaClient, type TicketPriority, type TicketStatus } from '@intelliflow/db';

const prisma = new PrismaClient();

function getDefaultNextSteps(
  priority: TicketPriority
): { title: string; dueDate: string }[] {
  const base: { title: string; dueDate: string }[] = [
    { title: 'Review ticket details and confirm category', dueDate: 'Due Today' },
    { title: 'Send initial acknowledgement to customer', dueDate: 'Due Today' },
  ];

  if (priority === 'CRITICAL' || priority === 'HIGH') {
    return [
      ...base,
      {
        title: 'Escalate to senior support if unresolved',
        dueDate: priority === 'CRITICAL' ? 'Due in 1 hour' : 'Due Today',
      },
      { title: 'Update customer with resolution progress', dueDate: 'Tomorrow' },
    ];
  }

  return [
    ...base,
    { title: 'Investigate root cause and document findings', dueDate: 'Tomorrow' },
  ];
}

async function backfillRelatedTickets() {
  console.log('--- Backfilling related tickets ---');

  // Get all tickets grouped by tenant
  const tickets = await prisma.ticket.findMany({
    select: { id: true, subject: true, status: true, tenantId: true },
    orderBy: { createdAt: 'desc' },
  });

  // Group by tenant
  const byTenant = new Map<string, typeof tickets>();
  for (const t of tickets) {
    const list = byTenant.get(t.tenantId) ?? [];
    list.push(t);
    byTenant.set(t.tenantId, list);
  }

  let totalCreated = 0;

  for (const [tenantId, tenantTickets] of byTenant) {
    console.log(`  Tenant ${tenantId}: ${tenantTickets.length} tickets`);

    for (const ticket of tenantTickets) {
      // Check if already has related tickets
      const existingCount = await prisma.relatedTicket.count({
        where: { ticketId: ticket.id },
      });
      if (existingCount > 0) continue;

      const subjectWords = new Set(
        ticket.subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
      );
      if (subjectWords.size === 0) continue;

      const matches: { id: string; subject: string; status: string; similarity: number }[] = [];

      for (const other of tenantTickets) {
        if (other.id === ticket.id) continue;
        const otherWords = other.subject.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        if (otherWords.length === 0) continue;
        const overlap = otherWords.filter((w) => subjectWords.has(w)).length;
        const similarity = Math.round(
          (overlap / Math.max(subjectWords.size, otherWords.length)) * 100
        );
        if (similarity >= 30) {
          matches.push({ id: other.id, subject: other.subject, status: other.status, similarity });
        }
      }

      if (matches.length === 0) continue;

      const topMatches = matches.sort((a, b) => b.similarity - a.similarity).slice(0, 5);

      await prisma.relatedTicket.createMany({
        data: topMatches.map((m) => ({
          ticketId: ticket.id,
          relatedId: m.id,
          relatedSubject: m.subject,
          relatedStatus: m.status as TicketStatus,
          similarity: m.similarity,
          tenantId,
        })),
        skipDuplicates: true,
      });

      totalCreated += topMatches.length;
    }
  }

  console.log(`  Created ${totalCreated} related ticket links`);
}

async function backfillNextSteps() {
  console.log('--- Backfilling next steps ---');

  // Find tickets with no next steps
  const ticketsWithoutSteps = await prisma.ticket.findMany({
    where: {
      nextSteps: { none: {} },
      status: { notIn: ['RESOLVED', 'CLOSED', 'ARCHIVED'] },
    },
    select: { id: true, priority: true, tenantId: true },
  });

  console.log(`  Found ${ticketsWithoutSteps.length} tickets without next steps`);

  let totalCreated = 0;

  for (const ticket of ticketsWithoutSteps) {
    const steps = getDefaultNextSteps(ticket.priority);
    await prisma.ticketNextStep.createMany({
      data: steps.map((step) => ({
        ticketId: ticket.id,
        title: step.title,
        dueDate: step.dueDate,
        completed: false,
        tenantId: ticket.tenantId,
      })),
    });
    totalCreated += steps.length;
  }

  console.log(`  Created ${totalCreated} next steps`);
}

async function main() {
  console.log('Ticket backfill script starting...\n');

  await backfillRelatedTickets();
  console.log('');
  await backfillNextSteps();

  console.log('\nDone!');
}

main()
  .catch((e) => {
    console.error('Backfill failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
