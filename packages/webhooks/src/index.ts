/**
 * @intelliflow/webhooks
 *
 * Comprehensive webhook framework for building secure webhook endpoints
 *
 * Features:
 * - Multi-source webhook handling (Stripe, GitHub, SendGrid, custom)
 * - Automatic signature verification
 * - Idempotency with 24h TTL cache
 * - Retry mechanism with exponential backoff
 * - Dead Letter Queue pattern
 * - Metrics and observability
 *
 * @module @intelliflow/webhooks
 */

export * from './framework';
