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
type ConnectorId = z.infer<typeof connectorIdSchema>;

const syncOptionsSchema = z.object({
  connectorId: connectorIdSchema,
  fullSync: z.boolean().default(false),
  entityTypes: z.array(z.string()).optional(),
  since: z.date().optional(),
});

// ============================================
// Adapter-backed health checks
// ============================================

type RuntimeAdapterStatus = 'healthy' | 'degraded' | 'unhealthy';
type ConnectorInfo = { name: string; type: ConnectorHealthStatus['type']; provider: string };
type ConnectorHealthSnapshot = Pick<ConnectorHealthStatus, 'status' | 'latencyMs' | 'errorMessage'>;
type OAuthHealthToken = {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string[];
  tokenType: string;
};
type AdapterResult<T> = {
  isSuccess: boolean;
  isFailure: boolean;
  value: T;
  error?: { message?: string };
};
type AdapterHealthPayload = {
  status: RuntimeAdapterStatus;
  latencyMs: number;
};
type SimpleHealthAdapter = {
  checkConnection: () => Promise<AdapterResult<AdapterHealthPayload>>;
};
type OAuthHealthAdapter = {
  checkConnection: (tokens: OAuthHealthToken) => Promise<AdapterResult<AdapterHealthPayload>>;
};
type TeamsHealthAdapter = OAuthHealthAdapter & {
  getAccessToken: () => Promise<AdapterResult<OAuthHealthToken>>;
};
type AdaptersModule = {
  SAPAdapter: new (config: {
    baseUrl: string;
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    company: string;
  }) => SimpleHealthAdapter;
  StripeAdapter: new (config: {
    secretKey: string;
    webhookSecret?: string;
    apiVersion?: string;
  }) => SimpleHealthAdapter;
  PayPalAdapter: new (config: {
    clientId: string;
    clientSecret: string;
    environment: 'sandbox' | 'production';
    webhookId?: string;
  }) => SimpleHealthAdapter;
  GmailAdapter: new (config: {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    scopes?: string[];
  }) => OAuthHealthAdapter;
  OutlookAdapter: new (config: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri: string;
    scopes?: string[];
  }) => OAuthHealthAdapter;
  SlackAdapter: new (config: {
    botToken: string;
    signingSecret?: string;
    appToken?: string;
  }) => SimpleHealthAdapter;
  TeamsAdapter: new (config: {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri?: string;
  }) => TeamsHealthAdapter;
};
type ConnectorHealthProviderForTests = (
  connectorId: ConnectorId,
  connector: ConnectorInfo
) => Promise<ConnectorHealthSnapshot>;

const connectorInfo: Record<ConnectorId, ConnectorInfo> = {
  'erp-sap': { name: 'SAP ERP', type: 'erp', provider: 'sap' },
  'payment-stripe': { name: 'Stripe', type: 'payment', provider: 'stripe' },
  'payment-paypal': { name: 'PayPal', type: 'payment', provider: 'paypal' },
  'email-gmail': { name: 'Gmail', type: 'email', provider: 'google' },
  'email-outlook': { name: 'Outlook', type: 'email', provider: 'microsoft' },
  'messaging-slack': { name: 'Slack', type: 'messaging', provider: 'slack' },
  'messaging-teams': { name: 'Microsoft Teams', type: 'messaging', provider: 'microsoft' },
};
const connectorIds = Object.keys(connectorInfo) as ConnectorId[];

let adaptersPromise: Promise<AdaptersModule> | null = null;
let healthProviderForTests: ConnectorHealthProviderForTests | null = null;

const loadAdapters = async (): Promise<AdaptersModule> => {
  if (!adaptersPromise) {
    adaptersPromise = import('@intelliflow/adapters') as Promise<AdaptersModule>;
  }
  return adaptersPromise;
};

const missingRequiredEnv = (keys: string[]): string[] =>
  keys.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });

const unknownHealth = (reason: string): ConnectorHealthSnapshot => ({
  status: 'unknown',
  latencyMs: null,
  errorMessage: reason,
});

const unhealthyHealth = (reason: string): ConnectorHealthSnapshot => ({
  status: 'unhealthy',
  latencyMs: null,
  errorMessage: reason,
});

const fromAdapterResult = (
  result: AdapterResult<AdapterHealthPayload>,
  fallbackError: string
): ConnectorHealthSnapshot => {
  if (result.isFailure) {
    return unhealthyHealth(result.error?.message || fallbackError);
  }

  if (result.value.status === 'healthy' || result.value.status === 'degraded') {
    return {
      status: result.value.status,
      latencyMs: result.value.latencyMs,
    };
  }

  if (result.value.status === 'unhealthy') {
    return {
      status: 'unhealthy',
      latencyMs: result.value.latencyMs,
      errorMessage: result.error?.message,
    };
  }

  return unknownHealth('Adapter returned unknown health status.');
};

const createOAuthHealthToken = (accessToken: string): OAuthHealthToken => ({
  accessToken,
  refreshToken: 'health-check-refresh-token',
  expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  scope: [],
  tokenType: 'Bearer',
});

const checkSapHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv([
    'SAP_BASE_URL',
    'SAP_CLIENT_ID',
    'SAP_CLIENT_SECRET',
    'SAP_USERNAME',
    'SAP_PASSWORD',
    'SAP_COMPANY',
  ]);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.SAPAdapter({
      baseUrl: process.env.SAP_BASE_URL!,
      clientId: process.env.SAP_CLIENT_ID!,
      clientSecret: process.env.SAP_CLIENT_SECRET!,
      username: process.env.SAP_USERNAME!,
      password: process.env.SAP_PASSWORD!,
      company: process.env.SAP_COMPANY!,
    });
    const result = await adapter.checkConnection();
    return fromAdapterResult(result, 'SAP health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'SAP health check failed.');
  }
};

const checkStripeHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv(['STRIPE_SECRET_KEY']);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.StripeAdapter({
      secretKey: process.env.STRIPE_SECRET_KEY!,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      apiVersion: '2024-12-18.acacia',
    });
    const result = await adapter.checkConnection();
    return fromAdapterResult(result, 'Stripe health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'Stripe health check failed.');
  }
};

const checkPayPalHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv(['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET']);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.PayPalAdapter({
      clientId: process.env.PAYPAL_CLIENT_ID!,
      clientSecret: process.env.PAYPAL_CLIENT_SECRET!,
      environment: process.env.PAYPAL_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      webhookId: process.env.PAYPAL_WEBHOOK_ID,
    });
    const result = await adapter.checkConnection();
    return fromAdapterResult(result, 'PayPal health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'PayPal health check failed.');
  }
};

const checkGmailHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv([
    'GMAIL_CLIENT_ID',
    'GMAIL_CLIENT_SECRET',
    'GMAIL_REDIRECT_URI',
    'GMAIL_HEALTH_ACCESS_TOKEN',
  ]);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.GmailAdapter({
      clientId: process.env.GMAIL_CLIENT_ID!,
      clientSecret: process.env.GMAIL_CLIENT_SECRET!,
      redirectUri: process.env.GMAIL_REDIRECT_URI!,
    });
    const result = await adapter.checkConnection(
      createOAuthHealthToken(process.env.GMAIL_HEALTH_ACCESS_TOKEN!)
    );
    return fromAdapterResult(result, 'Gmail health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'Gmail health check failed.');
  }
};

const checkOutlookHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv([
    'OUTLOOK_CLIENT_ID',
    'OUTLOOK_CLIENT_SECRET',
    'OUTLOOK_TENANT_ID',
    'OUTLOOK_REDIRECT_URI',
    'OUTLOOK_HEALTH_ACCESS_TOKEN',
  ]);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.OutlookAdapter({
      clientId: process.env.OUTLOOK_CLIENT_ID!,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET!,
      tenantId: process.env.OUTLOOK_TENANT_ID!,
      redirectUri: process.env.OUTLOOK_REDIRECT_URI!,
    });
    const result = await adapter.checkConnection(
      createOAuthHealthToken(process.env.OUTLOOK_HEALTH_ACCESS_TOKEN!)
    );
    return fromAdapterResult(result, 'Outlook health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'Outlook health check failed.');
  }
};

const checkSlackHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv(['SLACK_BOT_TOKEN']);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.SlackAdapter({
      botToken: process.env.SLACK_BOT_TOKEN!,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
    });
    const result = await adapter.checkConnection();
    return fromAdapterResult(result, 'Slack health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'Slack health check failed.');
  }
};

const checkTeamsHealth = async (): Promise<ConnectorHealthSnapshot> => {
  const missing = missingRequiredEnv(['TEAMS_CLIENT_ID', 'TEAMS_CLIENT_SECRET', 'TEAMS_TENANT_ID']);
  if (missing.length > 0) {
    return unknownHealth(`Health check not configured: missing ${missing.join(', ')}`);
  }

  try {
    const adapters = await loadAdapters();
    const adapter = new adapters.TeamsAdapter({
      clientId: process.env.TEAMS_CLIENT_ID!,
      clientSecret: process.env.TEAMS_CLIENT_SECRET!,
      tenantId: process.env.TEAMS_TENANT_ID!,
      redirectUri: process.env.TEAMS_REDIRECT_URI,
    });

    const auth = await adapter.getAccessToken();
    if (auth.isFailure) {
      return unhealthyHealth(auth.error?.message || 'Teams authentication failed.');
    }

    const result = await adapter.checkConnection(auth.value);
    return fromAdapterResult(result, 'Teams health check failed.');
  } catch (error) {
    return unhealthyHealth(error instanceof Error ? error.message : 'Teams health check failed.');
  }
};

const connectorHealthChecks: Record<ConnectorId, () => Promise<ConnectorHealthSnapshot>> = {
  'erp-sap': checkSapHealth,
  'payment-stripe': checkStripeHealth,
  'payment-paypal': checkPayPalHealth,
  'email-gmail': checkGmailHealth,
  'email-outlook': checkOutlookHealth,
  'messaging-slack': checkSlackHealth,
  'messaging-teams': checkTeamsHealth,
};

// Exported for deterministic tests.
export const setConnectorHealthProviderForTests = (
  provider: ConnectorHealthProviderForTests | null
): void => {
  healthProviderForTests = provider;
};

const getConnectorStatus = async (connectorId: ConnectorId): Promise<ConnectorHealthStatus> => {
  const info = connectorInfo[connectorId];
  if (!info) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: `Unknown connector: ${connectorId}`,
    });
  }

  const health = healthProviderForTests
    ? await healthProviderForTests(connectorId, info)
    : await connectorHealthChecks[connectorId]();

  return {
    id: connectorId,
    name: info.name,
    type: info.type,
    provider: info.provider,
    status: health.status,
    latencyMs: health.latencyMs,
    lastCheckedAt: new Date(),
    errorMessage: health.errorMessage,
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
    const results = await Promise.all(connectorIds.map((id) => getConnectorStatus(id)));

    return {
      connectors: results,
      summary: {
        total: results.length,
        healthy: results.filter((c) => c.status === 'healthy').length,
        degraded: results.filter((c) => c.status === 'degraded').length,
        unhealthy: results.filter((c) => c.status === 'unhealthy').length,
        unknown: results.filter((c) => c.status === 'unknown').length,
      },
      checkedAt: new Date(),
    };
  }),

  /**
   * Get connectors by type
   */
  getConnectorsByType: protectedProcedure
    .input(
      z.object({
        type: z.enum(['erp', 'payment', 'email', 'messaging']),
      })
    )
    .query(async ({ input }) => {
      const allConnectors = await Promise.all(connectorIds.map((id) => getConnectorStatus(id)));

      return allConnectors.filter((c) => c.type === input.type);
    }),

  /**
   * Trigger a sync operation for an ERP connector
   */
  triggerSync: protectedProcedure.input(syncOptionsSchema).mutation(async ({ input }) => {
    // In production, this would trigger the actual sync
    // For now, return mock result
    const startTime = new Date();

    // Simulate sync processing time
    await new Promise((resolve) => setTimeout(resolve, 100));

    const result: ConnectorSyncResult = {
      connectorId: input.connectorId,
      success: Math.random() > 0.05, // NOSONAR - non-security: simulated UI demo sync result, not used for auth or tokens
      recordsProcessed: Math.floor(Math.random() * 100) + 10, // NOSONAR - non-security: simulated UI demo sync result, not used for auth or tokens
      recordsFailed: Math.random() > 0.8 ? Math.floor(Math.random() * 5) : 0, // NOSONAR - non-security: simulated UI demo sync result, not used for auth or tokens
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
      const status = await getConnectorStatus(input.connectorId);
      const success = status.status === 'healthy' || status.status === 'degraded';
      let message: string;
      if (status.status === 'unhealthy') {
        message = 'Connection failed: ' + (status.errorMessage || 'Unknown error');
      } else if (status.status === 'unknown') {
        message = 'Connection unavailable: health check is not configured';
      } else {
        message = 'Connection successful';
      }

      return {
        connectorId: input.connectorId,
        success,
        latencyMs: status.latencyMs,
        message,
        testedAt: new Date(),
      };
    }),
});

export type IntegrationsRouter = typeof integrationsRouter;
