/**
 * AI Worker Metrics Module
 *
 * Exports Prometheus metrics endpoint handlers for AI monitoring.
 *
 * @module metrics
 * @task IFC-117
 */

export {
  getMetricsHandler,
  getStatusHandler,
  authenticateMetricsRequest,
  buildMetricsResponse,
  buildStatusResponse,
  type MetricsResponse,
} from './prometheus-exporter';
