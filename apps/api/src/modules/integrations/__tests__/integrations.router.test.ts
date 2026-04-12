/**
 * Integrations Router Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { appRouter } from '../../../router';
import type { Context } from '../../../context';
import { createPublicContext, createTestContext } from '../../../test/setup';
import { setConnectorHealthProviderForTests } from '../integrations.router';

// Mock context factory
const createMockContext = (authenticated = true): Context => {
  const req = {
    headers: {
      get: (name: string) => {
        if (name === 'x-csrf-token') return 'test-csrf-token';
        return null;
      },
      has: (name: string) => name === 'x-csrf-token',
    },
  } as unknown as Context['req'];

  return authenticated ? createTestContext({ req }) : createPublicContext({ req });
};

const HEALTH_CHECK_FIXTURES: Record<
  string,
  { status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number; errorMessage?: string }
> = {
  'erp-sap': { status: 'unhealthy', latencyMs: 220, errorMessage: 'Connection timeout' },
  'payment-stripe': { status: 'healthy', latencyMs: 84 },
  'payment-paypal': { status: 'degraded', latencyMs: 162 },
  'email-gmail': { status: 'healthy', latencyMs: 93 },
  'email-outlook': { status: 'healthy', latencyMs: 111 },
  'messaging-slack': { status: 'degraded', latencyMs: 155 },
  'messaging-teams': { status: 'healthy', latencyMs: 120 },
};

describe('Integrations Router', () => {
  const caller = appRouter.createCaller(createMockContext(true));
  const unauthenticatedCaller = appRouter.createCaller(createMockContext(false));

  beforeEach(() => {
    setConnectorHealthProviderForTests(async (connectorId) => {
      const fixture = HEALTH_CHECK_FIXTURES[connectorId];
      return (
        fixture ?? {
          status: 'unknown',
          latencyMs: null,
          errorMessage: 'Missing test fixture',
        }
      );
    });
  });

  afterEach(() => {
    setConnectorHealthProviderForTests(null);
    vi.clearAllMocks();
  });

  describe('getConnectorHealth', () => {
    it('should return health status for a valid connector', async () => {
      const result = await caller.integrations.getConnectorHealth({
        connectorId: 'payment-stripe',
      });

      expect(result).toHaveProperty('id', 'payment-stripe');
      expect(result).toHaveProperty('name', 'Stripe');
      expect(result).toHaveProperty('type', 'payment');
      expect(result).toHaveProperty('provider', 'stripe');
      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(result.status);
      expect(result).toHaveProperty('latencyMs');
      expect(result).toHaveProperty('lastCheckedAt');
    });

    it('should throw error for invalid connector ID', async () => {
      await expect(
        caller.integrations.getConnectorHealth({
          // @ts-expect-error - testing invalid input
          connectorId: 'invalid-connector',
        })
      ).rejects.toThrow();
    });

    it('should require authentication', async () => {
      await expect(
        unauthenticatedCaller.integrations.getConnectorHealth({
          connectorId: 'payment-stripe',
        })
      ).rejects.toThrow();
    });
  });

  describe('getAllConnectorsHealth', () => {
    it('should return health status for all connectors', async () => {
      const result = await caller.integrations.getAllConnectorsHealth();

      expect(result).toHaveProperty('connectors');
      expect(result.connectors).toHaveLength(7);
      expect(result).toHaveProperty('summary');
      expect(result.summary).toHaveProperty('total', 7);
      expect(result.summary).toHaveProperty('healthy');
      expect(result.summary).toHaveProperty('degraded');
      expect(result.summary).toHaveProperty('unhealthy');
      expect(result.summary).toHaveProperty('unknown');
      expect(result).toHaveProperty('checkedAt');

      // Verify sum matches total
      const { healthy, degraded, unhealthy, unknown } = result.summary;
      expect(healthy + degraded + unhealthy + unknown).toBe(result.summary.total);
    });

    it('should return all connector types', async () => {
      const result = await caller.integrations.getAllConnectorsHealth();

      const types = new Set(result.connectors.map((c) => c.type));
      expect(types).toContain('erp');
      expect(types).toContain('payment');
      expect(types).toContain('email');
      expect(types).toContain('messaging');
    });

    it('should count unknown statuses in summary', async () => {
      setConnectorHealthProviderForTests(async (connectorId) => {
        if (connectorId === 'messaging-teams') {
          return {
            status: 'unknown',
            latencyMs: null,
            errorMessage: 'Health check not configured: missing TEAMS_CLIENT_ID',
          };
        }

        const fixture = HEALTH_CHECK_FIXTURES[connectorId];
        return fixture ?? { status: 'unknown', latencyMs: null, errorMessage: 'Missing fixture' };
      });

      const result = await caller.integrations.getAllConnectorsHealth();
      expect(result.summary.unknown).toBeGreaterThan(0);
      expect(
        result.connectors.some(
          (connector) => connector.id === 'messaging-teams' && connector.status === 'unknown'
        )
      ).toBe(true);
    });
  });

  describe('getConnectorsByType', () => {
    it('should filter connectors by payment type', async () => {
      const result = await caller.integrations.getConnectorsByType({
        type: 'payment',
      });

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.type === 'payment')).toBe(true);
      expect(result.map((c) => c.provider)).toEqual(['stripe', 'paypal']);
    });

    it('should filter connectors by email type', async () => {
      const result = await caller.integrations.getConnectorsByType({
        type: 'email',
      });

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.type === 'email')).toBe(true);
    });

    it('should filter connectors by messaging type', async () => {
      const result = await caller.integrations.getConnectorsByType({
        type: 'messaging',
      });

      expect(result).toHaveLength(2);
      expect(result.every((c) => c.type === 'messaging')).toBe(true);
    });

    it('should filter connectors by erp type', async () => {
      const result = await caller.integrations.getConnectorsByType({
        type: 'erp',
      });

      expect(result).toHaveLength(1);
      expect(result[0].provider).toBe('sap');
    });
  });

  describe('triggerSync', () => {
    it('should trigger a sync operation', async () => {
      const result = await caller.integrations.triggerSync({
        connectorId: 'erp-sap',
        fullSync: false,
      });

      expect(result).toHaveProperty('connectorId', 'erp-sap');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('recordsProcessed');
      expect(result).toHaveProperty('recordsFailed');
      expect(result).toHaveProperty('startedAt');
      expect(result).toHaveProperty('completedAt');
      expect(result).toHaveProperty('errors');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should accept entity type filters', async () => {
      const result = await caller.integrations.triggerSync({
        connectorId: 'erp-sap',
        fullSync: false,
        entityTypes: ['customers', 'orders'],
      });

      expect(result).toHaveProperty('connectorId', 'erp-sap');
      expect(result).toHaveProperty('success');
    });

    it('should require authentication', async () => {
      await expect(
        unauthenticatedCaller.integrations.triggerSync({
          connectorId: 'erp-sap',
          fullSync: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('getDashboardConfig', () => {
    it('should return dashboard configuration', async () => {
      const result = await caller.integrations.getDashboardConfig();

      expect(result).toHaveProperty('version', '1.0.0');
      expect(result).toHaveProperty('refreshIntervalSeconds', 30);
      expect(result).toHaveProperty('connectorCategories');
      expect(result.connectorCategories).toEqual(['erp', 'payment', 'email', 'messaging']);
      expect(result).toHaveProperty('panels');
      expect(result.panels).toHaveLength(6);
    });

    it('should be accessible without authentication (public)', async () => {
      const result = await unauthenticatedCaller.integrations.getDashboardConfig();

      expect(result).toHaveProperty('version');
    });
  });

  describe('testConnection', () => {
    it('should test connector connection', async () => {
      const result = await caller.integrations.testConnection({
        connectorId: 'payment-stripe',
      });

      expect(result).toHaveProperty('connectorId', 'payment-stripe');
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('latencyMs');
      expect(result).toHaveProperty('message');
      expect(result).toHaveProperty('testedAt');
    });

    it('should handle failed connections gracefully', async () => {
      const result = await caller.integrations.testConnection({
        connectorId: 'erp-sap',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Connection failed');
    });

    it('should report unknown health checks as unavailable', async () => {
      setConnectorHealthProviderForTests(async () => ({
        status: 'unknown',
        latencyMs: null,
        errorMessage: 'Health check not configured: missing token',
      }));

      const result = await caller.integrations.testConnection({
        connectorId: 'payment-stripe',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('health check is not configured');
    });

    it('should require authentication', async () => {
      await expect(
        unauthenticatedCaller.integrations.testConnection({
          connectorId: 'payment-stripe',
        })
      ).rejects.toThrow();
    });
  });
});
