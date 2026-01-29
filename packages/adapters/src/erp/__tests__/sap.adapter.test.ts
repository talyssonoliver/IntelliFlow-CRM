/**
 * SAP ERP Adapter Tests
 *
 * Tests for the SAP ERP adapter using mocked HTTP responses.
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SAPAdapter, SAPConfig, SAPCustomer, SAPSalesOrder } from '../sap/client';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('SAPAdapter', () => {
  let adapter: SAPAdapter;
  const config: SAPConfig = {
    baseUrl: 'https://test-sap.example.com',
    clientId: 'test_client',
    clientSecret: 'test_secret',
    username: 'test_user',
    password: 'test_pass',
    company: 'TEST_CO',
  };

  beforeEach(() => {
    adapter = new SAPAdapter(config);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token_123'],
          ['set-cookie', 'session=abc123'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.authenticate();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.accessToken).toBe('csrf_token_123');
        expect(result.value.sessionId).toBe('session=abc123');
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('should handle authentication failure with 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Map() as unknown as Headers,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('SAP_AUTH_ERROR');
      }
    });

    it('should handle connection errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await adapter.authenticate();

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('SAP_CONNECTION_ERROR');
      }
    });
  });

  describe('getCustomer', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should retrieve a customer by ID', async () => {
      const mockCustomer = {
        d: {
          Customer: 'CUST001',
          CustomerName: 'Acme Corporation Ltd',
          Country: 'US',
          EmailAddress: 'contact@acme.com',
          PhoneNumber: '+1-555-0100',
          CityName: 'New York',
          PostalCode: '10001',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockCustomer),
      });

      const result = await adapter.getCustomer('CUST001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.customerNumber).toBe('CUST001');
        expect(result.value.name).toBe('Acme Corporation Ltd');
        expect(result.value.email).toBe('contact@acme.com');
        expect(result.value.country).toBe('US');
      }
    });

    it('should return null for non-existent customer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.getCustomer('NONEXISTENT');

      expect(result.isSuccess).toBe(true);
      expect(result.value).toBeNull();
    });
  });

  describe('createCustomer', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should create a new customer', async () => {
      const newCustomer: Omit<SAPCustomer, 'customerNumber'> = {
        name: 'New Customer',
        country: 'UK',
        email: 'new@customer.com',
        phone: '+44-20-1234-5678',
        city: 'London',
        postalCode: 'SW1A 1AA',
      };

      const mockResponse = {
        d: {
          Customer: 'CUST002',
          CustomerFullName: 'New Customer',
          Country: 'UK',
          EmailAddress: 'new@customer.com',
          PhoneNumber: '+44-20-1234-5678',
          CityName: 'London',
          PostalCode: 'SW1A 1AA',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createCustomer(newCustomer);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.customerNumber).toBe('CUST002');
        expect(result.value.name).toBe('New Customer');
      }
    });
  });

  describe('syncCustomers', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should sync customers with pagination', async () => {
      const mockResponse = {
        d: {
          results: [
            { Customer: 'CUST001', CustomerFullName: 'Customer 1', Country: 'US' },
            { Customer: 'CUST002', CustomerFullName: 'Customer 2', Country: 'UK' },
          ],
          __next: 'https://test-sap.example.com/...?$skiptoken=CUST002',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.syncCustomers(undefined, 100);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.success).toBe(true);
        expect(result.value.data).toHaveLength(2);
        expect(result.value.hasMore).toBe(true);
        expect(result.value.syncToken).toBeDefined();
      }
    });
  });

  describe('getSalesOrder', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should retrieve a sales order with items', async () => {
      const mockOrder = {
        d: {
          SalesOrder: 'SO001',
          SoldToParty: 'CUST001',
          SalesOrderDate: '2025-01-15',
          TransactionCurrency: 'USD',
          TotalNetAmount: 1500,
          TotalTaxAmount: 150,
          OverallSDProcessStatus: 'B',
          to_Item: {
            results: [
              {
                SalesOrderItem: '000010',
                Material: 'MAT001',
                SalesOrderItemText: 'Widget A',
                RequestedQuantity: 10,
                RequestedQuantityUnit: 'EA',
                NetPriceAmount: 100,
                NetAmount: 1000,
              },
              {
                SalesOrderItem: '000020',
                Material: 'MAT002',
                SalesOrderItemText: 'Widget B',
                RequestedQuantity: 5,
                RequestedQuantityUnit: 'EA',
                NetPriceAmount: 100,
                NetAmount: 500,
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockOrder),
      });

      const result = await adapter.getSalesOrder('SO001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.orderNumber).toBe('SO001');
        expect(result.value.customerNumber).toBe('CUST001');
        expect(result.value.status).toBe('in_progress');
        expect(result.value.netAmount).toBe(1500);
        expect(result.value.items).toHaveLength(2);
        expect(result.value.items[0].materialNumber).toBe('MAT001');
      }
    });
  });

  describe('createSalesOrder', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should create a sales order', async () => {
      const newOrder: Omit<SAPSalesOrder, 'orderNumber' | 'status'> = {
        customerNumber: 'CUST001',
        orderDate: new Date('2025-01-20'),
        currency: 'EUR',
        netAmount: 2000,
        taxAmount: 400,
        totalAmount: 2400,
        items: [
          {
            itemNumber: '',
            materialNumber: 'MAT001',
            description: 'Test Product',
            quantity: 20,
            unit: 'EA',
            unitPrice: 100,
            netAmount: 2000,
          },
        ],
      };

      const mockResponse = {
        d: {
          SalesOrder: 'SO002',
          SoldToParty: 'CUST001',
          SalesOrderDate: '2025-01-20',
          TransactionCurrency: 'EUR',
          TotalNetAmount: 2000,
          TotalTaxAmount: 400,
          OverallSDProcessStatus: 'A',
          to_Item: {
            results: [
              {
                SalesOrderItem: '000010',
                Material: 'MAT001',
                SalesOrderItemText: 'Test Product',
                RequestedQuantity: 20,
                RequestedQuantityUnit: 'EA',
                NetPriceAmount: 100,
                NetAmount: 2000,
              },
            ],
          },
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await adapter.createSalesOrder(newOrder);

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.orderNumber).toBe('SO002');
        expect(result.value.status).toBe('open');
      }
    });
  });

  describe('getInvoice', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should retrieve an invoice', async () => {
      const mockInvoice = {
        d: {
          BillingDocument: 'INV001',
          SalesDocument: 'SO001',
          SoldToParty: 'CUST001',
          BillingDocumentDate: '2025-01-25',
          PaymentDueDate: '2025-02-25',
          PaymentStatus: 'A',
          TransactionCurrency: 'USD',
          NetAmount: 1500,
          TaxAmount: 150,
          GrossAmount: 1650,
          PaidAmount: 0,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockInvoice),
      });

      const result = await adapter.getInvoice('INV001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.invoiceNumber).toBe('INV001');
        expect(result.value.orderNumber).toBe('SO001');
        expect(result.value.status).toBe('open');
        expect(result.value.totalAmount).toBe(1650);
      }
    });
  });

  describe('getMaterial', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should retrieve material/product information', async () => {
      const mockMaterial = {
        d: {
          Product: 'MAT001',
          ProductDescription: 'Widget A - Premium',
          ProductGroup: 'WIDGETS',
          BaseUnit: 'EA',
          GrossWeight: 0.5,
          WeightUnit: 'KG',
          CurrentStock: 1000,
          ReservedStock: 50,
          StandardPrice: 99.99,
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockMaterial),
      });

      const result = await adapter.getMaterial('MAT001');

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess && result.value) {
        expect(result.value.materialNumber).toBe('MAT001');
        expect(result.value.description).toBe('Widget A - Premium');
        expect(result.value.stockQuantity).toBe(1000);
        expect(result.value.availableQuantity).toBe(950);
      }
    });
  });

  describe('checkConnection', () => {
    it('should return healthy status when metadata endpoint responds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map() as unknown as Headers,
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('healthy');
        expect(result.value.latencyMs).toBeGreaterThanOrEqual(0);
      }
    });

    it('should return unhealthy status when endpoint fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        headers: new Map() as unknown as Headers,
      });

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('unhealthy');
      }
    });

    it('should return unhealthy status on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network unavailable'));

      const result = await adapter.checkConnection();

      expect(result.isSuccess).toBe(true);
      if (result.isSuccess) {
        expect(result.value.status).toBe('unhealthy');
      }
    });
  });

  describe('rate limiting', () => {
    beforeEach(async () => {
      // Mock authentication
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Map([
          ['x-csrf-token', 'csrf_token'],
          ['set-cookie', 'session=test'],
        ]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });
    });

    it('should handle rate limit responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: new Map([['Retry-After', '30']]) as unknown as Headers,
        json: () => Promise.resolve({}),
      });

      const result = await adapter.getCustomer('CUST001');

      expect(result.isFailure).toBe(true);
      if (result.isFailure) {
        expect(result.error.code).toBe('SAP_RATE_LIMIT');
      }
    });
  });
});
