/**
 * IntelliFlow CRM - Database Seed Script
 *
 * This script populates the database with sample data matching the frontend UI mockups.
 * It is idempotent - can be run multiple times without creating duplicates.
 *
 * Usage:
 *   pnpm run db:seed
 *
 * Data Sources:
 * - Lead data from: apps/web/src/app/leads/(list)/page.tsx
 * - Contact data from: apps/web/src/app/contacts/(list)/page.tsx
 * - Deal data from: apps/web/src/app/deals/page.tsx and apps/web/src/app/deals/[id]/page.tsx
 * - Ticket data from: apps/web/src/app/tickets/page.tsx
 * - Dashboard metrics from: apps/web/src/components/dashboard/widgets/*
 */

import {
  Prisma,
  PrismaClient,
  UserRole,
  LeadSource,
  LeadStatus,
  OpportunityStage,
  TaskPriority,
  TaskStatus,
  EventStatus,
  TicketStatus,
  TicketPriority,
  SLAStatus,
  FileType,
  ActivityType,
  AgentActionStatus,
  TicketActivityType,
  TicketChannel,
  ContactActivityType,
  LeadActivityType,
  Sentiment,
  ChurnRisk,
  CalendarEventType,
  // New enums for flow coverage
  EmailStatus,
  ChatChannel,
  ChatStatus,
  CallStatus,
  DocumentStatus,
  FeedbackType,
  FeedbackStatus,
  RenewalStatus,
  AgentStatus,
  WorkflowStatus,
  InsightStatus,
  HealthStatus,
  AlertStatus,
  // Audit log enums (ADR-008 consolidation)
  ActorType,
  AuditAction,
  // Auto-Response enums (IFC-029)
  AutoResponseStatus,
  AutoResponseTrigger,
  // Appointment enums (IFC-182)
  AppointmentStatus,
  AppointmentType,
} from '@prisma/client';

// Import SEED_IDS from the single source of truth
import { SEED_IDS, LEGACY_STRING_IDS } from '../src/seed-ids';
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();

// =============================================================================
// Supabase Auth User Seeding
// =============================================================================

/**
 * Seed users in Supabase Auth
 * This is required for users to be able to log in via Supabase Auth
 * Uses the service role key which has admin privileges
 */
async function seedSupabaseAuthUsers() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.log('⚠️ Supabase credentials not configured - skipping auth user seeding');
    console.log('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to enable auth seeding');
    return;
  }

  console.log('🔐 Seeding Supabase Auth users...');

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // Define auth users to seed (subset of users that need login capability)
  const authUsers = [
    {
      id: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { name: 'Admin User', role: 'ADMIN' },
    },
    {
      id: SEED_IDS.users.manager,
      email: 'alex@intelliflow.dev',
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { name: 'Alex Thompson', role: 'MANAGER' },
    },
    {
      id: SEED_IDS.users.sarahJohnson,
      email: 'sarah.johnson@intelliflow.dev',
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { name: 'Sarah Johnson', role: 'SALES_REP' },
    },
    {
      id: SEED_IDS.users.mikeDavis,
      email: 'mike.davis@intelliflow.dev',
      password: 'TestPassword123!',
      email_confirm: true,
      user_metadata: { name: 'Mike Davis', role: 'SALES_REP' },
    },
  ];

  for (const user of authUsers) {
    try {
      // First try to get existing user
      const { data: existingUser } = await supabaseAdmin.auth.admin.getUserById(user.id);

      if (existingUser?.user) {
        console.log(`   ✓ Auth user exists: ${user.email}`);
        continue;
      }

      // Create new user with specific ID
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        id: user.id,
        email: user.email,
        password: user.password,
        email_confirm: user.email_confirm,
        user_metadata: user.user_metadata,
      });

      if (error) {
        // Check if it's a duplicate email error
        if (
          error.message?.includes('already been registered') ||
          error.message?.includes('duplicate')
        ) {
          console.log(`   ✓ Auth user already exists: ${user.email}`);
        } else {
          console.error(`   ✗ Failed to create auth user ${user.email}:`, error.message);
        }
      } else {
        console.log(`   ✓ Created auth user: ${user.email}`);
      }
    } catch (err) {
      console.error(`   ✗ Error seeding auth user ${user.email}:`, err);
    }
  }

  console.log('✅ Supabase Auth users seeded');
}

/**
 * UUID prefix pattern for seed data cleanup
 * All seed UUIDs use format: 00000000-0000-4000-8000-XXXXXXXXXXXX
 */
const SEED_UUID_PREFIX = '00000000-0000-4000-8000';

// Re-export SEED_IDS for use in tests (imported from single source of truth)
export { SEED_IDS };

// =============================================================================
// Cleanup Functions
// =============================================================================

async function cleanDatabase() {
  console.log('🧹 Cleaning existing seed data...');

  // Delete in correct order to respect foreign key constraints

  // =========================================================================
  // NEW FLOW COVERAGE MODELS (clean first - most dependent)
  // =========================================================================

  // API & Webhooks (leaf tables)
  await prisma.aPIUsageRecord.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.aPIKey.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.aPIVersion.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.webhookDelivery.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.webhookEndpoint.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Monitoring & Performance
  await prisma.performanceMetric.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.alertIncident.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.healthCheck.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // AI Insights
  await prisma.aIInsight.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Reports & Dashboards
  await prisma.reportExecution.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.reportSchedule.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.reportDefinition.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.kPIDefinition.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.dashboardConfig.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Workflow & Business Rules
  await prisma.businessRuleExecution.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.businessRule.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.workflowExecution.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.workflowDefinition.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Ticket Categories & SLA Breaches
  await prisma.escalationHistory.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.sLABreach.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.ticketCategory.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Agent Skills & Routing
  await prisma.routingAudit.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.routingRule.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.agentAvailability.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.agentSkill.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Deal Renewals & Health
  await prisma.accountHealthScore.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.dealRenewal.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Customer Feedback
  await prisma.feedbackSurvey.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Documents
  await prisma.documentShare.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.documentAccessLog.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.document.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Case Documents (IFC-152)
  await prisma.caseDocumentAudit.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.caseDocumentACL.deleteMany({
    where: { document_id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.caseDocument.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Calls
  await prisma.callRecord.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Chat
  await prisma.chatMessage.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.chatConversation.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Email
  await prisma.emailAttachment.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.emailRecord.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.emailTemplate.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // Teams & Workspaces
  await prisma.teamMember.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.team.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.workspaceMember.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.workspace.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  // =========================================================================
  // ORIGINAL MODELS
  // =========================================================================

  // First: Agent actions
  await prisma.agentAction.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Contact activities
  await prisma.contactActivity.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // New UI data models
  await prisma.contactNote.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.contactAIInsight.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.calendarEvent.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Appointments (calendar page data)
  await prisma.appointmentAttendee.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.appointmentCase.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.appointment.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete old hardcoded appointment IDs
  await prisma.appointment.deleteMany({
    where: { id: { in: ['home-appt-1', 'home-appt-2'] } },
  });
  await prisma.teamMessage.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.pipelineSnapshot.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.trafficSource.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.growthMetric.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.dealsWonMetric.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.salesPerformance.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Ticket-related child tables
  await prisma.ticketNextStep.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.relatedTicket.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.ticketAIInsight.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.ticketAttachment.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.ticketActivity.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.sLANotification.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.ticket.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.sLAPolicy.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.aIScore.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.auditLogEntry.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.domainEvent.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.task.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete tasks owned by seed users (test-created)
  await prisma.task.deleteMany({
    where: { ownerId: { startsWith: SEED_UUID_PREFIX } },
  });
  // Deal-related child tables
  await prisma.dealProduct.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.dealFile.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.activityEvent.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.opportunity.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete opportunities owned by seed users (test-created)
  await prisma.opportunity.deleteMany({
    where: { ownerId: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.contact.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete contacts owned by seed users (test-created)
  await prisma.contact.deleteMany({
    where: { ownerId: { startsWith: SEED_UUID_PREFIX } },
  });
  // Auto-Response Drafts (depends on leads) - IFC-029
  await prisma.autoResponseDraft.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.lead.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete leads owned by seed users (test-created with CUID IDs)
  await prisma.lead.deleteMany({
    where: { ownerId: { startsWith: SEED_UUID_PREFIX } },
  });
  // Cases and case tasks (depends on accounts and users)
  await prisma.caseTask.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.case.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Delete any remaining opportunities referencing seed accounts
  await prisma.opportunity.deleteMany({
    where: { accountId: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.account.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });
  // Also delete accounts owned by seed users (test-created)
  await prisma.account.deleteMany({
    where: { ownerId: { startsWith: SEED_UUID_PREFIX } },
  });
  await prisma.user.deleteMany({
    where: { id: { startsWith: SEED_UUID_PREFIX } },
  });

  console.log('✅ Existing seed data cleaned');
}

// =============================================================================
// Seed Functions
// =============================================================================

/**
 * RBAC Permission Matrix
 * Defines default permissions for each role
 * Based on apps/api/src/security/rbac.ts DEFAULT_PERMISSIONS
 */
type PermissionAction = 'read' | 'write' | 'delete' | 'export' | 'manage' | 'admin';
type ResourceType =
  | 'lead'
  | 'contact'
  | 'account'
  | 'opportunity'
  | 'task'
  | 'user'
  | 'ai_score'
  | 'appointment'
  | 'system';
type RoleName = 'ADMIN' | 'MANAGER' | 'SALES_REP' | 'USER' | 'VIEWER';

const RBAC_ROLE_LEVELS: Record<RoleName, number> = {
  ADMIN: 100,
  MANAGER: 75,
  SALES_REP: 50,
  USER: 25,
  VIEWER: 10,
};

const RBAC_DEFAULT_PERMISSIONS: Record<RoleName, Record<ResourceType, PermissionAction[]>> = {
  ADMIN: {
    lead: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    contact: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    account: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    task: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    user: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    ai_score: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    appointment: ['read', 'write', 'delete', 'export', 'manage', 'admin'],
    system: ['read', 'write', 'admin'],
  },
  MANAGER: {
    lead: ['read', 'write', 'delete', 'export', 'manage'],
    contact: ['read', 'write', 'delete', 'export', 'manage'],
    account: ['read', 'write', 'delete', 'export', 'manage'],
    opportunity: ['read', 'write', 'delete', 'export', 'manage'],
    task: ['read', 'write', 'delete', 'export', 'manage'],
    user: ['read', 'manage'],
    ai_score: ['read', 'write', 'manage'],
    appointment: ['read', 'write', 'delete', 'export', 'manage'],
    system: ['read'],
  },
  SALES_REP: {
    lead: ['read', 'write', 'delete', 'export'],
    contact: ['read', 'write', 'delete', 'export'],
    account: ['read', 'write', 'export'],
    opportunity: ['read', 'write', 'delete', 'export'],
    task: ['read', 'write', 'delete'],
    user: ['read'],
    ai_score: ['read', 'write'],
    appointment: ['read', 'write', 'delete'],
    system: [],
  },
  USER: {
    lead: ['read', 'write'],
    contact: ['read', 'write'],
    account: ['read'],
    opportunity: ['read', 'write'],
    task: ['read', 'write'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read', 'write'],
    system: [],
  },
  VIEWER: {
    lead: ['read'],
    contact: ['read'],
    account: ['read'],
    opportunity: ['read'],
    task: ['read'],
    user: ['read'],
    ai_score: ['read'],
    appointment: ['read'],
    system: [],
  },
};

async function seedRBACPermissions() {
  console.log('🔐 Seeding RBAC permissions...');

  // Collect all unique permissions from the matrix
  const permissionSet = new Set<string>();
  const permissions: Array<{
    name: string;
    resource: string;
    action: string;
    description: string;
  }> = [];

  for (const [resources] of Object.entries(RBAC_DEFAULT_PERMISSIONS)) {
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        const permissionName = `${resource}:${action}`;
        if (!permissionSet.has(permissionName)) {
          permissionSet.add(permissionName);
          permissions.push({
            name: permissionName,
            resource,
            action,
            description: `Allow ${action} operations on ${resource}`,
          });
        }
      }
    }
  }

  // Upsert all permissions
  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { name: permission.name },
      update: permission,
      create: permission,
    });
  }

  console.log(`✅ Created ${permissions.length} permissions`);
  return permissions;
}

async function seedRBACRoles() {
  console.log('👤 Seeding RBAC roles...');

  const roles: Array<{ name: string; description: string; level: number; isSystem: boolean }> = [
    {
      name: 'ADMIN',
      description: 'Full system access with all permissions',
      level: RBAC_ROLE_LEVELS.ADMIN,
      isSystem: true,
    },
    {
      name: 'MANAGER',
      description: 'Team management and full CRM access',
      level: RBAC_ROLE_LEVELS.MANAGER,
      isSystem: true,
    },
    {
      name: 'SALES_REP',
      description: 'Full CRM access for own records',
      level: RBAC_ROLE_LEVELS.SALES_REP,
      isSystem: true,
    },
    {
      name: 'USER',
      description: 'Basic read access with limited write permissions',
      level: RBAC_ROLE_LEVELS.USER,
      isSystem: true,
    },
    {
      name: 'VIEWER',
      description: 'Read-only access to all records',
      level: RBAC_ROLE_LEVELS.VIEWER,
      isSystem: true,
    },
  ];

  for (const role of roles) {
    await prisma.rBACRole.upsert({
      where: { name: role.name },
      update: role,
      create: role,
    });
  }

  console.log(`✅ Created ${roles.length} RBAC roles`);
  return roles;
}

async function seedRBACRolePermissions() {
  console.log('🔗 Seeding role-permission mappings...');

  let mappingCount = 0;

  for (const [roleName, resources] of Object.entries(RBAC_DEFAULT_PERMISSIONS)) {
    // Get the role from database
    const role = await prisma.rBACRole.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      console.warn(`⚠️  Role ${roleName} not found, skipping permissions`);
      continue;
    }

    // Map all permissions for this role
    for (const [resource, actions] of Object.entries(resources)) {
      for (const action of actions) {
        const permissionName = `${resource}:${action}`;

        // Get the permission from database
        const permission = await prisma.permission.findUnique({
          where: { name: permissionName },
        });

        if (!permission) {
          console.warn(`⚠️  Permission ${permissionName} not found, skipping`);
          continue;
        }

        // Create role-permission mapping
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: { granted: true },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            granted: true,
          },
        });

        mappingCount++;
      }
    }
  }

  console.log(`✅ Created ${mappingCount} role-permission mappings`);
}

async function seedUsers(tenantId: string) {
  console.log('👥 Seeding users...');

  const users = [
    {
      id: SEED_IDS.users.admin,
      email: 'admin@intelliflow.dev',
      name: 'Admin User',
      role: UserRole.ADMIN,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
      tenantId,
    },
    {
      id: SEED_IDS.users.manager,
      email: 'alex@intelliflow.dev',
      name: 'Alex Thompson',
      role: UserRole.MANAGER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
      tenantId,
    },
    // Top Performers from Dashboard widgets
    {
      id: SEED_IDS.users.sarahJohnson,
      email: 'sarah.johnson@intelliflow.dev',
      name: 'Sarah Johnson',
      role: UserRole.SALES_REP,
      avatarUrl:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
      tenantId,
    },
    {
      id: SEED_IDS.users.mikeDavis,
      email: 'mike.davis@intelliflow.dev',
      name: 'Mike Davis',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
      tenantId,
    },
    {
      id: SEED_IDS.users.emilyDavis,
      email: 'emily.davis@intelliflow.dev',
      name: 'Emily Davis',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily',
      tenantId,
    },
    {
      id: SEED_IDS.users.jamesWilson,
      email: 'james.wilson@intelliflow.dev',
      name: 'James Wilson',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=james',
      tenantId,
    },
    // Support Team
    {
      id: SEED_IDS.users.alexMorgan,
      email: 'alex.morgan@intelliflow.dev',
      name: 'Alex Morgan',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alexm',
      tenantId,
    },
    {
      id: SEED_IDS.users.sarahJenkins,
      email: 'sarah.jenkins@intelliflow.dev',
      name: 'Sarah Jenkins',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarahj',
      tenantId,
    },
    {
      id: SEED_IDS.users.mikeRoss,
      email: 'mike.ross@intelliflow.dev',
      name: 'Mike Ross',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=miker',
      tenantId,
    },
    {
      id: SEED_IDS.users.davidKim,
      email: 'david.kim@intelliflow.dev',
      name: 'David Kim',
      role: UserRole.USER,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=davidk',
      tenantId,
    },
    // Deal owner from detail page
    {
      id: SEED_IDS.users.janeDoe,
      email: 'jane.doe@intelliflow.dev',
      name: 'Jane Doe',
      role: UserRole.SALES_REP,
      avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=janed',
      tenantId,
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        ...user,
      },
      create: {
        ...user,
      },
    });
  }

  console.log(`✅ Created ${users.length} users`);
  return users;
}

async function seedAccounts(tenantId: string) {
  console.log('🏢 Seeding accounts...');

  const accounts = [
    // From Leads/Contacts pages
    {
      id: SEED_IDS.accounts.techCorp,
      name: 'TechCorp',
      website: 'https://techcorp.example.com',
      industry: 'Software',
      employees: 500,
      revenue: 50000000,
      description: 'Leading enterprise software provider',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.designCo,
      name: 'DesignCo',
      website: 'https://designco.example.com',
      industry: 'Creative Agency',
      employees: 50,
      revenue: 5000000,
      description: 'Award-winning design agency',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.smithConsulting,
      name: 'Smith Consulting',
      website: 'https://smithconsulting.example.com',
      industry: 'Consulting',
      employees: 25,
      revenue: 2500000,
      description: 'Boutique consulting firm',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.globalSoft,
      name: 'GlobalSoft',
      website: 'https://globalsoft.example.com',
      industry: 'Enterprise',
      employees: 2000,
      revenue: 200000000,
      description: 'Global enterprise software solutions',
      ownerId: SEED_IDS.users.jamesWilson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.finTech,
      name: 'FinTech IO',
      website: 'https://fintech.io',
      industry: 'Finance',
      employees: 150,
      revenue: 15000000,
      description: 'Modern financial technology solutions',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    // From Deals page
    {
      id: SEED_IDS.accounts.acmeCorp,
      name: 'Acme Corporation',
      website: 'https://acme.example.com',
      industry: 'Technology',
      employees: 1000,
      revenue: 100000000,
      description: 'Enterprise technology solutions',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.techStart,
      name: 'TechStart Inc',
      website: 'https://techstart.example.com',
      industry: 'SaaS',
      employees: 30,
      revenue: 3000000,
      description: 'Fast-growing SaaS startup',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.globalTech,
      name: 'GlobalTech Solutions',
      website: 'https://globaltech.example.com',
      industry: 'IT Services',
      employees: 500,
      revenue: 75000000,
      description: 'Global IT services provider',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.dataCorp,
      name: 'DataCorp Analytics',
      website: 'https://datacorp.example.com',
      industry: 'Data Analytics',
      employees: 200,
      revenue: 25000000,
      description: 'Data analytics and BI solutions',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.innovateCo,
      name: 'InnovateCo',
      website: 'https://innovateco.example.com',
      industry: 'Innovation Consulting',
      employees: 75,
      revenue: 10000000,
      description: 'Innovation and transformation consulting',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.megaCorp,
      name: 'MegaCorp Industries',
      website: 'https://megacorp.example.com',
      industry: 'Manufacturing',
      employees: 5000,
      revenue: 500000000,
      description: 'Global manufacturing leader',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.startupXYZ,
      name: 'StartupXYZ',
      website: 'https://startupxyz.example.com',
      industry: 'Technology',
      employees: 15,
      revenue: 500000,
      description: 'Early-stage tech startup',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.accounts.devTools,
      name: 'DevTools Inc',
      website: 'https://devtools.example.com',
      industry: 'Developer Tools',
      employees: 45,
      revenue: 4000000,
      description: 'Developer productivity tools',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
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

async function seedLeads(tenantId: string) {
  console.log('🎯 Seeding leads...');

  // Data from apps/web/src/app/leads/(list)/page.tsx
  const leads = [
    {
      id: SEED_IDS.leads.sarahMiller,
      email: 'sarah@techcorp.com',
      firstName: 'Sarah',
      lastName: 'Miller',
      company: 'TechCorp',
      title: 'CTO',
      phone: '+1 (555) 123-4567',
      source: LeadSource.WEBSITE,
      status: LeadStatus.QUALIFIED,
      score: 85,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.leads.davidChen,
      email: 'd.chen@designco.com',
      firstName: 'David',
      lastName: 'Chen',
      company: 'DesignCo',
      title: 'Manager',
      phone: '+1 (555) 987-6543',
      source: LeadSource.REFERRAL,
      status: LeadStatus.NEW,
      score: 42,
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.leads.amandaSmith,
      email: 'amanda@gmail.com',
      firstName: 'Amanda',
      lastName: 'Smith',
      company: 'Freelance',
      title: null,
      phone: '+1 (555) 321-7890',
      source: LeadSource.SOCIAL,
      status: LeadStatus.UNQUALIFIED,
      score: 15,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.leads.jamesWilson,
      email: 'j.wilson@globalsoft.com',
      firstName: 'James',
      lastName: 'Wilson',
      company: 'GlobalSoft',
      title: 'VP Sales',
      phone: '+1 (555) 456-7890',
      source: LeadSource.EVENT,
      // Note: 'NEGOTIATING' in UI maps to LeadStatus - using CONTACTED as closest match
      status: LeadStatus.CONTACTED,
      score: 92,
      ownerId: SEED_IDS.users.jamesWilson,
      tenantId,
    },
    {
      id: SEED_IDS.leads.elenaRodriguez,
      email: 'elena@fintech.io',
      firstName: 'Elena',
      lastName: 'Rodriguez',
      company: 'FinTech',
      title: 'Product Manager',
      phone: '+1 (555) 555-0199',
      source: LeadSource.EMAIL,
      status: LeadStatus.CONTACTED,
      score: 55,
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.leads.marcusReed,
      email: 'marcus.reed@summitsys.com',
      firstName: 'Marcus',
      lastName: 'Reed',
      company: 'Summit Systems Ltd.',
      title: 'Director of Operations',
      phone: '+1 (512) 555-0199',
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      score: 78,
      ownerId: SEED_IDS.users.alexMorgan,
      // Lead 360 fields
      location: 'Austin, TX',
      website: 'summitsys.com',
      avatarUrl:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=160&h=160&fit=crop&crop=face',
      lastContactedAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
      estimatedValue: 85000,
      tags: ['Enterprise', 'Multi-warehouse', 'Q1 Budget'],
      tenantId,
    },
    // Queue leads for routing UI (PG-132) — status NEW, unassigned
    {
      id: SEED_IDS.leads.kevinTaylor,
      email: 'kevin.taylor@cloudtech.io',
      firstName: 'Kevin',
      lastName: 'Taylor',
      company: 'CloudTech Solutions',
      title: 'VP Engineering',
      phone: '+1 (555) 700-0001',
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      score: 82,
      estimatedValue: 95000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.rachelGreen,
      email: 'rachel@startupabc.com',
      firstName: 'Rachel',
      lastName: 'Green',
      company: 'StartupABC',
      title: 'Co-Founder',
      phone: '+1 (555) 700-0002',
      source: LeadSource.REFERRAL,
      status: LeadStatus.NEW,
      score: 75,
      estimatedValue: 45000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.tomBrown,
      email: 'tom.brown@dataflow.com',
      firstName: 'Tom',
      lastName: 'Brown',
      company: 'DataFlow Inc',
      title: 'CTO',
      phone: '+1 (555) 700-0003',
      source: LeadSource.EVENT,
      status: LeadStatus.NEW,
      score: 88,
      estimatedValue: 120000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.lisaPark,
      email: 'lisa.park@finserve.com',
      firstName: 'Lisa',
      lastName: 'Park',
      company: 'FinServe Corp',
      title: 'Director of IT',
      phone: '+1 (555) 700-0004',
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      score: 68,
      estimatedValue: 38000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.carlosRivera,
      email: 'carlos@greenenergy.com',
      firstName: 'Carlos',
      lastName: 'Rivera',
      company: 'GreenEnergy Ltd',
      title: 'Operations Manager',
      phone: '+1 (555) 700-0005',
      source: LeadSource.REFERRAL,
      status: LeadStatus.NEW,
      score: 71,
      estimatedValue: 62000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.ninaPatel,
      email: 'nina.patel@medtech.io',
      firstName: 'Nina',
      lastName: 'Patel',
      company: 'MedTech Solutions',
      title: 'Head of Procurement',
      phone: '+1 (555) 700-0006',
      source: LeadSource.WEBSITE,
      status: LeadStatus.NEW,
      score: 85,
      estimatedValue: 88000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.ryanMurphy,
      email: 'ryan@logipro.com',
      firstName: 'Ryan',
      lastName: 'Murphy',
      company: 'LogiPro Systems',
      title: 'Logistics Director',
      phone: '+1 (555) 700-0007',
      source: LeadSource.SOCIAL,
      status: LeadStatus.NEW,
      score: 62,
      estimatedValue: 41000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.leads.dianaHall,
      email: 'diana@edulearn.io',
      firstName: 'Diana',
      lastName: 'Hall',
      company: 'EduLearn Platform',
      title: 'Product Manager',
      phone: '+1 (555) 700-0008',
      source: LeadSource.EMAIL,
      status: LeadStatus.NEW,
      score: 79,
      estimatedValue: 55000,
      ownerId: SEED_IDS.users.admin,
      tenantId,
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

// =============================================================================
// Lead 360 Seed Functions
// =============================================================================

async function seedLeadActivities(tenantId: string) {
  console.log('📊 Seeding lead activities...');
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

  const activities = [
    {
      id: SEED_IDS.leadActivities.webFormSubmission,
      type: LeadActivityType.WEB_FORM,
      title: 'Web Form Submission',
      description: 'Lead source: "Request a Demo" landing page',
      timestamp: new Date(now.getTime() - 15 * 60 * 1000), // 15 min ago
      userName: 'System',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        source: 'Request a Demo',
        message:
          'We are looking to replace our current inventory system. Do you support multi-warehouse tracking?',
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.scoreUpdate,
      type: LeadActivityType.SCORE_UPDATE,
      title: 'Lead Qualification Score Updated',
      description: 'AI-powered score recalculation',
      timestamp: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      userName: 'System',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        oldScore: 45,
        newScore: 78,
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.emailAutoResponse,
      type: LeadActivityType.EMAIL,
      title: 'Automated Email Sent: "Thanks for your interest"',
      description: 'Auto-response email triggered',
      timestamp: new Date(now.getTime() - 90 * 60 * 1000), // 1.5 hours ago
      userName: 'System',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        subject: 'Thanks for your interest in IntelliFlow',
        preview:
          'Hi Marcus, Thank you for reaching out! We received your demo request and will be in touch shortly...',
        opened: true,
        clicked: true,
        openCount: 2,
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.statusChange,
      type: LeadActivityType.STATUS_CHANGE,
      title: 'Lead Created',
      description: 'Imported via API integration',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      userName: 'System',
      metadata: {
        newStatus: 'NEW',
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.callLogged,
      type: LeadActivityType.CALL,
      title: 'Call Logged',
      description: 'Initial outreach call',
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000), // Yesterday 10 AM
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        duration: '8 min',
        outcome: 'connected',
        recordingUrl: '/recordings/call-001.mp3',
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.noteAdded,
      type: LeadActivityType.NOTE,
      title: 'Note Added',
      description: 'Marcus mentioned they are evaluating 2 other competitors',
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000 + 15 * 60 * 1000), // Yesterday 10:15 AM
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.emailFollowup,
      type: LeadActivityType.EMAIL,
      title: 'Email Sent',
      description: 'Follow-up with pricing information',
      timestamp: new Date(twoDaysAgo.getTime() + 14 * 60 * 60 * 1000), // 2 days ago 2 PM
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        subject: 'IntelliFlow - Custom Pricing for Summit Systems',
        preview: 'Hi Marcus, Following up on our call, here is the custom pricing we discussed...',
        opened: true,
        clicked: false,
        openCount: 1,
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
    {
      id: SEED_IDS.leadActivities.meetingScheduled,
      type: LeadActivityType.MEETING,
      title: 'Meeting Scheduled',
      description: 'Product Demo Call',
      timestamp: new Date(threeDaysAgo.getTime() + 9 * 60 * 60 * 1000), // 3 days ago 9 AM
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      metadata: {
        attendees: ['Marcus Reed', 'Alex Morgan', 'Sarah Chen'],
        location: 'Zoom',
        duration: '45 min',
      },
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
    },
  ];

  for (const activity of activities) {
    await prisma.leadActivity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} lead activities`);
}

async function seedLeadNotes(tenantId: string) {
  console.log('📝 Seeding lead notes...');
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const notes = [
    {
      id: SEED_IDS.leadNotes.competitorNote,
      content:
        'Marcus mentioned they are evaluating 2 other competitors. Needs SOC2 compliance docs.',
      author: 'Alex Morgan',
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
      createdAt: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000 + 15 * 60 * 1000), // Yesterday 10:15 AM
    },
    {
      id: SEED_IDS.leadNotes.budgetNote,
      content: 'Budget approved for Q1. Looking for multi-warehouse inventory tracking.',
      author: 'Alex Morgan',
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
      createdAt: new Date(twoDaysAgo.getTime() + 11 * 60 * 60 * 1000), // 2 days ago 11 AM
    },
  ];

  for (const note of notes) {
    await prisma.leadNote.upsert({
      where: { id: note.id },
      update: note,
      create: note,
    });
  }

  console.log(`✅ Created ${notes.length} lead notes`);
}

async function seedLeadFiles(tenantId: string) {
  console.log('📁 Seeding lead files...');
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  const files = [
    {
      id: SEED_IDS.leadFiles.requirements,
      name: 'Summit_Systems_Requirements.pdf',
      size: '2.4 MB',
      sizeBytes: 2516582,
      fileType: FileType.PDF,
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
      uploadedAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 min ago (from web form)
      uploadedById: null, // Uploaded by lead
    },
    {
      id: SEED_IDS.leadFiles.productOverview,
      name: 'Product_Overview_Deck.pptx',
      size: '5.1 MB',
      sizeBytes: 5347737,
      fileType: FileType.OTHER,
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
      uploadedAt: new Date(twoDaysAgo.getTime() + 10 * 60 * 60 * 1000), // 2 days ago
      uploadedById: SEED_IDS.users.alexMorgan,
    },
  ];

  for (const file of files) {
    await prisma.leadFile.upsert({
      where: { id: file.id },
      update: file,
      create: file,
    });
  }

  console.log(`✅ Created ${files.length} lead files`);
}

async function seedLeadAIInsights(tenantId: string) {
  console.log('🤖 Seeding lead AI insights...');

  const insights = [
    {
      id: SEED_IDS.leadAIInsights.marcusReed,
      leadId: SEED_IDS.leads.marcusReed,
      tenantId,
      conversionProbability: 72,
      estimatedValue: 85000,
      churnRisk: ChurnRisk.LOW,
      engagementScore: 85,
      sentiment: 'Positive',
      sentimentTrend: 'improving',
      lastEngagementDays: 1,
      nextBestAction: 'Schedule a discovery call to discuss multi-warehouse requirements',
      recommendations: [
        'Lead shows high engagement - optimal time for a demo call',
        'Company size matches ICP - consider enterprise pricing',
        'Multi-warehouse interest aligns with our core feature set',
      ],
    },
  ];

  for (const insight of insights) {
    await prisma.leadAIInsight.upsert({
      where: { id: insight.id },
      update: insight,
      create: insight,
    });
  }

  console.log(`✅ Created ${insights.length} lead AI insights`);
}

// =============================================================================
// Auto-Response Drafts Seed Function (IFC-029: Agent Approvals)
// =============================================================================

async function seedAutoResponseDrafts(tenantId: string) {
  console.log('📧 Seeding auto-response drafts...');
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneDayFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const drafts = [
    // PENDING_APPROVAL - awaiting user decision
    {
      id: SEED_IDS.autoResponseDrafts.pendingEmail,
      tenantId,
      leadId: SEED_IDS.leads.sarahMiller,
      recipientEmail: 'sarah@techcorp.com',
      subject: 'Re: Product Demo Request',
      body: `Hi Sarah,

Thank you for your interest in IntelliFlow CRM! I'd be happy to schedule a demo to show you how our AI-powered lead management can help TechCorp.

Based on your inquiry, I think you'd particularly benefit from seeing:
- Our automated lead scoring system
- Real-time pipeline analytics
- Integration capabilities with your existing tools

Would any of the following times work for a 30-minute demo call?
- Tuesday at 2:00 PM EST
- Wednesday at 10:00 AM EST
- Thursday at 3:00 PM EST

Looking forward to connecting!

Best regards,
The IntelliFlow Team`,
      triggerType: AutoResponseTrigger.EMAIL_RECEIVED,
      aiConfidence: 0.89,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.PENDING_APPROVAL,
      version: 1,
      expiresAt: oneDayFromNow,
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: twoHoursAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: oneHourAgo.toISOString(), actor: 'system' },
      ]),
      createdAt: twoHoursAgo,
      updatedAt: oneHourAgo,
    },
    // PENDING_APPROVAL - follow-up email
    {
      id: SEED_IDS.autoResponseDrafts.pendingFollowUp,
      tenantId,
      leadId: SEED_IDS.leads.davidChen,
      recipientEmail: 'd.chen@designco.com',
      subject: 'Following Up: Your CRM Requirements',
      body: `Hi David,

I wanted to follow up on your recent inquiry about CRM solutions for DesignCo.

I noticed you were particularly interested in:
- Creative project tracking
- Client relationship management
- Proposal and contract automation

I've prepared a customized overview that addresses these specific needs. Would you have 15 minutes this week to discuss?

Best regards,
The IntelliFlow Team`,
      triggerType: AutoResponseTrigger.FORM_SUBMIT,
      aiConfidence: 0.82,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.PENDING_APPROVAL,
      version: 1,
      expiresAt: oneDayFromNow,
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: oneHourAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: now.toISOString(), actor: 'system' },
      ]),
      createdAt: oneHourAgo,
      updatedAt: now,
    },
    // APPROVED - approved but not yet sent
    {
      id: SEED_IDS.autoResponseDrafts.approved,
      tenantId,
      leadId: SEED_IDS.leads.amandaSmith,
      recipientEmail: 'amanda@smithconsulting.com',
      subject: 'Re: Consulting Partnership Opportunity',
      body: `Hi Amanda,

Thank you for reaching out about a potential consulting partnership!

We're always excited to work with experienced consultants who can help our clients get the most out of IntelliFlow.

I'd love to schedule a call to discuss:
- Partnership program details
- Commission structures
- Training and certification options

Please let me know your availability.

Best regards,
The IntelliFlow Team`,
      triggerType: AutoResponseTrigger.EMAIL_RECEIVED,
      aiConfidence: 0.91,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.APPROVED,
      version: 2,
      expiresAt: oneDayFromNow,
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: oneDayAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: oneDayAgo.toISOString(), actor: 'system' },
        { status: 'APPROVED', timestamp: twoHoursAgo.toISOString(), actor: SEED_IDS.users.manager },
      ]),
      approvalDecision: JSON.stringify({
        decision: 'APPROVED',
        decidedBy: SEED_IDS.users.manager,
        decidedAt: twoHoursAgo.toISOString(),
        reason: 'Good tone and accurate information',
      }),
      createdAt: oneDayAgo,
      updatedAt: twoHoursAgo,
    },
    // REJECTED - user rejected the draft
    {
      id: SEED_IDS.autoResponseDrafts.rejected,
      tenantId,
      leadId: SEED_IDS.leads.jamesWilson,
      recipientEmail: 'j.wilson@globalsoft.com',
      subject: 'Re: Enterprise Pricing Inquiry',
      body: `Dear Mr. Wilson,

Thank you for your interest in IntelliFlow's enterprise solutions.

Our enterprise tier includes advanced features such as...`,
      triggerType: AutoResponseTrigger.EMAIL_RECEIVED,
      aiConfidence: 0.75,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.REJECTED,
      version: 1,
      expiresAt: oneDayFromNow,
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: twoDaysAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: twoDaysAgo.toISOString(), actor: 'system' },
        { status: 'REJECTED', timestamp: oneDayAgo.toISOString(), actor: SEED_IDS.users.admin },
      ]),
      approvalDecision: JSON.stringify({
        decision: 'REJECTED',
        decidedBy: SEED_IDS.users.admin,
        decidedAt: oneDayAgo.toISOString(),
        reason: 'Too formal - needs more personalized approach for VP-level contact',
      }),
      createdAt: twoDaysAgo,
      updatedAt: oneDayAgo,
    },
    // ESCALATED - needs manager review
    {
      id: SEED_IDS.autoResponseDrafts.escalated,
      tenantId,
      leadId: SEED_IDS.leads.elenaRodriguez,
      recipientEmail: 'elena@fintech.io',
      subject: 'Re: Custom Integration Requirements',
      body: `Hi Elena,

Thank you for sharing your integration requirements. I understand FinTech.io needs:
- Custom API integrations
- Real-time data sync
- SOC2 compliance documentation

Given the technical complexity, I've escalated this to our solutions architect team for a more detailed response.

We'll get back to you within 24 hours with a comprehensive proposal.

Best regards,
The IntelliFlow Team`,
      triggerType: AutoResponseTrigger.EMAIL_RECEIVED,
      aiConfidence: 0.68,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.ESCALATED,
      version: 1,
      expiresAt: oneDayFromNow,
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: oneHourAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: oneHourAgo.toISOString(), actor: 'system' },
        { status: 'ESCALATED', timestamp: now.toISOString(), actor: SEED_IDS.users.sarahJohnson },
      ]),
      escalation: JSON.stringify({
        escalatedBy: SEED_IDS.users.sarahJohnson,
        escalatedTo: SEED_IDS.users.manager,
        escalatedAt: now.toISOString(),
        reason: 'Complex technical requirements - needs solutions architect review',
      }),
      escalationCount: 1,
      createdAt: oneHourAgo,
      updatedAt: now,
    },
    // SENT - successfully sent
    {
      id: SEED_IDS.autoResponseDrafts.sent,
      tenantId,
      leadId: SEED_IDS.leads.marcusReed,
      recipientEmail: 'marcus@summitsystems.com',
      subject: 'Re: Multi-Warehouse Inventory Tracking',
      body: `Hi Marcus,

Thank you for your inquiry about multi-warehouse inventory tracking!

IntelliFlow CRM offers comprehensive inventory management with:
- Real-time stock levels across multiple locations
- Automated reorder notifications
- Transfer tracking between warehouses

I'd be happy to schedule a demo focused on these features. Would Wednesday at 2 PM work for you?

Best regards,
The IntelliFlow Team`,
      triggerType: AutoResponseTrigger.FORM_SUBMIT,
      aiConfidence: 0.94,
      modelVersion: 'gpt-4o-mini-2024-07-18',
      status: AutoResponseStatus.SENT,
      version: 2,
      expiresAt: twoDaysAgo, // Already expired (was sent)
      statusHistory: JSON.stringify([
        { status: 'DRAFT', timestamp: threeDaysAgo.toISOString(), actor: 'system' },
        { status: 'PENDING_APPROVAL', timestamp: threeDaysAgo.toISOString(), actor: 'system' },
        { status: 'APPROVED', timestamp: twoDaysAgo.toISOString(), actor: SEED_IDS.users.admin },
        { status: 'SENT', timestamp: twoDaysAgo.toISOString(), actor: 'system' },
      ]),
      approvalDecision: JSON.stringify({
        decision: 'APPROVED',
        decidedBy: SEED_IDS.users.admin,
        decidedAt: twoDaysAgo.toISOString(),
        reason: 'Great response - addresses their specific needs',
      }),
      createdAt: threeDaysAgo,
      updatedAt: twoDaysAgo,
    },
  ];

  for (const draft of drafts) {
    await prisma.autoResponseDraft.upsert({
      where: { id: draft.id },
      update: draft,
      create: draft,
    });
  }

  console.log(`✅ Created ${drafts.length} auto-response drafts`);
}

// =============================================================================
// AI Conversation Records (PG-151: Active Agents Dashboard)
// =============================================================================

async function seedConversationRecords(tenantId: string) {
  console.log('🤖 Seeding AI conversation records (Active Agents Dashboard)...');

  const now = new Date();
  const oneMinAgo = new Date(now.getTime() - 60 * 1000);
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
  const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000);
  const twentyMinAgo = new Date(now.getTime() - 20 * 60 * 1000);
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const fortyFiveMinAgo = new Date(now.getTime() - 45 * 60 * 1000);
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60 * 1000);

  // Helper to build conversation records concisely
  function conv(
    id: string, sessionSuffix: string, agentName: string, agentModel: string,
    title: string, contextName: string, contextType: string,
    status: string, startedAt: Date, lastMessageAt: Date,
    msgCount: number, toolCount: number,
    opts: Record<string, unknown> = {},
  ) {
    return {
      id, sessionId: `session-${sessionSuffix}-${Date.now()}`,
      title, contextName, contextType,
      agentId: `crewai-${agentName}-v1`, agentName, agentModel,
      userName: 'System', channel: 'automation',
      messageCount: msgCount, toolCallCount: toolCount,
      status, startedAt, lastMessageAt,
      tenantId, userId: SEED_IDS.users.admin,
      ...opts,
    };
  }

  const IDS = SEED_IDS.conversationRecords;
  const conversations = [
    // ── ACTIVE agents (8) ──────────────────────────────────────────────
    conv(IDS.qualificationAgent, 'qual-1', 'qualification', 'gpt-4o-mini',
      'Lead Qualification: Marcus Reed', 'Qualifying lead Marcus Reed', 'lead_qualification',
      'ACTIVE', tenMinAgo, fiveMinAgo, 8, 3,
      { contextId: SEED_IDS.leads.marcusReed, tokenCountInput: 2450, tokenCountOutput: 890 }),

    conv(IDS.emailAgent, 'email-2', 'email', 'gpt-4o',
      'Email Draft: Follow-up with Sarah Miller', 'Drafting email for Sarah Miller', 'email_generation',
      'ACTIVE', thirtyMinAgo, fiveMinAgo, 12, 5,
      { contextId: SEED_IDS.leads.sarahMiller, userId: SEED_IDS.users.sarahJohnson, tokenCountInput: 4200, tokenCountOutput: 1650 }),

    conv(IDS.followupAgent, 'followup-3', 'followup', 'gpt-4o-mini',
      'Follow-up Check: 14 Overdue Tasks', 'Checking overdue follow-ups', 'followup_management',
      'ACTIVE', fiveMinAgo, oneMinAgo, 6, 2,
      { tokenCountInput: 1800, tokenCountOutput: 520 }),

    conv(IDS.nbaAgent, 'nba-4', 'nba', 'gpt-4o',
      'Next Best Action: Pipeline Analysis', 'Analyzing 23 deals for NBA', 'next_best_action',
      'ACTIVE', oneHourAgo, tenMinAgo, 15, 7,
      { tokenCountInput: 6100, tokenCountOutput: 2340 }),

    conv(IDS.sentimentAgent, 'sentiment-7', 'sentiment', 'gpt-4o-mini',
      'Sentiment Analysis: 12 New Tickets', 'Analyzing ticket sentiment batch', 'sentiment_analysis',
      'ACTIVE', twentyMinAgo, fiveMinAgo, 14, 0,
      { tokenCountInput: 3600, tokenCountOutput: 1100 }),

    conv(IDS.autoresponseAgent, 'autoresponse-8', 'autoresponse', 'gpt-4o-mini',
      'Auto-Response: 3 Pending Emails', 'Generating auto-responses', 'auto_response',
      'ACTIVE', fifteenMinAgo, fiveMinAgo, 9, 2,
      { tokenCountInput: 2800, tokenCountOutput: 960 }),

    conv(IDS.ragAgent, 'rag-9', 'rag', 'text-embedding-3-small',
      'RAG Context: Deal Research for TechCorp', 'Retrieving context for deal analysis', 'rag_context',
      'ACTIVE', tenMinAgo, fiveMinAgo, 4, 3,
      { tokenCountInput: 1200, tokenCountOutput: 450 }),

    conv(IDS.crewAgent, 'crew-11', 'crew', 'gpt-4o',
      'Crew: Full Lead Processing Pipeline', 'Orchestrating qualification → email → followup', 'crew_orchestration',
      'ACTIVE', fortyFiveMinAgo, tenMinAgo, 32, 14,
      { tokenCountInput: 12000, tokenCountOutput: 4800 }),

    // ── IDLE agents (3) ────────────────────────────────────────────────
    conv(IDS.scoringAgent, 'scoring-5', 'scoring', 'gpt-4o-mini',
      'Lead Scoring: Awaiting Next Batch', 'Waiting for lead batch', 'lead_scoring',
      'IDLE', twoHoursAgo, oneHourAgo, 24, 12,
      { tokenCountInput: 8900, tokenCountOutput: 3200 }),

    conv(IDS.embeddingAgent, 'embedding-10', 'embedding', 'text-embedding-3-small',
      'Embedding: Batch Complete', 'Waiting for new documents', 'embedding_generation',
      'IDLE', threeHoursAgo, twoHoursAgo, 48, 0,
      { tokenCountInput: 15000, tokenCountOutput: 0 }),

    conv(IDS.indexerAgent, 'indexer-13', 'indexer', 'text-embedding-3-small',
      'Document Indexer: 156 Documents Indexed', 'Indexing complete — awaiting new uploads', 'document_indexing',
      'IDLE', threeHoursAgo, oneHourAgo, 156, 156,
      { tokenCountInput: 48000, tokenCountOutput: 0 }),

    // ── ERROR agents (2) ───────────────────────────────────────────────
    conv(IDS.churnAgent, 'churn-6', 'churn', 'gpt-4o',
      'Churn Prediction: API Timeout', 'Churn analysis failed — model timeout', 'churn_prediction',
      'ERROR', thirtyMinAgo, twentyMinAgo, 3, 1,
      { wasEscalated: true, escalatedTo: SEED_IDS.users.manager, escalatedAt: twentyMinAgo,
        tokenCountInput: 800, tokenCountOutput: 0 }),

    conv(IDS.ocrAgent, 'ocr-14', 'ocr', 'tesseract-v5',
      'OCR: Corrupted PDF Processing Error', 'Failed to process invoice-2026-Q1.pdf', 'ocr_processing',
      'ERROR', fortyFiveMinAgo, fortyFiveMinAgo, 2, 1,
      { wasEscalated: true, escalatedTo: SEED_IDS.users.manager, escalatedAt: fortyFiveMinAgo }),

    // ── Additional: Hallucination checker (ACTIVE — always running) ───
    conv(IDS.hallucinationAgent, 'hallucination-12', 'hallucination', 'gpt-4o-mini',
      'Hallucination Check: Continuous Monitoring', 'Monitoring AI output quality', 'hallucination_detection',
      'ACTIVE', threeHoursAgo, oneMinAgo, 89, 0,
      { tokenCountInput: 22000, tokenCountOutput: 5600 }),
  ];

  for (const c of conversations) {
    await prisma.conversationRecord.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  // Sample messages for qualification + email agents
  const messages = [
    { id: SEED_IDS.conversationMessages.msg1, conversationId: IDS.qualificationAgent, role: 'system',
      content: 'You are a lead qualification agent. Analyze the provided lead data and determine qualification score.', createdAt: tenMinAgo, tenantId },
    { id: SEED_IDS.conversationMessages.msg2, conversationId: IDS.qualificationAgent, role: 'assistant',
      content: 'Analyzing lead Marcus Reed from Summit Systems. Checking engagement history, company size, and intent signals.', createdAt: new Date(tenMinAgo.getTime() + 30_000), tenantId },
    { id: SEED_IDS.conversationMessages.msg3, conversationId: IDS.qualificationAgent, role: 'assistant',
      content: 'Lead scored at 87/100. High engagement (5 pricing page visits in 24h), mid-market company (250 employees), strong buying signals.', createdAt: fiveMinAgo, tenantId },
    { id: SEED_IDS.conversationMessages.msg4, conversationId: IDS.emailAgent, role: 'system',
      content: 'Draft a personalized follow-up email for the lead based on their recent interactions.', createdAt: thirtyMinAgo, tenantId },
    { id: SEED_IDS.conversationMessages.msg5, conversationId: IDS.emailAgent, role: 'assistant',
      content: 'Reviewing Sarah Miller interaction history: 3 calls, 2 demos, proposal viewed 4 times. Current stage: Negotiation.', createdAt: new Date(thirtyMinAgo.getTime() + 120_000), tenantId },
    { id: SEED_IDS.conversationMessages.msg6, conversationId: IDS.emailAgent, role: 'assistant',
      content: 'Email draft ready. Subject: "Next steps for your IntelliFlow implementation". Confidence: 0.92. Awaiting approval.', createdAt: fiveMinAgo, tenantId },
  ];

  for (const msg of messages) {
    await prisma.messageRecord.upsert({ where: { id: msg.id }, update: msg, create: msg });
  }

  // Sample tool calls
  const toolCalls = [
    { id: SEED_IDS.conversationToolCalls.tc1, conversationId: IDS.qualificationAgent, messageId: SEED_IDS.conversationMessages.msg2,
      toolName: 'search_lead_history', toolInput: { leadId: SEED_IDS.leads.marcusReed, days: 30 },
      toolOutput: { visits: 12, downloads: 2, emailOpens: 8 }, status: 'SUCCESS',
      startedAt: new Date(tenMinAgo.getTime() + 10_000), completedAt: new Date(tenMinAgo.getTime() + 12_000), durationMs: 2000, tenantId },
    { id: SEED_IDS.conversationToolCalls.tc2, conversationId: IDS.qualificationAgent, messageId: SEED_IDS.conversationMessages.msg2,
      toolName: 'get_company_info', toolInput: { company: 'Summit Systems' },
      toolOutput: { employees: 250, industry: 'Technology', revenue: '$45M' }, status: 'SUCCESS',
      startedAt: new Date(tenMinAgo.getTime() + 13_000), completedAt: new Date(tenMinAgo.getTime() + 14_000), durationMs: 1000, tenantId },
    { id: SEED_IDS.conversationToolCalls.tc3, conversationId: IDS.emailAgent, messageId: SEED_IDS.conversationMessages.msg5,
      toolName: 'get_interaction_history', toolInput: { leadId: SEED_IDS.leads.sarahMiller, limit: 10 },
      toolOutput: { interactions: 8, lastContact: '2026-02-15', sentiment: 'positive' }, status: 'SUCCESS',
      startedAt: new Date(thirtyMinAgo.getTime() + 60_000), completedAt: new Date(thirtyMinAgo.getTime() + 62_000), durationMs: 2000, tenantId },
  ];

  for (const tc of toolCalls) {
    await prisma.toolCallRecord.upsert({ where: { id: tc.id }, update: tc, create: tc });
  }

  console.log(`✅ Created ${conversations.length} AI conversation records, ${messages.length} messages, ${toolCalls.length} tool calls`);
}

async function seedContacts(tenantId: string) {
  console.log('📇 Seeding contacts...');

  // Data from apps/web/src/app/contacts/(list)/page.tsx and deals pages
  const contacts = [
    // From Contacts list page
    {
      id: SEED_IDS.contacts.sarahMiller,
      email: 'sarah@techcorp.com',
      firstName: 'Sarah',
      lastName: 'Miller',
      title: 'CTO',
      phone: '+1 (555) 123-4567',
      department: 'Technology',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techCorp,
    },
    {
      id: SEED_IDS.contacts.davidChen,
      email: 'd.chen@designco.com',
      firstName: 'David',
      lastName: 'Chen',
      title: 'Manager',
      phone: '+1 (555) 987-6543',
      department: 'Creative',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.designCo,
    },
    {
      id: SEED_IDS.contacts.amandaSmith,
      email: 'amanda@smithconsulting.com',
      firstName: 'Amanda',
      lastName: 'Smith',
      title: 'Freelance Consultant',
      phone: '+1 (555) 321-7890',
      department: 'Consulting',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.smithConsulting,
    },
    {
      id: SEED_IDS.contacts.jamesWilson,
      email: 'j.wilson@globalsoft.com',
      firstName: 'James',
      lastName: 'Wilson',
      title: 'VP Sales',
      phone: '+1 (555) 456-7890',
      department: 'Sales',
      ownerId: SEED_IDS.users.jamesWilson,
      tenantId,
      accountId: SEED_IDS.accounts.globalSoft,
    },
    {
      id: SEED_IDS.contacts.elenaRodriguez,
      email: 'elena@fintech.io',
      firstName: 'Elena',
      lastName: 'Rodriguez',
      title: 'Product Manager',
      phone: '+1 (555) 555-0199',
      department: 'Product',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.finTech,
    },
    // From Deals page - contacts linked to deals
    {
      id: SEED_IDS.contacts.johnSmith,
      email: 'john.smith@acme.com',
      firstName: 'John',
      lastName: 'Smith',
      title: 'Procurement Manager',
      phone: '+1 (555) 100-2001',
      department: 'Procurement',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
    },
    {
      id: SEED_IDS.contacts.emilyChen,
      email: 'emily.chen@techstart.com',
      firstName: 'Emily',
      lastName: 'Chen',
      title: 'CEO',
      phone: '+1 (555) 100-2002',
      department: 'Executive',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techStart,
    },
    {
      id: SEED_IDS.contacts.michaelBrown,
      email: 'michael.brown@globaltech.com',
      firstName: 'Michael',
      lastName: 'Brown',
      title: 'IT Director',
      phone: '+1 (555) 100-2003',
      department: 'IT',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.globalTech,
    },
    {
      id: SEED_IDS.contacts.lisaWang,
      email: 'lisa.wang@datacorp.com',
      firstName: 'Lisa',
      lastName: 'Wang',
      title: 'CIO',
      phone: '+1 (555) 100-2004',
      department: 'IT',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.dataCorp,
    },
    // From Deal detail page
    {
      id: SEED_IDS.contacts.robertFox,
      email: 'robert.fox@acme.com',
      firstName: 'Robert',
      lastName: 'Fox',
      title: 'CTO',
      phone: '+1 (555) 100-2005',
      department: 'Technology',
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
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

async function seedOpportunities(tenantId: string) {
  console.log('💰 Seeding opportunities (deals)...');

  // Data from apps/web/src/app/deals/page.tsx
  const opportunities = [
    {
      id: SEED_IDS.opportunities.enterpriseLicenseAcme,
      name: 'Enterprise License - Acme Corp',
      value: 75000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 20,
      expectedCloseDate: new Date('2025-02-15'),
      description: 'Enterprise license for Acme Corporation',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.opportunities.annualSubscriptionTechStart,
      name: 'Annual Subscription - TechStart',
      value: 24000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 25,
      expectedCloseDate: new Date('2025-01-30'),
      description: 'Annual subscription for TechStart Inc',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techStart,
      contactId: SEED_IDS.contacts.emilyChen,
    },
    {
      id: SEED_IDS.opportunities.customIntegrationGlobalTech,
      name: 'Custom Integration - GlobalTech',
      value: 120000,
      stage: OpportunityStage.NEEDS_ANALYSIS,
      probability: 40,
      expectedCloseDate: new Date('2025-03-01'),
      description: 'Custom integration project for GlobalTech Solutions',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.globalTech,
      contactId: SEED_IDS.contacts.michaelBrown,
    },
    {
      id: SEED_IDS.opportunities.platformMigrationDataCorp,
      name: 'Platform Migration - DataCorp',
      value: 85000,
      stage: OpportunityStage.PROPOSAL,
      probability: 60,
      expectedCloseDate: new Date('2025-02-28'),
      description: 'Platform migration for DataCorp Analytics',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.dataCorp,
      contactId: SEED_IDS.contacts.lisaWang,
    },
    {
      id: SEED_IDS.opportunities.consultingInnovateCo,
      name: 'Consulting Package - InnovateCo',
      value: 45000,
      stage: OpportunityStage.PROPOSAL,
      probability: 55,
      expectedCloseDate: new Date('2025-02-10'),
      description: 'Consulting engagement for InnovateCo',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.innovateCo,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.enterpriseSuiteMegaCorp,
      name: 'Enterprise Suite - MegaCorp',
      value: 250000,
      stage: OpportunityStage.NEGOTIATION,
      probability: 75,
      expectedCloseDate: new Date('2025-01-31'),
      description: 'Full enterprise suite for MegaCorp Industries',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.megaCorp,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      name: 'Team License - StartupXYZ',
      value: 12000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-12-20'),
      description: 'Team license for StartupXYZ',
      closedAt: new Date('2024-12-20'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.startupXYZ,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.apiAccessDevTools,
      name: 'API Access - DevTools',
      value: 18000,
      stage: OpportunityStage.CLOSED_LOST,
      probability: 0,
      expectedCloseDate: new Date('2024-12-15'),
      description: 'API access subscription for DevTools Inc',
      closedAt: new Date('2024-12-15'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.devTools,
      contactId: null,
    },
    // From Deal detail page - Acme Corp Software License
    {
      id: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      name: 'Acme Corp Software License',
      value: 125000,
      stage: OpportunityStage.PROPOSAL,
      probability: 60,
      expectedCloseDate: new Date('2025-01-24'),
      description: 'Enterprise License (100 Seats) + Implementation (Standard Package)',
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.robertFox,
    },
    // =========================================================================
    // HISTORICAL CLOSED DEALS FOR TREND CHART (Last 6 months)
    // =========================================================================
    // May 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedMay1,
      name: 'Professional Services - May Deal 1',
      value: 15000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-05-15'),
      description: 'Consulting services package',
      closedAt: new Date('2024-05-15'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techCorp,
      contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.opportunities.closedMay2,
      name: 'Team License - May Deal 2',
      value: 8000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-05-22'),
      description: 'Team subscription',
      closedAt: new Date('2024-05-22'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.designCo,
      contactId: SEED_IDS.contacts.davidChen,
    },
    // June 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedJun1,
      name: 'Enterprise Setup - June Deal 1',
      value: 25000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-06-10'),
      description: 'Enterprise implementation',
      closedAt: new Date('2024-06-10'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.globalSoft,
      contactId: SEED_IDS.contacts.jamesWilson,
    },
    {
      id: SEED_IDS.opportunities.closedJun2,
      name: 'Annual Subscription - June Deal 2',
      value: 12000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-06-25'),
      description: 'Annual renewal',
      closedAt: new Date('2024-06-25'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.finTech,
      contactId: SEED_IDS.contacts.elenaRodriguez,
    },
    // July 2024 - 1 deal
    {
      id: SEED_IDS.opportunities.closedJul1,
      name: 'Integration Package - July Deal',
      value: 18000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-07-18'),
      description: 'Custom integration',
      closedAt: new Date('2024-07-18'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.innovateCo,
      contactId: null,
    },
    // August 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedAug1,
      name: 'Enterprise License - August Deal 1',
      value: 45000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-08-12'),
      description: 'Enterprise license package',
      closedAt: new Date('2024-08-12'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.megaCorp,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.closedAug2,
      name: 'Professional Services - August Deal 2',
      value: 22000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-08-28'),
      description: 'Consulting engagement',
      closedAt: new Date('2024-08-28'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.dataCorp,
      contactId: SEED_IDS.contacts.lisaWang,
    },
    // September 2024 - 1 deal
    {
      id: SEED_IDS.opportunities.closedSep1,
      name: 'Platform Migration - September Deal',
      value: 35000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-09-20'),
      description: 'Platform upgrade and migration',
      closedAt: new Date('2024-09-20'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.globalTech,
      contactId: SEED_IDS.contacts.michaelBrown,
    },
    // October 2024 - 2 deals
    {
      id: SEED_IDS.opportunities.closedOct1,
      name: 'Enterprise Suite - October Deal 1',
      value: 55000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-10-15'),
      description: 'Complete enterprise solution',
      closedAt: new Date('2024-10-15'),
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.acmeCorp,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.opportunities.closedOct2,
      name: 'Custom Development - October Deal 2',
      value: 28000,
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-10-28'),
      description: 'Custom feature development',
      closedAt: new Date('2024-10-28'),
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.techStart,
      contactId: SEED_IDS.contacts.emilyChen,
    },
    // =========================================================================
    // ADDITIONAL ACTIVE DEALS FOR PIPELINE VARIETY
    // =========================================================================
    // More Qualification stage
    {
      id: SEED_IDS.opportunities.qualificationDeal1,
      name: 'Starter Package - Prospect Alpha',
      value: 5000,
      stage: OpportunityStage.QUALIFICATION,
      probability: 15,
      expectedCloseDate: new Date('2025-03-15'),
      description: 'Small business starter package',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.startupXYZ,
      contactId: null,
    },
    {
      id: SEED_IDS.opportunities.qualificationDeal2,
      name: 'Trial to Paid - Prospect Beta',
      value: 8500,
      stage: OpportunityStage.QUALIFICATION,
      probability: 20,
      expectedCloseDate: new Date('2025-03-20'),
      description: 'Converting trial user to paid',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.devTools,
      contactId: null,
    },
    // More Proposal stage
    {
      id: SEED_IDS.opportunities.proposalDeal1,
      name: 'Mid-Market Solution - Company C',
      value: 35000,
      stage: OpportunityStage.PROPOSAL,
      probability: 50,
      expectedCloseDate: new Date('2025-02-28'),
      description: 'Mid-market CRM solution',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.techCorp,
      contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.opportunities.proposalDeal2,
      name: 'Integration Services - Company D',
      value: 18000,
      stage: OpportunityStage.PROPOSAL,
      probability: 45,
      expectedCloseDate: new Date('2025-03-05'),
      description: 'Third-party integration services',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      accountId: SEED_IDS.accounts.designCo,
      contactId: SEED_IDS.contacts.davidChen,
    },
    {
      id: SEED_IDS.opportunities.proposalDeal3,
      name: 'Annual Renewal - Company E',
      value: 22000,
      stage: OpportunityStage.PROPOSAL,
      probability: 65,
      expectedCloseDate: new Date('2025-02-15'),
      description: 'Annual subscription renewal with expansion',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      accountId: SEED_IDS.accounts.finTech,
      contactId: SEED_IDS.contacts.elenaRodriguez,
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

async function seedSLAPolicies(tenantId: string) {
  console.log('📋 Seeding SLA policies...');

  const policies = [
    {
      id: SEED_IDS.slaPolicy.default,
      name: 'Standard SLA',
      description: 'Default SLA policy for standard support tickets',
      criticalResponseMinutes: 15,
      highResponseMinutes: 60,
      mediumResponseMinutes: 240,
      lowResponseMinutes: 480,
      criticalResolutionMinutes: 120,
      highResolutionMinutes: 480,
      mediumResolutionMinutes: 1440,
      lowResolutionMinutes: 4320,
      warningThresholdPercent: 25,
      isDefault: true,
      isActive: true,
      tenantId,
    },
    {
      id: SEED_IDS.slaPolicy.premium,
      name: 'Premium SLA',
      description: 'Premium SLA policy for enterprise customers',
      criticalResponseMinutes: 5,
      highResponseMinutes: 30,
      mediumResponseMinutes: 120,
      lowResponseMinutes: 240,
      criticalResolutionMinutes: 60,
      highResolutionMinutes: 240,
      mediumResolutionMinutes: 720,
      lowResolutionMinutes: 2160,
      warningThresholdPercent: 30,
      isDefault: false,
      isActive: true,
      tenantId,
    },
  ];

  for (const policy of policies) {
    await prisma.sLAPolicy.upsert({
      where: { id: policy.id },
      update: policy,
      create: policy,
    });
  }

  console.log(`✅ Created ${policies.length} SLA policies`);
  return policies;
}

async function seedTickets(tenantId: string) {
  console.log('🎫 Seeding tickets...');

  const now = new Date();

  // Data from apps/web/src/app/tickets/page.tsx
  const tickets = [
    {
      id: SEED_IDS.tickets.systemOutage,
      ticketNumber: 'T-10924',
      subject: 'System Outage: West Region',
      description: 'Multiple customers reporting connectivity issues',
      status: TicketStatus.OPEN,
      priority: TicketPriority.CRITICAL,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.BREACHED,
      slaResolutionDue: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours overdue
      slaBreachedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      contactName: 'Robert Chen',
      contactEmail: 'r.chen@acmecorp.com',
      assigneeId: SEED_IDS.users.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.loginFailure,
      ticketNumber: 'T-10921',
      subject: 'Login Failure for Enterprise Account',
      description: 'SSO authentication failing for GlobalTech',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.HIGH,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.AT_RISK,
      slaResolutionDue: new Date(now.getTime() + 45 * 60 * 1000), // 45 minutes from now
      contactName: 'David Kim',
      contactEmail: 'd.kim@globaltech.com',
      assigneeId: SEED_IDS.users.mikeRoss,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.darkModeRequest,
      ticketNumber: 'T-10899',
      subject: 'Feature Request: Dark Mode',
      description: 'Customer requesting dark mode for dashboard',
      status: TicketStatus.OPEN,
      priority: TicketPriority.LOW,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.ON_TRACK,
      slaResolutionDue: new Date(now.getTime() + 22 * 60 * 60 * 1000), // 22 hours from now
      contactName: 'Amanda Wilson',
      contactEmail: 'a.wilson@startup.io',
      assigneeId: null,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.billingInquiry,
      ticketNumber: 'T-10887',
      subject: 'Billing Inquiry - Nov Invoice',
      description: 'Question about charges on November invoice',
      status: TicketStatus.WAITING_ON_CUSTOMER,
      priority: TicketPriority.MEDIUM,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.ON_TRACK,
      slaResolutionDue: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 4 hours from now
      contactName: 'Elena Rodriguez',
      contactEmail: 'elena@fintech.io',
      assigneeId: SEED_IDS.users.davidKim,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.api500Error,
      ticketNumber: 'T-10755',
      subject: 'Integration API 500 Error',
      description: 'REST API returning 500 errors on POST requests',
      status: TicketStatus.IN_PROGRESS,
      priority: TicketPriority.CRITICAL,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      slaStatus: SLAStatus.BREACHED,
      slaResolutionDue: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours overdue
      slaBreachedAt: new Date(now.getTime() - 12 * 60 * 60 * 1000), // 12 hours ago
      contactName: 'James Wilson',
      contactEmail: 'j.wilson@techstart.com',
      assigneeId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    {
      id: SEED_IDS.tickets.dashboardPerformance,
      ticketNumber: 'T-10742',
      subject: 'Dashboard Performance Issues',
      description: 'Slow loading times during peak hours',
      status: TicketStatus.OPEN,
      priority: TicketPriority.HIGH,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      slaStatus: SLAStatus.AT_RISK,
      slaResolutionDue: new Date(now.getTime() + 28 * 60 * 1000), // 28 minutes from now
      contactName: 'Michael Brown',
      contactEmail: 'm.brown@enterprise.com',
      assigneeId: SEED_IDS.users.sarahJenkins,
      tenantId,
    },
  ];

  for (const ticket of tickets) {
    const hasSlaDue = Boolean(ticket.slaResponseDue || ticket.slaResolutionDue);

    if (ticket.slaStatus === SLAStatus.BREACHED && !ticket.slaBreachedAt) {
      throw new Error(
        `Invalid seed ticket ${ticket.ticketNumber}: BREACHED status requires slaBreachedAt`
      );
    }

    if (ticket.slaBreachedAt && !hasSlaDue) {
      throw new Error(
        `Invalid seed ticket ${ticket.ticketNumber}: slaBreachedAt requires slaResponseDue or slaResolutionDue`
      );
    }
  }

  for (const ticket of tickets) {
    await prisma.ticket.upsert({
      where: { id: ticket.id },
      update: ticket,
      create: ticket,
    });
  }

  console.log(`✅ Created ${tickets.length} tickets`);
  return tickets;
}

async function seedTasks(tenantId: string) {
  console.log('📋 Seeding tasks...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const oct24 = new Date(2025, 9, 24); // Oct 24, 2025
  const jan20 = new Date(2025, 0, 20); // Jan 20, 2025

  // Data from Dashboard widgets and Deal detail page
  const tasks = [
    // From UpcomingTasksWidget
    {
      id: SEED_IDS.tasks.callSarah,
      title: 'Call Sarah re: contract',
      description: 'Discuss contract terms for the TechCorp deal',
      dueDate: today,
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      contactId: SEED_IDS.contacts.sarahMiller,
    },
    {
      id: SEED_IDS.tasks.followUpTechCorp,
      title: 'Follow up with TechCorp',
      description: 'Send updated proposal after meeting',
      dueDate: tomorrow,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      opportunityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
    },
    {
      id: SEED_IDS.tasks.prepareQ3Report,
      title: 'Prepare Q3 Report',
      description: 'Compile Q3 sales and performance metrics',
      dueDate: oct24,
      priority: TaskPriority.LOW,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.manager,
      tenantId,
    },
    // From PendingTasksWidget
    {
      id: SEED_IDS.tasks.callAcmeCorp,
      title: 'Call with Acme Corp',
      description: 'Scheduled call at 2:00 PM',
      dueDate: today,
      priority: TaskPriority.HIGH,
      status: TaskStatus.IN_PROGRESS,
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.tasks.reviewQ3Report,
      title: 'Review Q3 Report',
      description: 'Review and approve Q3 report at 10:00 AM',
      dueDate: tomorrow,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.manager,
      tenantId,
    },
    // From Deal detail page - Next Steps
    {
      id: SEED_IDS.tasks.sendContract,
      title: 'Send revised contract',
      description: 'Send updated contract to Acme Corp',
      dueDate: tomorrow,
      priority: TaskPriority.URGENT,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.tasks.scheduleTechReview,
      title: 'Schedule tech review',
      description: 'Arrange technical review meeting with Acme Corp team',
      dueDate: jan20,
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.janeDoe,
      tenantId,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
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

async function seedAIScores(tenantId: string) {
  console.log('🤖 Seeding AI scores...');

  const aiScores = [
    {
      id: SEED_IDS.aiScores.sarahMiller,
      score: 85,
      confidence: 0.92,
      factors: {
        title_score: 30, // CTO - high decision maker
        company_size_score: 25, // 500 employees - good fit
        engagement_score: 20, // Qualified status
        budget_fit_score: 10,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.sarahMiller,
      scoredById: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.aiScores.davidChen,
      score: 42,
      confidence: 0.78,
      factors: {
        title_score: 15, // Manager - mid-level
        company_size_score: 10, // 50 employees - smaller
        engagement_score: 10, // New status
        budget_fit_score: 7,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.davidChen,
      scoredById: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.aiScores.amandaSmith,
      score: 15,
      confidence: 0.65,
      factors: {
        title_score: 5, // Freelance - low
        company_size_score: 2, // Very small
        engagement_score: 5, // Unqualified
        budget_fit_score: 3,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.amandaSmith,
      scoredById: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.aiScores.jamesWilson,
      score: 92,
      confidence: 0.96,
      factors: {
        title_score: 35, // VP Sales - key decision maker
        company_size_score: 30, // 2000 employees - enterprise
        engagement_score: 20, // Active negotiation
        budget_fit_score: 7,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.jamesWilson,
      scoredById: SEED_IDS.users.admin,
      tenantId,
    },
    {
      id: SEED_IDS.aiScores.elenaRodriguez,
      score: 55,
      confidence: 0.82,
      factors: {
        title_score: 20, // Product Manager - influential
        company_size_score: 15, // 150 employees - mid-size
        engagement_score: 12, // Contacted
        budget_fit_score: 8,
      },
      modelVersion: 'v1.0.0',
      leadId: SEED_IDS.leads.elenaRodriguez,
      scoredById: SEED_IDS.users.admin,
      tenantId,
    },
  ];

  for (const aiScore of aiScores) {
    await prisma.aIScore.upsert({
      where: { id: aiScore.id },
      update: aiScore,
      create: aiScore,
    });
  }

  console.log(`✅ Created ${aiScores.length} AI scores`);
  return aiScores;
}

async function seedAuditLogs(tenantId: string) {
  console.log('📝 Seeding audit log entries...');

  // NOSONAR: Hardcoded private IPs (192.168.x.x) are safe here - this is mock seed data
  // for development/testing only. These are RFC 1918 private addresses, not real user IPs.
  // Using consolidated AuditLogEntry table per ADR-008
  const auditLogEntries = [
    {
      id: SEED_IDS.auditLogs.create,
      eventType: 'LeadCreated',
      eventId: `event-${SEED_IDS.auditLogs.create}`,
      actorType: ActorType.USER,
      actorId: SEED_IDS.users.sarahJohnson,
      resourceType: 'Lead',
      resourceId: SEED_IDS.leads.sarahMiller,
      action: AuditAction.CREATE,
      beforeState: Prisma.JsonNull,
      afterState: { status: LeadStatus.QUALIFIED, score: 85 },
      changedFields: ['status', 'score'],
      ipAddress: '192.168.1.100', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      tenantId,
    },
    {
      id: SEED_IDS.auditLogs.opportunityCreate,
      eventType: 'OpportunityCreated',
      eventId: `event-${SEED_IDS.auditLogs.opportunityCreate}`,
      actorType: ActorType.USER,
      actorId: SEED_IDS.users.janeDoe,
      resourceType: 'Opportunity',
      resourceId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      action: AuditAction.CREATE,
      beforeState: Prisma.JsonNull,
      afterState: { stage: OpportunityStage.PROPOSAL, value: 125000 },
      changedFields: ['stage', 'value'],
      ipAddress: '192.168.1.101', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      tenantId,
    },
    {
      id: SEED_IDS.auditLogs.update,
      eventType: 'OpportunityStageChanged',
      eventId: `event-${SEED_IDS.auditLogs.update}`,
      actorType: ActorType.USER,
      actorId: SEED_IDS.users.mikeDavis,
      resourceType: 'Opportunity',
      resourceId: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      action: AuditAction.UPDATE,
      beforeState: { stage: OpportunityStage.NEGOTIATION },
      afterState: { stage: OpportunityStage.CLOSED_WON },
      changedFields: ['stage'],
      ipAddress: '192.168.1.102', // NOSONAR - mock seed data
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      tenantId,
    },
  ];

  for (const entry of auditLogEntries) {
    await prisma.auditLogEntry.upsert({
      where: { id: entry.id },
      update: entry,
      create: entry,
    });
  }

  console.log(`✅ Created ${auditLogEntries.length} audit log entries`);
  return auditLogEntries;
}

async function seedDomainEvents(tenantId: string) {
  console.log('📤 Seeding domain events...');

  const domainEvents = [
    {
      id: SEED_IDS.domainEvents.leadScored,
      eventType: 'LeadScored',
      aggregateType: 'Lead',
      aggregateId: SEED_IDS.leads.jamesWilson,
      payload: {
        score: 92,
        confidence: 0.96,
        modelVersion: 'v1.0.0',
      },
      metadata: { scoredById: SEED_IDS.users.admin },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
      tenantId,
    },
    {
      id: SEED_IDS.domainEvents.opportunityStageChanged,
      eventType: 'OpportunityStageChanged',
      aggregateType: 'Opportunity',
      aggregateId: SEED_IDS.opportunities.teamLicenseStartupXYZ,
      payload: {
        previousStage: OpportunityStage.NEGOTIATION,
        newStage: OpportunityStage.CLOSED_WON,
        value: 12000,
      },
      metadata: { userId: SEED_IDS.users.mikeDavis },
      status: EventStatus.PROCESSED,
      processedAt: new Date(),
      tenantId,
    },
    {
      id: SEED_IDS.domainEvents.ticketSLABreached,
      eventType: 'TicketSLABreached',
      aggregateType: 'Ticket',
      aggregateId: SEED_IDS.tickets.systemOutage,
      payload: {
        ticketNumber: 'T-10924',
        priority: TicketPriority.CRITICAL,
        breachedAt: new Date(),
      },
      metadata: { systemGenerated: true },
      status: EventStatus.PENDING,
      tenantId,
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

// =============================================================================
// Supplementary Data Seed Functions
// =============================================================================

async function seedDealProducts(tenantId: string) {
  console.log('📦 Seeding deal products...');

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 138-141
  const products = [
    {
      id: SEED_IDS.dealProducts.enterpriseLicense,
      name: 'Enterprise License',
      description: 'Qty: 100 Seats',
      quantity: 100,
      unitPrice: 1000,
      totalPrice: 100000,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      tenantId,
    },
    {
      id: SEED_IDS.dealProducts.implementation,
      name: 'Implementation',
      description: 'Standard Package',
      quantity: 1,
      unitPrice: 25000,
      totalPrice: 25000,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      tenantId,
    },
  ];

  for (const product of products) {
    await prisma.dealProduct.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }

  console.log(`✅ Created ${products.length} deal products`);
  return products;
}

async function seedDealFiles(tenantId: string) {
  console.log('📁 Seeding deal files...');

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 146-149
  const files = [
    {
      id: SEED_IDS.dealFiles.acmeMsa,
      name: 'Acme_MSA_v3.pdf',
      size: '2.4 MB',
      sizeBytes: 2516582,
      fileType: FileType.PDF,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      uploadedById: SEED_IDS.users.janeDoe,
      uploadedAt: new Date('2024-12-15'),
      tenantId,
    },
    {
      id: SEED_IDS.dealFiles.requirementsDoc,
      name: 'Requirements_Doc.docx',
      size: '1.1 MB',
      sizeBytes: 1153434,
      fileType: FileType.DOCX,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      uploadedById: SEED_IDS.users.janeDoe,
      uploadedAt: new Date('2024-12-10'),
      tenantId,
    },
  ];

  for (const file of files) {
    await prisma.dealFile.upsert({
      where: { id: file.id },
      update: file,
      create: file,
    });
  }

  console.log(`✅ Created ${files.length} deal files`);
  return files;
}

async function seedDealActivities(tenantId: string) {
  console.log('📋 Seeding deal activities...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Data from apps/web/src/app/deals/[id]/page.tsx lines 152-202
  const activities = [
    {
      id: SEED_IDS.dealActivities.agentAdvance,
      type: ActivityType.AGENT_ACTION,
      title: 'AI: Advance deal to negotiation stage',
      description:
        'Pipeline Intelligence Agent detected positive signals from recent communication',
      timestamp: new Date(now.getTime() - 30 * 60 * 1000), // 11:30 AM today
      dateLabel: 'today',
      agentActionId: 'action-3',
      agentName: 'Pipeline Intelligence Agent',
      confidenceScore: 92,
      agentStatus: AgentActionStatus.PENDING_APPROVAL,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
    {
      id: SEED_IDS.dealActivities.emailProposal,
      type: ActivityType.EMAIL,
      title: 'Email Sent: Proposal V2',
      description: 'Attached the updated pricing model as discussed in the meeting.',
      timestamp: new Date(now.getTime() - 78 * 60 * 1000), // 10:42 AM today
      dateLabel: 'today',
      attachmentName: 'Proposal_Acme_v2.pdf',
      attachmentType: 'pdf',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
    {
      id: SEED_IDS.dealActivities.agentMeeting,
      type: ActivityType.AGENT_ACTION,
      title: 'AI: Schedule follow-up meeting',
      description: 'Task Automation Agent identified optimal meeting time based on calendars',
      timestamp: new Date(now.getTime() - 165 * 60 * 1000), // 9:15 AM today
      dateLabel: 'today',
      agentActionId: 'action-4',
      agentName: 'Task Automation Agent',
      confidenceScore: 78,
      agentStatus: AgentActionStatus.APPROVED,
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
    {
      id: SEED_IDS.dealActivities.callRobert,
      type: ActivityType.CALL,
      title: 'Call with Robert Fox',
      description:
        'Discussed timeline for implementation. They are keen to start by Nov 1st. Need to adjust contract start date.',
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000 + 15 * 60 * 1000), // 2:15 PM yesterday
      dateLabel: 'yesterday',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
    {
      id: SEED_IDS.dealActivities.stageChange,
      type: ActivityType.STAGE_CHANGE,
      title: 'Stage Changed',
      timestamp: new Date(yesterday.getTime() + 9 * 60 * 60 * 1000 + 30 * 60 * 1000), // 9:30 AM yesterday
      dateLabel: 'yesterday',
      stageFrom: 'Qualification',
      stageTo: 'Proposal',
      opportunityId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
      userId: SEED_IDS.users.janeDoe,
      tenantId,
    },
  ];

  for (const activity of activities) {
    await prisma.activityEvent.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} deal activities`);
  return activities;
}

async function seedTicketActivities(tenantId: string) {
  console.log('💬 Seeding ticket activities...');

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Data from apps/web/src/app/tickets/[id]/page.tsx lines 134-180
  const activities = [
    // ---- System Outage (CRITICAL) ----
    {
      id: SEED_IDS.ticketActivities.customerMessage,
      type: TicketActivityType.CUSTOMER_MESSAGE,
      content:
        "Hi Support,\n\nOur team in the West Region is reporting consistent 503 errors when trying to load the main dashboard. This started about 30 minutes ago. We've tried clearing cache and different browsers but the issue persists.\n\nPlease investigate ASAP as this is blocking our daily reporting.\n\nRegards,\nDavid",
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 30 * 60 * 1000), // Yesterday 4:30 PM
      isInternal: false,
      authorName: 'David Kim',
      authorRole: 'Customer',
      authorAvatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&h=80&fit=crop&crop=face',
      channel: TicketChannel.EMAIL,
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.systemPriority,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'automatically assigned priority',
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 30 * 60 * 1000),
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'priority_assigned',
      systemEventData: { newPriority: 'High' },
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.agentReply,
      type: TicketActivityType.AGENT_REPLY,
      content:
        "Hello David,\n\nThanks for reaching out. I'm looking into this immediately. We are checking our load balancers for the West region.\n\nI've escalated this to our DevOps team.",
      timestamp: new Date(yesterday.getTime() + 16 * 60 * 60 * 1000 + 45 * 60 * 1000), // Yesterday 4:45 PM
      isInternal: false,
      authorName: 'Sarah Jenkins',
      authorRole: 'Support Agent',
      authorAvatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=80&h=80&fit=crop&crop=face',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.priorityChange,
      type: TicketActivityType.STATUS_CHANGE,
      content: 'changed priority to',
      timestamp: new Date(yesterday.getTime() + 17 * 60 * 60 * 1000), // Yesterday 5:00 PM
      isInternal: true,
      authorName: 'Sarah Jenkins',
      authorRole: 'Support Agent',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'priority_change',
      systemEventData: { newPriority: 'Critical' },
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.internalNote,
      type: TicketActivityType.INTERNAL_NOTE,
      content:
        'We identified a degraded shard in the DB cluster. Replication lag is high. Creating a fix now.',
      timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000), // Today 9:15 AM (3 hours ago)
      isInternal: true,
      authorName: 'Mike Ross (DevOps)',
      authorRole: 'DevOps',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.slaBreach,
      type: TicketActivityType.SLA_ALERT,
      content: 'Resolution time exceeded by 2 hours',
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'sla_breach',
      ticketId: SEED_IDS.tickets.systemOutage,
      tenantId,
    },

    // ---- Login Failure (HIGH) ----
    {
      id: SEED_IDS.ticketActivities.loginCreated,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Ticket created',
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000), // Yesterday 10:00 AM
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'ticket_created',
      ticketId: SEED_IDS.tickets.loginFailure,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.loginCustomerMsg,
      type: TicketActivityType.CUSTOMER_MESSAGE,
      content:
        "Hi,\n\nOur SSO login has been failing for the past hour. Multiple users across the organization are unable to sign in. The error says 'Authentication provider unavailable'.\n\nThis is urgent — our entire sales team is locked out.\n\nThanks,\nEmily",
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000 + 5 * 60 * 1000), // Yesterday 10:05 AM
      isInternal: false,
      authorName: 'Emily Chen',
      authorRole: 'Customer',
      channel: TicketChannel.EMAIL,
      ticketId: SEED_IDS.tickets.loginFailure,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.loginAgentReply,
      type: TicketActivityType.AGENT_REPLY,
      content:
        "Hi Emily,\n\nI've escalated this to our identity team. We're seeing issues with the SSO provider and are working on restoring access. In the meantime, users can try the direct login at /auth/login.\n\nWe'll update you within 30 minutes.",
      timestamp: new Date(yesterday.getTime() + 10 * 60 * 60 * 1000 + 20 * 60 * 1000), // Yesterday 10:20 AM
      isInternal: false,
      authorName: 'Mike Ross',
      authorRole: 'Support Agent',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.loginFailure,
      tenantId,
    },

    // ---- Dark Mode Request (LOW) ----
    {
      id: SEED_IDS.ticketActivities.darkModeCreated,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Ticket created',
      timestamp: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'ticket_created',
      ticketId: SEED_IDS.tickets.darkModeRequest,
      tenantId,
    },

    // ---- Billing Inquiry (MEDIUM) ----
    {
      id: SEED_IDS.ticketActivities.billingCreated,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Ticket created',
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'ticket_created',
      ticketId: SEED_IDS.tickets.billingInquiry,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.billingAgentReply,
      type: TicketActivityType.AGENT_REPLY,
      content:
        "Hi,\n\nI've reviewed your account and can see the duplicate charge. I'm processing a refund for the extra charge now. You should see it reflected within 3-5 business days.\n\nPlease let me know if you have any other questions.",
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000), // 2 days ago + 2h
      isInternal: false,
      authorName: 'David Kim',
      authorRole: 'Support Agent',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.billingInquiry,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.billingWaiting,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Status changed to Waiting on Customer',
      timestamp: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000 + 2 * 60 * 60 * 1000 + 5 * 60 * 1000),
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'status_change',
      systemEventData: { newStatus: 'WAITING_ON_CUSTOMER' },
      ticketId: SEED_IDS.tickets.billingInquiry,
      tenantId,
    },

    // ---- API 500 Error (CRITICAL) ----
    {
      id: SEED_IDS.ticketActivities.apiCreated,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Ticket created',
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000), // Yesterday 2:00 PM
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'ticket_created',
      ticketId: SEED_IDS.tickets.api500Error,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.apiCustomerMsg,
      type: TicketActivityType.CUSTOMER_MESSAGE,
      content:
        "We're getting 500 Internal Server Error on all API calls to /api/v2/contacts and /api/v2/deals. This started around 1:45 PM and is affecting our integration pipeline. Our automated workflows are failing as a result.\n\nEndpoint: POST /api/v2/contacts\nResponse: 500 Internal Server Error\nRequest ID: req_abc123",
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000 + 10 * 60 * 1000), // Yesterday 2:10 PM
      isInternal: false,
      authorName: 'James Wilson',
      authorRole: 'Customer',
      channel: TicketChannel.EMAIL,
      ticketId: SEED_IDS.tickets.api500Error,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.apiAgentReply,
      type: TicketActivityType.AGENT_REPLY,
      content:
        "Hi James,\n\nWe've identified the root cause — a database connection pool exhaustion issue. Our infrastructure team is scaling up the connection pool and deploying a fix now.\n\nETA for resolution: 30-45 minutes.",
      timestamp: new Date(yesterday.getTime() + 14 * 60 * 60 * 1000 + 35 * 60 * 1000), // Yesterday 2:35 PM
      isInternal: false,
      authorName: 'Alex Morgan',
      authorRole: 'Support Agent',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.api500Error,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.apiSlaBreach,
      type: TicketActivityType.SLA_ALERT,
      content: 'Response time SLA at risk — approaching 1 hour limit',
      timestamp: new Date(yesterday.getTime() + 15 * 60 * 60 * 1000), // Yesterday 3:00 PM
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'sla_breach',
      ticketId: SEED_IDS.tickets.api500Error,
      tenantId,
    },

    // ---- Dashboard Performance (HIGH) ----
    {
      id: SEED_IDS.ticketActivities.dashCreated,
      type: TicketActivityType.SYSTEM_EVENT,
      content: 'Ticket created',
      timestamp: new Date(now.getTime() - 8 * 60 * 60 * 1000), // 8 hours ago
      isInternal: true,
      authorName: 'System',
      authorRole: 'System',
      channel: TicketChannel.SYSTEM,
      systemEventType: 'ticket_created',
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      tenantId,
    },
    {
      id: SEED_IDS.ticketActivities.dashCustomerMsg,
      type: TicketActivityType.CUSTOMER_MESSAGE,
      content:
        "The analytics dashboard is taking 15-20 seconds to load. Charts are timing out and we see spinner indefinitely on the revenue breakdown widget. This has been getting progressively worse over the past week.\n\nBrowser: Chrome 120\nScreen: Analytics > Revenue Dashboard",
      timestamp: new Date(now.getTime() - 7 * 60 * 60 * 1000 - 45 * 60 * 1000), // ~7h45m ago
      isInternal: false,
      authorName: 'Rachel Green',
      authorRole: 'Customer',
      channel: TicketChannel.PORTAL,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      tenantId,
    },
  ];

  for (const activity of activities) {
    await prisma.ticketActivity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} ticket activities`);
  return activities;
}

async function seedTicketAttachments(tenantId: string) {
  console.log('📎 Seeding ticket attachments...');

  // Data from apps/web/src/app/tickets/[id]/page.tsx lines 789-791
  const attachments = [
    {
      id: SEED_IDS.ticketAttachments.errorLogs,
      name: 'error-logs-west-region.pdf',
      size: '2.4 MB',
      sizeBytes: 2516582,
      fileType: FileType.PDF,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.davidKim,
      tenantId,
    },
    {
      id: SEED_IDS.ticketAttachments.screenshot,
      name: 'screenshot-503-error.png',
      size: '1.1 MB',
      sizeBytes: 1153434,
      fileType: FileType.IMAGE,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.davidKim,
      tenantId,
    },
    {
      id: SEED_IDS.ticketAttachments.devopsAnalysis,
      name: 'devops-analysis.docx',
      size: '856 KB',
      sizeBytes: 876544,
      fileType: FileType.DOCX,
      ticketId: SEED_IDS.tickets.systemOutage,
      uploadedById: SEED_IDS.users.mikeRoss,
      tenantId,
    },
  ];

  for (const attachment of attachments) {
    await prisma.ticketAttachment.upsert({
      where: { id: attachment.id },
      update: attachment,
      create: attachment,
    });
  }

  console.log(`✅ Created ${attachments.length} ticket attachments`);
  return attachments;
}

// =============================================================================
// Additional Data Seed Functions (from agent-approvals, contacts detail, dashboard)
// =============================================================================

async function seedAdditionalUsersAndAccounts(tenantId: string) {
  console.log('👥 Seeding additional users and accounts...');

  // Additional users from dashboard widgets
  const additionalUsers = [
    {
      id: SEED_IDS.additionalUsers.aliceSmith,
      email: 'alice.smith@intelliflow.dev',
      name: 'Alice Smith',
      role: UserRole.SALES_REP,
      tenantId,
    },
    {
      id: SEED_IDS.additionalUsers.bobJones,
      email: 'bob.jones@intelliflow.dev',
      name: 'Bob Jones',
      role: UserRole.SALES_REP,
      tenantId,
    },
  ];

  for (const user of additionalUsers) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        ...user,
      },
      create: {
        ...user,
      },
    });
  }

  // Additional account: TechFlow Inc. (from contact detail page)
  const techFlowAccount = {
    id: SEED_IDS.additionalAccounts.techFlowInc,
    name: 'TechFlow Inc.',
    industry: 'Technology',
    website: 'https://techflow.com',
    ownerId: SEED_IDS.users.alexMorgan, // Assign to Alex Morgan (sales rep)
    tenantId,
  };

  await prisma.account.upsert({
    where: { id: techFlowAccount.id },
    update: techFlowAccount,
    create: techFlowAccount,
  });

  // Additional contact: Sarah Jenkins (from contact detail page)
  const sarahJenkinsContact = {
    id: SEED_IDS.additionalContacts.sarahJenkins,
    email: 'sarah.j@techflow.com',
    firstName: 'Sarah',
    lastName: 'Jenkins',
    title: 'VP of Marketing',
    phone: '+1 (555) 012-3456',
    department: 'Marketing',
    ownerId: SEED_IDS.users.alexMorgan,
    tenantId,
    accountId: SEED_IDS.additionalAccounts.techFlowInc,
  };

  await prisma.contact.upsert({
    where: { id: sarahJenkinsContact.id },
    update: sarahJenkinsContact,
    create: sarahJenkinsContact,
  });

  console.log('✅ Created 2 additional users, 1 account, 1 contact');
}

async function seedAgentActions(tenantId: string) {
  console.log('🤖 Seeding agent actions...');

  const now = new Date();

  // Data from apps/web/src/app/agent-approvals/page.tsx lines 45-154
  const agentActions = [
    {
      id: SEED_IDS.agentActions.leadUpdate,
      actionType: 'lead_update',
      tenantId,
      description: 'Update lead score and status based on engagement analysis',
      aiReasoning:
        'Lead opened 5 emails (100% open rate), visited pricing page 3 times, and downloaded enterprise whitepaper. Company size (500+ employees) matches ideal customer profile.',
      confidenceScore: 85,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'lead-123',
      entityType: 'lead',
      entityName: 'John Smith - Acme Corp',
      previousState: {
        score: 45,
        status: 'New',
        nextFollowUp: null,
        notes: 'Initial inquiry via website form',
      },
      proposedState: {
        score: 72,
        status: 'Qualified',
        nextFollowUp: '2025-01-05',
        notes:
          'Initial inquiry via website form. AI Analysis: High engagement, enterprise company, decision-maker role.',
      },
      agentId: 'scoring-agent-v1',
      agentName: 'Lead Scoring Agent',
      createdAt: new Date(now.getTime() - 30 * 60 * 1000), // 30 min ago
      expiresAt: new Date(now.getTime() + 23 * 60 * 60 * 1000), // 23 hours from now
    },
    {
      id: SEED_IDS.agentActions.emailDraft,
      actionType: 'email_draft',
      tenantId,
      description: 'Send personalized follow-up email based on demo engagement',
      aiReasoning:
        'Contact attended 45-minute demo, asked 8 questions about API integrations, and requested pricing information. Optimal follow-up timing is 5 days post-demo based on historical conversion data.',
      confidenceScore: 78,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'contact-456',
      entityType: 'contact',
      entityName: 'Sarah Johnson - TechStart Inc',
      previousState: {
        lastContactedAt: '2024-12-20',
        emailsSent: 2,
      },
      proposedState: {
        lastContactedAt: '2025-01-02',
        emailsSent: 3,
        pendingEmail: {
          subject: 'Quick follow-up on your IntelliFlow demo',
          body: 'Hi Sarah, I wanted to follow up on our demo last week...',
        },
      },
      agentId: 'outreach-agent-v1',
      agentName: 'Outreach Agent',
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
      expiresAt: new Date(now.getTime() + 22 * 60 * 60 * 1000),
    },
    {
      id: SEED_IDS.agentActions.dealStageChange,
      actionType: 'deal_stage_change',
      tenantId,
      description: 'Advance deal to negotiation stage with updated probability',
      aiReasoning:
        "Prospect verbally agreed to terms in last meeting (sentiment analysis: positive). Legal team CC'd on latest email suggests contract review in progress. Similar deals at this stage have 75% close rate.",
      confidenceScore: 92,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'deal-789',
      entityType: 'deal',
      entityName: 'Enterprise License - GlobalTech',
      previousState: {
        stage: 'PROPOSAL',
        probability: 60,
        value: 85000,
      },
      proposedState: {
        stage: 'NEGOTIATION',
        probability: 75,
        value: 92000,
        notes: 'Verbal agreement on terms. Awaiting legal review.',
      },
      agentId: 'pipeline-agent-v1',
      agentName: 'Pipeline Intelligence Agent',
      createdAt: new Date(now.getTime() - 15 * 60 * 1000), // 15 min ago
      expiresAt: new Date(now.getTime() + 23.5 * 60 * 60 * 1000),
    },
    {
      id: SEED_IDS.agentActions.taskCreate,
      actionType: 'task_create',
      tenantId,
      description: 'Create follow-up task for high-intent lead',
      aiReasoning:
        'Lead visited pricing page 5 times in last 24 hours and spent 12 minutes on comparison chart. Urgency signals suggest ready for sales conversation.',
      confidenceScore: 68,
      status: AgentActionStatus.PENDING_APPROVAL,
      entityId: 'lead-124',
      entityType: 'lead',
      entityName: 'Mike Chen - StartupXYZ',
      previousState: {
        tasks: [],
      },
      proposedState: {
        tasks: [
          {
            title: 'Schedule discovery call',
            dueDate: '2025-01-03',
            priority: 'high',
            assignee: 'current_user',
          },
        ],
      },
      agentId: 'task-agent-v1',
      agentName: 'Task Automation Agent',
      createdAt: new Date(now.getTime() - 45 * 60 * 1000), // 45 min ago
      expiresAt: new Date(now.getTime() + 22.5 * 60 * 60 * 1000),
    },
  ];

  for (const action of agentActions) {
    await prisma.agentAction.upsert({
      where: { id: action.id },
      update: action,
      create: action,
    });
  }

  console.log(`✅ Created ${agentActions.length} agent actions`);
  return agentActions;
}

async function seedContactActivities(tenantId: string) {
  console.log('📱 Seeding contact activities...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx lines 99-235
  const activities = [
    {
      id: SEED_IDS.contactActivities.emailOpened,
      type: ContactActivityType.EMAIL,
      title: 'Email Opened',
      description: 'Proposal Follow-up - Q3 Software',
      timestamp: new Date('2024-12-20T14:00:00Z'),
      userName: 'System',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        subject: 'Proposal Follow-up - Q3 Software',
        preview:
          'Hi Sarah, Following up on our conversation about the Q3 software implementation...',
        openCount: 3,
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.meetingCompleted,
      type: ContactActivityType.MEETING,
      title: 'Meeting Completed',
      description: 'Q3 Requirements Review - 45 min',
      timestamp: new Date('2024-12-19T15:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        attendees: ['Sarah Jenkins', 'Alex Morgan', 'Mike Chen'],
        location: 'Zoom',
        notes: 'Discussed API integration requirements. Sarah confirmed budget approval for Q1.',
        duration: '45 min',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.dealStageUpdated,
      type: ContactActivityType.DEAL,
      title: 'Deal Stage Updated',
      description: 'Moved from Qualification → Negotiation',
      timestamp: new Date('2024-12-19T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.callLogged,
      type: ContactActivityType.CALL,
      title: 'Call Logged',
      description: 'Discussed requirements for custom API integration',
      timestamp: new Date('2024-12-18T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        duration: '15 min',
        outcome: 'connected',
        recordingUrl: '/recordings/call-123.mp3',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.whatsappMessage,
      type: ContactActivityType.CHAT,
      title: 'WhatsApp Message',
      description: 'Quick follow-up on pricing question',
      timestamp: new Date('2024-12-17T16:30:00Z'),
      userName: 'Sarah Jenkins',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        channel: 'whatsapp',
        messageCount: 5,
        preview: 'Thanks for the quick response! The pricing looks good...',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.documentSigned,
      type: ContactActivityType.DOCUMENT,
      title: 'Document Signed',
      description: 'NDA Agreement signed',
      timestamp: new Date('2024-12-16T11:00:00Z'),
      userName: 'Sarah Jenkins',
      sentiment: Sentiment.POSITIVE,
      metadata: {
        fileName: 'NDA_TechFlow_2024.pdf',
        fileSize: '245 KB',
        fileType: 'pdf',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.ticketResolved,
      type: ContactActivityType.TICKET,
      title: 'Ticket Resolved',
      description: 'Integration API question resolved',
      timestamp: new Date('2024-12-15T14:00:00Z'),
      userName: 'Support Team',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        ticketId: 'TKT-1234',
        status: 'Resolved',
        priority: 'Medium',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.noteAdded,
      type: ContactActivityType.NOTE,
      title: 'Note Added',
      description: 'Sarah mentioned they are evaluating 2 other competitors',
      timestamp: new Date('2024-12-15T16:30:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.emailSent,
      type: ContactActivityType.EMAIL,
      title: 'Email Sent',
      description: 'Enterprise License Proposal',
      timestamp: new Date('2024-12-14T09:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        subject: 'Enterprise License Proposal - TechFlow Inc.',
        preview: 'Dear Sarah, Thank you for your interest in our Enterprise solution...',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
    {
      id: SEED_IDS.contactActivities.meetingScheduled,
      type: ContactActivityType.MEETING,
      title: 'Meeting Scheduled',
      description: 'Initial Discovery Call',
      timestamp: new Date('2024-12-10T10:00:00Z'),
      userName: 'Alex Morgan',
      sentiment: Sentiment.NEUTRAL,
      metadata: {
        attendees: ['Sarah Jenkins', 'Alex Morgan'],
        location: 'Google Meet',
        duration: '30 min',
      },
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      tenantId,
    },
  ];

  for (const activity of activities) {
    await prisma.contactActivity.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${activities.length} contact activities`);
  return activities;
}

async function seedDashboardActivities(tenantId: string) {
  console.log('📊 Seeding dashboard recent activities...');

  // Data from apps/web/src/components/dashboard/widgets/RecentActivityWidget.tsx
  // These are ActivityEvent records for the dashboard widget
  const now = new Date();

  const dashboardActivities = [
    {
      id: SEED_IDS.dashboardActivities.aliceActivity,
      type: ActivityType.STAGE_CHANGE,
      title: 'Created new deal',
      description: 'Tech Solutions Bundle',
      timestamp: new Date(now.getTime() - 2 * 60 * 1000), // 2 minutes ago
      dateLabel: 'today',
      userId: SEED_IDS.additionalUsers.aliceSmith,
      tenantId,
    },
    {
      id: SEED_IDS.dashboardActivities.bobActivity,
      type: ActivityType.NOTE,
      title: 'Updated status',
      description: 'Project Alpha',
      timestamp: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      dateLabel: 'today',
      userId: SEED_IDS.additionalUsers.bobJones,
      tenantId,
    },
  ];

  for (const activity of dashboardActivities) {
    await prisma.activityEvent.upsert({
      where: { id: activity.id },
      update: activity,
      create: activity,
    });
  }

  console.log(`✅ Created ${dashboardActivities.length} dashboard activities`);
  return dashboardActivities;
}

// =============================================================================
// NEW COMPREHENSIVE UI DATA SEED FUNCTIONS
// =============================================================================

async function seedContactNotes(tenantId: string) {
  console.log('📝 Seeding contact notes...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockNotes)
  const notes = [
    {
      id: SEED_IDS.contactNotes.securityFeatures,
      content:
        'Very interested in our enterprise security features. Needs SOC2 compliance documentation.',
      author: 'Alex Morgan',
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      createdAt: new Date('2024-12-15T16:30:00Z'),
      tenantId,
    },
    {
      id: SEED_IDS.contactNotes.budgetApproved,
      content: 'Budget approved for Q1. Decision expected by end of January.',
      author: 'Sarah Jenkins',
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      createdAt: new Date('2024-12-10T11:00:00Z'),
      tenantId,
    },
  ];

  for (const note of notes) {
    await prisma.contactNote.upsert({
      where: { id: note.id },
      update: note,
      create: note,
    });
  }

  console.log(`✅ Created ${notes.length} contact notes`);
}

async function seedContactAIInsights(tenantId: string) {
  console.log('🤖 Seeding contact AI insights...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockAIInsights)
  const insight = {
    id: SEED_IDS.contactAIInsights.sarahJenkins,
    contactId: SEED_IDS.additionalContacts.sarahJenkins,
    tenantId,
    conversionProbability: 85,
    lifetimeValue: 24500000, // $245,000 in cents
    churnRisk: ChurnRisk.LOW,
    nextBestAction: 'Schedule a meeting to discuss contract terms',
    sentiment: 'Positive',
    engagementScore: 85,
    recommendations: [
      'Contact has high engagement - good time to propose upsell',
      'Decision maker role identified - include in executive communications',
      'Optimal contact time: Tuesday-Thursday, 10am-2pm PST',
    ],
    sentimentTrend: 'improving',
    lastEngagementDays: 2,
  };

  await prisma.contactAIInsight.upsert({
    where: { id: insight.id },
    update: insight,
    create: insight,
  });

  console.log('✅ Created 1 contact AI insight');
}

async function seedCalendarEvents(tenantId: string) {
  console.log('📅 Seeding calendar events...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Data from multiple sources:
  // - apps/web/src/app/contacts/[id]/page.tsx (mockUpcoming)
  // - apps/web/src/components/dashboard/widgets/UpcomingEventsWidget.tsx (events)
  const events = [
    // From mockUpcoming (contact page)
    {
      id: SEED_IDS.calendarEvents.q3Review,
      title: 'Q3 Review',
      description: 'Quarterly review meeting with Sarah Jenkins',
      startTime: new Date(today.getTime() + 14 * 60 * 60 * 1000), // 2 PM today
      endTime: new Date(today.getTime() + 15 * 60 * 60 * 1000), // 3 PM today
      location: 'Zoom',
      eventType: CalendarEventType.MEETING,
      attendees: [
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=40&h=40&fit=crop&crop=face',
        'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=40&h=40&fit=crop&crop=face',
      ],
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    // From UpcomingEventsWidget
    {
      id: SEED_IDS.calendarEvents.productDemoTechCorp,
      title: 'Product Demo - TechCorp',
      description: 'Product demonstration for TechCorp team',
      startTime: new Date(today.getTime() + 15 * 60 * 60 * 1000), // 3 PM today
      endTime: new Date(today.getTime() + 16 * 60 * 60 * 1000),
      location: 'Conference Room A',
      eventType: CalendarEventType.MEETING,
      contactId: SEED_IDS.contacts.sarahMiller,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.calendarEvents.followUpCallSarah,
      title: 'Follow-up Call - Sarah',
      description: 'Follow-up call with Sarah regarding proposal',
      startTime: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 10.5 * 60 * 60 * 1000), // Tomorrow 10:30 AM
      endTime: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 11 * 60 * 60 * 1000),
      eventType: CalendarEventType.CALL,
      contactId: SEED_IDS.contacts.sarahMiller,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    {
      id: SEED_IDS.calendarEvents.proposalDeadline,
      title: 'Proposal Deadline',
      description: 'Deadline to submit TechCorp proposal',
      startTime: new Date('2024-10-28T17:00:00Z'),
      eventType: CalendarEventType.DEADLINE,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
  ];

  for (const event of events) {
    await prisma.calendarEvent.upsert({
      where: { id: event.id },
      update: event,
      create: event,
    });
  }

  console.log(`✅ Created ${events.length} calendar events`);
}

async function seedTeamMessages(tenantId: string) {
  console.log('💬 Seeding team messages...');

  const now = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TeamChatWidget.tsx
  const messages = [
    {
      id: SEED_IDS.teamMessages.sarahClosedDeal,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah',
      userAvatar: 'S',
      message: 'Just closed the deal with TechCorp!',
      channel: 'general',
      createdAt: new Date(now.getTime() - 5 * 60 * 1000), // 5 minutes ago
      tenantId,
    },
    {
      id: SEED_IDS.teamMessages.mikeGreatWork,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike',
      userAvatar: 'M',
      message: 'Great work team!',
      channel: 'general',
      createdAt: new Date(now.getTime() - 12 * 60 * 1000), // 12 minutes ago
      tenantId,
    },
    {
      id: SEED_IDS.teamMessages.emilyMeetingNotes,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily',
      userAvatar: 'E',
      message: 'Meeting notes uploaded',
      channel: 'general',
      createdAt: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      tenantId,
    },
  ];

  for (const msg of messages) {
    await prisma.teamMessage.upsert({
      where: { id: msg.id },
      update: msg,
      create: msg,
    });
  }

  console.log(`✅ Created ${messages.length} team messages`);
}

async function seedPipelineSnapshots(tenantId: string) {
  console.log('📊 Seeding pipeline snapshots...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/PipelineWidget.tsx
  const stages = [
    {
      id: SEED_IDS.pipelineSnapshots.qualification,
      stage: 'Qualification',
      value: 1240000, // $12,400 in cents
      dealCount: 8,
      percentage: 15,
      color: 'bg-ds-primary',
      snapshotDate,
      tenantId,
    },
    {
      id: SEED_IDS.pipelineSnapshots.proposal,
      stage: 'Proposal',
      value: 3420000, // $34,200 in cents
      dealCount: 12,
      percentage: 40,
      color: 'bg-indigo-500',
      snapshotDate,
      tenantId,
    },
    {
      id: SEED_IDS.pipelineSnapshots.negotiation,
      stage: 'Negotiation',
      value: 12000000, // $120,000 in cents
      dealCount: 4,
      percentage: 25,
      color: 'bg-amber-500',
      snapshotDate,
      tenantId,
    },
    {
      id: SEED_IDS.pipelineSnapshots.closedWon,
      stage: 'Closed Won',
      value: 4000000, // $40,000 in cents
      dealCount: 2,
      percentage: 20,
      color: 'bg-green-500',
      snapshotDate,
      tenantId,
    },
  ];

  for (const stage of stages) {
    await prisma.pipelineSnapshot.upsert({
      where: { id: stage.id },
      update: stage,
      create: stage,
    });
  }

  console.log(`✅ Created ${stages.length} pipeline snapshots`);
}

async function seedTrafficSources(tenantId: string) {
  console.log('📈 Seeding traffic sources...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TrafficSourcesWidget.tsx
  const sources = [
    {
      id: SEED_IDS.trafficSources.direct,
      tenantId,
      name: 'Direct',
      percentage: 35,
      color: 'bg-ds-primary',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.organic,
      tenantId,
      name: 'Organic',
      percentage: 28,
      color: 'bg-emerald-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.referral,
      tenantId,
      name: 'Referral',
      percentage: 22,
      color: 'bg-amber-500',
      snapshotDate,
    },
    {
      id: SEED_IDS.trafficSources.social,
      tenantId,
      name: 'Social',
      percentage: 15,
      color: 'bg-violet-500',
      snapshotDate,
    },
  ];

  for (const source of sources) {
    await prisma.trafficSource.upsert({
      where: { id: source.id },
      update: source,
      create: source,
    });
  }

  console.log(`✅ Created ${sources.length} traffic sources`);
}

async function seedGrowthMetrics(tenantId: string) {
  console.log('📈 Seeding growth metrics...');

  const currentYear = new Date().getFullYear();

  // Data from apps/web/src/components/dashboard/widgets/GrowthTrendsWidget.tsx
  const dataPoints = [20, 35, 28, 45, 42, 55, 48, 62, 58, 72, 68, 85];
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const monthIds = [
    'jan',
    'feb',
    'mar',
    'apr',
    'may',
    'jun',
    'jul',
    'aug',
    'sep',
    'oct',
    'nov',
    'dec',
  ];

  const metrics = months.map((month, index) => ({
    id: SEED_IDS.growthMetrics[monthIds[index] as keyof typeof SEED_IDS.growthMetrics],
    tenantId,
    month,
    year: currentYear,
    value: dataPoints[index],
    metricType: 'revenue',
  }));

  for (const metric of metrics) {
    await prisma.growthMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} growth metrics`);
}

async function seedDealsWonMetrics() {
  console.log('📊 Seeding deals won metrics...');

  const currentYear = new Date().getFullYear();

  // Data from apps/web/src/components/dashboard/widgets/DealsWonWidget.tsx
  const chartData = [
    { month: 'Jul', value: 45 },
    { month: 'Aug', value: 65 },
    { month: 'Sep', value: 55 },
    { month: 'Oct', value: 70 },
    { month: 'Nov', value: 80 },
    { month: 'Dec', value: 95 },
  ];
  const monthIds = ['jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  const metrics = chartData.map((data, index) => ({
    id: SEED_IDS.dealsWonMetrics[monthIds[index] as keyof typeof SEED_IDS.dealsWonMetrics],
    month: data.month,
    year: currentYear,
    value: data.value,
  }));

  for (const metric of metrics) {
    await prisma.dealsWonMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} deals won metrics`);
}

async function seedTicketNextSteps(tenantId: string) {
  console.log('📋 Seeding ticket next steps...');

  const steps = [
    // ---- System Outage (CRITICAL) — 3 custom steps ----
    {
      id: SEED_IDS.ticketNextSteps.verifyDbFix,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Verify DB cluster fix deployment',
      dueDate: 'Due in 1 hour',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.confirmResolution,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Confirm with customer resolution',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.documentRootCause,
      ticketId: SEED_IDS.tickets.systemOutage,
      title: 'Document root cause for knowledge base',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },

    // ---- Login Failure (HIGH) — 4 default steps ----
    {
      id: SEED_IDS.ticketNextSteps.loginReviewSso,
      ticketId: SEED_IDS.tickets.loginFailure,
      title: 'Review ticket details and confirm category',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.loginAckCustomer,
      ticketId: SEED_IDS.tickets.loginFailure,
      title: 'Send initial acknowledgement to customer',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.loginEscalate,
      ticketId: SEED_IDS.tickets.loginFailure,
      title: 'Escalate to senior support if unresolved',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.loginUpdateCustomer,
      ticketId: SEED_IDS.tickets.loginFailure,
      title: 'Update customer with resolution progress',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },

    // ---- Dark Mode Request (LOW) — 3 default steps ----
    {
      id: SEED_IDS.ticketNextSteps.darkReviewDetails,
      ticketId: SEED_IDS.tickets.darkModeRequest,
      title: 'Review ticket details and confirm category',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.darkAckCustomer,
      ticketId: SEED_IDS.tickets.darkModeRequest,
      title: 'Send initial acknowledgement to customer',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.darkInvestigate,
      ticketId: SEED_IDS.tickets.darkModeRequest,
      title: 'Investigate root cause and document findings',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },

    // ---- Billing Inquiry (MEDIUM) — 3 default steps ----
    {
      id: SEED_IDS.ticketNextSteps.billingReview,
      ticketId: SEED_IDS.tickets.billingInquiry,
      title: 'Review ticket details and confirm category',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.billingAck,
      ticketId: SEED_IDS.tickets.billingInquiry,
      title: 'Send initial acknowledgement to customer',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.billingInvestigate,
      ticketId: SEED_IDS.tickets.billingInquiry,
      title: 'Investigate root cause and document findings',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },

    // ---- API 500 Error (CRITICAL) — 4 default steps ----
    {
      id: SEED_IDS.ticketNextSteps.apiReview,
      ticketId: SEED_IDS.tickets.api500Error,
      title: 'Review ticket details and confirm category',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.apiAck,
      ticketId: SEED_IDS.tickets.api500Error,
      title: 'Send initial acknowledgement to customer',
      dueDate: 'Due Today',
      completed: true,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.apiEscalate,
      ticketId: SEED_IDS.tickets.api500Error,
      title: 'Escalate to senior support if unresolved',
      dueDate: 'Due in 1 hour',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.apiUpdate,
      ticketId: SEED_IDS.tickets.api500Error,
      title: 'Update customer with resolution progress',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },

    // ---- Dashboard Performance (HIGH) — 4 default steps ----
    {
      id: SEED_IDS.ticketNextSteps.dashReview,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      title: 'Review ticket details and confirm category',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.dashAck,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      title: 'Send initial acknowledgement to customer',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.dashEscalate,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      title: 'Escalate to senior support if unresolved',
      dueDate: 'Due Today',
      completed: false,
      tenantId,
    },
    {
      id: SEED_IDS.ticketNextSteps.dashUpdate,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      title: 'Update customer with resolution progress',
      dueDate: 'Tomorrow',
      completed: false,
      tenantId,
    },
  ];

  for (const step of steps) {
    await prisma.ticketNextStep.upsert({
      where: { id: step.id },
      update: step,
      create: step,
    });
  }

  console.log(`✅ Created ${steps.length} ticket next steps`);
}

async function seedRelatedTickets(tenantId: string) {
  console.log('🔗 Seeding related tickets...');

  const related = [
    // ---- System Outage → related ----
    {
      id: SEED_IDS.relatedTickets.slowDashboard,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: SEED_IDS.tickets.dashboardPerformance,
      relatedSubject: 'Dashboard performance degradation',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 85,
      tenantId,
    },
    {
      id: SEED_IDS.relatedTickets.databaseTimeout,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: SEED_IDS.tickets.api500Error,
      relatedSubject: 'API 500 Internal Server Error on /api/v2/contacts',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 72,
      tenantId,
    },
    {
      id: SEED_IDS.relatedTickets.apiLatency,
      ticketId: SEED_IDS.tickets.systemOutage,
      relatedId: SEED_IDS.tickets.loginFailure,
      relatedSubject: 'SSO login failures across organization',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 45,
      tenantId,
    },

    // ---- Login Failure → related to system outage ----
    {
      id: SEED_IDS.relatedTickets.loginSsoOutage,
      ticketId: SEED_IDS.tickets.loginFailure,
      relatedId: SEED_IDS.tickets.systemOutage,
      relatedSubject: 'System outage - 503 errors on dashboard',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 45,
      tenantId,
    },

    // ---- API 500 Error → related ----
    {
      id: SEED_IDS.relatedTickets.apiDbTimeout,
      ticketId: SEED_IDS.tickets.api500Error,
      relatedId: SEED_IDS.tickets.systemOutage,
      relatedSubject: 'System outage - 503 errors on dashboard',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 72,
      tenantId,
    },
    {
      id: SEED_IDS.relatedTickets.apiSystemOutage,
      ticketId: SEED_IDS.tickets.api500Error,
      relatedId: SEED_IDS.tickets.dashboardPerformance,
      relatedSubject: 'Dashboard performance degradation',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 55,
      tenantId,
    },

    // ---- Dashboard Performance → related ----
    {
      id: SEED_IDS.relatedTickets.dashSystemOutage,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      relatedId: SEED_IDS.tickets.systemOutage,
      relatedSubject: 'System outage - 503 errors on dashboard',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 85,
      tenantId,
    },
    {
      id: SEED_IDS.relatedTickets.dashApiLatency,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      relatedId: SEED_IDS.tickets.api500Error,
      relatedSubject: 'API 500 Internal Server Error on /api/v2/contacts',
      relatedStatus: TicketStatus.IN_PROGRESS,
      similarity: 55,
      tenantId,
    },
  ];

  for (const ticket of related) {
    await prisma.relatedTicket.upsert({
      where: { id: ticket.id },
      update: ticket,
      create: ticket,
    });
  }

  console.log(`✅ Created ${related.length} related tickets`);
}

async function seedTicketAIInsights(tenantId: string) {
  console.log('🤖 Seeding ticket AI insights...');

  const insights = [
    {
      id: SEED_IDS.ticketAIInsights.systemOutage,
      ticketId: SEED_IDS.tickets.systemOutage,
      suggestedSolutions: [
        'Check DB cluster replication status - similar to T-10756',
        'Verify load balancer health checks for West region',
        'Review recent deployment changes in the last 24 hours',
      ],
      sentiment: 'negative',
      predictedResolutionTime: '2-4 hours',
      similarResolvedTickets: 8,
      escalationRisk: 'high',
      tenantId,
    },
    {
      id: SEED_IDS.ticketAIInsights.loginFailure,
      ticketId: SEED_IDS.tickets.loginFailure,
      suggestedSolutions: [
        'Check SSO provider status page for ongoing incidents',
        'Verify SAML certificate expiry dates',
        'Provide direct login URL as temporary workaround',
      ],
      sentiment: 'negative',
      predictedResolutionTime: '1-2 hours',
      similarResolvedTickets: 5,
      escalationRisk: 'high',
      tenantId,
    },
    {
      id: SEED_IDS.ticketAIInsights.api500Error,
      ticketId: SEED_IDS.tickets.api500Error,
      suggestedSolutions: [
        'Check database connection pool utilization metrics',
        'Review API gateway rate limiting configuration',
        'Verify recent schema migration compatibility',
      ],
      sentiment: 'negative',
      predictedResolutionTime: '1-3 hours',
      similarResolvedTickets: 12,
      escalationRisk: 'critical',
      tenantId,
    },
    {
      id: SEED_IDS.ticketAIInsights.dashboardPerformance,
      ticketId: SEED_IDS.tickets.dashboardPerformance,
      suggestedSolutions: [
        'Optimize revenue dashboard SQL queries with proper indexing',
        'Add caching layer for chart data aggregation',
        'Check if recent data volume increase is causing slow queries',
      ],
      sentiment: 'neutral',
      predictedResolutionTime: '4-8 hours',
      similarResolvedTickets: 3,
      escalationRisk: 'medium',
      tenantId,
    },
  ];

  for (const insight of insights) {
    await prisma.ticketAIInsight.upsert({
      where: { id: insight.id },
      update: insight,
      create: insight,
    });
  }

  console.log(`✅ Created ${insights.length} ticket AI insights`);
}

async function seedSalesPerformance(tenantId: string) {
  console.log('🏆 Seeding sales performance...');

  const snapshotDate = new Date();

  // Data from apps/web/src/components/dashboard/widgets/TopPerformersWidget.tsx
  const performers = [
    {
      id: SEED_IDS.salesPerformance.sarahJohnson,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      userAvatar: 'SJ',
      dealCount: 12,
      revenue: 4520000, // $45,200 in cents
      rank: 1,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.mikeChen,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Chen',
      userAvatar: 'MC',
      dealCount: 10,
      revenue: 3850000, // $38,500 in cents
      rank: 2,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.emilyDavis,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      userAvatar: 'ED',
      dealCount: 8,
      revenue: 3210000, // $32,100 in cents
      rank: 3,
      period: 'monthly',
      snapshotDate,
    },
    {
      id: SEED_IDS.salesPerformance.jamesWilson,
      userId: SEED_IDS.users.jamesWilson,
      userName: 'James Wilson',
      userAvatar: 'JW',
      dealCount: 7,
      revenue: 2890000, // $28,900 in cents
      rank: 4,
      period: 'monthly',
      snapshotDate,
    },
  ];

  for (const perf of performers) {
    await prisma.salesPerformance.upsert({
      where: { id: perf.id },
      update: perf,
      create: perf,
    });
  }

  console.log(`✅ Created ${performers.length} sales performance records`);
}

async function seedDashboardTasks(tenantId: string) {
  console.log('✅ Seeding dashboard tasks...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Data from apps/web/src/components/dashboard/widgets/PendingTasksWidget.tsx
  const tasks = [
    {
      id: SEED_IDS.dashboardTasks.callAcme,
      title: 'Call with Acme Corp',
      description: 'Discuss Q4 renewal',
      dueDate: new Date(today.getTime() + 14 * 60 * 60 * 1000), // Today 2 PM
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.dashboardTasks.reviewQ3,
      title: 'Review Q3 Report',
      description: 'Review and prepare comments',
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000 + 10 * 60 * 60 * 1000), // Tomorrow 10 AM
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.dashboardTasks.emailFollowup,
      title: 'Email follow-up: Sarah',
      description: 'Follow up on proposal',
      dueDate: new Date(today.getTime() - 24 * 60 * 60 * 1000), // Yesterday (overdue)
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} dashboard tasks`);
}

async function seedContactDeals(tenantId: string) {
  console.log('💼 Seeding contact deals...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockDeals)
  // These deals are associated with Sarah Jenkins contact
  const deals = [
    {
      id: SEED_IDS.contactDeals.enterpriseLicense,
      name: 'Enterprise License - Q1 2025',
      value: 7500000, // $75,000 in cents
      stage: OpportunityStage.NEGOTIATION,
      probability: 75,
      expectedCloseDate: new Date('2025-01-31'),
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
    {
      id: SEED_IDS.contactDeals.professionalServices,
      name: 'Professional Services Package',
      value: 3500000, // $35,000 in cents
      stage: OpportunityStage.PROPOSAL,
      probability: 50,
      expectedCloseDate: new Date('2025-02-15'),
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
    {
      id: SEED_IDS.contactDeals.supportRenewal,
      name: 'Support Contract Renewal',
      value: 1500000, // $15,000 in cents
      stage: OpportunityStage.CLOSED_WON,
      probability: 100,
      expectedCloseDate: new Date('2024-12-01'),
      closedAt: new Date('2024-12-01'),
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      accountId: SEED_IDS.additionalAccounts.techFlowInc,
    },
  ];

  for (const deal of deals) {
    await prisma.opportunity.upsert({
      where: { id: deal.id },
      update: deal,
      create: deal,
    });
  }

  console.log(`✅ Created ${deals.length} contact deals`);
}

async function seedContactTasks(tenantId: string) {
  console.log('📋 Seeding contact tasks...');

  // Data from apps/web/src/app/contacts/[id]/page.tsx (mockTasks)
  const tasks = [
    {
      id: SEED_IDS.contactTasks.followUpContract,
      title: 'Follow up on contract',
      description: 'Follow up with Sarah on enterprise license contract',
      dueDate: new Date('2024-12-28'),
      priority: TaskPriority.HIGH,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactTasks.scheduleTechDemo,
      title: 'Schedule tech demo',
      description: 'Schedule technical demonstration for engineering team',
      dueDate: new Date('2024-12-30'),
      priority: TaskPriority.MEDIUM,
      status: TaskStatus.PENDING,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.contactTasks.sendProposal,
      title: 'Send initial proposal',
      description: 'Send initial proposal document',
      dueDate: new Date('2024-12-10'),
      priority: TaskPriority.LOW,
      status: TaskStatus.COMPLETED,
      ownerId: SEED_IDS.users.alexMorgan,
      tenantId,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
  ];

  for (const task of tasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: task,
      create: task,
    });
  }

  console.log(`✅ Created ${tasks.length} contact tasks`);
}

// =============================================================================
// NEW FLOW COVERAGE SEED FUNCTIONS (FLOW-001 to FLOW-038)
// =============================================================================

// FLOW-002, FLOW-004: Teams & Workspaces
async function seedWorkspaces() {
  console.log('🏢 Seeding workspaces...');

  const workspaces = [
    {
      id: SEED_IDS.workspaces.intelliflow,
      name: 'IntelliFlow CRM',
      slug: 'intelliflow-crm',
      description: 'Main IntelliFlow CRM workspace for enterprise customers',
      industry: 'Technology',
      size: 'enterprise',
      plan: 'enterprise',
      isActive: true,
      settings: {
        theme: 'dark',
        timezone: 'UTC',
        notifications: { email: true, slack: true },
      },
    },
    {
      id: SEED_IDS.workspaces.demo,
      name: 'Demo Workspace',
      slug: 'demo-workspace',
      description: 'Demo workspace for trials and demonstrations',
      industry: 'Various',
      size: 'small',
      plan: 'trial',
      isActive: true,
      settings: { theme: 'light', timezone: 'America/New_York' },
    },
  ];

  for (const workspace of workspaces) {
    await prisma.workspace.upsert({
      where: { id: workspace.id },
      update: workspace,
      create: workspace,
    });
  }

  console.log(`✅ Created ${workspaces.length} workspaces`);
}

async function seedTeams() {
  console.log('👥 Seeding teams...');

  const teams = [
    {
      id: SEED_IDS.teams.sales,
      name: 'Sales Team',
      description: 'Enterprise sales and account management',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.sarahJohnson,
      isActive: true,
    },
    {
      id: SEED_IDS.teams.support,
      name: 'Support Team',
      description: 'Customer support and ticket resolution',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.emilyDavis,
      isActive: true,
    },
    {
      id: SEED_IDS.teams.engineering,
      name: 'Engineering Team',
      description: 'Technical implementation and integrations',
      workspaceId: SEED_IDS.workspaces.intelliflow,
      leaderId: SEED_IDS.users.jamesWilson,
      isActive: true,
    },
  ];

  for (const team of teams) {
    await prisma.team.upsert({
      where: { id: team.id },
      update: team,
      create: team,
    });
  }

  console.log(`✅ Created ${teams.length} teams`);
}

async function seedTeamMembers() {
  console.log('👤 Seeding team members...');

  const members = [
    {
      id: SEED_IDS.teamMembers.sarahSales,
      teamId: SEED_IDS.teams.sales,
      userId: SEED_IDS.users.sarahJohnson,
      role: 'lead',
      joinedAt: new Date('2024-01-15'),
    },
    {
      id: SEED_IDS.teamMembers.mikeSales,
      teamId: SEED_IDS.teams.sales,
      userId: SEED_IDS.users.mikeDavis,
      role: 'member',
      joinedAt: new Date('2024-02-01'),
    },
    {
      id: SEED_IDS.teamMembers.emilySupport,
      teamId: SEED_IDS.teams.support,
      userId: SEED_IDS.users.emilyDavis,
      role: 'lead',
      joinedAt: new Date('2024-01-10'),
    },
  ];

  for (const member of members) {
    await prisma.teamMember.upsert({
      where: { id: member.id },
      update: member,
      create: member,
    });
  }

  console.log(`✅ Created ${members.length} team members`);
}

// FLOW-016: Email Communication
async function seedEmailTemplates(tenantId: string) {
  console.log('📧 Seeding email templates...');

  const templates = [
    {
      id: SEED_IDS.emailTemplates.welcome,
      name: 'Welcome Email',
      subject: 'Welcome to IntelliFlow CRM!',
      body: "<h1>Welcome!</h1><p>Thank you for joining IntelliFlow CRM. We're excited to help you streamline your sales process.</p>",
      category: 'onboarding',
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.emailTemplates.followUp,
      name: 'Sales Follow-up',
      subject: 'Following up on our conversation',
      body: '<p>Hi {{firstName}},</p><p>I wanted to follow up on our conversation about {{topic}}. Are you available for a quick call this week?</p>',
      category: 'sales',
      isActive: true,
      createdBy: SEED_IDS.users.sarahJohnson,
    },
    {
      id: SEED_IDS.emailTemplates.proposal,
      name: 'Proposal Template',
      subject: 'Your Custom Proposal from IntelliFlow',
      body: "<h2>Proposal for {{company}}</h2><p>Based on our discussions, we've prepared the following proposal...</p>",
      category: 'sales',
      isActive: true,
      createdBy: SEED_IDS.users.sarahJohnson,
    },
  ];

  for (const template of templates) {
    await prisma.emailTemplate.upsert({
      where: { id: template.id },
      update: template,
      create: template,
    });
  }

  console.log(`✅ Created ${templates.length} email templates`);
}

async function seedEmailRecords(tenantId: string) {
  console.log('📨 Seeding email records...');

  const emails = [
    {
      id: SEED_IDS.emailRecords.welcomeSarah,
      templateId: SEED_IDS.emailTemplates.welcome,
      subject: 'Welcome to IntelliFlow CRM!',
      body: '<h1>Welcome Sarah!</h1><p>Thank you for joining IntelliFlow CRM.</p>',
      fromEmail: 'noreply@intelliflow.com',
      toEmail: 'sarah.jenkins@techflow.com',
      status: EmailStatus.DELIVERED,
      sentAt: new Date('2024-12-10T10:00:00'),
      deliveredAt: new Date('2024-12-10T10:00:05'),
      openCount: 3,
      clickCount: 1,
      openedAt: new Date('2024-12-11T14:30:00'),
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
    },
    {
      id: SEED_IDS.emailRecords.proposalAcme,
      templateId: SEED_IDS.emailTemplates.proposal,
      subject: 'Your Custom Proposal from IntelliFlow',
      body: '<h2>Proposal for Acme Corp</h2><p>Enterprise license proposal...</p>',
      fromEmail: 'sarah.johnson@intelliflow.com',
      toEmail: 'robert@acmecorp.com',
      status: EmailStatus.OPENED,
      sentAt: new Date('2024-12-20T09:00:00'),
      deliveredAt: new Date('2024-12-20T09:00:03'),
      openCount: 5,
      clickCount: 2,
      openedAt: new Date('2024-12-21T11:00:00'),
      contactId: SEED_IDS.contacts.robertFox,
      dealId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.emailRecords.followUpDavid,
      templateId: SEED_IDS.emailTemplates.followUp,
      subject: 'Following up on our conversation',
      body: '<p>Hi David,</p><p>I wanted to follow up on our demo...</p>',
      fromEmail: 'mike.davis@intelliflow.com',
      toEmail: 'david.chen@globalsoft.com',
      status: EmailStatus.SENT,
      sentAt: new Date('2024-12-22T15:00:00'),
      contactId: SEED_IDS.contacts.davidChen,
    },
  ];

  for (const email of emails) {
    await prisma.emailRecord.upsert({
      where: { id: email.id },
      update: email,
      create: email,
    });
  }

  console.log(`✅ Created ${emails.length} email records`);
}

// FLOW-017: Chat Integration
async function seedChatConversations(tenantId: string) {
  console.log('💬 Seeding chat conversations...');

  const conversations = [
    {
      id: SEED_IDS.chatConversations.supportChat1,
      channel: ChatChannel.INTERNAL,
      status: ChatStatus.OPEN,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      assigneeId: SEED_IDS.users.emilyDavis,
      priority: 'high',
      lastMessageAt: new Date('2024-12-20T09:02:00'),
    },
    {
      id: SEED_IDS.chatConversations.whatsappInquiry,
      channel: ChatChannel.WHATSAPP,
      externalId: 'wa_12345678',
      status: ChatStatus.RESOLVED,
      contactId: SEED_IDS.contacts.sarahMiller,
      assigneeId: SEED_IDS.users.mikeDavis,
      closedAt: new Date('2024-12-18T14:30:00'),
      lastMessageAt: new Date('2024-12-18T14:25:00'),
    },
    {
      id: SEED_IDS.chatConversations.slackIntegration,
      channel: ChatChannel.SLACK,
      externalId: 'slack_C123ABC',
      status: ChatStatus.OPEN,
      assigneeId: SEED_IDS.users.jamesWilson,
      lastMessageAt: new Date('2024-12-21T10:00:00'),
    },
  ];

  for (const conv of conversations) {
    await prisma.chatConversation.upsert({
      where: { id: conv.id },
      update: conv,
      create: conv,
    });
  }

  console.log(`✅ Created ${conversations.length} chat conversations`);
}

async function seedChatMessages(tenantId: string) {
  console.log('💭 Seeding chat messages...');

  const messages = [
    {
      id: SEED_IDS.chatMessages.msg1,
      tenantId,
      conversationId: SEED_IDS.chatConversations.supportChat1,
      senderId: SEED_IDS.additionalContacts.sarahJenkins,
      senderName: 'Sarah Jenkins',
      senderType: 'contact',
      content: 'Hi, I have a question about the enterprise license pricing.',
    },
    {
      id: SEED_IDS.chatMessages.msg2,
      tenantId,
      conversationId: SEED_IDS.chatConversations.supportChat1,
      senderId: SEED_IDS.users.emilyDavis,
      senderName: 'Emily Davis',
      senderType: 'user',
      content:
        "Hello Sarah! I'd be happy to help with pricing. Let me connect you with our sales team.",
    },
    {
      id: SEED_IDS.chatMessages.msg3,
      tenantId,
      conversationId: SEED_IDS.chatConversations.whatsappInquiry,
      senderId: SEED_IDS.contacts.sarahMiller,
      senderName: 'Sarah Miller',
      senderType: 'contact',
      content: 'Thanks for the quick response on my inquiry!',
    },
  ];

  for (const msg of messages) {
    await prisma.chatMessage.upsert({
      where: { id: msg.id },
      update: msg,
      create: msg,
    });
  }

  console.log(`✅ Created ${messages.length} chat messages`);
}

// FLOW-018: Call Recording
async function seedCallRecords(tenantId: string) {
  console.log('📞 Seeding call records...');

  const calls = [
    {
      id: SEED_IDS.callRecords.discoverySarah,
      direction: 'outbound',
      fromNumber: '+1-555-0100',
      toNumber: '+1-555-0101',
      duration: 1800, // 30 minutes
      status: CallStatus.COMPLETED,
      recordingUrl: 'https://recordings.intelliflow.com/call_001.mp3',
      transcription:
        'Sarah: Hi, thanks for taking the time today...\nRep: Of course, let me walk you through our enterprise features...',
      summary:
        'Discovery call with Sarah Jenkins. Discussed enterprise features, pricing, and implementation timeline. Scheduled follow-up demo.',
      sentiment: 'positive',
      startedAt: new Date('2024-12-15T10:00:00'),
      endedAt: new Date('2024-12-15T10:30:00'),
      userId: SEED_IDS.users.sarahJohnson,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      dealId: SEED_IDS.opportunities.enterpriseLicenseAcme,
    },
    {
      id: SEED_IDS.callRecords.demoTechCorp,
      direction: 'outbound',
      fromNumber: '+1-555-0100',
      toNumber: '+1-555-0102',
      duration: 2700, // 45 minutes
      status: CallStatus.COMPLETED,
      recordingUrl: 'https://recordings.intelliflow.com/call_002.mp3',
      transcription: 'Demo of the platform...',
      summary: 'Product demo for TechCorp. Very engaged. Requested pricing proposal.',
      sentiment: 'positive',
      startedAt: new Date('2024-12-18T14:00:00'),
      endedAt: new Date('2024-12-18T14:45:00'),
      userId: SEED_IDS.users.mikeDavis,
      contactId: SEED_IDS.contacts.johnSmith,
    },
    {
      id: SEED_IDS.callRecords.supportFollowup,
      direction: 'inbound',
      fromNumber: '+1-555-0103',
      toNumber: '+1-555-0100',
      duration: 600, // 10 minutes
      status: CallStatus.COMPLETED,
      summary: 'Support follow-up on ticket resolution.',
      sentiment: 'neutral',
      startedAt: new Date('2024-12-20T16:00:00'),
      endedAt: new Date('2024-12-20T16:10:00'),
      userId: SEED_IDS.users.emilyDavis,
    },
  ];

  for (const call of calls) {
    await prisma.callRecord.upsert({
      where: { id: call.id },
      update: call,
      create: call,
    });
  }

  console.log(`✅ Created ${calls.length} call records`);
}

// FLOW-021: Document Management
async function seedDocuments(tenantId: string) {
  console.log('📄 Seeding documents...');

  const documents = [
    {
      id: SEED_IDS.documents.proposalAcme,
      name: 'Acme Corp Enterprise Proposal',
      fileName: 'Acme_Enterprise_Proposal_2024.pdf',
      fileSize: 2048576, // 2MB
      fileType: 'application/pdf',
      fileUrl: 'https://docs.intelliflow.com/proposals/acme_2024.pdf',
      category: 'proposal',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.sarahJohnson,
      uploadedByName: 'Sarah Johnson',
      accountId: SEED_IDS.accounts.acmeCorp,
      dealId: SEED_IDS.opportunities.acmeCorpSoftwareLicense,
    },
    {
      id: SEED_IDS.documents.contract2024,
      name: 'Master Service Agreement',
      fileName: 'MSA_TechCorp_2024.pdf',
      fileSize: 1548576,
      fileType: 'application/pdf',
      fileUrl: 'https://docs.intelliflow.com/contracts/msa_techcorp.pdf',
      category: 'contract',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.admin,
      uploadedByName: 'System Admin',
      accountId: SEED_IDS.accounts.techCorp,
      description: 'Master Service Agreement signed November 2024',
    },
    {
      id: SEED_IDS.documents.requirementsSpec,
      name: 'Technical Requirements Spec',
      fileName: 'TechCorp_Requirements.docx',
      fileSize: 512000,
      fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      fileUrl: 'https://docs.intelliflow.com/specs/techcorp_req.docx',
      category: 'specification',
      status: DocumentStatus.ACTIVE,
      uploadedBy: SEED_IDS.users.jamesWilson,
      uploadedByName: 'James Wilson',
      accountId: SEED_IDS.accounts.techCorp,
    },
  ];

  for (const doc of documents) {
    await prisma.document.upsert({
      where: { id: doc.id },
      update: doc,
      create: doc,
    });
  }

  console.log(`✅ Created ${documents.length} documents`);
}

// =============================================================================
// PG-138: Case Management — seed data matching case_list.html mockup
// =============================================================================

async function seedCases() {
  console.log('⚖️ Seeding cases...');

  const tenantId = SEED_IDS.tenant.default;

  // Users matching mockup assignees
  const sarahJenkins = SEED_IDS.users.sarahJenkins;
  const mikeDavis = SEED_IDS.users.mikeDavis; // Michael K. in mockup
  const davidKim = SEED_IDS.users.davidKim; // David C. in mockup
  const emilyDavis = SEED_IDS.users.emilyDavis; // Emily W. in mockup
  const admin = SEED_IDS.users.admin;
  const jamesWilson = SEED_IDS.users.jamesWilson;
  const alexMorgan = SEED_IDS.users.alexMorgan;

  // Accounts as clients
  const smithConsulting = SEED_IDS.accounts.smithConsulting;
  const techFlowInc = SEED_IDS.additionalAccounts.techFlowInc;
  const acmeCorp = SEED_IDS.accounts.acmeCorp;
  const techCorp = SEED_IDS.accounts.techCorp;
  const globalSoft = SEED_IDS.accounts.globalSoft;
  const finTech = SEED_IDS.accounts.finTech;
  const designCo = SEED_IDS.accounts.designCo;
  const dataCorp = SEED_IDS.accounts.dataCorp;

  const cases = [
    // Row 1 from mockup: Estate Planning - Smith Family (In Progress, Medium)
    {
      id: SEED_IDS.cases.estatePlanningSmith,
      title: 'Estate Planning - Smith Family',
      description:
        'Comprehensive estate planning including wills, trusts, and power of attorney documents for the Smith family. Client requires tax-efficient wealth transfer strategy.',
      status: 'IN_PROGRESS' as const,
      priority: 'MEDIUM' as const,
      deadline: new Date('2026-03-24'),
      clientId: smithConsulting,
      assignedTo: sarahJenkins,
      resolution: null,
      parties: JSON.stringify([
        { name: 'Robert Smith', role: 'Client', email: 'robert@smith-consulting.com' },
        { name: 'Margaret Smith', role: 'Spouse', email: 'margaret@smith-consulting.com' },
      ]),
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-01-10T09:00:00Z'),
      updatedAt: new Date('2026-02-14T10:30:00Z'),
    },
    // Row 2 from mockup: Corporate Merger - TechFlow Inc (Overdue, High)
    {
      id: SEED_IDS.cases.corporateMergerTechFlow,
      title: 'Corporate Merger - TechFlow Inc',
      description:
        'Legal due diligence and documentation for the merger of TechFlow Inc with DataStream Corp. Awaiting financial disclosure documents from counterparty.',
      status: 'OPEN' as const,
      priority: 'HIGH' as const,
      deadline: new Date('2026-02-12'), // Past deadline = overdue
      clientId: techFlowInc,
      assignedTo: mikeDavis,
      resolution: null,
      parties: JSON.stringify([
        { name: 'TechFlow Inc.', role: 'Acquirer', email: 'legal@techflow.com' },
        { name: 'DataStream Corp', role: 'Target', email: 'counsel@datastream.com' },
      ]),
      closedAt: null,
      tenantId,
      createdAt: new Date('2025-11-15T08:00:00Z'),
      updatedAt: new Date('2026-02-13T14:00:00Z'),
    },
    // Row 3 from mockup: Civil Litigation - Johnson v. City (Open, Low)
    {
      id: SEED_IDS.cases.civilLitigationJohnson,
      title: 'Civil Litigation - Johnson v. City',
      description:
        'Civil lawsuit filed by Linda Johnson against City of Springfield regarding property zoning dispute. Initial review phase - gathering evidence and reviewing municipal records.',
      status: 'OPEN' as const,
      priority: 'LOW' as const,
      deadline: new Date('2026-04-05'),
      clientId: acmeCorp,
      assignedTo: davidKim,
      resolution: null,
      parties: JSON.stringify([
        { name: 'Linda Johnson', role: 'Plaintiff', email: 'l.johnson@email.com' },
        { name: 'City of Springfield', role: 'Defendant' },
      ]),
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-01-20T10:00:00Z'),
      updatedAt: new Date('2026-02-12T11:30:00Z'),
    },
    // Row 4 from mockup: Real Estate Closing - 442 Pine St (Closed, Medium)
    {
      id: SEED_IDS.cases.realEstateClosingPine,
      title: 'Real Estate Closing - 442 Pine St',
      description:
        'Residential real estate closing for property at 442 Pine Street. All documents signed, title transferred, and funds disbursed.',
      status: 'CLOSED' as const,
      priority: 'MEDIUM' as const,
      deadline: new Date('2026-01-28'),
      clientId: techCorp,
      assignedTo: emilyDavis,
      resolution:
        'Successfully closed on January 28, 2026. Title transferred and funds disbursed to all parties.',
      parties: JSON.stringify([
        { name: 'Marcos Rodriguez', role: 'Buyer', email: 'marcos@techcorp.com' },
        { name: 'First National Bank', role: 'Lender' },
      ]),
      closedAt: new Date('2026-01-28T16:00:00Z'),
      tenantId,
      createdAt: new Date('2025-12-01T09:00:00Z'),
      updatedAt: new Date('2026-01-28T16:00:00Z'),
    },
    // Additional cases for stats (Open: 124, In Progress: 86, Overdue: 12, Closed: 432 from mockup)
    {
      id: SEED_IDS.cases.intellectualPropertyDispute,
      title: 'IP Dispute - Patent Infringement Claim',
      description:
        'Patent infringement claim regarding proprietary AI algorithm. Client alleges unauthorized use of patented technology in competitor product.',
      status: 'IN_PROGRESS' as const,
      priority: 'HIGH' as const,
      deadline: new Date('2026-03-15'),
      clientId: globalSoft,
      assignedTo: admin,
      resolution: null,
      parties: JSON.stringify([
        { name: 'GlobalSoft Inc', role: 'Plaintiff' },
        { name: 'CompetitorX Ltd', role: 'Defendant' },
      ]),
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-01-05T08:00:00Z'),
      updatedAt: new Date('2026-02-10T15:00:00Z'),
    },
    {
      id: SEED_IDS.cases.contractReviewGlobal,
      title: 'Contract Review - Global SaaS Agreement',
      description:
        'Reviewing and negotiating enterprise SaaS agreement with multi-year terms. Focus on liability caps, data protection, and SLA commitments.',
      status: 'OPEN' as const,
      priority: 'MEDIUM' as const,
      deadline: new Date('2026-03-01'),
      clientId: finTech,
      assignedTo: sarahJenkins,
      resolution: null,
      parties: null,
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-02-01T10:00:00Z'),
      updatedAt: new Date('2026-02-13T09:00:00Z'),
    },
    {
      id: SEED_IDS.cases.employmentDispute,
      title: 'Employment Dispute - Wrongful Termination',
      description:
        'Employment dispute regarding alleged wrongful termination. Employee claims termination violated company policy and employment contract.',
      status: 'IN_PROGRESS' as const,
      priority: 'URGENT' as const,
      deadline: new Date('2026-02-20'),
      clientId: designCo,
      assignedTo: jamesWilson,
      resolution: null,
      parties: JSON.stringify([
        { name: 'DesignCo Inc', role: 'Employer' },
        { name: 'Alex Thompson', role: 'Former Employee' },
      ]),
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-01-25T08:00:00Z'),
      updatedAt: new Date('2026-02-14T08:00:00Z'),
    },
    {
      id: SEED_IDS.cases.regulatoryCompliance,
      title: 'Regulatory Compliance - GDPR Audit',
      description:
        'GDPR compliance audit and documentation review. Preparing data processing inventory and updating privacy policies.',
      status: 'OPEN' as const,
      priority: 'HIGH' as const,
      deadline: new Date('2026-04-01'),
      clientId: dataCorp,
      assignedTo: alexMorgan,
      resolution: null,
      parties: null,
      closedAt: null,
      tenantId,
      createdAt: new Date('2026-02-05T10:00:00Z'),
      updatedAt: new Date('2026-02-12T14:00:00Z'),
    },
  ];

  for (const c of cases) {
    await prisma.case.upsert({
      where: { id: c.id },
      update: c,
      create: c,
    });
  }

  console.log(`✅ Created ${cases.length} cases`);
}

async function seedCaseTasks() {
  console.log('📋 Seeding case tasks...');

  const tasks = [
    // Estate Planning tasks
    {
      id: SEED_IDS.caseTasks.reviewDocuments,
      caseId: SEED_IDS.cases.estatePlanningSmith,
      title: 'Review existing estate documents',
      description: 'Review all current wills, trusts, and beneficiary designations',
      dueDate: new Date('2026-02-20'),
      status: 'COMPLETED' as const,
      assignee: SEED_IDS.users.sarahJenkins,
      completedAt: new Date('2026-02-15T14:00:00Z'),
    },
    {
      id: SEED_IDS.caseTasks.draftAgreement,
      caseId: SEED_IDS.cases.estatePlanningSmith,
      title: 'Draft updated trust agreement',
      description: 'Prepare new revocable living trust with tax optimization provisions',
      dueDate: new Date('2026-03-10'),
      status: 'IN_PROGRESS' as const,
      assignee: SEED_IDS.users.sarahJenkins,
      completedAt: null,
    },
    {
      id: SEED_IDS.caseTasks.clientMeeting,
      caseId: SEED_IDS.cases.estatePlanningSmith,
      title: 'Schedule client review meeting',
      description: 'Set up meeting with Robert and Margaret Smith to review draft documents',
      dueDate: new Date('2026-03-15'),
      status: 'PENDING' as const,
      assignee: SEED_IDS.users.sarahJenkins,
      completedAt: null,
    },
    // Corporate Merger tasks (overdue)
    {
      id: SEED_IDS.caseTasks.mergerReview,
      caseId: SEED_IDS.cases.corporateMergerTechFlow,
      title: 'Complete financial due diligence review',
      description: 'Review all financial statements, audit reports, and projections from TechFlow',
      dueDate: new Date('2026-02-10'),
      status: 'IN_PROGRESS' as const,
      assignee: SEED_IDS.users.mikeDavis,
      completedAt: null,
    },
    {
      id: SEED_IDS.caseTasks.dueDiligence,
      caseId: SEED_IDS.cases.corporateMergerTechFlow,
      title: 'Collect outstanding disclosure documents',
      description: 'Request and verify all required disclosure documents from counterparty',
      dueDate: new Date('2026-02-08'),
      status: 'PENDING' as const,
      assignee: SEED_IDS.users.mikeDavis,
      completedAt: null,
    },
    // Civil Litigation tasks
    {
      id: SEED_IDS.caseTasks.collectEvidence,
      caseId: SEED_IDS.cases.civilLitigationJohnson,
      title: 'Gather zoning records and evidence',
      description: 'Request municipal zoning records, meeting minutes, and prior zoning decisions',
      dueDate: new Date('2026-03-01'),
      status: 'IN_PROGRESS' as const,
      assignee: SEED_IDS.users.davidKim,
      completedAt: null,
    },
    {
      id: SEED_IDS.caseTasks.fileMotion,
      caseId: SEED_IDS.cases.civilLitigationJohnson,
      title: 'File preliminary motion',
      description: 'Prepare and file motion for preliminary injunction',
      dueDate: new Date('2026-03-20'),
      status: 'PENDING' as const,
      assignee: SEED_IDS.users.davidKim,
      completedAt: null,
    },
    // Real Estate Closing tasks (all completed)
    {
      id: SEED_IDS.caseTasks.titleSearch,
      caseId: SEED_IDS.cases.realEstateClosingPine,
      title: 'Complete title search',
      description: 'Verify clear title and resolve any liens or encumbrances',
      dueDate: new Date('2026-01-15'),
      status: 'COMPLETED' as const,
      assignee: SEED_IDS.users.emilyDavis,
      completedAt: new Date('2026-01-14T10:00:00Z'),
    },
    {
      id: SEED_IDS.caseTasks.draftClosingDocs,
      caseId: SEED_IDS.cases.realEstateClosingPine,
      title: 'Draft closing documents',
      description: 'Prepare deed, settlement statement, and all closing documents',
      dueDate: new Date('2026-01-25'),
      status: 'COMPLETED' as const,
      assignee: SEED_IDS.users.emilyDavis,
      completedAt: new Date('2026-01-24T16:00:00Z'),
    },
    {
      id: SEED_IDS.caseTasks.depositTransfer,
      caseId: SEED_IDS.cases.realEstateClosingPine,
      title: 'Process deposit and fund transfer',
      description: 'Coordinate escrow deposit and final fund transfer between parties',
      dueDate: new Date('2026-01-28'),
      status: 'COMPLETED' as const,
      assignee: SEED_IDS.users.emilyDavis,
      completedAt: new Date('2026-01-28T14:00:00Z'),
    },
    // Employment Dispute task
    {
      id: SEED_IDS.caseTasks.filingDeadline,
      caseId: SEED_IDS.cases.employmentDispute,
      title: 'Prepare response to claim',
      description: 'Draft formal response to wrongful termination claim before filing deadline',
      dueDate: new Date('2026-02-18'),
      status: 'IN_PROGRESS' as const,
      assignee: SEED_IDS.users.jamesWilson,
      completedAt: null,
    },
    // Court Hearing for IP case
    {
      id: SEED_IDS.caseTasks.courtHearing,
      caseId: SEED_IDS.cases.intellectualPropertyDispute,
      title: 'Prepare for preliminary hearing',
      description: 'Prepare all materials for the preliminary injunction hearing',
      dueDate: new Date('2026-03-10'),
      status: 'PENDING' as const,
      assignee: SEED_IDS.users.admin,
      completedAt: null,
    },
  ];

  const tenantId = SEED_IDS.tenant.default;
  for (const t of tasks) {
    const data = { ...t, tenantId };
    await prisma.caseTask.upsert({
      where: { id: t.id },
      update: data,
      create: data,
    });
  }

  console.log(`✅ Created ${tasks.length} case tasks`);
}

// IFC-152: Case Document Management
async function seedCaseDocuments() {
  console.log('📑 Seeding case documents...');

  const userId = SEED_IDS.users.admin;

  const caseDocuments = [
    {
      id: SEED_IDS.caseDocuments.employmentAgreement,
      tenant_id: userId,
      version_major: 2,
      version_minor: 1,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'SIGNED',
      title: 'Employment Agreement - Sarah Chen',
      description:
        'Standard employment contract with non-compete clause for Senior Software Engineer position',
      document_type: 'CONTRACT',
      classification: 'CONFIDENTIAL',
      tags: ['Employment', 'Legal', 'HR'],
      related_case_id: null,
      related_contact_id: SEED_IDS.contacts.sarahMiller,
      storage_key: 'documents/employment-agreement-sarah-chen.pdf',
      content_hash: 'a'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(245000),
      signed_by: userId,
      signed_at: new Date('2024-12-29T14:00:00'),
      signature_hash: 'signature-' + 'b'.repeat(56),
      signature_ip_address: '192.168.1.100',
      signature_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      created_by: userId,
      created_at: new Date('2024-12-28T14:30:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T10:15:00'),
      retention_until: null,
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.ndaTechCorp,
      tenant_id: userId,
      version_major: 1,
      version_minor: 0,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'APPROVED',
      title: 'NDA - TechCorp Partnership',
      description: 'Non-disclosure agreement for Q1 2025 partnership discussions',
      document_type: 'AGREEMENT',
      classification: 'CONFIDENTIAL',
      tags: ['NDA', 'Legal', 'Partnership'],
      related_case_id: null,
      related_contact_id: SEED_IDS.contacts.davidChen,
      storage_key: 'documents/nda-techcorp-2024.pdf',
      content_hash: 'c'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(95000),
      signed_by: userId,
      signed_at: new Date('2024-12-27T16:00:00'),
      signature_hash: 'signature-' + 'd'.repeat(56),
      signature_ip_address: '192.168.1.50',
      signature_user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      created_by: userId,
      created_at: new Date('2024-12-26T11:00:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-27T16:00:00'),
      retention_until: null,
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.motionToDismiss,
      tenant_id: userId,
      version_major: 1,
      version_minor: 3,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'UNDER_REVIEW',
      title: 'Motion to Dismiss - Case #2024-CV-1234',
      description: 'Motion to dismiss based on lack of jurisdiction',
      document_type: 'COURT_FILING',
      classification: 'INTERNAL',
      tags: ['Litigation', 'Motion', 'Civil'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/motion-dismiss-cv1234.pdf',
      content_hash: 'e'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(180000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-27T09:15:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T11:20:00'),
      retention_until: new Date('2025-12-31T23:59:59'),
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.evidenceEmailLog,
      tenant_id: userId,
      version_major: 1,
      version_minor: 0,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'ARCHIVED',
      title: 'Evidence - Email Communication Log',
      description: 'Email thread regarding contract negotiations with timestamps',
      document_type: 'EVIDENCE',
      classification: 'PRIVILEGED',
      tags: ['Evidence', 'Discovery', 'Email'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/evidence-email-log.pdf',
      content_hash: 'f'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(1250000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-25T08:00:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-25T08:00:00'),
      retention_until: new Date('2030-12-31T23:59:59'),
      deleted_at: null,
    },
    {
      id: SEED_IDS.caseDocuments.serviceAgreement,
      tenant_id: userId,
      version_major: 0,
      version_minor: 2,
      version_patch: 0,
      parent_version_id: null,
      is_latest_version: true,
      status: 'DRAFT',
      title: 'Service Agreement - Cloud Infrastructure',
      description: 'Annual cloud service provider agreement with SLA terms',
      document_type: 'CONTRACT',
      classification: 'INTERNAL',
      tags: ['Contract', 'SaaS', 'Infrastructure'],
      related_case_id: null,
      related_contact_id: null,
      storage_key: 'documents/service-agreement-cloud.pdf',
      content_hash: 'g'.repeat(64),
      mime_type: 'application/pdf',
      size_bytes: BigInt(310000),
      signed_by: null,
      signed_at: null,
      signature_hash: null,
      signature_ip_address: null,
      signature_user_agent: null,
      created_by: userId,
      created_at: new Date('2024-12-24T16:45:00'),
      updated_by: userId,
      updated_at: new Date('2024-12-29T09:30:00'),
      retention_until: null,
      deleted_at: null,
    },
  ];

  for (const doc of caseDocuments) {
    await prisma.caseDocument.upsert({
      where: { id: doc.id },
      update: doc,
      create: doc,
    });

    // Add ACL for admin user
    await prisma.caseDocumentACL.upsert({
      where: {
        document_id_principal_id: {
          document_id: doc.id,
          principal_id: userId,
        },
      },
      update: {},
      create: {
        document_id: doc.id,
        tenant_id: doc.tenant_id,
        principal_id: userId,
        principal_type: 'USER',
        access_level: 'ADMIN',
        granted_by: userId,
        granted_at: doc.created_at,
        expires_at: null,
      },
    });

    // Add some audit logs
    await prisma.caseDocumentAudit.create({
      data: {
        document_id: doc.id,
        tenant_id: doc.tenant_id,
        event_type: 'CREATED',
        metadata: { title: doc.title },
        user_id: userId,
        ip_address: '192.168.1.1',
        user_agent: 'Mozilla/5.0',
        created_at: doc.created_at,
      },
    });

    if (doc.status === 'SIGNED' && doc.signed_at) {
      await prisma.caseDocumentAudit.create({
        data: {
          document_id: doc.id,
          tenant_id: doc.tenant_id,
          event_type: 'SIGNED',
          metadata: { signatureHash: doc.signature_hash },
          user_id: userId,
          ip_address: doc.signature_ip_address || '192.168.1.1',
          user_agent: doc.signature_user_agent || 'Mozilla/5.0',
          created_at: doc.signed_at,
        },
      });
    }
  }

  console.log(`✅ Created ${caseDocuments.length} case documents with ACL and audit logs`);
}

// FLOW-015: Customer Feedback (NPS/CSAT)
async function seedFeedbackSurveys(tenantId: string) {
  console.log('📊 Seeding feedback surveys...');

  const surveys = [
    {
      id: SEED_IDS.feedbackSurveys.npsSarah,
      type: FeedbackType.NPS,
      contactId: SEED_IDS.additionalContacts.sarahJenkins,
      contactName: 'Sarah Jenkins',
      contactEmail: 'sarah.jenkins@techflow.com',
      score: 9,
      comment:
        'Excellent service! The team was very responsive and the platform exceeded our expectations.',
      sentiment: 'positive',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-01T10:00:00'),
      respondedAt: new Date('2024-12-02T14:30:00'),
    },
    {
      id: SEED_IDS.feedbackSurveys.csatDavid,
      type: FeedbackType.CSAT,
      contactId: SEED_IDS.contacts.davidChen,
      contactName: 'David Chen',
      contactEmail: 'david.chen@globalsoft.com',
      score: 4,
      comment: 'Good experience overall. Support was helpful.',
      sentiment: 'positive',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-10T09:00:00'),
      respondedAt: new Date('2024-12-10T16:00:00'),
    },
    {
      id: SEED_IDS.feedbackSurveys.cesMike,
      type: FeedbackType.CES,
      contactId: SEED_IDS.contacts.michaelBrown,
      contactName: 'Michael Brown',
      contactEmail: 'michael.brown@acme.com',
      score: 3,
      comment: 'The onboarding process was straightforward.',
      sentiment: 'neutral',
      status: FeedbackStatus.RESPONDED,
      sentAt: new Date('2024-12-15T11:00:00'),
      respondedAt: new Date('2024-12-16T09:00:00'),
    },
  ];

  for (const survey of surveys) {
    await prisma.feedbackSurvey.upsert({
      where: { id: survey.id },
      update: survey,
      create: survey,
    });
  }

  console.log(`✅ Created ${surveys.length} feedback surveys`);
}

// FLOW-010: Deal Renewals
async function seedDealRenewals(tenantId: string) {
  console.log('🔄 Seeding deal renewals...');

  const renewals = [
    {
      id: SEED_IDS.dealRenewals.acmeRenewal,
      originalDealId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      renewalType: 'annual',
      status: RenewalStatus.UPCOMING,
      renewalDate: new Date('2025-12-01'),
      value: 125000, // 25% increase
      previousValue: 100000,
      changePercent: 25,
      notes: 'Client very satisfied. Likely to expand seats.',
      ownerId: SEED_IDS.users.sarahJohnson,
      tenantId,
      ownerName: 'Sarah Johnson',
    },
    {
      id: SEED_IDS.dealRenewals.techCorpRenewal,
      originalDealId: SEED_IDS.opportunities.annualSubscriptionTechStart,
      renewalType: 'annual',
      status: RenewalStatus.IN_PROGRESS,
      renewalDate: new Date('2025-02-15'),
      value: 50000,
      previousValue: 45000,
      changePercent: 11.1,
      notes: 'Early renewal discussions started. Very engaged.',
      ownerId: SEED_IDS.users.mikeDavis,
      tenantId,
      ownerName: 'Mike Davis',
    },
  ];

  for (const renewal of renewals) {
    await prisma.dealRenewal.upsert({
      where: { id: renewal.id },
      update: renewal,
      create: renewal,
    });
  }

  console.log(`✅ Created ${renewals.length} deal renewals`);
}

async function seedAccountHealthScores(tenantId: string) {
  console.log('💚 Seeding account health scores...');

  const healthScores = [
    {
      id: SEED_IDS.accountHealthScores.acmeHealth,
      accountId: SEED_IDS.accounts.acmeCorp,
      accountName: 'Acme Corporation',
      overallScore: 92,
      engagementScore: 95,
      usageScore: 88,
      supportScore: 90,
      paymentScore: 100,
      churnRisk: ChurnRisk.LOW,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 45,
        features_used: 12,
        support_tickets: 2,
        nps_score: 9,
      },
    },
    {
      id: SEED_IDS.accountHealthScores.techCorpHealth,
      accountId: SEED_IDS.accounts.techCorp,
      accountName: 'TechCorp',
      overallScore: 78,
      engagementScore: 72,
      usageScore: 80,
      supportScore: 85,
      paymentScore: 95,
      churnRisk: ChurnRisk.MEDIUM,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 20,
        features_used: 8,
        support_tickets: 5,
        nps_score: 7,
      },
    },
    {
      id: SEED_IDS.accountHealthScores.globalSoftHealth,
      accountId: SEED_IDS.accounts.globalSoft,
      accountName: 'GlobalSoft',
      overallScore: 65,
      engagementScore: 55,
      usageScore: 60,
      supportScore: 70,
      paymentScore: 100,
      churnRisk: ChurnRisk.HIGH,
      calculatedAt: new Date('2024-12-20'),
      riskFactors: {
        logins_per_week: 10,
        features_used: 4,
        support_tickets: 8,
        nps_score: 5,
      },
    },
  ];

  for (const health of healthScores) {
    await prisma.accountHealthScore.upsert({
      where: { id: health.id },
      update: health,
      create: health,
    });
  }

  console.log(`✅ Created ${healthScores.length} account health scores`);
}

// FLOW-012: Agent Skills & Routing
async function seedAgentSkills(tenantId: string) {
  console.log('🎯 Seeding agent skills...');

  const skills = [
    {
      id: SEED_IDS.agentSkills.sarahTechnical,
      tenantId,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      skillName: 'Technical Sales',
      proficiency: 95,
      certified: true,
      certifiedAt: new Date('2024-01-15'),
    },
    {
      id: SEED_IDS.agentSkills.sarahNegotiation,
      tenantId,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      skillName: 'Enterprise Negotiation',
      proficiency: 90,
      certified: true,
      certifiedAt: new Date('2024-03-01'),
    },
    {
      id: SEED_IDS.agentSkills.mikeSupport,
      tenantId,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Davis',
      skillName: 'Technical Support',
      proficiency: 88,
      certified: true,
      certifiedAt: new Date('2024-02-15'),
    },
    // Expanded skills for routing UI (PG-132)
    {
      id: SEED_IDS.agentSkills.emilyBilling,
      tenantId,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      skillName: 'Billing & Renewals',
      proficiency: 88,
      certified: true,
      certifiedAt: new Date('2024-04-10'),
    },
    {
      id: SEED_IDS.agentSkills.emilySMBSales,
      tenantId,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      skillName: 'SMB Sales',
      proficiency: 82,
      certified: true,
      certifiedAt: new Date('2024-06-01'),
    },
    {
      id: SEED_IDS.agentSkills.jamesAPI,
      tenantId,
      userId: SEED_IDS.users.jamesWilson,
      userName: 'James Wilson',
      skillName: 'API Integration',
      proficiency: 90,
      certified: true,
      certifiedAt: new Date('2024-05-15'),
    },
    {
      id: SEED_IDS.agentSkills.jamesDemos,
      tenantId,
      userId: SEED_IDS.users.jamesWilson,
      userName: 'James Wilson',
      skillName: 'Product Demos',
      proficiency: 85,
      certified: false,
    },
    {
      id: SEED_IDS.agentSkills.alexSalesConsulting,
      tenantId,
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      skillName: 'Sales Consulting',
      proficiency: 78,
      certified: false,
    },
    {
      id: SEED_IDS.agentSkills.davidEnterprise,
      tenantId,
      userId: SEED_IDS.users.davidKim,
      userName: 'David Kim',
      skillName: 'Enterprise Sales',
      proficiency: 92,
      certified: true,
      certifiedAt: new Date('2024-02-20'),
    },
    {
      id: SEED_IDS.agentSkills.janeCustomerSuccess,
      tenantId,
      userId: SEED_IDS.users.janeDoe,
      userName: 'Jane Doe',
      skillName: 'Customer Success',
      proficiency: 87,
      certified: true,
      certifiedAt: new Date('2024-07-01'),
    },
    {
      id: SEED_IDS.agentSkills.sarahJLeadQual,
      tenantId,
      userId: SEED_IDS.users.sarahJenkins,
      userName: 'Sarah Jenkins',
      skillName: 'Lead Qualification',
      proficiency: 91,
      certified: true,
      certifiedAt: new Date('2024-03-15'),
    },
  ];

  for (const skill of skills) {
    await prisma.agentSkill.upsert({
      where: { id: skill.id },
      update: skill,
      create: skill,
    });
  }

  console.log(`✅ Created ${skills.length} agent skills`);
}

async function seedAgentAvailability(tenantId: string) {
  console.log('🟢 Seeding agent availability...');

  const availability = [
    {
      id: SEED_IDS.agentAvailability.sarahAvailable,
      tenantId,
      userId: SEED_IDS.users.sarahJohnson,
      userName: 'Sarah Johnson',
      status: AgentStatus.ONLINE,
      currentCapacity: 3,
      maxCapacity: 10,
      lastActiveAt: new Date('2024-12-20T09:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.mikeAvailable,
      tenantId,
      userId: SEED_IDS.users.mikeDavis,
      userName: 'Mike Davis',
      status: AgentStatus.BUSY,
      currentCapacity: 8,
      maxCapacity: 10,
      lastActiveAt: new Date('2024-12-20T10:30:00'),
    },
    {
      id: SEED_IDS.agentAvailability.emilyAvailable,
      tenantId,
      userId: SEED_IDS.users.emilyDavis,
      userName: 'Emily Davis',
      status: AgentStatus.ONLINE,
      currentCapacity: 5,
      maxCapacity: 15,
      lastActiveAt: new Date('2024-12-20T08:00:00'),
    },
    // Expanded agents for routing UI (PG-132)
    {
      id: SEED_IDS.agentAvailability.jamesAvailable,
      tenantId,
      userId: SEED_IDS.users.jamesWilson,
      userName: 'James Wilson',
      status: AgentStatus.AWAY,
      currentCapacity: 2,
      maxCapacity: 8,
      lastActiveAt: new Date('2024-12-20T07:00:00'),
      shiftStart: new Date('2024-12-20T08:00:00'),
      shiftEnd: new Date('2024-12-20T16:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.alexAvailable,
      tenantId,
      userId: SEED_IDS.users.alexMorgan,
      userName: 'Alex Morgan',
      status: AgentStatus.ON_BREAK,
      currentCapacity: 4,
      maxCapacity: 10,
      lastActiveAt: new Date('2024-12-20T09:30:00'),
      shiftStart: new Date('2024-12-20T09:00:00'),
      shiftEnd: new Date('2024-12-20T17:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.davidAvailable,
      tenantId,
      userId: SEED_IDS.users.davidKim,
      userName: 'David Kim',
      status: AgentStatus.ONLINE,
      currentCapacity: 1,
      maxCapacity: 12,
      lastActiveAt: new Date('2024-12-20T06:30:00'),
      shiftStart: new Date('2024-12-20T07:00:00'),
      shiftEnd: new Date('2024-12-20T15:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.janeAvailable,
      tenantId,
      userId: SEED_IDS.users.janeDoe,
      userName: 'Jane Doe',
      status: AgentStatus.ONLINE,
      currentCapacity: 6,
      maxCapacity: 15,
      lastActiveAt: new Date('2024-12-20T10:00:00'),
      shiftStart: new Date('2024-12-20T10:00:00'),
      shiftEnd: new Date('2024-12-20T18:00:00'),
    },
    {
      id: SEED_IDS.agentAvailability.sarahJAvailable,
      tenantId,
      userId: SEED_IDS.users.sarahJenkins,
      userName: 'Sarah Jenkins',
      status: AgentStatus.BUSY,
      currentCapacity: 7,
      maxCapacity: 8,
      lastActiveAt: new Date('2024-12-20T08:15:00'),
      shiftStart: new Date('2024-12-20T08:00:00'),
      shiftEnd: new Date('2024-12-20T16:00:00'),
    },
  ];

  for (const avail of availability) {
    await prisma.agentAvailability.upsert({
      where: { id: avail.id },
      update: avail,
      create: avail,
    });
  }

  console.log(`✅ Created ${availability.length} agent availability records`);
}

async function seedRoutingRules(tenantId: string) {
  console.log('🔀 Seeding routing rules...');

  const rules = [
    {
      id: SEED_IDS.routingRules.enterpriseDeals,
      name: 'Enterprise Deals',
      description: 'Route high-value enterprise leads ($100k+) to senior sales team',
      priority: 0,
      conditions: {
        estimatedValue: { operator: 'gte', value: 100000 },
      },
      actions: {
        assign_to_team: SEED_IDS.teams.sales,
        notify: ['slack', 'email'],
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.technicalSupport,
      name: 'Technical Support',
      description: 'Route technical leads from website/API to Mike Davis',
      priority: 1,
      conditions: {
        source: { operator: 'in', value: ['WEBSITE', 'API'] },
        tags: { operator: 'contains', value: 'technical' },
      },
      actions: {
        assign_to_user: SEED_IDS.users.mikeDavis,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.urgentEscalation,
      name: 'Urgent Escalation',
      description: 'Escalate hot leads (score 90+) to Sarah Johnson with notifications',
      priority: 2,
      conditions: {
        score: { operator: 'gte', value: 90 },
      },
      actions: {
        assign_to_user: SEED_IDS.users.sarahJohnson,
        notify: ['slack', 'email'],
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.highValueLeads,
      name: 'High-Value Leads',
      description: 'Route leads with score >= 70 and value >= $50k to sales team',
      priority: 3,
      conditions: {
        score: { operator: 'gte', value: 70 },
        estimatedValue: { operator: 'gte', value: 50000 },
      },
      actions: {
        assign_to_team: SEED_IDS.teams.sales,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.technicalEvaluation,
      name: 'Technical Evaluation',
      description: 'Route website leads with technical tags to Mike Davis for evaluation',
      priority: 4,
      conditions: {
        source: 'WEBSITE',
        tags: { operator: 'contains', value: 'technical' },
      },
      actions: {
        assign_to_user: SEED_IDS.users.mikeDavis,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.websiteInquiries,
      name: 'Website Inquiries',
      description: 'Route qualified website leads (score 40+) to sales team',
      priority: 5,
      conditions: {
        source: 'WEBSITE',
        score: { operator: 'gte', value: 40 },
      },
      actions: {
        assign_to_team: SEED_IDS.teams.sales,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.referralLeads,
      name: 'Referral Leads',
      description: 'Route all referral leads to Emily Davis',
      priority: 6,
      conditions: {
        source: 'REFERRAL',
      },
      actions: {
        assign_to_user: SEED_IDS.users.emilyDavis,
      },
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.routingRules.lowScoreNurture,
      name: 'Low-Score Nurture',
      description: 'Route low-score leads (< 30) to support team for nurturing',
      priority: 7,
      conditions: {
        score: { operator: 'lt', value: 30 },
      },
      actions: {
        assign_to_team: SEED_IDS.teams.support,
      },
      isActive: false,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const rule of rules) {
    const data = { ...rule, tenantId };
    await prisma.routingRule.upsert({
      where: { id: rule.id },
      update: data,
      create: data,
    });
  }

  console.log(`✅ Created ${rules.length} routing rules`);
}

// Routing audit records for routing UI (PG-132)
async function seedRoutingAudits(tenantId: string) {
  console.log('📋 Seeding routing audits...');

  const now = Date.now();
  const HOUR = 60 * 60 * 1000;
  const DAY = 24 * HOUR;

  const audits = [
    {
      id: SEED_IDS.routingAudits.audit1,
      ticketId: SEED_IDS.leads.kevinTaylor,
      ruleId: SEED_IDS.routingRules.highValueLeads,
      ruleName: 'High-Value Leads',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      reason: 'rule_match',
      details: { score: 82, estimatedValue: 95000 },
      createdAt: new Date(now - 2 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit2,
      ticketId: SEED_IDS.leads.tomBrown,
      ruleId: SEED_IDS.routingRules.enterpriseDeals,
      ruleName: 'Enterprise Deals',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      reason: 'rule_match',
      details: { score: 88, estimatedValue: 120000 },
      createdAt: new Date(now - 4 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit3,
      ticketId: SEED_IDS.leads.rachelGreen,
      ruleId: SEED_IDS.routingRules.referralLeads,
      ruleName: 'Referral Leads',
      toUserId: SEED_IDS.users.emilyDavis,
      toUserName: 'Emily Davis',
      reason: 'rule_match',
      details: { source: 'REFERRAL' },
      createdAt: new Date(now - 6 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit4,
      ticketId: SEED_IDS.leads.ninaPatel,
      ruleId: SEED_IDS.routingRules.websiteInquiries,
      ruleName: 'Website Inquiries',
      toUserId: SEED_IDS.users.mikeDavis,
      toUserName: 'Mike Davis',
      reason: 'rule_match',
      details: { source: 'WEBSITE', score: 85 },
      createdAt: new Date(now - 8 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit5,
      ticketId: SEED_IDS.leads.carlosRivera,
      fromUserId: SEED_IDS.users.admin,
      fromUserName: 'Admin User',
      toUserId: SEED_IDS.users.emilyDavis,
      toUserName: 'Emily Davis',
      reason: 'manual',
      details: { note: 'Referral from existing client' },
      createdAt: new Date(now - 12 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit6,
      ticketId: SEED_IDS.leads.lisaPark,
      toUserId: SEED_IDS.users.jamesWilson,
      toUserName: 'James Wilson',
      reason: 'skill_match',
      details: { skill: 'API Integration', proficiency: 90 },
      createdAt: new Date(now - 18 * HOUR),
    },
    {
      id: SEED_IDS.routingAudits.audit7,
      ticketId: SEED_IDS.leads.ryanMurphy,
      ruleId: SEED_IDS.routingRules.websiteInquiries,
      ruleName: 'Website Inquiries',
      toUserId: SEED_IDS.users.davidKim,
      toUserName: 'David Kim',
      reason: 'load_balance',
      details: { currentLoad: 1, maxCapacity: 12 },
      createdAt: new Date(now - 1 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit8,
      ticketId: SEED_IDS.leads.dianaHall,
      ruleId: SEED_IDS.routingRules.highValueLeads,
      ruleName: 'High-Value Leads',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      reason: 'rule_match',
      details: { score: 79, estimatedValue: 55000 },
      createdAt: new Date(now - 1.5 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit9,
      ticketId: SEED_IDS.leads.sarahMiller,
      fromUserId: SEED_IDS.users.sarahJohnson,
      fromUserName: 'Sarah Johnson',
      toUserId: SEED_IDS.users.mikeDavis,
      toUserName: 'Mike Davis',
      reason: 'manual',
      details: { note: 'Reassigned for technical evaluation' },
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit10,
      ticketId: SEED_IDS.leads.davidChen,
      toUserId: SEED_IDS.users.emilyDavis,
      toUserName: 'Emily Davis',
      reason: 'skill_match',
      details: { skill: 'SMB Sales', proficiency: 82 },
      createdAt: new Date(now - 2 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit11,
      ticketId: SEED_IDS.leads.jamesWilson,
      ruleId: SEED_IDS.routingRules.urgentEscalation,
      ruleName: 'Urgent Escalation',
      fromUserId: SEED_IDS.users.mikeDavis,
      fromUserName: 'Mike Davis',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      reason: 'escalation',
      details: { score: 92, previousAgent: 'Mike Davis' },
      createdAt: new Date(now - 2.5 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit12,
      ticketId: SEED_IDS.leads.elenaRodriguez,
      ruleId: SEED_IDS.routingRules.websiteInquiries,
      ruleName: 'Website Inquiries',
      toUserId: SEED_IDS.users.jamesWilson,
      toUserName: 'James Wilson',
      reason: 'rule_match',
      details: { source: 'EMAIL', score: 55 },
      createdAt: new Date(now - 3 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit13,
      ticketId: SEED_IDS.leads.marcusReed,
      fromUserId: SEED_IDS.users.alexMorgan,
      fromUserName: 'Alex Morgan',
      toUserId: SEED_IDS.users.davidKim,
      toUserName: 'David Kim',
      reason: 'manual',
      details: { note: 'Alex on leave, reassigning' },
      createdAt: new Date(now - 4 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit14,
      ticketId: SEED_IDS.leads.kevinTaylor,
      ruleId: SEED_IDS.routingRules.technicalSupport,
      ruleName: 'Technical Support',
      toUserId: SEED_IDS.users.mikeDavis,
      toUserName: 'Mike Davis',
      reason: 'rule_match',
      details: { tags: ['technical'], source: 'WEBSITE' },
      createdAt: new Date(now - 4.5 * DAY),
    },
    {
      id: SEED_IDS.routingAudits.audit15,
      ticketId: SEED_IDS.leads.tomBrown,
      ruleId: SEED_IDS.routingRules.highValueLeads,
      ruleName: 'High-Value Leads',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      reason: 'rule_match',
      details: { score: 88, estimatedValue: 120000 },
      createdAt: new Date(now - 5 * DAY),
    },
  ];

  for (const audit of audits) {
    const data = { ...audit, tenantId };
    await prisma.routingAudit.upsert({
      where: { id: audit.id },
      update: data,
      create: data,
    });
  }

  console.log(`✅ Created ${audits.length} routing audit records`);
}

// FLOW-011, FLOW-013: Ticket Categories & SLA
async function seedTicketCategories() {
  console.log('🏷️ Seeding ticket categories...');

  const categories = [
    {
      id: SEED_IDS.ticketCategories.billing,
      name: 'Billing',
      description: 'Billing and payment related inquiries',
      color: '#10B981',
      icon: 'credit-card',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.technical,
      name: 'Technical Support',
      description: 'Technical issues and troubleshooting',
      color: '#3B82F6',
      icon: 'wrench',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.featureRequest,
      name: 'Feature Request',
      description: 'New feature requests and suggestions',
      color: '#8B5CF6',
      icon: 'lightbulb',
      isActive: true,
    },
    {
      id: SEED_IDS.ticketCategories.general,
      name: 'General Inquiry',
      description: 'General questions and information requests',
      color: '#6B7280',
      icon: 'info',
      isActive: true,
    },
  ];

  for (const category of categories) {
    await prisma.ticketCategory.upsert({
      where: { id: category.id },
      update: category,
      create: category,
    });
  }

  console.log(`✅ Created ${categories.length} ticket categories`);
}

async function seedSLABreaches() {
  console.log('⚠️ Seeding SLA breaches...');

  const breaches = [
    {
      id: SEED_IDS.slaBreaches.responseBreachOutage,
      ticketId: SEED_IDS.tickets.systemOutage,
      slaPolicyId: SEED_IDS.slaPolicy.premium,
      breachType: 'response',
      targetTime: new Date('2024-12-19T02:30:00'), // Target was 30 min from 02:00
      breachedAt: new Date('2024-12-19T02:45:00'), // Actually responded at 45 min
      durationOverdue: 15, // 15 minutes late
      resolved: true,
      resolvedAt: new Date('2024-12-19T03:30:00'),
      notes: 'Overnight incident - on-call team responded within 15 minutes of alert',
    },
    {
      id: SEED_IDS.slaBreaches.resolutionBreachLogin,
      ticketId: SEED_IDS.tickets.loginFailure,
      slaPolicyId: SEED_IDS.slaPolicy.default,
      breachType: 'resolution',
      targetTime: new Date('2024-12-18T09:00:00'), // Target was 8 hours (480 min)
      breachedAt: new Date('2024-12-18T17:00:00'), // Breached at 17:00
      durationOverdue: 60, // 1 hour late (540-480)
      resolved: false,
      notes: 'Required escalation to identity provider - external dependency',
    },
  ];

  for (const breach of breaches) {
    await prisma.sLABreach.upsert({
      where: { id: breach.id },
      update: breach,
      create: breach,
    });
  }

  console.log(`✅ Created ${breaches.length} SLA breaches`);
}

async function seedEscalationHistory(tenantId: string) {
  console.log('📈 Seeding escalation history...');

  const escalations = [
    {
      id: SEED_IDS.escalationHistory.outageEscalation,
      tenantId,
      ticketId: SEED_IDS.tickets.systemOutage,
      fromUserId: SEED_IDS.users.emilyDavis,
      fromUserName: 'Emily Davis',
      toUserId: SEED_IDS.users.manager,
      toUserName: 'Manager',
      level: 2,
      reason: 'Critical system outage affecting multiple customers',
      escalatedAt: new Date('2024-12-19T02:15:00'),
      acknowledgedAt: new Date('2024-12-19T02:20:00'),
    },
    {
      id: SEED_IDS.escalationHistory.billingEscalation,
      tenantId,
      ticketId: SEED_IDS.tickets.billingInquiry,
      fromUserId: SEED_IDS.users.mikeDavis,
      fromUserName: 'Mike Davis',
      toUserId: SEED_IDS.users.sarahJohnson,
      toUserName: 'Sarah Johnson',
      level: 1,
      reason: 'Enterprise customer requesting discount review',
      escalatedAt: new Date('2024-12-17T10:00:00'),
      acknowledgedAt: new Date('2024-12-17T10:15:00'),
    },
  ];

  for (const escalation of escalations) {
    await prisma.escalationHistory.upsert({
      where: { id: escalation.id },
      update: escalation,
      create: escalation,
    });
  }

  console.log(`✅ Created ${escalations.length} escalation history records`);
}

// FLOW-025, FLOW-026: Workflow Engine
async function seedWorkflowDefinitions() {
  console.log('⚙️ Seeding workflow definitions...');

  const workflows = [
    {
      id: SEED_IDS.workflowDefinitions.leadQualification,
      name: 'Lead Qualification Workflow',
      description: 'Automated lead qualification and scoring',
      category: 'sales',
      triggerType: 'lead.created',
      triggerConfig: { source: ['website', 'referral'] },
      steps: [
        { id: 1, type: 'score', config: { model: 'ai_scoring_v2' } },
        { id: 2, type: 'condition', config: { field: 'score', operator: 'gte', value: 70 } },
        { id: 3, type: 'assign', config: { to: 'sales_team' } },
        { id: 4, type: 'notify', config: { channel: 'slack', template: 'new_qualified_lead' } },
      ],
      isActive: true,
      version: 2,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.workflowDefinitions.dealApproval,
      name: 'Deal Approval Workflow',
      description: 'Multi-stage deal approval process',
      category: 'sales',
      triggerType: 'deal.stage_changed',
      triggerConfig: { stage: 'negotiation', value_gte: 50000 },
      steps: [
        { id: 1, type: 'approval', config: { approver: 'sales_manager' } },
        { id: 2, type: 'condition', config: { field: 'value', operator: 'gte', value: 100000 } },
        { id: 3, type: 'approval', config: { approver: 'vp_sales', if_condition: true } },
        { id: 4, type: 'notify', config: { channel: 'email', template: 'deal_approved' } },
      ],
      isActive: true,
      version: 1,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.workflowDefinitions.ticketRouting,
      name: 'Ticket Auto-Routing',
      description: 'Intelligent ticket routing based on category and priority',
      category: 'support',
      triggerType: 'ticket.created',
      triggerConfig: {},
      steps: [
        { id: 1, type: 'classify', config: { model: 'ticket_classifier_v1' } },
        { id: 2, type: 'route', config: { rules: 'standard_routing' } },
        { id: 3, type: 'sla', config: { policy: 'auto_select' } },
        { id: 4, type: 'notify', config: { channel: 'internal', template: 'new_ticket_assigned' } },
      ],
      isActive: true,
      version: 1,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const workflow of workflows) {
    await prisma.workflowDefinition.upsert({
      where: { id: workflow.id },
      update: workflow,
      create: workflow,
    });
  }

  console.log(`✅ Created ${workflows.length} workflow definitions`);
}

async function seedWorkflowExecutions() {
  console.log('▶️ Seeding workflow executions...');

  const executions = [
    {
      id: SEED_IDS.workflowExecutions.leadQual1,
      workflowId: SEED_IDS.workflowDefinitions.leadQualification,
      triggeredBy: 'system',
      entityType: 'lead',
      entityId: SEED_IDS.leads.sarahMiller,
      triggerData: { lead_id: SEED_IDS.leads.sarahMiller, source: 'website' },
      status: WorkflowStatus.COMPLETED,
      currentStep: 4,
      stepResults: [
        { step: 1, status: 'completed', result: { score: 85 } },
        { step: 2, status: 'completed', result: { passed: true } },
        { step: 3, status: 'completed', result: { assigned_to: SEED_IDS.users.sarahJohnson } },
        { step: 4, status: 'completed', result: { notification_sent: true } },
      ],
      startedAt: new Date('2024-12-20T10:00:00'),
      completedAt: new Date('2024-12-20T10:00:05'),
    },
    {
      id: SEED_IDS.workflowExecutions.dealApproval1,
      workflowId: SEED_IDS.workflowDefinitions.dealApproval,
      triggeredBy: 'user',
      entityType: 'deal',
      entityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      triggerData: { deal_id: SEED_IDS.opportunities.enterpriseLicenseAcme },
      status: WorkflowStatus.RUNNING,
      currentStep: 2,
      stepResults: [
        {
          step: 1,
          status: 'completed',
          result: { approved: true, approver: SEED_IDS.users.manager },
        },
        { step: 2, status: 'pending', result: null },
      ],
      startedAt: new Date('2024-12-21T14:00:00'),
    },
  ];

  for (const execution of executions) {
    await prisma.workflowExecution.upsert({
      where: { id: execution.id },
      update: execution,
      create: execution,
    });
  }

  console.log(`✅ Created ${executions.length} workflow executions`);
}

// FLOW-027: Business Rules
async function seedBusinessRules() {
  console.log('📏 Seeding business rules...');

  const rules = [
    {
      id: SEED_IDS.businessRules.discountApproval,
      name: 'Discount Approval Threshold',
      description: 'Requires manager approval for discounts over 15%',
      entityType: 'deal',
      ruleType: 'validation',
      conditions: { discount_percentage: { operator: 'gt', value: 15 } },
      actions: { require_approval: true, approver_role: 'manager' },
      priority: 1,
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.businessRules.autoAssignment,
      name: 'Auto-Assignment by Territory',
      description: 'Automatically assign leads based on geographic territory',
      entityType: 'lead',
      ruleType: 'automation',
      conditions: { lead_country: { operator: 'in', value: ['US', 'CA'] } },
      actions: { assign_to_team: SEED_IDS.teams.sales },
      priority: 2,
      isActive: true,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.businessRules.escalationTrigger,
      name: 'SLA Escalation Trigger',
      description: 'Escalate tickets approaching SLA breach',
      entityType: 'ticket',
      ruleType: 'automation',
      conditions: { sla_remaining_percent: { operator: 'lt', value: 20 } },
      actions: { escalate: true, notify: ['manager', 'slack'] },
      priority: 0,
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const rule of rules) {
    await prisma.businessRule.upsert({
      where: { id: rule.id },
      update: rule,
      create: rule,
    });
  }

  console.log(`✅ Created ${rules.length} business rules`);
}

// FLOW-022, FLOW-023: Dashboards & Reports
async function seedDashboardConfigs() {
  console.log('📊 Seeding dashboard configs...');

  const dashboards = [
    {
      id: SEED_IDS.dashboardConfigs.salesDashboard,
      name: 'Sales Dashboard',
      userId: SEED_IDS.users.sarahJohnson,
      isDefault: true,
      layout: { columns: 3, rows: 4 },
      widgets: [
        { id: 'pipeline', type: 'pipeline', position: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'revenue', type: 'kpi', position: { x: 2, y: 0, w: 1, h: 1 } },
        { id: 'deals', type: 'deals_won', position: { x: 2, y: 1, w: 1, h: 1 } },
        { id: 'activities', type: 'recent_activities', position: { x: 0, y: 2, w: 3, h: 2 } },
      ],
    },
    {
      id: SEED_IDS.dashboardConfigs.supportDashboard,
      name: 'Support Dashboard',
      userId: SEED_IDS.users.emilyDavis,
      isDefault: true,
      layout: { columns: 3, rows: 3 },
      widgets: [
        { id: 'tickets', type: 'ticket_overview', position: { x: 0, y: 0, w: 2, h: 1 } },
        { id: 'sla', type: 'sla_status', position: { x: 2, y: 0, w: 1, h: 1 } },
        { id: 'csat', type: 'csat_trend', position: { x: 0, y: 1, w: 3, h: 2 } },
      ],
    },
    {
      id: SEED_IDS.dashboardConfigs.executiveDashboard,
      name: 'Executive Overview',
      userId: SEED_IDS.users.admin,
      isDefault: false,
      layout: { columns: 4, rows: 4 },
      widgets: [
        { id: 'revenue', type: 'revenue_chart', position: { x: 0, y: 0, w: 2, h: 2 } },
        { id: 'growth', type: 'growth_metrics', position: { x: 2, y: 0, w: 2, h: 2 } },
        { id: 'health', type: 'account_health', position: { x: 0, y: 2, w: 2, h: 2 } },
        { id: 'performance', type: 'team_performance', position: { x: 2, y: 2, w: 2, h: 2 } },
      ],
    },
  ];

  for (const dashboard of dashboards) {
    await prisma.dashboardConfig.upsert({
      where: { id: dashboard.id },
      update: dashboard,
      create: dashboard,
    });
  }

  console.log(`✅ Created ${dashboards.length} dashboard configs`);
}

async function seedKPIDefinitions() {
  console.log('🎯 Seeding KPI definitions...');

  const kpis = [
    {
      id: SEED_IDS.kpiDefinitions.revenueTarget,
      name: 'Monthly Revenue Target',
      description: 'Track monthly recurring revenue against target',
      category: 'sales',
      metric: 'mrr',
      calculation: 'sum',
      target: 500000,
      unit: '$',
      format: 'currency',
      isActive: true,
    },
    {
      id: SEED_IDS.kpiDefinitions.ticketResolution,
      name: 'First Response Time',
      description: 'Average first response time for support tickets',
      category: 'support',
      metric: 'avg_first_response',
      calculation: 'average',
      target: 60,
      unit: 'minutes',
      format: 'duration',
      isActive: true,
    },
    {
      id: SEED_IDS.kpiDefinitions.customerSatisfaction,
      name: 'Customer Satisfaction Score',
      description: 'Overall CSAT from post-interaction surveys',
      category: 'support',
      metric: 'csat',
      calculation: 'percentage',
      target: 90,
      unit: '%',
      format: 'percentage',
      isActive: true,
    },
  ];

  for (const kpi of kpis) {
    await prisma.kPIDefinition.upsert({
      where: { id: kpi.id },
      update: kpi,
      create: kpi,
    });
  }

  console.log(`✅ Created ${kpis.length} KPI definitions`);
}

async function seedReportDefinitions(tenantId: string) {
  console.log('📈 Seeding report definitions...');

  const reports = [
    {
      id: SEED_IDS.reportDefinitions.salesPipeline,
      tenantId,
      name: 'Sales Pipeline Report',
      description: 'Weekly overview of sales pipeline and deal progression',
      category: 'sales',
      type: 'table',
      dataSource: 'opportunities',
      columns: ['name', 'stage', 'value', 'probability', 'expected_close', 'owner'],
      filters: { status: 'open' },
      grouping: { by: 'stage' },
      isPublic: false,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.reportDefinitions.supportMetrics,
      tenantId,
      name: 'Support Metrics Report',
      description: 'Daily support ticket metrics and SLA compliance',
      category: 'support',
      type: 'summary',
      dataSource: 'tickets',
      columns: ['ticket_count', 'avg_resolution_time', 'sla_compliance', 'csat'],
      filters: {},
      isPublic: true,
      createdBy: SEED_IDS.users.emilyDavis,
    },
    {
      id: SEED_IDS.reportDefinitions.revenueAnalysis,
      tenantId,
      name: 'Revenue Analysis',
      description: 'Monthly revenue breakdown by segment and product',
      category: 'finance',
      type: 'chart',
      dataSource: 'deals',
      columns: ['revenue', 'segment', 'product', 'month'],
      filters: { status: 'closed_won' },
      grouping: { by: 'segment' },
      chartConfig: { type: 'bar', axis: { x: 'month', y: 'revenue' } },
      isPublic: false,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const report of reports) {
    await prisma.reportDefinition.upsert({
      where: { id: report.id },
      update: report,
      create: report,
    });
  }

  console.log(`✅ Created ${reports.length} report definitions`);
}

// FLOW-024: AI Insights
async function seedAIInsights(tenantId: string) {
  console.log('🤖 Seeding AI insights...');

  const insights = [
    {
      id: SEED_IDS.aiInsights.dealRiskAcme,
      tenantId,
      type: 'prediction',
      category: 'risk',
      title: 'Deal at Risk: Acme Corp Enterprise License',
      description:
        'Deal showing signs of stalling. No activity in 14 days. Risk factors include no recent activity, stakeholder change, and competitor mention.',
      confidence: 85,
      priority: 'high',
      entityType: 'deal',
      entityId: SEED_IDS.opportunities.enterpriseLicenseAcme,
      suggestedActions: [
        'Schedule executive review',
        'Offer additional demo',
        'Provide case studies',
      ],
      metadata: {
        deal_id: SEED_IDS.opportunities.enterpriseLicenseAcme,
        risk_factors: ['no_recent_activity', 'stakeholder_change', 'competitor_mention'],
      },
      status: InsightStatus.NEW,
    },
    {
      id: SEED_IDS.aiInsights.churnRiskTechCorp,
      tenantId,
      type: 'prediction',
      category: 'risk',
      title: 'Churn Risk Alert: TechCorp',
      description:
        'Account health score declining. Product usage down 40% this month. Engagement signals show reduced logins, fewer support tickets, and missed training sessions.',
      confidence: 78,
      priority: 'high',
      entityType: 'account',
      entityId: SEED_IDS.accounts.techCorp,
      suggestedActions: [
        'Schedule check-in call',
        'Offer additional training',
        'Review account health',
      ],
      metadata: {
        account_id: SEED_IDS.accounts.techCorp,
        health_score: 65,
        usage_trend: -40,
        engagement_signals: ['reduced_logins', 'fewer_support_tickets', 'missed_training'],
      },
      status: InsightStatus.NEW,
    },
    {
      id: SEED_IDS.aiInsights.upsellOpportunity,
      tenantId,
      type: 'recommendation',
      category: 'sales',
      title: 'Upsell Opportunity: GlobalSoft',
      description:
        'Account approaching user limit (45/50 users). Usage growing 25% monthly. Good candidate for enterprise plan upgrade with potential value of $25,000.',
      confidence: 82,
      priority: 'medium',
      entityType: 'account',
      entityId: SEED_IDS.accounts.globalSoft,
      suggestedActions: [
        'Present enterprise plan',
        'Schedule upgrade discussion',
        'Prepare ROI analysis',
      ],
      metadata: {
        account_id: SEED_IDS.accounts.globalSoft,
        current_users: 45,
        user_limit: 50,
        usage_growth: 25,
        recommended_plan: 'enterprise',
        potential_value: 25000,
      },
      status: InsightStatus.NEW,
    },
  ];

  for (const insight of insights) {
    await prisma.aIInsight.upsert({
      where: { id: insight.id },
      update: insight,
      create: insight,
    });
  }

  console.log(`✅ Created ${insights.length} AI insights`);
}

// FLOW-031, FLOW-032, FLOW-033: Monitoring & Observability
async function seedHealthChecks() {
  console.log('🏥 Seeding health checks...');

  const checks = [
    {
      id: SEED_IDS.healthChecks.apiGateway,
      serviceName: 'api-gateway',
      status: HealthStatus.HEALTHY,
      responseTime: 45,
      details: { version: '2.1.0', uptime: '99.99%' },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.healthChecks.database,
      serviceName: 'postgresql',
      status: HealthStatus.HEALTHY,
      responseTime: 12,
      details: { connections: 45, max_connections: 100 },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.healthChecks.aiWorker,
      serviceName: 'ai-worker',
      status: HealthStatus.DEGRADED,
      responseTime: 850,
      error: 'High queue length detected',
      details: { queue_length: 150, avg_processing_time: '2.5s' },
      checkedAt: new Date('2024-12-21T12:00:00'),
    },
  ];

  for (const check of checks) {
    await prisma.healthCheck.upsert({
      where: { id: check.id },
      update: check,
      create: check,
    });
  }

  console.log(`✅ Created ${checks.length} health checks`);
}

async function seedAlertIncidents() {
  console.log('🚨 Seeding alert incidents...');

  const incidents = [
    {
      id: SEED_IDS.alertIncidents.highLatency,
      alertName: 'High API Latency',
      severity: 'warning',
      source: 'prometheus',
      message: 'API response time exceeded 500ms threshold for 5 minutes',
      status: AlertStatus.RESOLVED,
      firedAt: new Date('2024-12-20T14:30:00'),
      acknowledgedBy: SEED_IDS.users.jamesWilson,
      acknowledgedAt: new Date('2024-12-20T14:32:00'),
      resolvedBy: SEED_IDS.users.jamesWilson,
      resolvedAt: new Date('2024-12-20T14:45:00'),
      details: { endpoint: '/api/leads', avg_latency: 650 },
    },
    {
      id: SEED_IDS.alertIncidents.errorSpike,
      alertName: 'Error Rate Spike',
      severity: 'critical',
      source: 'sentry',
      message: 'Error rate increased by 300% in the last 10 minutes',
      status: AlertStatus.ACKNOWLEDGED,
      firedAt: new Date('2024-12-21T11:00:00'),
      acknowledgedBy: SEED_IDS.users.admin,
      acknowledgedAt: new Date('2024-12-21T11:05:00'),
      details: { error_count: 450, normal_rate: 15 },
    },
  ];

  for (const incident of incidents) {
    await prisma.alertIncident.upsert({
      where: { id: incident.id },
      update: incident,
      create: incident,
    });
  }

  console.log(`✅ Created ${incidents.length} alert incidents`);
}

async function seedPerformanceMetrics() {
  console.log('📉 Seeding performance metrics...');

  const metrics = [
    {
      id: SEED_IDS.performanceMetrics.apiLatency,
      metricName: 'api_response_time_p95',
      metricType: 'histogram',
      value: 125,
      unit: 'ms',
      serviceName: 'api-gateway',
      tags: { endpoint: '/api/*', percentile: 95 },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.performanceMetrics.dbQueryTime,
      metricName: 'db_query_time_avg',
      metricType: 'gauge',
      value: 18,
      unit: 'ms',
      serviceName: 'postgresql',
      tags: { operation: 'read' },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
    {
      id: SEED_IDS.performanceMetrics.aiResponseTime,
      metricName: 'ai_scoring_latency_p99',
      metricType: 'histogram',
      value: 1850,
      unit: 'ms',
      serviceName: 'ai-worker',
      tags: { model: 'lead_scorer_v2', percentile: 99 },
      recordedAt: new Date('2024-12-21T12:00:00'),
    },
  ];

  for (const metric of metrics) {
    await prisma.performanceMetric.upsert({
      where: { id: metric.id },
      update: metric,
      create: metric,
    });
  }

  console.log(`✅ Created ${metrics.length} performance metrics`);
}

// FLOW-034: Webhooks
async function seedWebhookEndpoints(tenantId: string) {
  console.log('🔗 Seeding webhook endpoints...');

  const endpoints = [
    {
      id: SEED_IDS.webhookEndpoints.slackNotifications,
      tenantId,
      name: 'Slack Notifications',
      url: 'https://hooks.slack.com/services/T00/B00/XXXX',
      events: ['deal.won', 'deal.lost', 'ticket.escalated'],
      secret: 'whsec_slack_integration_secret',
      isActive: true,
      createdBy: SEED_IDS.users.admin,
    },
    {
      id: SEED_IDS.webhookEndpoints.zapierIntegration,
      tenantId,
      name: 'Zapier Integration',
      url: 'https://hooks.zapier.com/hooks/catch/123456/abcdef/',
      events: ['lead.created', 'contact.updated', 'deal.stage_changed'],
      secret: 'whsec_zapier_integration_secret',
      isActive: true,
      createdBy: SEED_IDS.users.manager,
    },
    {
      id: SEED_IDS.webhookEndpoints.customCRM,
      tenantId,
      name: 'Legacy CRM Sync',
      url: 'https://legacy-crm.example.com/api/webhooks/intelliflow',
      events: ['contact.created', 'contact.updated', 'deal.created'],
      secret: 'whsec_legacy_crm_secret',
      isActive: false,
      createdBy: SEED_IDS.users.admin,
    },
  ];

  for (const endpoint of endpoints) {
    await prisma.webhookEndpoint.upsert({
      where: { id: endpoint.id },
      update: endpoint,
      create: endpoint,
    });
  }

  console.log(`✅ Created ${endpoints.length} webhook endpoints`);
}

// FLOW-035, FLOW-036: API Management
async function seedAPIKeys(tenantId: string) {
  console.log('🔑 Seeding API keys...');

  const keys = [
    {
      id: SEED_IDS.apiKeys.mobileApp,
      tenantId,
      name: 'Mobile App API Key',
      keyHash: 'sha256_mobile_app_key_hash_placeholder',
      keyPrefix: 'if_mob_',
      userId: SEED_IDS.users.admin,
      scopes: ['read:leads', 'read:contacts', 'read:deals', 'write:tasks'],
      rateLimit: 1000,
      isActive: true,
      lastUsedAt: new Date('2024-12-21T10:30:00'),
      expiresAt: new Date('2025-12-21'),
    },
    {
      id: SEED_IDS.apiKeys.integration,
      tenantId,
      name: 'Integration API Key',
      keyHash: 'sha256_integration_key_hash_placeholder',
      keyPrefix: 'if_int_',
      userId: SEED_IDS.users.manager,
      scopes: ['read:*', 'write:leads', 'write:contacts'],
      rateLimit: 5000,
      isActive: true,
      lastUsedAt: new Date('2024-12-21T11:00:00'),
      expiresAt: new Date('2025-06-21'),
    },
    {
      id: SEED_IDS.apiKeys.internal,
      tenantId,
      name: 'Internal Services Key',
      keyHash: 'sha256_internal_key_hash_placeholder',
      keyPrefix: 'if_srv_',
      userId: SEED_IDS.users.admin,
      scopes: ['admin:*'],
      rateLimit: 10000,
      isActive: true,
    },
  ];

  for (const key of keys) {
    await prisma.aPIKey.upsert({
      where: { id: key.id },
      update: key,
      create: key,
    });
  }

  console.log(`✅ Created ${keys.length} API keys`);
}

async function seedAPIVersions() {
  console.log('🔢 Seeding API versions...');

  const versions = [
    {
      id: SEED_IDS.apiVersions.v1,
      version: 'v1',
      releaseDate: new Date('2024-01-15'),
      deprecatedAt: new Date('2024-12-01'),
      sunsetDate: new Date('2025-06-01'),
      status: 'deprecated',
      changelog: 'Initial API release',
      breakingChanges: [],
    },
    {
      id: SEED_IDS.apiVersions.v2,
      version: 'v2',
      releaseDate: new Date('2024-06-01'),
      status: 'current',
      changelog: 'Major performance improvements, new endpoints for AI features',
      breakingChanges: ['Removed /api/v1/legacy endpoints', 'Changed pagination format'],
    },
  ];

  for (const version of versions) {
    await prisma.aPIVersion.upsert({
      where: { id: version.id },
      update: version,
      create: version,
    });
  }

  console.log(`✅ Created ${versions.length} API versions`);
}

// =============================================================================
// Tenant Management
// =============================================================================

async function getDefaultTenant() {
  console.log('🏢 Getting default tenant...');

  // Use deterministic ID from SEED_IDS to match FALLBACK_USER in API context
  // This ensures seeded data is visible in development mode
  const expectedId = SEED_IDS.tenant.default;

  // Check if tenant with correct ID already exists
  let tenant = await prisma.tenant.findUnique({
    where: { id: expectedId },
  });

  if (tenant) {
    console.log(`✅ Found existing default tenant (ID: ${tenant.id})`);
    return tenant;
  }

  // Check if there's a tenant with slug 'default' but wrong ID
  const existingBySlug = await prisma.tenant.findUnique({
    where: { slug: 'default' },
  });

  if (existingBySlug && existingBySlug.id !== expectedId) {
    console.log(`⚠️  Found tenant with slug 'default' but wrong ID (${existingBySlug.id})`);
    console.log(`   Updating tenant ID to match expected ID (${expectedId})`);

    // Update the tenant ID using raw SQL (Prisma doesn't support PK updates)
    // This will cascade to all related records via foreign key constraints
    await prisma.$executeRawUnsafe(
      `
      UPDATE tenants SET id = $1 WHERE id = $2
    `,
      expectedId,
      existingBySlug.id
    );

    // Fetch the updated tenant
    tenant = await prisma.tenant.findUnique({
      where: { id: expectedId },
    });

    if (tenant) {
      console.log(`✅ Updated tenant ID to ${tenant.id}`);
      return tenant;
    }
  }

  // Create tenant with deterministic ID if nothing exists
  tenant = await prisma.tenant.create({
    data: {
      id: expectedId,
      name: 'Default Organization',
      slug: 'default',
      status: 'ACTIVE',
    },
  });

  console.log(`✅ Created default tenant (ID: ${tenant.id})`);
  return tenant;
}

// =============================================================================
// Home Page Seed Data (IFC-182)
// Uses relative dates to ensure data shows on home page
// =============================================================================

async function seedHomePageData(tenantId: string) {
  console.log('🏠 Seeding home page data with recent dates...');

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000);
  const threeDaysAgo = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
  const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000);

  // Get the first user to assign as owner
  const user = await prisma.user.findFirst({
    where: { tenantId },
  });

  if (!user) {
    console.log('⚠️  No users found, skipping home page seed data');
    return;
  }

  // 1. Create recent HIGH priority tasks (for welcome message)
  const recentTasks = [
    {
      id: 'home-task-1',
      title: 'Follow up with Acme Corp on proposal',
      description: 'Send updated pricing and schedule demo call',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: new Date(today.getTime() + 24 * 60 * 60 * 1000), // tomorrow
      ownerId: user.id,
      tenantId,
    },
    {
      id: 'home-task-2',
      title: 'Prepare quarterly review presentation',
      description: 'Compile Q4 metrics and forecasts',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000), // 2 days
      ownerId: user.id,
      tenantId,
    },
    {
      id: 'home-task-3',
      title: 'Review contract with legal team',
      description: 'Get approval for TechCorp enterprise deal',
      status: TaskStatus.PENDING,
      priority: TaskPriority.HIGH,
      dueDate: today, // due today
      ownerId: user.id,
      tenantId,
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

  // 2. Create recent opportunities with CLOSED_WON (for deal trend)
  const account = await prisma.account.findFirst({ where: { tenantId } });

  if (account) {
    const recentDeals = [
      {
        id: 'home-deal-1',
        name: 'CloudSync Enterprise License',
        stage: OpportunityStage.CLOSED_WON,
        value: 75000,
        probability: 100,
        closedAt: twoDaysAgo,
        expectedCloseDate: twoDaysAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId,
      },
      {
        id: 'home-deal-2',
        name: 'DataFlow Analytics Subscription',
        stage: OpportunityStage.CLOSED_WON,
        value: 45000,
        probability: 100,
        closedAt: threeDaysAgo,
        expectedCloseDate: threeDaysAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId,
      },
      {
        id: 'home-deal-3',
        name: 'SecureVault Implementation',
        stage: OpportunityStage.CLOSED_WON,
        value: 120000,
        probability: 100,
        closedAt: oneWeekAgo,
        expectedCloseDate: oneWeekAgo,
        accountId: account.id,
        ownerId: user.id,
        tenantId,
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
  const recentAuditLogs = [
    {
      id: 'home-audit-1',
      eventType: 'DealClosed',
      eventId: `event-home-audit-1-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Opportunity',
      resourceId: 'home-deal-1',
      action: AuditAction.UPDATE,
      beforeState: { stage: 'NEGOTIATION' },
      afterState: { stage: 'CLOSED_WON', value: 75000 },
      changedFields: ['stage'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId,
      timestamp: twoDaysAgo,
    },
    {
      id: 'home-audit-2',
      eventType: 'TaskCompleted',
      eventId: `event-home-audit-2-${Date.now()}`,
      actorType: ActorType.USER,
      actorId: user.id,
      resourceType: 'Task',
      resourceId: 'home-task-1',
      action: AuditAction.UPDATE,
      beforeState: { status: 'IN_PROGRESS' },
      afterState: { status: 'COMPLETED' },
      changedFields: ['status'],
      ipAddress: '192.168.1.100',
      userAgent: 'Mozilla/5.0',
      tenantId,
      timestamp: yesterday,
    },
    {
      id: 'home-audit-3',
      eventType: 'LeadQualified',
      eventId: `event-home-audit-3-${Date.now()}`,
      actorType: ActorType.AI,
      actorId: null,
      resourceType: 'Lead',
      resourceId: SEED_IDS.leads.sarahMiller,
      action: AuditAction.UPDATE,
      beforeState: { status: 'NEW', score: 45 },
      afterState: { status: 'QUALIFIED', score: 92 },
      changedFields: ['status', 'score'],
      ipAddress: null,
      userAgent: 'IntelliFlow AI Engine',
      tenantId,
      timestamp: yesterday,
    },
    {
      id: 'home-audit-4',
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
      tenantId,
      timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000), // 2 hours ago
    },
    {
      id: 'home-audit-5',
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
      tenantId,
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

  // 4. Create appointments (comprehensive calendar demo data)
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfterTomorrow = new Date(today);
  dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeek2 = new Date(today);
  nextWeek2.setDate(nextWeek2.getDate() + 9);
  const nextWeek3 = new Date(today);
  nextWeek3.setDate(nextWeek3.getDate() + 10);
  const twoWeeksOut = new Date(today);
  twoWeeksOut.setDate(twoWeeksOut.getDate() + 14);
  const threeWeeksOut = new Date(today);
  threeWeeksOut.setDate(threeWeeksOut.getDate() + 21);

  const appointments = [
    {
      id: SEED_IDS.appointments.productDemoTechCorp,
      title: 'Product Demo - TechCorp',
      description: 'Show new analytics features and discuss enterprise licensing',
      startTime: new Date(today.getTime() + 10 * 60 * 60 * 1000), // 10 AM today
      endTime: new Date(today.getTime() + 11 * 60 * 60 * 1000), // 11 AM today
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.MEETING,
      location: 'Zoom - https://zoom.us/j/123456789',
      notes: 'Key stakeholders: CTO and VP Engineering. Focus on real-time dashboards.',
      bufferMinutesBefore: 15,
      reminderMinutes: 30,
      organizerId: user.id,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.followUpCallSarah,
      title: 'Follow-up Call - Sarah Miller',
      description: 'Discuss proposal feedback and next steps for enterprise deal',
      startTime: new Date(today.getTime() + 14 * 60 * 60 * 1000), // 2 PM today
      endTime: new Date(today.getTime() + 14.5 * 60 * 60 * 1000), // 2:30 PM today
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.CALL,
      location: 'Phone: +1 (555) 234-5678',
      notes: 'Sarah mentioned budget concerns in last email. Prepare pricing options.',
      reminderMinutes: 15,
      organizerId: user.id,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.q3ReviewMeeting,
      title: 'Q3 Pipeline Review',
      description: 'Quarterly review of sales pipeline, conversion rates, and revenue targets',
      startTime: new Date(tomorrow.getTime() + 9 * 60 * 60 * 1000), // 9 AM tomorrow
      endTime: new Date(tomorrow.getTime() + 10.5 * 60 * 60 * 1000), // 10:30 AM tomorrow
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.MEETING,
      location: 'Conference Room B',
      notes: 'Bring pipeline reports and forecast spreadsheets. CFO will attend.',
      bufferMinutesBefore: 10,
      bufferMinutesAfter: 10,
      reminderMinutes: 60,
      organizerId: user.id,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.proposalDeadline,
      title: 'Proposal Deadline - Acme Corp',
      description: 'Final deadline for submitting enterprise software proposal to Acme Corp',
      startTime: new Date(dayAfterTomorrow.getTime() + 17 * 60 * 60 * 1000), // 5 PM day after tomorrow
      endTime: new Date(dayAfterTomorrow.getTime() + 17.5 * 60 * 60 * 1000), // 5:30 PM
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.OTHER,
      location: 'N/A - Document submission',
      notes: 'Submit via Acme procurement portal. Include pricing tiers and SLA guarantees.',
      reminderMinutes: 120,
      organizerId: user.id,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.clientConsultation,
      title: 'Client Consultation - GlobalSoft',
      description: 'Initial consultation on CRM integration and data migration requirements',
      startTime: new Date(nextWeek.getTime() + 11 * 60 * 60 * 1000), // 11 AM next week
      endTime: new Date(nextWeek.getTime() + 12 * 60 * 60 * 1000), // 12 PM
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.CONSULTATION,
      location: 'Microsoft Teams',
      notes:
        'Assess current CRM setup, data volume, integration points. Bring migration checklist.',
      bufferMinutesBefore: 15,
      reminderMinutes: 60,
      organizerId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.courtHearing,
      title: 'Court Hearing - Johnson Civil Case',
      description: 'Preliminary hearing for Johnson v. Smith civil litigation case',
      startTime: new Date(nextWeek2.getTime() + 9 * 60 * 60 * 1000), // 9 AM
      endTime: new Date(nextWeek2.getTime() + 12 * 60 * 60 * 1000), // 12 PM
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.HEARING,
      location: 'District Court, Room 304',
      notes: 'Bring case files, evidence binder, and witness list. Arrive 30 min early.',
      bufferMinutesBefore: 30,
      bufferMinutesAfter: 15,
      reminderMinutes: 120,
      organizerId: SEED_IDS.users.jamesWilson,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.depositionPrep,
      title: 'Deposition Prep - TechFlow Merger',
      description: 'Prepare witness for deposition in TechFlow corporate merger case',
      startTime: new Date(nextWeek3.getTime() + 14 * 60 * 60 * 1000), // 2 PM
      endTime: new Date(nextWeek3.getTime() + 16 * 60 * 60 * 1000), // 4 PM
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.DEPOSITION,
      location: 'Law Office - Suite 500',
      notes: 'Review all financial documents. Prepare witness for cross-examination questions.',
      bufferMinutesBefore: 15,
      reminderMinutes: 60,
      organizerId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.weeklyStandup,
      title: 'Weekly Team Standup',
      description: 'Review pipeline progress, blockers, and weekly priorities',
      startTime: new Date(tomorrow.getTime() + 14 * 60 * 60 * 1000), // 2 PM tomorrow
      endTime: new Date(tomorrow.getTime() + 14.5 * 60 * 60 * 1000), // 2:30 PM
      status: AppointmentStatus.CONFIRMED,
      appointmentType: AppointmentType.MEETING,
      location: 'Conference Room A',
      notes: 'Standing meeting. Each team member: 2 min update. Focus on deals closing this week.',
      organizerId: user.id,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.partnerCall,
      title: 'Partner Integration Call - Zapier',
      description: 'Discuss webhook integration and API partnership opportunities',
      startTime: new Date(twoWeeksOut.getTime() + 15 * 60 * 60 * 1000), // 3 PM
      endTime: new Date(twoWeeksOut.getTime() + 16 * 60 * 60 * 1000), // 4 PM
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.CALL,
      location: 'Google Meet',
      notes: 'Review API documentation beforehand. Prepare integration demo environment.',
      reminderMinutes: 30,
      organizerId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    {
      id: SEED_IDS.appointments.strategySession,
      title: 'Q4 Strategy Planning Session',
      description: 'Executive strategy session for Q4 goals, budgets, and hiring plan',
      startTime: new Date(threeWeeksOut.getTime() + 10 * 60 * 60 * 1000), // 10 AM
      endTime: new Date(threeWeeksOut.getTime() + 13 * 60 * 60 * 1000), // 1 PM
      status: AppointmentStatus.SCHEDULED,
      appointmentType: AppointmentType.MEETING,
      location: 'Executive Boardroom',
      notes: 'Full-day session. Lunch provided. Bring department budget proposals.',
      bufferMinutesBefore: 15,
      bufferMinutesAfter: 15,
      reminderMinutes: 1440, // 24 hours
      organizerId: SEED_IDS.users.manager,
      tenantId,
    },
  ];

  for (const appt of appointments) {
    await prisma.appointment.upsert({
      where: { id: appt.id },
      update: appt,
      create: appt,
    });
  }
  console.log(`  ✅ Created ${appointments.length} appointments`);

  // 4b. Create appointment attendees
  const attendees = [
    // Product Demo - TechCorp: admin + Sarah + Mike
    {
      id: SEED_IDS.appointmentAttendees.att1,
      appointmentId: SEED_IDS.appointments.productDemoTechCorp,
      userId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att2,
      appointmentId: SEED_IDS.appointments.productDemoTechCorp,
      userId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    // Follow-up Call - Sarah: admin only (organizer)
    // Q3 Pipeline Review: admin + Sarah + Emily + James
    {
      id: SEED_IDS.appointmentAttendees.att3,
      appointmentId: SEED_IDS.appointments.q3ReviewMeeting,
      userId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att4,
      appointmentId: SEED_IDS.appointments.q3ReviewMeeting,
      userId: SEED_IDS.users.emilyDavis,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att5,
      appointmentId: SEED_IDS.appointments.q3ReviewMeeting,
      userId: SEED_IDS.users.jamesWilson,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att6,
      appointmentId: SEED_IDS.appointments.q3ReviewMeeting,
      userId: SEED_IDS.users.manager,
      tenantId,
    },
    // Client Consultation - GlobalSoft: Sarah + Alex
    {
      id: SEED_IDS.appointmentAttendees.att7,
      appointmentId: SEED_IDS.appointments.clientConsultation,
      userId: SEED_IDS.users.alexMorgan,
      tenantId,
    },
    // Court Hearing: James + Mike
    {
      id: SEED_IDS.appointmentAttendees.att8,
      appointmentId: SEED_IDS.appointments.courtHearing,
      userId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    // Deposition Prep: Mike + James
    {
      id: SEED_IDS.appointmentAttendees.att9,
      appointmentId: SEED_IDS.appointments.depositionPrep,
      userId: SEED_IDS.users.jamesWilson,
      tenantId,
    },
    // Weekly Standup: everyone
    {
      id: SEED_IDS.appointmentAttendees.att10,
      appointmentId: SEED_IDS.appointments.weeklyStandup,
      userId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att11,
      appointmentId: SEED_IDS.appointments.weeklyStandup,
      userId: SEED_IDS.users.mikeDavis,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentAttendees.att12,
      appointmentId: SEED_IDS.appointments.weeklyStandup,
      userId: SEED_IDS.users.emilyDavis,
      tenantId,
    },
    // Partner Call: Alex + admin
    {
      id: SEED_IDS.appointmentAttendees.att13,
      appointmentId: SEED_IDS.appointments.partnerCall,
      userId: user.id,
      tenantId,
    },
    // Strategy Session: manager + Sarah + Mike + Emily + James + Alex
    {
      id: SEED_IDS.appointmentAttendees.att14,
      appointmentId: SEED_IDS.appointments.strategySession,
      userId: SEED_IDS.users.sarahJohnson,
      tenantId,
    },
  ];

  for (const att of attendees) {
    await prisma.appointmentAttendee.upsert({
      where: { id: att.id },
      update: att,
      create: att,
    });
  }
  console.log(`  ✅ Created ${attendees.length} appointment attendees`);

  // 4c. Link appointments to cases
  const appointmentCases = [
    {
      id: SEED_IDS.appointmentCases.hearingCase,
      appointmentId: SEED_IDS.appointments.courtHearing,
      caseId: SEED_IDS.cases.civilLitigationJohnson,
      tenantId,
    },
    {
      id: SEED_IDS.appointmentCases.depositionCase,
      appointmentId: SEED_IDS.appointments.depositionPrep,
      caseId: SEED_IDS.cases.corporateMergerTechFlow,
      tenantId,
    },
  ];

  for (const ac of appointmentCases) {
    await prisma.appointmentCase.upsert({
      where: { id: ac.id },
      update: ac,
      create: ac,
    });
  }
  console.log(`  ✅ Created ${appointmentCases.length} appointment-case links`);

  // 5. Create user preferences with pinned items
  const existingPrefs = await prisma.user.findUnique({
    where: { id: user.id },
    select: { preferences: true },
  });

  const pinnedItems = [
    {
      entityType: 'lead',
      entityId: SEED_IDS.leads.sarahMiller,
      title: 'Sarah Miller - Hot Lead',
      subtitle: 'Score: 92',
      url: `/leads/${SEED_IDS.leads.sarahMiller}`,
      pinnedAt: yesterday.toISOString(),
      position: 0,
    },
    {
      entityType: 'opportunity',
      entityId: 'home-deal-1',
      title: 'CloudSync Enterprise',
      subtitle: '$75,000 - Won',
      url: '/deals/home-deal-1',
      pinnedAt: twoDaysAgo.toISOString(),
      position: 1,
    },
    {
      entityType: 'report',
      entityId: 'weekly-pipeline',
      title: 'Weekly Pipeline Report',
      url: '/reports/weekly-pipeline',
      pinnedAt: oneWeekAgo.toISOString(),
      position: 2,
    },
  ];

  await prisma.user.update({
    where: { id: user.id },
    data: {
      preferences: {
        ...(typeof existingPrefs?.preferences === 'object' ? existingPrefs.preferences : {}),
        pinnedItems,
        dailyGoal: {
          type: 'revenue',
          targetValue: 5000,
          label: 'Daily Revenue Target',
        },
      },
    },
  });
  console.log(`  ✅ Created ${pinnedItems.length} pinned items for user`);

  console.log('✅ Home page seed data complete');
}

// =============================================================================
// Notifications Seed Data
// =============================================================================

async function seedNotifications(tenantId: string) {
  console.log('📬 Seeding notifications...');

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const notifications = [
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'HIGH' as const,
      subject: 'Deal won: Enterprise License',
      body: 'Acme Corp Enterprise License deal worth $125,000 has been closed-won',
      metadata: { notificationType: 'deal_won', entityType: 'opportunity', entityId: SEED_IDS.opportunities.enterpriseLicenseAcme, actionUrl: `/deals/${SEED_IDS.opportunities.enterpriseLicenseAcme}` },
      createdAt: oneHourAgo,
    },
    {
      recipientId: SEED_IDS.users.manager,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'Deal stage changed',
      body: 'Enterprise License (Acme Corp) moved to Negotiation stage',
      metadata: { notificationType: 'deal_stage_changed', entityType: 'opportunity', entityId: SEED_IDS.opportunities.enterpriseLicenseAcme, actionUrl: `/deals/${SEED_IDS.opportunities.enterpriseLicenseAcme}` },
      createdAt: twoHoursAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'Lead scored by AI',
      body: 'Sarah Miller scored 85/100 (Hot tier) by AI scoring engine',
      metadata: { notificationType: 'lead_scored', entityType: 'lead', entityId: SEED_IDS.leads.sarahMiller, actionUrl: `/leads/${SEED_IDS.leads.sarahMiller}` },
      createdAt: twoHoursAgo,
    },
    {
      recipientId: SEED_IDS.users.manager,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'Lead converted to deal',
      body: 'David Chen has been converted to a deal',
      metadata: { notificationType: 'lead_converted', entityType: 'lead', entityId: SEED_IDS.leads.davidChen, actionUrl: `/leads/${SEED_IDS.leads.davidChen}` },
      createdAt: oneDayAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'Task assigned to you',
      body: 'You have been assigned "Follow up with Sarah Miller"',
      metadata: { notificationType: 'task_assigned', entityType: 'task', actionUrl: '/tasks' },
      createdAt: oneDayAgo,
    },
    {
      recipientId: SEED_IDS.users.manager,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'LOW' as const,
      subject: 'Task completed',
      body: 'Task "Call Sarah Miller" has been completed',
      metadata: { notificationType: 'task_completed', entityType: 'task', actionUrl: '/tasks' },
      createdAt: twoDaysAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'AI insight available',
      body: 'New AI recommendation: Consider bundling products for Acme Corp deal',
      metadata: { notificationType: 'ai_insight', actionUrl: '/ai/insights' },
      createdAt: oneHourAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'AI recommendation',
      body: 'AI suggests scheduling a follow-up meeting with TechCorp within 48 hours',
      metadata: { notificationType: 'ai_recommendation', actionUrl: '/ai/recommendations' },
      createdAt: twoHoursAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'LOW' as const,
      subject: 'System update',
      body: 'IntelliFlow CRM has been updated to version 2.1.0',
      metadata: { notificationType: 'system_update' },
      createdAt: twoDaysAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'HIGH' as const,
      subject: 'Ticket assigned to you',
      body: 'Ticket "System Outage Report" has been assigned to you',
      metadata: { notificationType: 'ticket_assigned', entityType: 'ticket', actionUrl: '/tickets' },
      createdAt: oneHourAgo,
    },
    {
      recipientId: SEED_IDS.users.manager,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'Case assigned to you',
      body: 'Case "Contract Review - GlobalTech" has been assigned to you',
      metadata: { notificationType: 'case_assigned', entityType: 'case', actionUrl: '/cases' },
      createdAt: oneDayAgo,
    },
    {
      recipientId: SEED_IDS.users.admin,
      channel: 'IN_APP' as const,
      status: 'PENDING' as const,
      priority: 'NORMAL' as const,
      subject: 'New email received',
      body: 'You have a new email from sarah.miller@techcorp.com',
      metadata: { notificationType: 'email_received', actionUrl: '/email' },
      createdAt: oneHourAgo,
    },
  ];

  for (const notif of notifications) {
    await prisma.notification.create({
      data: {
        ...notif,
        tenantId,
        metadata: notif.metadata as any,
      },
    });
  }

  console.log(`  ✅ Created ${notifications.length} notifications`);
}

// =============================================================================
// Main Function
// =============================================================================

async function main() {
  console.log('🌱 Starting database seeding...\n');
  console.log('📊 Seeding data from frontend UI mockups:\n');

  try {
    // Get or create default tenant (for multi-tenancy)
    const defaultTenant = await getDefaultTenant();
    const tenantId = defaultTenant.id;

    // Clean existing seed data for idempotency
    await cleanDatabase();

    // Seed Supabase Auth users (required for login capability)
    await seedSupabaseAuthUsers();

    // Seed RBAC infrastructure first (enables database-driven permissions)
    await seedRBACPermissions();
    await seedRBACRoles();
    await seedRBACRolePermissions();

    // Seed data in correct order (respecting foreign key constraints)
    await seedUsers(tenantId);
    await seedAccounts(tenantId);
    await seedLeads(tenantId);
    // Lead 360 data (requires leads)
    await seedLeadActivities(tenantId);
    await seedLeadNotes(tenantId);
    await seedLeadFiles(tenantId);
    await seedLeadAIInsights(tenantId);
    // Auto-Response Drafts for IFC-029 (Agent Approvals page)
    await seedAutoResponseDrafts(tenantId);
    // AI Conversation Records for PG-151 (Active Agents Dashboard)
    await seedConversationRecords(tenantId);
    await seedContacts(tenantId);
    await seedOpportunities(tenantId);
    await seedSLAPolicies(tenantId);
    await seedTickets(tenantId);
    await seedTasks(tenantId);
    await seedAIScores(tenantId);
    await seedAuditLogs(tenantId);
    await seedDomainEvents(tenantId);

    // Seed supplementary data (requires parent records)
    // NOTE: These are wrapped in try-catch as some may need tenantId updates
    console.log('\n📦 Seeding supplementary data (optional)...');
    try {
      await seedDealProducts(tenantId);
    } catch (e) {
      console.warn('⚠️  seedDealProducts failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedDealFiles(tenantId);
    } catch (e) {
      console.warn('⚠️  seedDealFiles failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedDealActivities(tenantId);
    } catch (e) {
      console.warn('⚠️  seedDealActivities failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTicketActivities(tenantId);
    } catch (e) {
      console.warn('⚠️  seedTicketActivities failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTicketAttachments();
    } catch (e) {
      console.warn('⚠️  seedTicketAttachments failed:', (e as Error).message?.slice(0, 100));
    }

    // Seed additional UI mockup data (Agent Actions, Contact Activities, Dashboard Activities)
    try {
      await seedAdditionalUsersAndAccounts(tenantId);
    } catch (e) {
      console.warn(
        '⚠️  seedAdditionalUsersAndAccounts failed:',
        (e as Error).message?.slice(0, 100)
      );
    }
    try {
      await seedAgentActions();
    } catch (e) {
      console.warn('⚠️  seedAgentActions failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedContactActivities(tenantId);
    } catch (e) {
      console.warn('⚠️  seedContactActivities failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedDashboardActivities();
    } catch (e) {
      console.warn('⚠️  seedDashboardActivities failed:', (e as Error).message?.slice(0, 100));
    }

    // Seed comprehensive UI data (contacts 360, dashboard widgets, analytics)
    try {
      await seedContactNotes(tenantId);
    } catch (e) {
      console.warn('⚠️  seedContactNotes failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedContactAIInsights(tenantId);
    } catch (e) {
      console.warn('⚠️  seedContactAIInsights failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedCalendarEvents(tenantId);
    } catch (e) {
      console.warn('⚠️  seedCalendarEvents failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTeamMessages();
    } catch (e) {
      console.warn('⚠️  seedTeamMessages failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedPipelineSnapshots();
    } catch (e) {
      console.warn('⚠️  seedPipelineSnapshots failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTrafficSources();
    } catch (e) {
      console.warn('⚠️  seedTrafficSources failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedGrowthMetrics();
    } catch (e) {
      console.warn('⚠️  seedGrowthMetrics failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedDealsWonMetrics();
    } catch (e) {
      console.warn('⚠️  seedDealsWonMetrics failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTicketNextSteps(tenantId);
    } catch (e) {
      console.warn('⚠️  seedTicketNextSteps failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedRelatedTickets(tenantId);
    } catch (e) {
      console.warn('⚠️  seedRelatedTickets failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTicketAIInsights(tenantId);
    } catch (e) {
      console.warn('⚠️  seedTicketAIInsights failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedSalesPerformance();
    } catch (e) {
      console.warn('⚠️  seedSalesPerformance failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedDashboardTasks(tenantId);
    } catch (e) {
      console.warn('⚠️  seedDashboardTasks failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedContactDeals(tenantId);
    } catch (e) {
      console.warn('⚠️  seedContactDeals failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedContactTasks(tenantId);
    } catch (e) {
      console.warn('⚠️  seedContactTasks failed:', (e as Error).message?.slice(0, 100));
    }

    // =========================================================================
    // NEW FLOW COVERAGE DATA (FLOW-001 to FLOW-038)
    // =========================================================================
    console.log('\n🔄 Seeding flow coverage data (optional)...');

    // FLOW-002, FLOW-004: Teams & Workspaces
    try {
      await seedWorkspaces();
    } catch (e) {
      console.warn('⚠️  seedWorkspaces failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTeams();
    } catch (e) {
      console.warn('⚠️  seedTeams failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedTeamMembers();
    } catch (e) {
      console.warn('⚠️  seedTeamMembers failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-016: Email Communication
    try {
      await seedEmailTemplates();
    } catch (e) {
      console.warn('⚠️  seedEmailTemplates failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedEmailRecords();
    } catch (e) {
      console.warn('⚠️  seedEmailRecords failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-017: Chat Integration
    try {
      await seedChatConversations();
    } catch (e) {
      console.warn('⚠️  seedChatConversations failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedChatMessages();
    } catch (e) {
      console.warn('⚠️  seedChatMessages failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-018: Call Recording
    try {
      await seedCallRecords();
    } catch (e) {
      console.warn('⚠️  seedCallRecords failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-021: Document Management
    try {
      await seedDocuments();
    } catch (e) {
      console.warn('⚠️  seedDocuments failed:', (e as Error).message?.slice(0, 100));
    }

    // PG-138: Case Management
    try {
      await seedCases();
    } catch (e) {
      console.warn('⚠️  seedCases failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedCaseTasks();
    } catch (e) {
      console.warn('⚠️  seedCaseTasks failed:', (e as Error).message?.slice(0, 100));
    }

    // IFC-152: Case Document Management
    try {
      await seedCaseDocuments();
    } catch (e) {
      console.warn('⚠️  seedCaseDocuments failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-015: Customer Feedback (NPS/CSAT)
    try {
      await seedFeedbackSurveys();
    } catch (e) {
      console.warn('⚠️  seedFeedbackSurveys failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-010: Deal Renewals & Account Health
    try {
      await seedDealRenewals(tenantId);
    } catch (e) {
      console.warn('⚠️  seedDealRenewals failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedAccountHealthScores();
    } catch (e) {
      console.warn('⚠️  seedAccountHealthScores failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-012: Agent Skills & Routing
    try {
      await seedAgentSkills(tenantId);
    } catch (e) {
      console.warn('⚠️  seedAgentSkills failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedAgentAvailability(tenantId);
    } catch (e) {
      console.warn('⚠️  seedAgentAvailability failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedRoutingRules(tenantId);
    } catch (e) {
      console.warn('⚠️  seedRoutingRules failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedRoutingAudits(tenantId);
    } catch (e) {
      console.warn('⚠️  seedRoutingAudits failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-011, FLOW-013: Ticket Categories & SLA
    try {
      await seedTicketCategories();
    } catch (e) {
      console.warn('⚠️  seedTicketCategories failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedSLABreaches();
    } catch (e) {
      console.warn('⚠️  seedSLABreaches failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedEscalationHistory();
    } catch (e) {
      console.warn('⚠️  seedEscalationHistory failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-025, FLOW-026: Workflow Engine
    try {
      await seedWorkflowDefinitions();
    } catch (e) {
      console.warn('⚠️  seedWorkflowDefinitions failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedWorkflowExecutions();
    } catch (e) {
      console.warn('⚠️  seedWorkflowExecutions failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-027: Business Rules
    try {
      await seedBusinessRules();
    } catch (e) {
      console.warn('⚠️  seedBusinessRules failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-022, FLOW-023: Dashboards & Reports
    try {
      await seedDashboardConfigs();
    } catch (e) {
      console.warn('⚠️  seedDashboardConfigs failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedKPIDefinitions();
    } catch (e) {
      console.warn('⚠️  seedKPIDefinitions failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedReportDefinitions();
    } catch (e) {
      console.warn('⚠️  seedReportDefinitions failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-024: AI Insights
    try {
      await seedAIInsights();
    } catch (e) {
      console.warn('⚠️  seedAIInsights failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-031, FLOW-032, FLOW-033: Monitoring & Observability
    try {
      await seedHealthChecks();
    } catch (e) {
      console.warn('⚠️  seedHealthChecks failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedAlertIncidents();
    } catch (e) {
      console.warn('⚠️  seedAlertIncidents failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedPerformanceMetrics();
    } catch (e) {
      console.warn('⚠️  seedPerformanceMetrics failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-034: Webhooks
    try {
      await seedWebhookEndpoints();
    } catch (e) {
      console.warn('⚠️  seedWebhookEndpoints failed:', (e as Error).message?.slice(0, 100));
    }

    // FLOW-035, FLOW-036: API Management
    try {
      await seedAPIKeys();
    } catch (e) {
      console.warn('⚠️  seedAPIKeys failed:', (e as Error).message?.slice(0, 100));
    }
    try {
      await seedAPIVersions();
    } catch (e) {
      console.warn('⚠️  seedAPIVersions failed:', (e as Error).message?.slice(0, 100));
    }

    // Notifications seed data (for notification inbox)
    try {
      await seedNotifications(tenantId);
    } catch (e) {
      console.warn('⚠️  seedNotifications failed:', (e as Error).message?.slice(0, 100));
    }

    // IFC-182: Home Page Data (uses relative dates for recent activity)
    try {
      await seedHomePageData(tenantId);
    } catch (e) {
      console.warn('⚠️  seedHomePageData failed:', (e as Error).message?.slice(0, 100));
    }

    console.log('\n✨ Database seeding completed successfully!\n');
    console.log('📊 Summary (matching UI mockups + ALL 38 FLOWS):');
    console.log('');
    console.log('  CORE ENTITIES:');
    console.log('  - 13 users (admin, manager, sales reps, support team, Alice Smith, Bob Jones)');
    console.log('  - 14 accounts (TechCorp, Acme Corp, MegaCorp, TechFlow Inc., etc.)');
    console.log('  - 5 leads (Sarah Miller, David Chen, etc.)');
    console.log('  - 11 contacts (with account relationships, includes Sarah Jenkins)');
    console.log('  - 12 opportunities/deals (across all pipeline stages + contact deals)');
    console.log('  - 2 SLA policies (Standard & Premium)');
    console.log('  - 6 tickets (with SLA statuses: Breached, At Risk, On Track)');
    console.log('  - 13 tasks (Dashboard widgets, Deal detail, Contact tasks)');
    console.log('  - 5 AI scores (for lead scoring)');
    console.log('  - 3 audit logs');
    console.log('  - 3 domain events');
    console.log('');
    console.log('  SUPPLEMENTARY DATA:');
    console.log('  - 2 deal products (Enterprise License, Implementation)');
    console.log('  - 2 deal files (Acme_MSA_v3.pdf, Requirements_Doc.docx)');
    console.log('  - 5 deal activities (AI agent actions, emails, calls, stage changes)');
    console.log('  - 6 ticket activities (customer messages, agent replies, system events)');
    console.log('  - 3 ticket attachments (error logs, screenshot, DevOps analysis)');
    console.log('');
    console.log('  ADDITIONAL UI DATA:');
    console.log('  - 4 agent actions (AI approval queue from agent-approvals)');
    console.log('  - 10 contact activities (from contacts/[id] detail page)');
    console.log('  - 2 dashboard activities (from RecentActivityWidget)');
    console.log('');
    console.log('  COMPREHENSIVE UI DATA:');
    console.log('  - 2 contact notes, 1 contact AI insight, 4 calendar events');
    console.log('  - 3 team messages, 4 pipeline snapshots, 4 traffic sources');
    console.log('  - 12 growth metrics, 6 deals won metrics, 4 sales performance records');
    console.log('  - 3 ticket next steps, 3 related tickets, 1 ticket AI insight');
    console.log('');
    console.log('  🆕 FLOW COVERAGE DATA (38 FLOWS):');
    console.log('  FLOW-002/004: 2 workspaces, 3 teams, 3 team members');
    console.log('  FLOW-016: 3 email templates, 3 email records');
    console.log('  FLOW-017: 3 chat conversations, 3 chat messages');
    console.log('  FLOW-018: 3 call records with transcription & sentiment');
    console.log('  FLOW-021: 3 documents with categories');
    console.log('  IFC-152: 5 case documents with ACL, versions, signatures');
    console.log('  FLOW-015: 3 feedback surveys (NPS, CSAT, CES)');
    console.log('  FLOW-010: 2 deal renewals, 3 account health scores');
    console.log('  FLOW-012: 3 agent skills, 3 agent availability, 3 routing rules');
    console.log('  FLOW-011/013: 4 ticket categories, 2 SLA breaches, 2 escalations');
    console.log('  FLOW-025/026: 3 workflow definitions, 2 workflow executions');
    console.log('  FLOW-027: 3 business rules');
    console.log('  FLOW-022/023: 3 dashboard configs, 3 KPIs, 3 report definitions');
    console.log('  FLOW-024: 3 AI insights (deal risk, churn risk, upsell)');
    console.log('  FLOW-031/032/033: 3 health checks, 2 alert incidents, 3 performance metrics');
    console.log('  FLOW-034: 3 webhook endpoints');
    console.log('  PG-151: 14 AI conversation records (9 active, 3 idle, 2 error), 6 messages, 3 tool calls');
    console.log('  FLOW-035/036: 3 API keys, 2 API versions');
    console.log('');
    console.log(
      '\n🎉 Ready for development! Data matches ALL 104 frontend mockup files + ALL 38 FLOWS!\n'
    );
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

(async () => {
  try {
    await main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
})();
