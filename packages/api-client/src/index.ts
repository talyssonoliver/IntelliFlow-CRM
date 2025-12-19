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

// Re-export useful types - Lead
export type {
  CreateLeadInput,
  UpdateLeadInput,
  LeadQueryInput,
  LeadResponse,
  LeadListResponse,
  LeadSource,
  LeadStatus,
} from '@intelliflow/validators/lead';

// Re-export useful types - Contact
export type {
  CreateContactInput,
  UpdateContactInput,
  ContactQueryInput,
  ContactResponse,
  ContactListResponse,
} from '@intelliflow/validators/contact';

// Re-export useful types - Account
export type {
  CreateAccountInput,
  UpdateAccountInput,
  AccountQueryInput,
  AccountResponse,
  AccountListResponse,
} from '@intelliflow/validators/account';

// Re-export useful types - Opportunity
export type {
  CreateOpportunityInput,
  UpdateOpportunityInput,
  OpportunityQueryInput,
  OpportunityResponse,
  OpportunityListResponse,
  OpportunityStage,
} from '@intelliflow/validators/opportunity';

// Re-export useful types - Task
export type {
  CreateTaskInput,
  UpdateTaskInput,
  TaskQueryInput,
  TaskResponse,
  TaskListResponse,
  TaskPriority,
  TaskStatus,
  CompleteTaskInput,
} from '@intelliflow/validators/task';

// Re-export common types
export type {
  PaginationInput,
  DateRangeInput,
  SearchInput,
  ApiError,
  Metadata,
} from '@intelliflow/validators/common';
