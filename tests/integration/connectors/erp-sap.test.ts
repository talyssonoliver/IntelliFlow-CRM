/**
 * SAP ERP Adapter Integration Tests
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SAPAdapter, SAPConfig } from '../../../packages/adapters/src/erp/sap/client';

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('SAPAdapter', () => {
  let adapter: SAPAdapter;
  let config: SAPConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      baseUrl: 'https://sap.example.com',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      username: 'testuser',
      password: 'testpass',
      company: 'TEST',
    };

    adapter = new SAPAdapter(config);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate successfully and return tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-csrf-token') return 'csrf-token-123';
            if (name === 'set-cookie') return 'session=abc123';
            return null;
          },
        },
      });

      const result = await adapter.authenticate();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.accessToken).toBe('csrf-token-123');
      expect(result.value?.sessionId).toBe('session=abc123');
    });

    it('should return error on authentication failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('SAP_AUTH_ERROR');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      expect(result.error?.code).toBe('SAP_CONNECTION_ERROR');
    });
  });

  describe('getCustomer', () => {
    beforeEach(async () => {
      // Setup authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-csrf-token') return 'csrf-token-123';
            if (name === 'set-cookie') return 'session=abc123';
            return null;
          },
        },
      });
      await adapter.authenticate();
    });

    it('should return customer when found', async () => {
      const mockCustomer = {
        d: {
          Customer: 'CUST001',
          CustomerFullName: 'Test Customer',
          Country: 'US',
          EmailAddress: 'test@example.com',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCustomer,
      });

      const result = await adapter.getCustomer('CUST001');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.customerNumber).toBe('CUST001');
      expect(result.value?.name).toBe('Test Customer');
    });

    it('should return null when customer not found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await adapter.getCustomer('NONEXISTENT');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('createCustomer', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-csrf-token') return 'csrf-token-123';
            if (name === 'set-cookie') return 'session=abc123';
            return null;
          },
        },
      });
      await adapter.authenticate();
    });

    it('should create customer successfully', async () => {
      const mockResponse = {
        d: {
          Customer: 'CUST002',
          CustomerFullName: 'New Customer',
          Country: 'UK',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.createCustomer({
        name: 'New Customer',
        country: 'UK',
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value?.name).toBe('New Customer');
    });
  });

  describe('syncCustomers', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-csrf-token') return 'csrf-token-123';
            if (name === 'set-cookie') return 'session=abc123';
            return null;
          },
        },
      });
      await adapter.authenticate();
    });

    it('should sync customers with pagination', async () => {
      const mockResponse = {
        d: {
          results: [
            { Customer: 'CUST001', CustomerFullName: 'Customer 1', Country: 'US' },
            { Customer: 'CUST002', CustomerFullName: 'Customer 2', Country: 'UK' },
          ],
          __next: 'https://sap.example.com/next?$skiptoken=token123',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await adapter.syncCustomers();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.data).toHaveLength(2);
      expect(result.value?.hasMore).toBe(true);
      expect(result.value?.syncToken).toBe('token123');
    });
  });

  describe('getSalesOrder', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        headers: {
          get: (name: string) => {
            if (name === 'x-csrf-token') return 'csrf-token-123';
            if (name === 'set-cookie') return 'session=abc123';
            return null;
          },
        },
      });
      await adapter.authenticate();
    });

    it('should return sales order with items', async () => {
      const mockOrder = {
        d: {
          SalesOrder: 'SO001',
          SoldToParty: 'CUST001',
          SalesOrderDate: '2025-01-15',
          OverallSDProcessStatus: 'A',
          TransactionCurrency: 'USD',
          TotalNetAmount: 1000,
          TotalTaxAmount: 100,
          to_Item: {
            results: [
              {
                SalesOrderItem: '000010',
                Material: 'MAT001',
                SalesOrderItemText: 'Product 1',
                RequestedQuantity: 5,
                RequestedQuantityUnit: 'EA',
                NetAmount: 500,
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockOrder,
      });

      const result = await adapter.getSalesOrder('SO001');

      expect(result.isSuccess).toBe(true);
      expect(result.value?.orderNumber).toBe('SO001');
      expect(result.value?.status).toBe('open');
      expect(result.value?.items).toHaveLength(1);
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status when connection succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('healthy');
      expect(result.value?.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when connection fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      expect(result.value?.status).toBe('unhealthy');
    });
  });
});
