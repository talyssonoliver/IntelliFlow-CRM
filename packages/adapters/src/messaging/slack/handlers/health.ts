/**
 * Slack Health Check Handler
 */

import { Result, DomainError } from '@intelliflow/domain';
import type { SlackConfig } from '../types';
import { makeRequest } from '../http-client';

export async function checkConnection(
  config: SlackConfig
): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>> {
  const start = Date.now();

  try {
    const response = await makeRequest(config, 'GET', '/auth.test', {});
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
