/**
 * Cleanup Legacy String-ID Seed Data
 *
 * This script removes old seed data that was created with string IDs
 * (e.g., 'seed-lead-sarah-miller') before the migration to UUID format.
 *
 * Run this ONCE after migrating to UUID-based seed IDs to remove duplicates.
 *
 * Usage:
 *   npx tsx packages/db/prisma/cleanup-legacy-seed-ids.ts
 *
 * IMPORTANT: This is a destructive operation. Make sure you have a backup!
 */

import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { LEGACY_STRING_IDS } from '../src/seed-ids';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
const LEGACY_HOME_PAGE_TASK_IDS = ['home-task-1', 'home-task-2', 'home-task-3'] as const;

/**
 * Legacy string ID patterns for each entity type
 * These patterns match the old seed data format
 */
const LEGACY_PATTERNS = {
  leads: 'seed-lead-',
  contacts: 'seed-contact-',
  accounts: 'seed-account-',
  opportunities: 'seed-opp-',
  tickets: 'seed-ticket-',
  tasks: 'seed-task-',
  slaPolicy: 'seed-sla-policy-',
  // Supplementary data
  dealProducts: 'seed-product-',
  dealFiles: 'seed-file-',
  dealActivities: 'seed-activity-',
  ticketActivities: 'seed-tkt-activity-',
  ticketAttachments: 'seed-tkt-attach-',
  agentActions: 'seed-agent-action-',
  contactActivities: 'seed-contact-act-',
  dashboardActivities: 'seed-dashboard-act-',
  contactNotes: 'seed-note-',
  contactAIInsights: 'seed-ai-insight-',
  calendarEvents: 'seed-event-',
  teamMessages: 'seed-msg-',
  pipelineSnapshots: 'seed-pipeline-',
  trafficSources: 'seed-traffic-',
  growthMetrics: 'seed-growth-',
  dealsWonMetrics: 'seed-deals-won-',
  ticketNextSteps: 'seed-step-',
  relatedTickets: 'seed-related-',
  ticketAIInsights: 'seed-ticket-ai-',
  salesPerformance: 'seed-perf-',
  dashboardTasks: 'seed-dash-task-',
  contactDeals: 'seed-contact-deal-',
  contactTasks: 'seed-contact-task-',
  // Flow coverage entities
  workspaces: 'seed-workspace-',
  teams: 'seed-team-',
  teamMembers: 'seed-team-member-',
  emailTemplates: 'seed-email-template-',
  emailRecords: 'seed-email-',
  chatConversations: 'seed-chat-conv-',
  chatMessages: 'seed-chat-msg-',
  callRecords: 'seed-call-',
  documents: 'seed-doc-',
  caseDocuments: 'seed-casedoc-',
  feedbackSurveys: 'seed-feedback-',
  dealRenewals: 'seed-renewal-',
  accountHealthScores: 'seed-health-',
  agentSkills: 'seed-skill-',
  agentAvailability: 'seed-avail-',
  routingRules: 'seed-routing-',
  ticketCategories: 'seed-category-',
  slaBreaches: 'seed-breach-',
  escalationHistory: 'seed-escalation-',
  workflowDefinitions: 'seed-workflow-',
  workflowExecutions: 'seed-wf-exec-',
  businessRules: 'seed-rule-',
  dashboardConfigs: 'seed-dashboard-',
  kpiDefinitions: 'seed-kpi-',
  reportDefinitions: 'seed-report-',
  aiInsights: 'seed-ai-insight-',
  healthChecks: 'seed-health-check-',
  alertIncidents: 'seed-alert-',
  performanceMetrics: 'seed-perf-',
  webhookEndpoints: 'seed-webhook-',
  apiKeys: 'seed-apikey-',
  apiVersions: 'seed-api-version-',
  // User IDs (some might use seed- prefix)
  users: 'seed-user-',
};

async function cleanupLegacySeedData() {
  console.log('🧹 Starting cleanup of legacy string-ID seed data...\n');

  let totalDeleted = 0;

  // Delete in order to respect foreign key constraints (children first)

  // 1. API & Webhooks
  try {
    const apiUsageDeleted = await prisma.aPIUsageRecord.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (apiUsageDeleted.count > 0) {
      console.log(`  ✓ Deleted ${apiUsageDeleted.count} API usage records`);
      totalDeleted += apiUsageDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const apiKeysDeleted = await prisma.aPIKey.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (apiKeysDeleted.count > 0) {
      console.log(`  ✓ Deleted ${apiKeysDeleted.count} API keys`);
      totalDeleted += apiKeysDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const webhooksDeleted = await prisma.webhookEndpoint.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (webhooksDeleted.count > 0) {
      console.log(`  ✓ Deleted ${webhooksDeleted.count} webhook endpoints`);
      totalDeleted += webhooksDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 2. Agent actions and activities
  try {
    const agentActionsDeleted = await prisma.agentAction.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (agentActionsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${agentActionsDeleted.count} agent actions`);
      totalDeleted += agentActionsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const contactActivitiesDeleted = await prisma.contactActivity.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (contactActivitiesDeleted.count > 0) {
      console.log(`  ✓ Deleted ${contactActivitiesDeleted.count} contact activities`);
      totalDeleted += contactActivitiesDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 3. Ticket-related
  try {
    const ticketActivitiesDeleted = await prisma.ticketActivity.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (ticketActivitiesDeleted.count > 0) {
      console.log(`  ✓ Deleted ${ticketActivitiesDeleted.count} ticket activities`);
      totalDeleted += ticketActivitiesDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const ticketAttachmentsDeleted = await prisma.ticketAttachment.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (ticketAttachmentsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${ticketAttachmentsDeleted.count} ticket attachments`);
      totalDeleted += ticketAttachmentsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const ticketsDeleted = await prisma.ticket.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (ticketsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${ticketsDeleted.count} tickets`);
      totalDeleted += ticketsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 4. Tasks
  try {
    const tasksDeleted = await prisma.task.deleteMany({
      where: {
        OR: [
          { id: { startsWith: 'seed-' } },
          { id: { in: [...LEGACY_HOME_PAGE_TASK_IDS] } },
        ],
      },
    });
    if (tasksDeleted.count > 0) {
      console.log(`  ✓ Deleted ${tasksDeleted.count} tasks`);
      totalDeleted += tasksDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 5. Deal-related
  try {
    const dealActivitiesDeleted = await prisma.activity.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (dealActivitiesDeleted.count > 0) {
      console.log(`  ✓ Deleted ${dealActivitiesDeleted.count} deal activities`);
      totalDeleted += dealActivitiesDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const dealFilesDeleted = await prisma.file.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (dealFilesDeleted.count > 0) {
      console.log(`  ✓ Deleted ${dealFilesDeleted.count} deal files`);
      totalDeleted += dealFilesDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  try {
    const opportunitiesDeleted = await prisma.opportunity.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (opportunitiesDeleted.count > 0) {
      console.log(`  ✓ Deleted ${opportunitiesDeleted.count} opportunities`);
      totalDeleted += opportunitiesDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 6. Leads
  try {
    const leadsDeleted = await prisma.lead.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (leadsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${leadsDeleted.count} leads`);
      totalDeleted += leadsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 7. Contacts
  try {
    const contactsDeleted = await prisma.contact.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (contactsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${contactsDeleted.count} contacts`);
      totalDeleted += contactsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  // 8. Accounts
  try {
    const accountsDeleted = await prisma.account.deleteMany({
      where: { id: { startsWith: 'seed-' } },
    });
    if (accountsDeleted.count > 0) {
      console.log(`  ✓ Deleted ${accountsDeleted.count} accounts`);
      totalDeleted += accountsDeleted.count;
    }
  } catch {
    /* table may not exist */
  }

  console.log(
    `\n✅ Cleanup complete! Deleted ${totalDeleted} total records with legacy string IDs.`
  );
  console.log('\n💡 Next steps:');
  console.log('   1. Run: pnpm --filter @intelliflow/db db:seed');
  console.log('   2. This will re-seed with the new UUID format.');
}

async function showLegacyCounts() {
  console.log('📊 Checking for legacy string-ID seed data...\n');

  let totalFound = 0;

  // Check leads
  try {
    const leadCount = await prisma.lead.count({
      where: { id: { startsWith: 'seed-' } },
    });
    if (leadCount > 0) {
      console.log(`  • Leads: ${leadCount} records with string IDs`);
      totalFound += leadCount;
    }
  } catch {
    /* table may not exist */
  }

  // Check contacts
  try {
    const contactCount = await prisma.contact.count({
      where: { id: { startsWith: 'seed-' } },
    });
    if (contactCount > 0) {
      console.log(`  • Contacts: ${contactCount} records with string IDs`);
      totalFound += contactCount;
    }
  } catch {
    /* table may not exist */
  }

  // Check accounts
  try {
    const accountCount = await prisma.account.count({
      where: { id: { startsWith: 'seed-' } },
    });
    if (accountCount > 0) {
      console.log(`  • Accounts: ${accountCount} records with string IDs`);
      totalFound += accountCount;
    }
  } catch {
    /* table may not exist */
  }

  // Check opportunities
  try {
    const oppCount = await prisma.opportunity.count({
      where: { id: { startsWith: 'seed-' } },
    });
    if (oppCount > 0) {
      console.log(`  • Opportunities: ${oppCount} records with string IDs`);
      totalFound += oppCount;
    }
  } catch {
    /* table may not exist */
  }

  // Check tasks
  try {
    const taskCount = await prisma.task.count({
      where: {
        OR: [
          { id: { startsWith: 'seed-' } },
          { id: { in: [...LEGACY_HOME_PAGE_TASK_IDS] } },
        ],
      },
    });
    if (taskCount > 0) {
      console.log(`  • Tasks: ${taskCount} records with string IDs`);
      totalFound += taskCount;
    }
  } catch {
    /* table may not exist */
  }

  // Check tickets
  try {
    const ticketCount = await prisma.ticket.count({
      where: { id: { startsWith: 'seed-' } },
    });
    if (ticketCount > 0) {
      console.log(`  • Tickets: ${ticketCount} records with string IDs`);
      totalFound += ticketCount;
    }
  } catch {
    /* table may not exist */
  }

  if (totalFound === 0) {
    console.log('  ✓ No legacy string-ID seed data found!');
  } else {
    console.log(`\n📋 Total: ${totalFound} records with legacy string IDs`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');

  try {
    await prisma.$connect();

    if (isDryRun) {
      await showLegacyCounts();
      console.log('\n💡 To delete these records, run without --dry-run flag');
    } else {
      await showLegacyCounts();
      console.log('\n');
      await cleanupLegacySeedData();
    }
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
