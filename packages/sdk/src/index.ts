/**
 * IntelliFlow SDK
 *
 * Official TypeScript SDK for IntelliFlow CRM.
 * Provides fully-typed API clients with end-to-end type safety using tRPC.
 *
 * This package re-exports the api-client functionality with additional
 * convenience utilities and documentation.
 *
 * @packageDocumentation
 */

// Re-export everything from api-client
export * from '@intelliflow/api-client';

// Import createTRPCClient for SDK factory function
import { createTRPCClient, type TRPCProviderProps } from '@intelliflow/api-client';

/**
 * Type for the IntelliFlow SDK client
 * Inferred from createTRPCClient return type
 */
export type IntelliFlowClient = ReturnType<typeof createTRPCClient>;

// SDK Version
export const SDK_VERSION = '0.1.0';

/**
 * SDK Configuration options
 */
export interface SDKConfig {
  /**
   * The base URL of the IntelliFlow API
   * @example "https://api.intelliflow.com" or "http://localhost:3000/api/trpc"
   */
  apiUrl: string;

  /**
   * Authentication token or function to retrieve token
   */
  auth?: string | (() => string | Promise<string>);

  /**
   * Optional custom fetch implementation
   */
  fetch?: typeof globalThis.fetch;

  /**
   * Enable debug logging
   * @default false
   */
  debug?: boolean;
}

/**
 * Create an IntelliFlow SDK client with simplified configuration
 *
 * @example
 * ```typescript
 * import { createIntelliFlowSDK } from '@intelliflow/sdk';
 *
 * const sdk = createIntelliFlowSDK({
 *   apiUrl: 'https://api.intelliflow.com',
 *   auth: () => getAuthToken(),
 * });
 *
 * // Use the SDK
 * const leads = await sdk.lead.list.query({ page: 1, limit: 20 });
 * ```
 */
export function createIntelliFlowSDK(config: SDKConfig): IntelliFlowClient {
  const headers = async (): Promise<Record<string, string>> => {
    const result: Record<string, string> = {};

    if (config.auth) {
      const token = typeof config.auth === 'function' ? await config.auth() : config.auth;
      result.authorization = `Bearer ${token}`;
    }

    return result;
  };

  const client = createTRPCClient({
    url: config.apiUrl,
    headers,
    fetch: config.fetch,
  });

  if (config.debug) {
    console.log('[IntelliFlow SDK] Initialized with config:', {
      apiUrl: config.apiUrl,
      hasAuth: !!config.auth,
      version: SDK_VERSION,
    });
  }

  return client;
}

// Re-export domain constants for validation helpers
import {
  LEAD_STATUSES,
  LEAD_SOURCES,
} from '@intelliflow/domain';
import { OPPORTUNITY_STAGES } from '@intelliflow/domain';
import { TASK_STATUSES, TASK_PRIORITIES } from '@intelliflow/domain';

// Re-export domain constants
export { LEAD_STATUSES, LEAD_SOURCES } from '@intelliflow/domain';
export { OPPORTUNITY_STAGES } from '@intelliflow/domain';
export { TASK_STATUSES, TASK_PRIORITIES } from '@intelliflow/domain';

/**
 * Helper to check if a value is a valid lead status
 * @param status - The status string to validate
 * @returns true if the status is valid
 */
export function isValidLeadStatus(status: string): status is (typeof LEAD_STATUSES)[number] {
  return (LEAD_STATUSES as readonly string[]).includes(status);
}

/**
 * Helper to check if a value is a valid lead source
 * @param source - The source string to validate
 * @returns true if the source is valid
 */
export function isValidLeadSource(source: string): source is (typeof LEAD_SOURCES)[number] {
  return (LEAD_SOURCES as readonly string[]).includes(source);
}

/**
 * Helper to check if a value is a valid opportunity stage
 * @param stage - The stage string to validate
 * @returns true if the stage is valid
 */
export function isValidOpportunityStage(stage: string): stage is (typeof OPPORTUNITY_STAGES)[number] {
  return (OPPORTUNITY_STAGES as readonly string[]).includes(stage);
}

/**
 * Helper to check if a value is a valid task status
 * @param status - The status string to validate
 * @returns true if the status is valid
 */
export function isValidTaskStatus(status: string): status is (typeof TASK_STATUSES)[number] {
  return (TASK_STATUSES as readonly string[]).includes(status);
}

/**
 * Helper to check if a value is a valid task priority
 * @param priority - The priority string to validate
 * @returns true if the priority is valid
 */
export function isValidTaskPriority(priority: string): priority is (typeof TASK_PRIORITIES)[number] {
  return (TASK_PRIORITIES as readonly string[]).includes(priority);
}
