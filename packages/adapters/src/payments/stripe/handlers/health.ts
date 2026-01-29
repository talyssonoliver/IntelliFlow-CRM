/**
 * Stripe Health Check Operations
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { StripeConfig } from '../types';
import { makeRequest } from '../http-client';

export async function checkConnection(
  config: StripeConfig
): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>> {
  const start = Date.now();

  try {
    const response = await makeRequest(config, 'GET', '/balance');
    const latencyMs = Date.now() - start;

    if (response.isFailure) {
      return Result.ok({
        status: 'unhealthy',
        latencyMs,
      });
    }

    return Result.ok({
      status: latencyMs < 1000 ? 'healthy' : 'degraded',
      latencyMs,
    });
  } catch {
    return Result.ok({
      status: 'unhealthy',
      latencyMs: Date.now() - start,
    });
  }
}
