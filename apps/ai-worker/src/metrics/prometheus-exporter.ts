/**
 * Prometheus Metrics Exporter
 *
 * Exposes AI monitoring metrics in Prometheus text format
 * via an authenticated HTTP endpoint.
 *
 * @module prometheus-exporter
 * @task IFC-117
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { getAllMetrics, getMonitoringStatus } from '../monitoring';

export interface MetricsResponse {
  contentType: string;
  body: string;
  statusCode: number;
}

/**
 * Get the configured metrics token (read at call time for testability)
 */
function getMetricsToken(): string {
  return process.env.METRICS_TOKEN || 'default-dev-token';
}

/**
 * Authenticate a metrics request using Bearer token
 */
export function authenticateMetricsRequest(
  authHeader: string | undefined
): boolean {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '');
  return token === getMetricsToken();
}

/**
 * Build Prometheus-formatted metrics response
 */
export function buildMetricsResponse(): MetricsResponse {
  const metrics = getAllMetrics();

  return {
    contentType: 'text/plain; charset=utf-8',
    body: metrics,
    statusCode: 200,
  };
}

/**
 * Build JSON health/status response
 */
export function buildStatusResponse(): MetricsResponse {
  const status = getMonitoringStatus();

  return {
    contentType: 'application/json',
    body: JSON.stringify(status),
    statusCode: status.healthy ? 200 : 503,
  };
}

/**
 * Express-compatible request handler for /metrics endpoint
 */
export function getMetricsHandler(): (
  req: IncomingMessage & { headers: Record<string, string | undefined> },
  res: ServerResponse & {
    status?: (code: number) => ServerResponse;
    setHeader: (key: string, value: string) => void;
    json?: (data: unknown) => void;
    end: (body?: string) => void;
    statusCode: number;
  }
) => void {
  return (req, res) => {
    // Authentication
    if (!authenticateMetricsRequest(req.headers.authorization)) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    // Return Prometheus format
    const response = buildMetricsResponse();
    res.statusCode = response.statusCode;
    res.setHeader('Content-Type', response.contentType);
    res.end(response.body);
  };
}

/**
 * Express-compatible request handler for /metrics/status endpoint
 */
export function getStatusHandler(): (
  req: IncomingMessage,
  res: ServerResponse & {
    setHeader: (key: string, value: string) => void;
    end: (body?: string) => void;
    statusCode: number;
  }
) => void {
  return (_req, res) => {
    const response = buildStatusResponse();
    res.statusCode = response.statusCode;
    res.setHeader('Content-Type', response.contentType);
    res.end(response.body);
  };
}
