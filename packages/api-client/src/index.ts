/**
 * tRPC API Client Package
 *
 * This package provides type-safe API clients for IntelliFlow CRM:
 * - Vanilla tRPC client for server-side use
 * - React Query hooks for client-side use
 * - Type exports for full end-to-end type safety
 */

export { createTRPCClient } from './vanilla-client';
export { trpc, TRPCProvider, type TRPCProviderProps } from './react-client';
export type { AppRouter } from '@intelliflow/api';

// Re-export useful types
export type {
  CreateLeadInput,
  UpdateLeadInput,
  LeadQueryInput,
  LeadResponse,
  LeadListResponse,
  LeadSource,
  LeadStatus,
} from '@intelliflow/validators/lead';

export type {
  CreateContactInput,
  UpdateContactInput,
  ContactQueryInput,
  ContactResponse,
  ContactListResponse,
} from '@intelliflow/validators/contact';
