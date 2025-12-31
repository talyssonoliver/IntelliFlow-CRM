/**
 * SAP ERP Adapter
 * Implements ERP integration for SAP Business Suite
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://api.sap.com/
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface SAPConfig {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  company: string;
}

export interface SAPAuthTokens {
  accessToken: string;
  expiresAt: Date;
  sessionId: string;
}

export interface SAPCustomer {
  customerNumber: string;
  name: string;
  name2?: string;
  street?: string;
  city?: string;
  postalCode?: string;
  country: string;
  region?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  creditLimit?: number;
  paymentTerms?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SAPSalesOrder {
  orderNumber: string;
  customerNumber: string;
  orderDate: Date;
  deliveryDate?: Date;
  status: 'open' | 'in_progress' | 'shipped' | 'completed' | 'cancelled';
  currency: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  items: SAPSalesOrderItem[];
}

export interface SAPSalesOrderItem {
  itemNumber: string;
  materialNumber: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  netAmount: number;
}

export interface SAPInvoice {
  invoiceNumber: string;
  orderNumber: string;
  customerNumber: string;
  invoiceDate: Date;
  dueDate: Date;
  status: 'open' | 'partial' | 'paid' | 'overdue' | 'cancelled';
  currency: string;
  netAmount: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
}

export interface SAPMaterial {
  materialNumber: string;
  description: string;
  materialGroup: string;
  baseUnit: string;
  weight?: number;
  weightUnit?: string;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  standardPrice?: number;
}

export interface SAPSyncResult<T> {
  success: boolean;
  data?: T;
  syncToken?: string;
  totalRecords: number;
  hasMore: boolean;
}

// ==================== Error Types ====================

export class SAPAuthenticationError extends DomainError {
  readonly code = 'SAP_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class SAPConnectionError extends DomainError {
  readonly code = 'SAP_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class SAPDataError extends DomainError {
  readonly code = 'SAP_DATA_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class SAPRateLimitError extends DomainError {
  readonly code = 'SAP_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// ==================== Adapter Interface ====================

export interface ERPServicePort {
  // Authentication
  authenticate(): Promise<Result<SAPAuthTokens, DomainError>>;
  refreshSession(): Promise<Result<SAPAuthTokens, DomainError>>;
  logout(): Promise<Result<void, DomainError>>;

  // Customer Operations
  getCustomer(customerNumber: string): Promise<Result<SAPCustomer | null, DomainError>>;
  createCustomer(customer: Omit<SAPCustomer, 'customerNumber'>): Promise<Result<SAPCustomer, DomainError>>;
  updateCustomer(customerNumber: string, updates: Partial<SAPCustomer>): Promise<Result<SAPCustomer, DomainError>>;
  syncCustomers(syncToken?: string, pageSize?: number): Promise<Result<SAPSyncResult<SAPCustomer[]>, DomainError>>;

  // Sales Order Operations
  getSalesOrder(orderNumber: string): Promise<Result<SAPSalesOrder | null, DomainError>>;
  createSalesOrder(order: Omit<SAPSalesOrder, 'orderNumber' | 'status'>): Promise<Result<SAPSalesOrder, DomainError>>;
  updateSalesOrderStatus(orderNumber: string, status: SAPSalesOrder['status']): Promise<Result<SAPSalesOrder, DomainError>>;
  syncSalesOrders(syncToken?: string, pageSize?: number): Promise<Result<SAPSyncResult<SAPSalesOrder[]>, DomainError>>;

  // Invoice Operations
  getInvoice(invoiceNumber: string): Promise<Result<SAPInvoice | null, DomainError>>;
  syncInvoices(syncToken?: string, pageSize?: number): Promise<Result<SAPSyncResult<SAPInvoice[]>, DomainError>>;

  // Material/Product Operations
  getMaterial(materialNumber: string): Promise<Result<SAPMaterial | null, DomainError>>;
  syncMaterials(syncToken?: string, pageSize?: number): Promise<Result<SAPSyncResult<SAPMaterial[]>, DomainError>>;

  // Health Check
  checkConnection(): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * SAP ERP Adapter
 * Implements integration with SAP Business Suite via OData/RFC
 */
export class SAPAdapter implements ERPServicePort {
  private config: SAPConfig;
  private tokens: SAPAuthTokens | null = null;

  constructor(config: SAPConfig) {
    this.config = config;
  }

  // ==================== Authentication ====================

  async authenticate(): Promise<Result<SAPAuthTokens, DomainError>> {
    try {
      const response = await fetch(`${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
          'x-csrf-token': 'Fetch',
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          return Result.fail(new SAPAuthenticationError('Invalid credentials'));
        }
        return Result.fail(new SAPConnectionError(`Authentication failed: ${response.statusText}`));
      }

      const csrfToken = response.headers.get('x-csrf-token') ?? '';
      const cookies = response.headers.get('set-cookie') ?? '';

      this.tokens = {
        accessToken: csrfToken,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
        sessionId: cookies,
      };

      return Result.ok(this.tokens);
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async refreshSession(): Promise<Result<SAPAuthTokens, DomainError>> {
    return this.authenticate();
  }

  async logout(): Promise<Result<void, DomainError>> {
    this.tokens = null;
    return Result.ok(undefined);
  }

  // ==================== Customer Operations ====================

  async getCustomer(customerNumber: string): Promise<Result<SAPCustomer | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Customer('${customerNumber}')`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (response.status === 404) {
        return Result.ok(null);
      }

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: Record<string, unknown> };
      return Result.ok(this.mapToCustomer(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createCustomer(
    customer: Omit<SAPCustomer, 'customerNumber'>
  ): Promise<Result<SAPCustomer, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Customer`,
        {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.mapToSAPCustomer(customer)),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: Record<string, unknown> };
      return Result.ok(this.mapToCustomer(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateCustomer(
    customerNumber: string,
    updates: Partial<SAPCustomer>
  ): Promise<Result<SAPCustomer, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Customer('${customerNumber}')`,
        {
          method: 'PATCH',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.mapToSAPCustomer(updates)),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      // Fetch updated customer
      return this.getCustomer(customerNumber) as Promise<Result<SAPCustomer, DomainError>>;
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async syncCustomers(
    syncToken?: string,
    pageSize: number = 100
  ): Promise<Result<SAPSyncResult<SAPCustomer[]>, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const params = new URLSearchParams({
        '$top': pageSize.toString(),
        '$format': 'json',
      });

      if (syncToken) {
        params.set('$skiptoken', syncToken);
      }

      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_Customer?${params}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: { results?: unknown[]; __next?: string } };
      const customers = (data.d?.results ?? []).map((c: unknown) => this.mapToCustomer(c as Record<string, unknown>));
      const nextLink = data.d?.__next;

      return Result.ok({
        success: true,
        data: customers,
        syncToken: nextLink ? this.extractSkipToken(nextLink) : undefined,
        totalRecords: customers.length,
        hasMore: !!nextLink,
      });
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Sales Order Operations ====================

  async getSalesOrder(orderNumber: string): Promise<Result<SAPSalesOrder | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${orderNumber}')?$expand=to_Item`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (response.status === 404) {
        return Result.ok(null);
      }

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: Record<string, unknown> };
      return Result.ok(this.mapToSalesOrder(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async createSalesOrder(
    order: Omit<SAPSalesOrder, 'orderNumber' | 'status'>
  ): Promise<Result<SAPSalesOrder, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder`,
        {
          method: 'POST',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(this.mapToSAPSalesOrder(order)),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: Record<string, unknown> };
      return Result.ok(this.mapToSalesOrder(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateSalesOrderStatus(
    orderNumber: string,
    status: SAPSalesOrder['status']
  ): Promise<Result<SAPSalesOrder, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const sapStatus = this.mapStatusToSAP(status);
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder('${orderNumber}')`,
        {
          method: 'PATCH',
          headers: {
            ...this.getHeaders(),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ OverallSDProcessStatus: sapStatus }),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      return this.getSalesOrder(orderNumber) as Promise<Result<SAPSalesOrder, DomainError>>;
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async syncSalesOrders(
    syncToken?: string,
    pageSize: number = 100
  ): Promise<Result<SAPSyncResult<SAPSalesOrder[]>, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const params = new URLSearchParams({
        '$top': pageSize.toString(),
        '$expand': 'to_Item',
        '$format': 'json',
      });

      if (syncToken) {
        params.set('$skiptoken', syncToken);
      }

      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrder?${params}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = await response.json() as { d: { results?: unknown[]; __next?: string } };
      const orders = (data.d?.results ?? []).map((o: unknown) => this.mapToSalesOrder(o as Record<string, unknown>));
      const nextLink = data.d?.__next;

      return Result.ok({
        success: true,
        data: orders,
        syncToken: nextLink ? this.extractSkipToken(nextLink) : undefined,
        totalRecords: orders.length,
        hasMore: !!nextLink,
      });
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Invoice Operations ====================

  async getInvoice(invoiceNumber: string): Promise<Result<SAPInvoice | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/A_BillingDocument('${invoiceNumber}')`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (response.status === 404) {
        return Result.ok(null);
      }

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { d: Record<string, unknown> };
      return Result.ok(this.mapToInvoice(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async syncInvoices(
    syncToken?: string,
    pageSize: number = 100
  ): Promise<Result<SAPSyncResult<SAPInvoice[]>, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const params = new URLSearchParams({
        '$top': pageSize.toString(),
        '$format': 'json',
      });

      if (syncToken) {
        params.set('$skiptoken', syncToken);
      }

      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_BILLING_DOCUMENT_SRV/A_BillingDocument?${params}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { d?: { results?: Record<string, unknown>[]; __next?: string } };
      const invoices = (data.d?.results ?? []).map((i) => this.mapToInvoice(i as Record<string, unknown>));
      const nextLink = data.d?.__next;

      return Result.ok({
        success: true,
        data: invoices,
        syncToken: nextLink ? this.extractSkipToken(nextLink) : undefined,
        totalRecords: invoices.length,
        hasMore: !!nextLink,
      });
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Material Operations ====================

  async getMaterial(materialNumber: string): Promise<Result<SAPMaterial | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product('${materialNumber}')`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (response.status === 404) {
        return Result.ok(null);
      }

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { d: Record<string, unknown> };
      return Result.ok(this.mapToMaterial(data.d));
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async syncMaterials(
    syncToken?: string,
    pageSize: number = 100
  ): Promise<Result<SAPSyncResult<SAPMaterial[]>, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const params = new URLSearchParams({
        '$top': pageSize.toString(),
        '$format': 'json',
      });

      if (syncToken) {
        params.set('$skiptoken', syncToken);
      }

      const response = await fetch(
        `${this.config.baseUrl}/sap/opu/odata/sap/API_PRODUCT_SRV/A_Product?${params}`,
        {
          method: 'GET',
          headers: this.getHeaders(),
        }
      );

      if (!response.ok) {
        return this.handleErrorResponse(response);
      }

      const data = (await response.json()) as { d?: { results?: Record<string, unknown>[]; __next?: string } };
      const materials = (data.d?.results ?? []).map((m) => this.mapToMaterial(m as Record<string, unknown>));
      const nextLink = data.d?.__next;

      return Result.ok({
        success: true,
        data: materials,
        syncToken: nextLink ? this.extractSkipToken(nextLink) : undefined,
        totalRecords: materials.length,
        hasMore: !!nextLink,
      });
    } catch (error) {
      return Result.fail(
        new SAPConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    const start = Date.now();

    try {
      const response = await fetch(`${this.config.baseUrl}/sap/opu/odata/sap/API_BUSINESS_PARTNER/$metadata`, {
        method: 'GET',
        headers: {
          'Accept': 'application/xml',
        },
      });

      const latencyMs = Date.now() - start;

      if (!response.ok) {
        return Result.ok({
          status: 'unhealthy',
          latencyMs,
        });
      }

      return Result.ok({
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        latencyMs,
      });
    } catch (error) {
      return Result.ok({
        status: 'unhealthy',
        latencyMs: Date.now() - start,
      });
    }
  }

  // ==================== Private Helpers ====================

  private async ensureAuthenticated(): Promise<Result<void, DomainError>> {
    if (!this.tokens || this.tokens.expiresAt < new Date()) {
      const authResult = await this.authenticate();
      if (authResult.isFailure) {
        return Result.fail(authResult.error);
      }
    }
    return Result.ok(undefined);
  }

  private getHeaders(): Record<string, string> {
    return {
      'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
      'x-csrf-token': this.tokens?.accessToken ?? '',
      'Cookie': this.tokens?.sessionId ?? '',
      'Accept': 'application/json',
    };
  }

  private handleErrorResponse<T>(response: Response): Result<T, DomainError> {
    switch (response.status) {
      case 401:
        return Result.fail(new SAPAuthenticationError('Session expired or invalid'));
      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new SAPRateLimitError(retryAfter));
      default:
        return Result.fail(new SAPDataError(`SAP API error: ${response.statusText}`));
    }
  }

  private extractSkipToken(nextLink: string): string {
    const match = nextLink.match(/\$skiptoken=([^&]+)/);
    return match ? match[1] : '';
  }

  private mapToCustomer(data: Record<string, unknown>): SAPCustomer {
    return {
      customerNumber: String(data.Customer ?? data.CustomerID ?? ''),
      name: String(data.CustomerName ?? data.CustomerFullName ?? ''),
      name2: data.CustomerName2 ? String(data.CustomerName2) : undefined,
      street: data.StreetName ? String(data.StreetName) : undefined,
      city: data.CityName ? String(data.CityName) : undefined,
      postalCode: data.PostalCode ? String(data.PostalCode) : undefined,
      country: String(data.Country ?? ''),
      region: data.Region ? String(data.Region) : undefined,
      phone: data.PhoneNumber ? String(data.PhoneNumber) : undefined,
      email: data.EmailAddress ? String(data.EmailAddress) : undefined,
      taxNumber: data.TaxNumber1 ? String(data.TaxNumber1) : undefined,
      creditLimit: data.CreditLimit ? Number(data.CreditLimit) : undefined,
      paymentTerms: data.PaymentTerms ? String(data.PaymentTerms) : undefined,
    };
  }

  private mapToSAPCustomer(customer: Partial<SAPCustomer>): Record<string, unknown> {
    const mapped: Record<string, unknown> = {};

    if (customer.name) mapped.CustomerFullName = customer.name;
    if (customer.name2) mapped.CustomerName2 = customer.name2;
    if (customer.street) mapped.StreetName = customer.street;
    if (customer.city) mapped.CityName = customer.city;
    if (customer.postalCode) mapped.PostalCode = customer.postalCode;
    if (customer.country) mapped.Country = customer.country;
    if (customer.region) mapped.Region = customer.region;
    if (customer.phone) mapped.PhoneNumber = customer.phone;
    if (customer.email) mapped.EmailAddress = customer.email;
    if (customer.taxNumber) mapped.TaxNumber1 = customer.taxNumber;
    if (customer.creditLimit) mapped.CreditLimit = customer.creditLimit;
    if (customer.paymentTerms) mapped.PaymentTerms = customer.paymentTerms;

    return mapped;
  }

  private mapToSalesOrder(data: Record<string, unknown>): SAPSalesOrder {
    const toItem = data.to_Item as { results?: Record<string, unknown>[] } | undefined;
    const items = Array.isArray(toItem?.results) ? toItem.results : [];

    return {
      orderNumber: String(data.SalesOrder ?? ''),
      customerNumber: String(data.SoldToParty ?? ''),
      orderDate: new Date(String(data.SalesOrderDate ?? new Date())),
      deliveryDate: data.RequestedDeliveryDate
        ? new Date(String(data.RequestedDeliveryDate))
        : undefined,
      status: this.mapStatusFromSAP(String(data.OverallSDProcessStatus ?? '')),
      currency: String(data.TransactionCurrency ?? 'USD'),
      netAmount: Number(data.TotalNetAmount ?? 0),
      taxAmount: Number(data.TotalTaxAmount ?? 0),
      totalAmount: Number(data.TotalNetAmount ?? 0) + Number(data.TotalTaxAmount ?? 0),
      items: items.map((item: Record<string, unknown>) => this.mapToSalesOrderItem(item)),
    };
  }

  private mapToSalesOrderItem(data: Record<string, unknown>): SAPSalesOrderItem {
    return {
      itemNumber: String(data.SalesOrderItem ?? ''),
      materialNumber: String(data.Material ?? ''),
      description: String(data.SalesOrderItemText ?? ''),
      quantity: Number(data.RequestedQuantity ?? 0),
      unit: String(data.RequestedQuantityUnit ?? 'EA'),
      unitPrice: Number(data.NetPriceAmount ?? 0),
      netAmount: Number(data.NetAmount ?? 0),
    };
  }

  private mapToSAPSalesOrder(order: Omit<SAPSalesOrder, 'orderNumber' | 'status'>): Record<string, unknown> {
    return {
      SoldToParty: order.customerNumber,
      SalesOrderDate: order.orderDate.toISOString().split('T')[0],
      RequestedDeliveryDate: order.deliveryDate?.toISOString().split('T')[0],
      TransactionCurrency: order.currency,
      to_Item: order.items.map((item, index) => ({
        SalesOrderItem: String((index + 1) * 10).padStart(6, '0'),
        Material: item.materialNumber,
        RequestedQuantity: item.quantity,
        RequestedQuantityUnit: item.unit,
      })),
    };
  }

  private mapToInvoice(data: Record<string, unknown>): SAPInvoice {
    return {
      invoiceNumber: String(data.BillingDocument ?? ''),
      orderNumber: String(data.SalesDocument ?? ''),
      customerNumber: String(data.SoldToParty ?? ''),
      invoiceDate: new Date(String(data.BillingDocumentDate ?? new Date())),
      dueDate: new Date(String(data.PaymentDueDate ?? new Date())),
      status: this.mapInvoiceStatus(String(data.PaymentStatus ?? '')),
      currency: String(data.TransactionCurrency ?? 'USD'),
      netAmount: Number(data.NetAmount ?? 0),
      taxAmount: Number(data.TaxAmount ?? 0),
      totalAmount: Number(data.GrossAmount ?? 0),
      paidAmount: Number(data.PaidAmount ?? 0),
    };
  }

  private mapToMaterial(data: Record<string, unknown>): SAPMaterial {
    return {
      materialNumber: String(data.Product ?? data.Material ?? ''),
      description: String(data.ProductDescription ?? ''),
      materialGroup: String(data.ProductGroup ?? ''),
      baseUnit: String(data.BaseUnit ?? 'EA'),
      weight: data.GrossWeight ? Number(data.GrossWeight) : undefined,
      weightUnit: data.WeightUnit ? String(data.WeightUnit) : undefined,
      stockQuantity: Number(data.CurrentStock ?? 0),
      reservedQuantity: Number(data.ReservedStock ?? 0),
      availableQuantity: Number(data.CurrentStock ?? 0) - Number(data.ReservedStock ?? 0),
      standardPrice: data.StandardPrice ? Number(data.StandardPrice) : undefined,
    };
  }

  private mapStatusFromSAP(sapStatus: string): SAPSalesOrder['status'] {
    switch (sapStatus) {
      case 'A':
        return 'open';
      case 'B':
        return 'in_progress';
      case 'C':
        return 'completed';
      case 'D':
        return 'shipped';
      case 'X':
        return 'cancelled';
      default:
        return 'open';
    }
  }

  private mapStatusToSAP(status: SAPSalesOrder['status']): string {
    switch (status) {
      case 'open':
        return 'A';
      case 'in_progress':
        return 'B';
      case 'completed':
        return 'C';
      case 'shipped':
        return 'D';
      case 'cancelled':
        return 'X';
      default:
        return 'A';
    }
  }

  private mapInvoiceStatus(paymentStatus: string): SAPInvoice['status'] {
    switch (paymentStatus) {
      case '':
      case 'A':
        return 'open';
      case 'P':
        return 'partial';
      case 'C':
        return 'paid';
      case 'O':
        return 'overdue';
      case 'X':
        return 'cancelled';
      default:
        return 'open';
    }
  }
}

export default SAPAdapter;
