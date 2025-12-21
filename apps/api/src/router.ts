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
import { taskRouter } from './modules/task/task.router';
import { healthRouter } from './modules/misc/health.router';
import { systemRouter } from './modules/misc/system.router';
import subscriptionRouter from './shared/subscription-demo';

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
 * Future routers to add:
 * - ai.*           - AI/intelligence endpoints
 * - analytics.*    - Analytics and reporting
 * - workflow.*     - Workflow automation
 * - email.*        - Email integration
 */
export const appRouter = createTRPCRouter({
  // Core CRM entities
  lead: leadRouter,
  contact: contactRouter,
  account: accountRouter,
  opportunity: opportunityRouter,
  task: taskRouter,

  // System utilities
  health: healthRouter,
  system: systemRouter,

  // Real-time subscriptions
  subscriptions: subscriptionRouter,

  // Future routers will be added here:
  // ai: aiRouter,
  // analytics: analyticsRouter,
  // workflow: workflowRouter,
  // email: emailRouter,
});

/**
 * Export type definition of the API
 * This type will be used by the frontend to get full type safety
 */
export type AppRouter = typeof appRouter;
