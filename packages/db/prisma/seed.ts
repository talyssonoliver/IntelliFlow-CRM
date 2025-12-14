/**
 * IntelliFlow CRM - Database Seed Script
 *
 * This script populates the database with sample data for development and testing.
 * It is idempotent - can be run multiple times without creating duplicates.
 *
 * Usage:
 *   pnpm run db:seed
 *
 * Features:
 * - Creates users with different roles
 * - Creates sample leads with various statuses and scores
 * - Creates contacts, accounts, and opportunities
 * - Generates AI scores for leads
 * - Creates sample tasks
 * - Generates audit logs
 */

import { PrismaClient, UserRole, LeadSource, LeadStatus, OpportunityStage, TaskPriority, TaskStatus, EventStatus } from '@prisma/client';

const prisma = new PrismaClient();

// Deterministic IDs for idempotency
const SEED_IDS = {
  users: {
    admin: 'seed-user-admin-001',
    manager: 'seed-user-manager-001',
    salesRep1: 'seed-user-sales-001',
    salesRep2: 'seed-user-sales-002',
  },
  leads: {
    lead1: 'seed-lead-001',
    lead2: 'seed-lead-002',
    lead3: 'seed-lead-003',
    lead4: 'seed-lead-004',
    lead5: 'seed-lead-005',
  },
  contacts: {
    contact1: 'seed-contact-001',
    contact2: 'seed-contact-002',
    contact3: 'seed-contact-003',
  },
  accounts: {
    account1: 'seed-account-001',
    account2: 'seed-account-002',
    account3: 'seed-account-003',
  },
  opportunities: {
    opp1: 'seed-opp-001',
    opp2: 'seed-opp-002',
    opp3: 'seed-opp-003',
  },
};

async function cleanDatabase() {
  console.log('🧹 Cleaning existing seed data...');

  // Delete in correct order to respect foreign key constraints
  await prisma.aiScore.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.auditLog.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.domainEvent.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.task.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.opportunity.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.contact.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.lead.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.account.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: 'seed-' } },
  });

  console.log('✅ Existing seed data cleaned');
}

async function seedUsers() {
  console.log('👥 Seeding users...');

  const users = [
    {
      id: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      name: 'Admin User',
      role: UserRole.ADMIN,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
    {
      id: SEED_IDS.users.manager,
      email: 'manager@intelliflow.dev',
      name: 'Sarah Manager',
      role: UserRole.MANAGER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
    },
    {
      id: SEED_IDS.users.salesRep1,
      email: 'john.sales@intelliflow.dev',
      name: 'John Sales',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john',
    },
    {
      id: SEED_IDS.users.salesRep2,
      email: 'jane.sales@intelliflow.dev',
      name: 'Jane Sales',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jane',
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: user,
      create: user,
    });
  }

  console.log(`✅ Created ${users.length} users`);
  return users;
}

async function seedAccounts() {
  console.log('🏢 Seeding accounts...');

  const accounts = [
    {
      id: SEED_IDS.accounts.account1,
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      employees: 500,
      revenue: 50000000,
      description: 'Leading provider of enterprise software solutions',
      ownerId: SEED_IDS.users.salesRep1,
    },
    {
      id: SEED_IDS.accounts.account2,
      name: 'TechStart Inc',
      website: 'https://techstart.example.com',
      industry: 'SaaS',
      employees: 50,
      revenue: 5000000,
      description: 'Fast-growing startup in the productivity space',
      ownerId: SEED_IDS.users.salesRep2,
    },
    {
      id: SEED_IDS.accounts.account3,
      name: 'Global Enterprises',
      website: 'https://global.example.com',
      industry: 'Consulting',
      employees: 2000,
      revenue: 200000000,
      description: 'International consulting firm',
      ownerId: SEED_IDS.users.salesRep1,
    },
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { id: account.id },
      update: account,
      create: account,
    });
  }

  console.log(`✅ Created ${accounts.length} accounts`);
  return accounts;
}

async function seedLeads() {
  console.log('🎯 Seeding leads...');

  const leads = [
    {
      id: SEED_IDS.leads.lead1,
      email: 'michael.prospect@example.com',
      firstName: 'Michael',
      lastName: 'Prospect',
      company: 'Innovation Labs',
      title: 'CTO',
      phone: '+1-555-0101',
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      score: 85,
      ownerId: SEED_IDS.users.salesRep1,
    },
    {
      id: SEED_IDS.leads.lead2,
      email: 'lisa.potential@example.com',
      firstName: 'Lisa',
      lastName: 'Potential',
      company: 'DataDrive Systems',
      title: 'VP of Engineering',
      phone: '+1-555-0102',
      source: LeadSource.REFERRAL,
      status: LeadStatus.CONTACTED,
      score: 92,
      ownerId: SEED_IDS.users.salesRep1,
    },
    {
      id: SEED_IDS.leads.lead3,
      email: 'robert.lead@example.com',
      firstName: 'Robert',
      lastName: 'Lead',
      company: 'CloudFirst Inc',
      title: 'Director of IT',
      phone: '+1-555-0103',
      source: LeadSource.SOCIAL,
      status: LeadStatus.QUALIFIED,
      score: 78,
      ownerId: SEED_IDS.users.salesRep2,
    },
    {
      id: SEED_IDS.leads.lead4,
      email: 'emily.cold@example.com',
      firstName: 'Emily',
      lastName: 'Cold',
      company: 'StartupXYZ',
      title: 'Founder',
      phone: '+1-555-0104',
      source: LeadSource.COLD_CALL,
      status: LeadStatus.UNQUALIFIED,
      score: 35,
      ownerId: SEED_IDS.users.salesRep2,
    },
    {
      id: SEED_IDS.leads.lead5,
      email: 'david.converted@example.com',
      firstName: 'David',
      lastName: 'Converted',
      company: 'Enterprise Solutions',
      title: 'CEO',
      phone: '+1-555-0105',
      source: LeadSource.EVENT,
      status: LeadStatus.CONVERTED,
      score: 95,
      ownerId: SEED_IDS.users.salesRep1,
    },
  ];

  for (const lead of leads) {
    await prisma.lead.upsert({
      where: { id: lead.id },
      update: lead,
      create: lead,
    });
  }

  console.log(`✅ Created ${leads.length} leads`);
  return leads;
}

async function seedContacts() {
  console.log('📇 Seeding contacts...');

  const contacts = [
    {
      id: SEED_IDS.contacts.contact1,
      email: 'alice.johnson@acme.example.com',
      firstName: 'Alice',
      lastName: 'Johnson',
      title: 'VP of Sales',
      phone: '+1-555-0201',
      department: 'Sales',
      ownerId: SEED_IDS.users.salesRep1,
      accountId: SEED_IDS.accounts.account1,
      leadId: SEED_IDS.leads.lead5, // Converted lead
    },
    {
      id: SEED_IDS.contacts.contact2,
      email: 'bob.smith@techstart.example.com',
      firstName: 'Bob',
      lastName: 'Smith',
      title: 'Product Manager',
      phone: '+1-555-0202',
      department: 'Product',
      ownerId: SEED_IDS.users.salesRep2,
      accountId: SEED_IDS.accounts.account2,
    },
    {
      id: SEED_IDS.contacts.contact3,
      email: 'carol.williams@global.example.com',
      firstName: 'Carol',
      lastName: 'Williams',
      title: 'Head of Operations',
      phone: '+1-555-0203',
      department: 'Operations',
      ownerId: SEED_IDS.users.salesRep1,
      accountId: SEED_IDS.accounts.account3,
    },
  ];

  for (const contact of contacts) {
    await prisma.contact.upsert({
      where: { id: contact.id },
      update: contact,
      create: contact,
    });
  }

  console.log(`✅ Created ${contacts.length} contacts`);
  return contacts;
}

async function seedOpportunities() {
  console.log('💰 Seeding opportunities...');

  const opportunities = [
    {
      id: SEED_IDS.opportunities.opp1,
      name: 'Acme Enterprise License',
      value: 250000,
      stage: OpportunityStage.PROPOSAL,
      probability: 70,
      expectedCloseDate: new Date('2025-03-31'),
      description: 'Enterprise license for 500 users',
      ownerId: SEED_IDS.users.salesRep1,
      accountId: SEED_IDS.accounts.account1,
      contactId: SEED_IDS.contacts.contact1,
    },
    {
      id: SEED_IDS.opportunities.opp2,
      name: 'TechStart Growth Plan',
      value: 50000,
      stage: OpportunityStage.NEGOTIATION,
      probability: 85,
      expectedCloseDate: new Date('2025-02-28'),
      description: 'Annual subscription with premium support',
      ownerId: SEED_IDS.users.salesRep2,
      accountId: SEED_IDS.accounts.account2,
      contactId: SEED_IDS.contacts.contact2,
    },
    {
      id: SEED_IDS.opportunities.opp3,
      name: 'Global Consulting Package',
      value: 500000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 40,
      expectedCloseDate: new Date('2025-06-30'),
      description: 'Multi-year consulting and implementation',
      ownerId: SEED_IDS.users.salesRep1,
      accountId: SEED_IDS.accounts.account3,
      contactId: SEED_IDS.contacts.contact3,
    },
  ];

  for (const opportunity of opportunities) {
    await prisma.opportunity.upsert({
      where: { id: opportunity.id },
      update: opportunity,
      create: opportunity,
    });
  }

  console.log(`✅ Created ${opportunities.length} opportunities`);
  return opportunities;
}

async function seedAIScores() {
  console.log('🤖 Seeding AI scores...');

  const aiScores = [
    {
      id: 'seed-ai-score-001',
      score: 85,
      confidence: 0.92,
      factors: {
        title_score: 30,
        company_size_score: 25,
        engagement_score: 20,
        budget_fit_score: 10,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.lead1,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-002',
      score: 92,
      confidence: 0.95,
      factors: {
        title_score: 35,
        company_size_score: 30,
        engagement_score: 22,
        budget_fit_score: 5,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.lead2,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-003',
      score: 78,
      confidence: 0.88,
      factors: {
        title_score: 25,
        company_size_score: 20,
        engagement_score: 18,
        budget_fit_score: 15,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.lead3,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-004',
      score: 35,
      confidence: 0.75,
      factors: {
        title_score: 10,
        company_size_score: 5,
        engagement_score: 15,
        budget_fit_score: 5,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.lead4,
      scoredById: SEED_IDS.users.admin,
    },
    {
      id: 'seed-ai-score-005',
      score: 95,
      confidence: 0.98,
      factors: {
        title_score: 35,
        company_size_score: 30,
        engagement_score: 25,
        budget_fit_score: 5,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.lead5,
      scoredById: SEED_IDS.users.admin,
    },
  ];

  for (const aiScore of aiScores) {
    await prisma.aiScore.upsert({
      where: { id: aiScore.id },
      update: aiScore,
      create: aiScore,
    });
  }

  console.log(`✅ Created ${aiScores.length} AI scores`);
  return aiScores;
}

async function seedTasks() {
  console.log('📋 Seeding tasks...');

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const tasks = [
    {
      id: 'seed-task-001',
      title: 'Follow up with Michael Prospect',
      description: 'Schedule a demo call to discuss their requirements',
      dueDate: tomorrow,
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.salesRep1,
      leadId: SEED_IDS.leads.lead1,
    },
    {
      id: 'seed-task-002',
      title: 'Send proposal to Acme Corp',
      description: 'Prepare and send enterprise pricing proposal',
      dueDate: nextWeek,
      priority: TaskPriority.URGENT,
      status: TaskStatus.IN_PROGRESS,
      ownerId: SEED_IDS.users.salesRep1,
      opportunityId: SEED_IDS.opportunities.opp1,
    },
    {
      id: 'seed-task-003',
      title: 'Qualification call with Lisa',
      description: 'Understand their current pain points and budget',
      dueDate: tomorrow,
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.salesRep1,
      leadId: SEED_IDS.leads.lead2,
    },
    {
      id: 'seed-task-004',
      title: 'Contract review for TechStart',
      description: 'Review and finalize contract terms',
      dueDate: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000),
      priority: TaskPriority.URGENT,
      status: TaskStatus.IN_PROGRESS,
      ownerId: SEED_IDS.users.salesRep2,
      opportunityId: SEED_IDS.opportunities.opp2,
    },
    {
      id: 'seed-task-005',
      title: 'Check in with Bob',
      description: 'Monthly check-in call',
      dueDate: nextWeek,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.salesRep2,
      contactId: SEED_IDS.contacts.contact2,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} tasks`);
  return tasks;
}

async function seedAuditLogs() {
  console.log('📝 Seeding audit logs...');

  const auditLogs = [
    {
      id: 'seed-audit-001',
      action: 'CREATE',
      entityType: 'Lead',
      entityId: SEED_IDS.leads.lead1,
      oldValue: null,
      newValue: { status: LeadStatus.NEW, score: 85 },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userId: SEED_IDS.users.salesRep1,
    },
    {
      id: 'seed-audit-002',
      action: 'UPDATE',
      entityType: 'Lead',
      entityId: SEED_IDS.leads.lead2,
      oldValue: { status: LeadStatus.NEW },
      newValue: { status: LeadStatus.CONTACTED },
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userId: SEED_IDS.users.salesRep1,
    },
    {
      id: 'seed-audit-003',
      action: 'CREATE',
      entityType: 'Opportunity',
      entityId: SEED_IDS.opportunities.opp1,
      oldValue: null,
      newValue: { stage: OpportunityStage.PROPOSAL, value: 250000 },
      ipAddress: '192.168.1.101',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      userId: SEED_IDS.users.salesRep1,
    },
  ];

  for (const auditLog of auditLogs) {
    await prisma.auditLog.upsert({
      where: { id: auditLog.id },
      update: auditLog,
      create: auditLog,
    });
  }

  console.log(`✅ Created ${auditLogs.length} audit logs`);
  return auditLogs;
}

async function seedDomainEvents() {
  console.log('📤 Seeding domain events...');

  const domainEvents = [
    {
      id: 'seed-event-001',
      eventType: 'LeadCreated',
      aggregateType: 'Lead',
      aggregateId: SEED_IDS.leads.lead1,
      payload: {
        email: 'michael.prospect@example.com',
        source: LeadSource.WEBSITE,
      },
      metadata: { userId: SEED_IDS.users.salesRep1 },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
    },
    {
      id: 'seed-event-002',
      eventType: 'LeadScored',
      aggregateType: 'Lead',
      aggregateId: SEED_IDS.leads.lead1,
      payload: {
        score: 85,
        confidence: 0.92,
        modelVersion: 'v1.0.0',
      },
      metadata: { scoredById: SEED_IDS.users.admin },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
    },
    {
      id: 'seed-event-003',
      eventType: 'OpportunityCreated',
      aggregateType: 'Opportunity',
      aggregateId: SEED_IDS.opportunities.opp1,
      payload: {
        name: 'Acme Enterprise License',
        value: 250000,
      },
      metadata: { userId: SEED_IDS.users.salesRep1 },
      status: EventStatus.PENDING,
    },
  ];

  for (const event of domainEvents) {
    await prisma.domainEvent.upsert({
      where: { id: event.id },
      update: event,
      create: event,
    });
  }

  console.log(`✅ Created ${domainEvents.length} domain events`);
  return domainEvents;
}

async function main() {
  console.log('🌱 Starting database seeding...\n');

  try {
    // Clean existing seed data for idempotency
    await cleanDatabase();

    // Seed data in correct order
    await seedUsers();
    await seedAccounts();
    await seedLeads();
    await seedContacts();
    await seedOpportunities();
    await seedAIScores();
    await seedTasks();
    await seedAuditLogs();
    await seedDomainEvents();

    console.log('\n✨ Database seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log('  - 4 users (admin, manager, 2 sales reps)');
    console.log('  - 3 accounts');
    console.log('  - 5 leads (various statuses)');
    console.log('  - 3 contacts');
    console.log('  - 3 opportunities');
    console.log('  - 5 AI scores');
    console.log('  - 5 tasks');
    console.log('  - 3 audit logs');
    console.log('  - 3 domain events');
    console.log('\n🎉 Ready to start development!\n');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
