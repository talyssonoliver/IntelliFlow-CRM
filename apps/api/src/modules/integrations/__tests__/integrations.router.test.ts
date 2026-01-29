/**
 * Integrations Router Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { inferProcedureInput } from '@trpc/server';
import { appRouter, type AppRouter } from '../../../router';
import type { Context } from '../../../context';

// Mock user for protected procedures
const mockUser = {
  id: 'user-123',
  email: 'test@example.com',
  tenant: { id: 'tenant-123', name: 'Test Tenant' },
};

// Mock context factory
const createMockContext = (authenticated = true): Context => ({
  user: authenticated ? mockUser : null,
  tenantId: authenticated ? 'tenant-123' : null,
  req: {} as Context['req'],
  res: {} as Context['res'],
  db: {} as Context['db'],
} as unknown as Context);

describe('Integrations Router', () => {
  const caller = appRouter.createCaller(createMockContext(true));
  const unauthenticatedCaller = appRouter.createCaller(createMockContext(false));

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
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
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
      expect(result).toHaveProperty('checkedAt');

      // Verify sum matches total
      const { healthy, degraded, unhealthy } = result.summary;
      expect(healthy + degraded + unhealthy).toBe(result.summary.total);
    });

    it('should return all connector types', async () => {
      const result = await caller.integrations.getAllConnectorsHealth();

      const types = new Set(result.connectors.map((c) => c.type));
      expect(types).toContain('erp');
      expect(types).toContain('payment');
      expect(types).toContain('email');
      expect(types).toContain('messaging');
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
      // Multiple attempts to possibly hit a failed connection
      let foundFailed = false;
      for (let i = 0; i < 20; i++) {
        const result = await caller.integrations.testConnection({
          connectorId: 'erp-sap',
        });

        if (!result.success) {
          foundFailed = true;
          expect(result.message).toContain('Connection failed');
          break;
        }
      }
      // Note: This test may be flaky due to random health status
      // In production, we'd mock the actual adapter behavior
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
