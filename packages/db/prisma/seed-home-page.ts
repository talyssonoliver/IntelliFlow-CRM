/**
 * Home Page Seed Script
 *
 * Adds recent data for the home page without full database reset.
 * Run with: npx tsx packages/db/prisma/seed-home-page.ts
 */

import {
  PrismaClient,
  TaskPriority,
  TaskStatus,
  OpportunityStage,
  AppointmentStatus,
  AppointmentType,
  ActorType,
  AuditAction,
  LeadStatus,
  LeadSource,
  UserRole,
  Prisma,
} from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { SEED_IDS } from '../src/seed-ids';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const LEGACY_HOME_PAGE_TASK_IDS = ['home-task-1', 'home-task-2', 'home-task-3'] as const;

async function seedHomePageData() {
  console.log('🏠 Seeding home page data with recent dates...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Get the first tenant
  const tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    console.log('❌ No tenant found');
    return;
  }

  // Get or create a user
  let user = await prisma.user.findFirst({
    where: { tenantId: tenant.id },
    select: { id: true, email: true },
  });

  if (!user) {
    console.log('  Creating test user via raw SQL...');
    const userId = 'home-seed-user-1';
    const userEmail = 'demo@intelliflow.com';

    // Use raw SQL to avoid Prisma client schema mismatch issues
    // Column names are camelCase in the database
    await prisma.$executeRaw`
      INSERT INTO users (id, email, name, role, "tenantId", "createdAt", "updatedAt")
      VALUES (${userId}, ${userEmail}, 'Demo User', 'ADMIN', ${tenant.id}, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `;

    user = { id: userId, email: userEmail };
  }

  console.log(`  Using tenant: ${tenant.name}, user: ${user.email}`);

  // 1. Create recent HIGH priority tasks
  await prisma.task.deleteMany({
    where: {
      tenantId: tenant.id,
      id: { in: [...LEGACY_HOME_PAGE_TASK_IDS] },
    },
  });

  const recentTasks = [
    {
      id: SEED_IDS.dashboardTasks.callAcme,
      title: 'Follow up with Acme Corp on proposal',
      description: 'Send updated pricing and schedule demo call',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      ownerId: user.id,
      tenantId: tenant.id,
    },
    {
      id: SEED_IDS.dashboardTasks.reviewQ3,
      title: 'Prepare quarterly review presentation',
      description: 'Compile Q4 metrics and forecasts',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000),
      ownerId: user.id,
      tenantId: tenant.id,
    },
    {
      id: SEED_IDS.dashboardTasks.emailFollowup,
      title: 'Review contract with legal team',
      description: 'Get approval for TechCorp enterprise deal',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: today,
      ownerId: user.id,
      tenantId: tenant.id,
    },
  ];

  for (const task of recentTasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }
  console.log(`  ✅ Created ${recentTasks.length} high-priority tasks`);

  // 2. Create recent opportunities with CLOSED_WON
  let account = await prisma.account.findFirst({ where: { tenantId: tenant.id } });

  if (!account) {
    console.log('  Creating test account...');
    account = await prisma.account.create({
      data: {
        id: 'home-seed-account-1',
        name: 'Acme Corporation',
        industry: 'Technology',
        website: 'https://acme.example.com',
        ownerId: user.id,
        tenantId: tenant.id,
      },
    });
  }

  if (account) {
    const recentDeals = [
      {
        id: SEED_IDS.opportunities.homeDeal1,
        name: 'CloudSync Enterprise License',
        stage: OpportunityStage.CLOSED_WON,
        value: 75000,
        probability: 100,
        closedAt: twoDaysAgo,
        expectedCloseDate: twoDaysAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId: tenant.id,
      },
      {
        id: SEED_IDS.opportunities.homeDeal2,
        name: 'DataFlow Analytics Subscription',
        stage: OpportunityStage.CLOSED_WON,
        value: 45000,
        probability: 100,
        closedAt: threeDaysAgo,
        expectedCloseDate: threeDaysAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId: tenant.id,
      },
      {
        id: SEED_IDS.opportunities.homeDeal3,
        name: 'SecureVault Implementation',
        stage: OpportunityStage.CLOSED_WON,
        value: 120000,
        probability: 100,
        closedAt: oneWeekAgo,
        expectedCloseDate: oneWeekAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId: tenant.id,
      },
    ];

    for (const deal of recentDeals) {
      await prisma.opportunity.upsert({
        where: { id: deal.id },
        update: deal,
        create: deal,
      });
    }
    console.log(`  ✅ Created ${recentDeals.length} recent closed deals`);
  }

  // 3. Create recent audit log entries (for activity feed)
  let lead = await prisma.lead.findFirst({ where: { tenantId: tenant.id } });

  if (!lead) {
    console.log('  Creating test leads...');
    // Create multiple leads for the home page stats
    const leadsToCreate = [
      {
        id: SEED_IDS.leads.homeSeedLead1,
        firstName: 'John',
        lastName: 'Smith',
        email: 'john.smith@techcorp.com',
        company: 'TechCorp',
        status: LeadStatus.QUALIFIED,
        source: LeadSource.WEBSITE,
        score: 92,
        ownerId: user.id,
        tenantId: tenant.id,
        createdAt: yesterday,
      },
      {
        id: SEED_IDS.leads.homeSeedLead2,
        firstName: 'Sarah',
        lastName: 'Johnson',
        email: 'sarah.j@innovate.io',
        company: 'Innovate Inc',
        status: LeadStatus.NEW,
        source: LeadSource.REFERRAL,
        score: 75,
        ownerId: user.id,
        tenantId: tenant.id,
        createdAt: yesterday,
      },
      {
        id: SEED_IDS.leads.homeSeedLead3,
        firstName: 'Mike',
        lastName: 'Chen',
        email: 'mike.chen@startup.co',
        company: 'StartupCo',
        status: LeadStatus.NEW,
        source: LeadSource.SOCIAL,
        score: 68,
        ownerId: user.id,
        tenantId: tenant.id,
        createdAt: twoDaysAgo,
      },
    ];

    for (const leadData of leadsToCreate) {
      await prisma.lead.upsert({
        where: { id: leadData.id },
        update: leadData,
        create: leadData,
      });
    }
    console.log(`  ✅ Created ${leadsToCreate.length} test leads`);

    lead = await prisma.lead.findFirst({ where: { tenantId: tenant.id } });
  }

  const recentAuditLogs = [
    {
      id: SEED_IDS.auditLogs.homeAudit1,
      eventType: 'DealClosed',
      eventId: `event-home-audit-1-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Opportunity',
      resourceId: SEED_IDS.opportunities.homeDeal1,
      action: AuditAction.UPDATE,
      beforeState: { stage: 'NEGOTIATION' },
      afterState: { stage: 'CLOSED_WON', value: 75000 },
      changedFields: ['stage'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId: tenant.id,
      timestamp: twoDaysAgo,
    },
    {
      id: SEED_IDS.auditLogs.homeAudit2,
      eventType: 'TaskCompleted',
      eventId: `event-home-audit-2-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Task',
      resourceId: SEED_IDS.dashboardTasks.callAcme,
      action: AuditAction.UPDATE,
      beforeState: { status: 'IN_PROGRESS' },
      afterState: { status: 'COMPLETED' },
      changedFields: ['status'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId: tenant.id,
      timestamp: yesterday,
    },
    {
      id: SEED_IDS.auditLogs.homeAudit3,
      eventType: 'LeadQualified',
      eventId: `event-home-audit-3-${Date.now()}`,
      actorType: ActorType.AI,
      actorId: null,
      resourceType: 'Lead',
      resourceId: lead?.id || 'unknown',
      action: AuditAction.UPDATE,
      beforeState: { status: 'NEW', score: 45 },
      afterState: { status: 'QUALIFIED', score: 92 },
      changedFields: ['status', 'score'],
      ipAddress: null,
      userAgent: 'IntelliFlow AI Engine',
      tenantId: tenant.id,
      timestamp: yesterday,
    },
    {
      id: SEED_IDS.auditLogs.homeAudit4,
      eventType: 'EmailSent',
      eventId: `event-home-audit-4-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Email',
      resourceId: 'email-001',
      action: AuditAction.CREATE,
      beforeState: Prisma.JsonNull,
      afterState: { subject: 'Follow-up: Proposal Review', to: 'contact@acmecorp.com' },
      changedFields: ['subject', 'to', 'body'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId: tenant.id,
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      id: SEED_IDS.auditLogs.homeAudit5,
      eventType: 'CallLogged',
      eventId: `event-home-audit-5-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Call',
      resourceId: 'call-001',
      action: AuditAction.CREATE,
      beforeState: Prisma.JsonNull,
      afterState: { duration: 1800, outcome: 'Scheduled follow-up demo' },
      changedFields: ['duration', 'outcome', 'notes'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId: tenant.id,
      timestamp: new Date(now.getTime() - 4 * 60 * 60 * 1000), // 4 hours ago
    },
  ];

  for (const log of recentAuditLogs) {
    await prisma.auditLogEntry.upsert({
      where: { id: log.id },
      update: log,
      create: log,
    });
  }
  console.log(`  ✅ Created ${recentAuditLogs.length} recent audit log entries`);

  // 4. Create appointments for today
  const todayAppointments = [
    {
      id: 'home-appt-1',
      title: 'Product Demo - TechCorp',
      description: 'Show new analytics features',
      startTime: new Date(today.getTime() + 10 * 60 * 60 * 1000),
      endTime: new Date(today.getTime() + 11 * 60 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.MEETING,
      location: 'Zoom',
      organizerId: user.id,
      tenantId: tenant.id,
    },
    {
      id: 'home-appt-2',
      title: 'Weekly Team Standup',
      description: 'Review pipeline and blockers',
      startTime: new Date(today.getTime() + 14 * 60 * 60 * 1000),
      endTime: new Date(today.getTime() + 14.5 * 60 * 60 * 1000),
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.MEETING,
      location: 'Conference Room A',
      organizerId: user.id,
      tenantId: tenant.id,
    },
  ];

  for (const appt of todayAppointments) {
    await prisma.appointment.upsert({
      where: { id: appt.id },
      update: appt,
      create: appt,
    });
  }
  console.log(`  ✅ Created ${todayAppointments.length} appointments for today`);

  // Note: Skipping user preferences update as the column doesn't exist in current schema
  // Pinned items would be stored in user.preferences JSON column when available

  console.log('✅ Home page seed data complete!');
}

(async () => {
  try {
    await seedHomePageData();
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
