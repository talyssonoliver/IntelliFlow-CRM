/**
 * External Service Wrapper
 *
 * Utility functions for wrapping external service calls with proper error handling.
 * Uses ExternalServiceError from application layer for consistent error mapping.
 *
 * Usage:
 *   const result = await wrapExternalServiceCall(
 *     () => fetch('https://api.example.com/data'),
 *     'ExampleAPI'
 *   );
 */

import { mapErrorToTRPCError } from './error-mapper';

/**
 * Wraps an external service call with error handling
 * Throws ExternalServiceError on failure, which maps to SERVICE_UNAVAILABLE
 *
 * @param serviceCall - Async function making the external API call
 * @param serviceName - Name of the external service for error messages
 * @returns The result of the service call
 * @throws ExternalServiceError mapped to TRPCError with SERVICE_UNAVAILABLE code
 */
export async function wrapExternalServiceCall<T>(
  serviceCall: () => Promise<T>,
  serviceName: string
): Promise<T> {
  try {
    return await serviceCall();
  } catch (error) {
    // Import ExternalServiceError from application layer
    // Use dynamic import and cast to handle tsup module resolution
    const app = await import('@intelliflow/application');
    const ExternalServiceError = (app as any).ExternalServiceError;

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExternalServiceError(`${serviceName} service failed: ${errorMessage}`);
  }
}

/**
 * Wraps an external service call with timeout
 * Useful for preventing hanging requests to external services
 *
 * @param serviceCall - Async function making the external API call
 * @param serviceName - Name of the external service
 * @param timeoutMs - Timeout in milliseconds (default: 30000)
 * @returns The result of the service call
 * @throws ExternalServiceError on timeout or failure
 */
export async function wrapExternalServiceCallWithTimeout<T>(
  serviceCall: () => Promise<T>,
  serviceName: string,
  timeoutMs: number = 30000
): Promise<T> {
  const app = await import('@intelliflow/application');
  const ExternalServiceError = (app as any).ExternalServiceError;

  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new ExternalServiceError(`${serviceName} service timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([serviceCall(), timeoutPromise]);
  } catch (error) {
    // If error is already ExternalServiceError, rethrow
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as any).code === 'EXTERNAL_SERVICE_ERROR'
    ) {
      throw error;
    }

    // Wrap other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExternalServiceError(`${serviceName} service failed: ${errorMessage}`);
  }
}

/**
 * Example usage for Stripe API calls
 */
export async function callStripeAPI<T>(apiCall: () => Promise<T>): Promise<T> {
  return wrapExternalServiceCallWithTimeout(apiCall, 'Stripe', 10000);
}

/**
 * Example usage for OpenAI API calls
 */
export async function callOpenAI<T>(apiCall: () => Promise<T>): Promise<T> {
  return wrapExternalServiceCallWithTimeout(apiCall, 'OpenAI', 60000);
}

/**
 * Example usage for SendGrid API calls
 */
export async function callSendGrid<T>(apiCall: () => Promise<T>): Promise<T> {
  return wrapExternalServiceCallWithTimeout(apiCall, 'SendGrid', 15000);
}

/**
 * Example usage for Twilio API calls
 */
export async function callTwilio<T>(apiCall: () => Promise<T>): Promise<T> {
  return wrapExternalServiceCallWithTimeout(apiCall, 'Twilio', 10000);
}

/**
 * Retry wrapper for external service calls with exponential backoff
 *
 * @param serviceCall - Async function making the external API call
 * @param serviceName - Name of the external service
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns The result of the service call
 * @throws ExternalServiceError after max retries exceeded
 */
export async function wrapExternalServiceCallWithRetry<T>(
  serviceCall: () => Promise<T>,
  serviceName: string,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  const app = await import('@intelliflow/application');
  const ExternalServiceError = (app as any).ExternalServiceError;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await serviceCall();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delayMs = initialDelayMs * Math.pow(2, attempt);
      console.warn(
        `[ExternalService] ${serviceName} failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delayMs}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // All retries exhausted
  throw new ExternalServiceError(
    `${serviceName} service failed after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`
  );
}
