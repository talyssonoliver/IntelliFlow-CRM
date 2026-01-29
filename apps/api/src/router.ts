/**
 * App Router
 *
 * This is the main tRPC router that combines all module routers.
 * It provides the complete API surface for IntelliFlow CRM.
 */

import { createTRPCRouter } from './trpc';
import { leadRouter } from './modules/lead/lead.router';
import { contactRouter } from './modules/contact/contact.router';
import { accountRouter } from './modules/account/account.router';
import { opportunityRouter } from './modules/opportunity/opportunity.router';
import { pipelineConfigRouter } from './modules/opportunity/pipeline-config.router';
import { taskRouter } from './modules/task/task.router';
import { ticketRouter } from './modules/ticket/ticket.router';
import { analyticsRouter } from './modules/analytics/analytics.router';
import { healthRouter } from './modules/misc/health.router';
import { systemRouter } from './modules/misc/system.router';
import { timelineRouter } from './modules/misc/timeline.router';
import subscriptionRouter from './shared/subscription-demo';
import { appointmentsRouter } from './modules/legal/appointments.router';
import { documentsRouter } from './modules/legal/documents.router';
import { agentRouter } from './modules/agent/agent.router';
import { auditRouter } from './modules/security/audit.router';
import { authRouter } from './modules/auth/auth.router';
import { billingRouter } from './modules/billing/billing.router';
import { integrationsRouter } from './modules/integrations/integrations.router';

/**
 * Main application router
 *
 * All module routers are namespaced under their respective keys:
 *
 * Core CRM Modules:
 * - lead.*         - Lead management endpoints
 * - contact.*      - Contact management endpoints
 * - account.*      - Account management endpoints
 * - opportunity.*  - Opportunity/deal management endpoints
 * - task.*         - Task management endpoints
 *
 * System & Monitoring:
 * - health.*       - Health check and diagnostics endpoints
 * - system.*       - System information and configuration
 *
 * Real-Time Features:
 * - subscriptions.* - WebSocket subscriptions for real-time updates
 *
 * AI & Automation:
 * - agent.*        - AI agent tools and approval workflow (IFC-139)
 *
 * Security & Compliance:
 * - audit.*        - Audit logs and security events (IFC-098)
 *
 * Analytics & Reporting:
 * - analytics.*    - Dashboard analytics and metrics
 * - ticket.*       - Support ticket management
 *
 * External Integrations:
 * - integrations.* - ERP, Payment, Email, Messaging connectors (IFC-099)
 *
 * Future routers to add:
 * - workflow.*     - Workflow automation
 */
export const appRouter = createTRPCRouter({
  // Authentication & Authorization
  auth: authRouter,

  // Billing & Subscriptions
  billing: billingRouter,

  // Core CRM entities
  lead: leadRouter,
  contact: contactRouter,
  account: accountRouter,
  opportunity: opportunityRouter,
  pipelineConfig: pipelineConfigRouter,
  task: taskRouter,
  ticket: ticketRouter,

  // Analytics & Reporting
  analytics: analyticsRouter,

  // Legal domain
  appointments: appointmentsRouter,
  documents: documentsRouter,

  // AI & Automation
  agent: agentRouter,

  // Security & Compliance
  audit: auditRouter,

  // System utilities
  health: healthRouter,
  system: systemRouter,
  timeline: timelineRouter,

  // Real-time subscriptions
  subscriptions: subscriptionRouter,

  // External Integrations (IFC-099)
  integrations: integrationsRouter,
});

/**
 * Export type definition of the API
 * This type will be used by the frontend to get full type safety
 */
export type AppRouter = typeof appRouter;
