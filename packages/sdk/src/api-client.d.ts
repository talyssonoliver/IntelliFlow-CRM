/**
 * Type declarations for @intelliflow/api-client
 *
 * This file provides type declarations since the api-client package
 * doesn't generate .d.ts files in its build.
 */

declare module '@intelliflow/api-client' {
  import type { QueryClient } from '@tanstack/react-query';

  // Vanilla client
  export interface TRPCClientConfig {
    url: string;
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
    fetch?: typeof fetch;
  }

  export function createTRPCClient(config: TRPCClientConfig): any;

  // React client
  export interface TRPCProviderProps {
    children: React.ReactNode;
    url: string;
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
    queryClient?: QueryClient;
  }

  export const trpc: any;
  export function TRPCProvider(props: TRPCProviderProps): JSX.Element;

  // Type re-exports
  export type AppRouter = any;

  // Lead types
  export type CreateLeadInput = any;
  export type UpdateLeadInput = any;
  export type LeadQueryInput = any;
  export type LeadResponse = any;
  export type LeadListResponse = any;
  export type LeadStatus = string;
  export type LeadSource = string;

  // Contact types
  export type CreateContactInput = any;
  export type UpdateContactInput = any;
  export type ContactQueryInput = any;
  export type ContactResponse = any;
  export type ContactListResponse = any;

  // Account types
  export type CreateAccountInput = any;
  export type UpdateAccountInput = any;
  export type AccountQueryInput = any;
  export type AccountResponse = any;
  export type AccountListResponse = any;

  // Opportunity types
  export type CreateOpportunityInput = any;
  export type UpdateOpportunityInput = any;
  export type OpportunityQueryInput = any;
  export type OpportunityResponse = any;
  export type OpportunityListResponse = any;
  export type OpportunityStage = string;

  // Task types
  export type CreateTaskInput = any;
  export type UpdateTaskInput = any;
  export type TaskQueryInput = any;
  export type TaskResponse = any;
  export type TaskListResponse = any;
  export type TaskStatus = string;
  export type TaskPriority = string;
  export type CompleteTaskInput = any;

  // Common types
  export type PaginationInput = any;
  export type DateRangeInput = any;
  export type SearchInput = any;
  export type ApiError = any;
  export type Metadata = any;
}
