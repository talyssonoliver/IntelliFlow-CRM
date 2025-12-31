/**
 * Type declarations for @intelliflow/adapters
 *
 * This is a temporary stub until the package builds successfully.
 * TODO: Remove this file once @intelliflow/adapters builds with proper types
 */

declare module '@intelliflow/adapters' {
  // Allow any exports from the built package
  export * from '@intelliflow/adapters/dist/index';

  // Re-export commonly used types with permissive signatures
  export class PrismaLeadRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class PrismaContactRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class PrismaAccountRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class PrismaOpportunityRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class PrismaTaskRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class PrismaCaseDocumentRepository {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class InMemoryEventBus {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class MockAIService {
    constructor(...args: any[]);
    [key: string]: any;
  }

  export class InMemoryCache {
    constructor(...args: any[]);
    [key: string]: any;
  }
}
