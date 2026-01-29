/**
 * Type declarations for @intelliflow/application
 *
 * This is a temporary stub until the package builds successfully.
 * TODO: Remove this file once @intelliflow/application builds with proper types
 */

declare module '@intelliflow/application' {
  // Allow any exports from the built package
  export * from '@intelliflow/application/dist/index';

  // Re-export commonly used service types with permissive signatures
  export class LeadService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class ContactService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class AccountService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class OpportunityService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class TaskService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class TicketService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class AnalyticsService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class IngestionOrchestrator {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export interface IngestionResult {
    success: boolean;
    documentId?: string;
    duplicate?: boolean;
    error?: string;
  }
}
