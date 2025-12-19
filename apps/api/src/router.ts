/**
 * App Router
 *
 * This is the main tRPC router that combines all module routers.
 * It provides the complete API surface for IntelliFlow CRM.
 */

import { router } from './server';
import { leadRouter } from './modules/lead/lead.router';
import { contactRouter } from './modules/contact/contact.router';
import { accountRouter } from './modules/account/account.router';
import { opportunityRouter } from './modules/opportunity/opportunity.router';
import { taskRouter } from './modules/task/task.router';

/**
 * Main application router
 *
 * All module routers are namespaced under their respective keys:
 * - lead.*         - Lead management endpoints
 * - contact.*      - Contact management endpoints
 * - account.*      - Account management endpoints
 * - opportunity.*  - Opportunity/deal management endpoints
 * - task.*         - Task management endpoints
 *
 * Future routers to add:
 * - ai.*           - AI/intelligence endpoints
 * - analytics.*    - Analytics and reporting
 * - workflow.*     - Workflow automation
 * - email.*        - Email integration
 */
export const appRouter = router({
  lead: leadRouter,
  contact: contactRouter,
  account: accountRouter,
  opportunity: opportunityRouter,
  task: taskRouter,
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
