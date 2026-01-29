/**
 * Cases Router - STUB
 *
 * This router is stubbed pending Prisma schema integration for the legal domain.
 * The Case and CaseTask models need to be added to the Prisma schema before
 * this router can be fully implemented.
 *
 * TODO: Implement when legal domain models are added to Prisma:
 * - Case model with status, deadlines, client relationship
 * - CaseTask model for case-related tasks
 * - @intelliflow/validators/case schema
 */

import { createTRPCRouter } from '../../trpc.js';

// Stubbed router - will be implemented when legal domain models exist
export const casesRouter = createTRPCRouter({
  // Placeholder - no procedures until Prisma models exist
});

// Export type for use in merged router
export type CasesRouter = typeof casesRouter;
