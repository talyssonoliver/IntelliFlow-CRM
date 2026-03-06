/**
 * External Service Wrapper
 *
 * Utility functions for wrapping external service calls with proper error handling.
 * Uses ExternalServiceError from application layer for consistent error mapping.
 */

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
