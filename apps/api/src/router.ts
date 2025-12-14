/**
 * App Router
 *
 * This is the main tRPC router that combines all module routers.
 * It provides the complete API surface for IntelliFlow CRM.
 */

import { router } from './server';
import { leadRouter } from './modules/lead/lead.router';
import { contactRouter } from './modules/contact/contact.router';

/**
 * Main application router
 *
 * All module routers are namespaced under their respective keys:
 * - lead.*    - Lead management endpoints
 * - contact.* - Contact management endpoints
 *
 * Future routers to add:
 * - account.* - Account management
 * - opportunity.* - Opportunity/deal management
 * - task.* - Task management
 * - ai.* - AI/intelligence endpoints
 * - analytics.* - Analytics and reporting
 */
export const appRouter = router({
  lead: leadRouter,
  contact: contactRouter,
  // Future routers will be added here:
  // account: accountRouter,
  // opportunity: opportunityRouter,
  // task: taskRouter,
  // ai: aiRouter,
  // analytics: analyticsRouter,
});

/**
 * Export type definition of the API
 * This type will be used by the frontend to get full type safety
 */
export type AppRouter = typeof appRouter;
