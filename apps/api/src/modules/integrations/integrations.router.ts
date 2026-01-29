/**
 * Integrations Router
 *
 * Provides type-safe tRPC endpoints for managing external integrations:
 * - Connector health status
 * - ERP sync operations
 * - Email gateway status
 * - Messaging integration status
 *
 * @implements IFC-099 (ERP/Payment/Email Connectors)
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, protectedProcedure, publicProcedure } from '../../trpc';

// ============================================
// Types
// ============================================

export interface ConnectorHealthStatus {
  id: string;
  name: string;
  type: 'erp' | 'payment' | 'email' | 'messaging';
  provider: string;
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  latencyMs: number | null;
  lastCheckedAt: Date;
  errorMessage?: string;
}

export interface ConnectorSyncResult {
  connectorId: string;
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  startedAt: Date;
  completedAt: Date;
  errors: Array<{ record: string; error: string }>;
}

// ============================================
// Schema Definitions
// ============================================

const connectorIdSchema = z.enum([
  'erp-sap',
  'payment-stripe',
  'payment-paypal',
  'email-gmail',
  'email-outlook',
  'messaging-slack',
  'messaging-teams',
]);

const syncOptionsSchema = z.object({
  connectorId: connectorIdSchema,
  fullSync: z.boolean().default(false),
  entityTypes: z.array(z.string()).optional(),
  since: z.date().optional(),
});

// ============================================
// Mock connector status (would be real adapters in production)
// ============================================

const getConnectorStatus = async (connectorId: string): Promise<ConnectorHealthStatus> => {
  // In production, this would call the actual adapter's checkConnection method
  // For now, return mock status based on connector ID
  const connectorInfo: Record<string, { name: string; type: ConnectorHealthStatus['type']; provider: string }> = {
    'erp-sap': { name: 'SAP ERP', type: 'erp', provider: 'sap' },
    'payment-stripe': { name: 'Stripe', type: 'payment', provider: 'stripe' },
    'payment-paypal': { name: 'PayPal', type: 'payment', provider: 'paypal' },
    'email-gmail': { name: 'Gmail', type: 'email', provider: 'google' },
    'email-outlook': { name: 'Outlook', type: 'email', provider: 'microsoft' },
    'messaging-slack': { name: 'Slack', type: 'messaging', provider: 'slack' },
    'messaging-teams': { name: 'Microsoft Teams', type: 'messaging', provider: 'microsoft' },
  };

  const info = connectorInfo[connectorId];
  if (!info) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Unknown connector: ${connectorId}`,
    });
  }

  // Simulate health check with random latency
  const latencyMs = Math.floor(Math.random() * 200) + 50;
  const isHealthy = Math.random() > 0.1; // 90% healthy

  return {
    id: connectorId,
    name: info.name,
    type: info.type,
    provider: info.provider,
    status: isHealthy ? (latencyMs > 150 ? 'degraded' : 'healthy') : 'unhealthy',
    latencyMs,
    lastCheckedAt: new Date(),
    errorMessage: isHealthy ? undefined : 'Connection timeout',
  };
};

// ============================================
// Router Definition
// ============================================

export const integrationsRouter = createTRPCRouter({
  /**
   * Get health status of a specific connector
   */
  getConnectorHealth: protectedProcedure
    .input(z.object({ connectorId: connectorIdSchema }))
    .query(async ({ input }) => {
      return getConnectorStatus(input.connectorId);
    }),

  /**
   * Get health status of all connectors
   */
  getAllConnectorsHealth: protectedProcedure.query(async () => {
    const connectorIds = [
      'erp-sap',
      'payment-stripe',
      'payment-paypal',
      'email-gmail',
      'email-outlook',
      'messaging-slack',
      'messaging-teams',
    ];

    const results = await Promise.all(
      connectorIds.map((id) => getConnectorStatus(id))
    );

    return {
      connectors: results,
      summary: {
        total: results.length,
        healthy: results.filter((c) => c.status === 'healthy').length,
        degraded: results.filter((c) => c.status === 'degraded').length,
        unhealthy: results.filter((c) => c.status === 'unhealthy').length,
      },
      checkedAt: new Date(),
    };
  }),

  /**
   * Get connectors by type
   */
  getConnectorsByType: protectedProcedure
    .input(z.object({
      type: z.enum(['erp', 'payment', 'email', 'messaging'])
    }))
    .query(async ({ input }) => {
      const allConnectors = await Promise.all([
        getConnectorStatus('erp-sap'),
        getConnectorStatus('payment-stripe'),
        getConnectorStatus('payment-paypal'),
        getConnectorStatus('email-gmail'),
        getConnectorStatus('email-outlook'),
        getConnectorStatus('messaging-slack'),
        getConnectorStatus('messaging-teams'),
      ]);

      return allConnectors.filter((c) => c.type === input.type);
    }),

  /**
   * Trigger a sync operation for an ERP connector
   */
  triggerSync: protectedProcedure
    .input(syncOptionsSchema)
    .mutation(async ({ input }) => {
      // In production, this would trigger the actual sync
      // For now, return mock result
      const startTime = new Date();

      // Simulate sync processing time
      await new Promise((resolve) => setTimeout(resolve, 100));

      const result: ConnectorSyncResult = {
        connectorId: input.connectorId,
        success: Math.random() > 0.05, // 95% success rate
        recordsProcessed: Math.floor(Math.random() * 100) + 10,
        recordsFailed: Math.random() > 0.8 ? Math.floor(Math.random() * 5) : 0,
        startedAt: startTime,
        completedAt: new Date(),
        errors: [],
      };

      return result;
    }),

  /**
   * Get the connector dashboard configuration
   * Returns the connector-status-dashboard.json structure
   */
  getDashboardConfig: publicProcedure.query(async () => {
    // In production, this would load and return the actual dashboard config
    return {
      version: '1.0.0',
      refreshIntervalSeconds: 30,
      connectorCategories: ['erp', 'payment', 'email', 'messaging'],
      panels: [
        { id: 'health-overview', title: 'Connector Health Overview', type: 'status_grid' },
        { id: 'payment-metrics', title: 'Payment Processing', type: 'metrics_chart' },
        { id: 'email-metrics', title: 'Email Activity', type: 'metrics_chart' },
        { id: 'messaging-activity', title: 'Messaging Activity', type: 'activity_feed' },
        { id: 'erp-sync-status', title: 'ERP Sync Status', type: 'sync_status' },
        { id: 'rate-limit-monitor', title: 'Rate Limit Usage', type: 'gauge_grid' },
      ],
    };
  }),

  /**
   * Test connector authentication
   */
  testConnection: protectedProcedure
    .input(z.object({ connectorId: connectorIdSchema }))
    .mutation(async ({ input }) => {
      // In production, this would test the actual connection
      const status = await getConnectorStatus(input.connectorId);

      return {
        connectorId: input.connectorId,
        success: status.status !== 'unhealthy',
        latencyMs: status.latencyMs,
        message: status.status === 'unhealthy'
          ? 'Connection failed: ' + (status.errorMessage || 'Unknown error')
          : 'Connection successful',
        testedAt: new Date(),
      };
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;
