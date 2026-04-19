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

// ============================================================================
// Retraining Triggers Counter
// ============================================================================

/** In-process counter incremented each time a retraining threshold is breached. */
let retrainingTriggersTotal = 0;
const retrainingTriggersByUrgency: Record<string, number> = {};

/**
 * Increment the retraining triggers counter.
 * Called by the feedback-analytics job handler on every threshold breach.
 *
 * @param labels  Optional label set (urgency level)
 */
export function incrementRetrainingTriggers(labels?: { urgency?: string }): void {
  retrainingTriggersTotal += 1;
  if (labels?.urgency) {
    retrainingTriggersByUrgency[labels.urgency] =
      (retrainingTriggersByUrgency[labels.urgency] ?? 0) + 1;
  }
}

/**
 * Returns Prometheus text for the retraining triggers counter.
 * Exposed separately so it can be included in `getAllMetrics()`.
 */
export function getRetrainingTriggerMetrics(): string {
  let out = '';
  out +=
    '# HELP intelliflow_ai_retraining_triggers_total Total AI retraining threshold breaches detected\n';
  out += '# TYPE intelliflow_ai_retraining_triggers_total counter\n';
  out += `intelliflow_ai_retraining_triggers_total ${retrainingTriggersTotal}\n`;
  for (const [urgency, count] of Object.entries(retrainingTriggersByUrgency)) {
    out += `intelliflow_ai_retraining_triggers_total{urgency="${urgency}"} ${count}\n`;
  }
  return out;
}

/** Reset counters — test helper only. */
export function _resetRetrainingTriggerCounters(): void {
  retrainingTriggersTotal = 0;
  for (const key of Object.keys(retrainingTriggersByUrgency)) {
    delete retrainingTriggersByUrgency[key];
  }
}

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
export function authenticateMetricsRequest(authHeader: string | undefined): boolean {
  if (!authHeader) return false;
  const token = authHeader.replaceAll('Bearer ', '');
  return token === getMetricsToken();
}

/**
 * Build Prometheus-formatted metrics response
 */
export function buildMetricsResponse(): MetricsResponse {
  const metrics = getAllMetrics() + '\n' + getRetrainingTriggerMetrics();

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
