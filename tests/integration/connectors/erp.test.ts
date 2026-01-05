/**
 * ERP Connector Integration Tests
 * Tests for SAP adapter functionality
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SAPAdapter,
  SAPConfig,
  SAPAuthenticationError,
  SAPConnectionError,
  SAPRateLimitError,
  SAPNotFoundError,
} from '@intelliflow/adapters';

// Mock fetch globally
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('SAP ERP Adapter', () => {
  let adapter: SAPAdapter;
  const mockConfig: SAPConfig = {
    baseUrl: 'https://api.sap.com/test',
    username: 'test-user',
    password: 'test-password',
    client: '100',
  };

  beforeEach(() => {
    adapter = new SAPAdapter(mockConfig);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication', () => {
    it('should authenticate successfully with valid credentials', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: (name: string) => name === 'x-csrf-token' ? 'mock-csrf-token' : null,
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          headers: {
            get: () => 'SAP-session-cookie',
          },
        });

      const result = await adapter.authenticate();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.csrfToken).toBeDefined();
      }
    });

    it('should fail authentication with invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Invalid credentials' } }),
      });

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error).toBeInstanceOf(SAPAuthenticationError);
      }
    });

    it('should handle connection errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error).toBeInstanceOf(SAPConnectionError);
      }
    });
  });

  describe('Customer Operations', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should retrieve customer by ID', async () => {
      const mockCustomer = {
        BusinessPartner: 'CUST001',
        BusinessPartnerName: 'Test Customer',
        CustomerAccountGroup: 'Z001',
        Industry: 'IT',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ d: mockCustomer }),
      });

      const result = await adapter.getCustomer(mockSession, 'CUST001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.id).toBe('CUST001');
        expect(result.value.name).toBe('Test Customer');
      }
    });

    it('should return null for non-existent customer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: 'Not found' } }),
      });

      const result = await adapter.getCustomer(mockSession, 'INVALID');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });

    it('should list customers with pagination', async () => {
      const mockCustomers = {
        d: {
          results: [
            { BusinessPartner: 'CUST001', BusinessPartnerName: 'Customer 1' },
            { BusinessPartner: 'CUST002', BusinessPartnerName: 'Customer 2' },
          ],
          __next: 'https://api.sap.com/test/customers?$skip=2',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockCustomers),
      });

      const result = await adapter.listCustomers(mockSession, { top: 2 });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.customers).toHaveLength(2);
        expect(result.value.nextLink).toBeDefined();
      }
    });

    it('should create a new customer', async () => {
      const newCustomer = {
        name: 'New Customer',
        accountGroup: 'Z001',
        industry: 'Retail',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          d: {
            BusinessPartner: 'CUST003',
            BusinessPartnerName: 'New Customer',
          },
        }),
      });

      const result = await adapter.createCustomer(mockSession, newCustomer);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.id).toBe('CUST003');
      }
    });
  });

  describe('Sales Order Operations', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should create a sales order', async () => {
      const orderData = {
        customerId: 'CUST001',
        orderType: 'TA',
        items: [
          { materialId: 'MAT001', quantity: 10, unit: 'EA' },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({
          d: {
            SalesOrder: '1000001',
            SalesOrderType: 'TA',
            SoldToParty: 'CUST001',
          },
        }),
      });

      const result = await adapter.createSalesOrder(mockSession, orderData);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.orderId).toBe('1000001');
      }
    });

    it('should retrieve sales order by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          d: {
            SalesOrder: '1000001',
            SalesOrderType: 'TA',
            SoldToParty: 'CUST001',
            TotalNetAmount: '1000.00',
            TransactionCurrency: 'USD',
          },
        }),
      });

      const result = await adapter.getSalesOrder(mockSession, '1000001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.orderId).toBe('1000001');
        expect(result.value.totalAmount).toBe('1000.00');
      }
    });
  });

  describe('Invoice Operations', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should list invoices for a customer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          d: {
            results: [
              { BillingDocument: 'INV001', TotalNetAmount: '500.00' },
              { BillingDocument: 'INV002', TotalNetAmount: '750.00' },
            ],
          },
        }),
      });

      const result = await adapter.listInvoices(mockSession, { customerId: 'CUST001' });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.invoices).toHaveLength(2);
      }
    });

    it('should retrieve invoice by ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          d: {
            BillingDocument: 'INV001',
            TotalNetAmount: '500.00',
            TransactionCurrency: 'USD',
            BillingDocumentDate: '2025-01-15',
          },
        }),
      });

      const result = await adapter.getInvoice(mockSession, 'INV001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.invoiceId).toBe('INV001');
        expect(result.value.amount).toBe('500.00');
      }
    });
  });

  describe('Material/Product Operations', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should list materials with filters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          d: {
            results: [
              { Material: 'MAT001', MaterialDescription: 'Product A', MaterialType: 'FERT' },
              { Material: 'MAT002', MaterialDescription: 'Product B', MaterialType: 'FERT' },
            ],
          },
        }),
      });

      const result = await adapter.listMaterials(mockSession, { materialType: 'FERT' });

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.materials).toHaveLength(2);
      }
    });

    it('should retrieve material stock levels', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          d: {
            Material: 'MAT001',
            Plant: '1000',
            AvailableStock: '150.000',
            BaseUnit: 'EA',
          },
        }),
      });

      const result = await adapter.getMaterialStock(mockSession, 'MAT001', '1000');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.availableQuantity).toBe(150);
      }
    });
  });

  describe('Error Handling', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should handle rate limiting', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: {
          get: (name: string) => name === 'Retry-After' ? '60' : null,
        },
        json: () => Promise.resolve({ error: { message: 'Rate limit exceeded' } }),
      });

      const result = await adapter.getCustomer(mockSession, 'CUST001');

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error).toBeInstanceOf(SAPRateLimitError);
        expect((result.error as SAPRateLimitError).retryAfterSeconds).toBe(60);
      }
    });

    it('should handle session expiration', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: { message: 'Session expired' } }),
      });

      const result = await adapter.getCustomer(mockSession, 'CUST001');

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error).toBeInstanceOf(SAPAuthenticationError);
      }
    });

    it('should validate session before requests', () => {
      const expiredSession = {
        csrfToken: 'mock-token',
        cookies: ['session=abc123'],
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      };

      const isValid = adapter.validateSession(expiredSession);

      expect(isValid).toBe(false);
    });
  });

  describe('Health Check', () => {
    const mockSession = {
      csrfToken: 'mock-token',
      cookies: ['session=abc123'],
      expiresAt: new Date(Date.now() + 3600000),
    };

    it('should return healthy status when API responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.checkConnection(mockSession);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('healthy');
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return unhealthy status when API fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await adapter.checkConnection(mockSession);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('unhealthy');
      }
    });

    it('should return degraded status for slow responses', async () => {
      // Simulate slow response by delaying the mock
      mockFetch.mockImplementationOnce(async () => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        return { ok: true, json: () => Promise.resolve({}) };
      });

      const result = await adapter.checkConnection(mockSession);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('degraded');
      }
    });
  });
});
