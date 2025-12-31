/**
 * PayPal Payment Adapter
 * Implements payment processing via PayPal REST API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://developer.paypal.com/docs/api/overview/
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface PayPalConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  webhookId?: string;
}

export interface PayPalAccessToken {
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
  scope: string;
}

export interface PayPalOrder {
  id: string;
  status: 'CREATED' | 'SAVED' | 'APPROVED' | 'VOIDED' | 'COMPLETED' | 'PAYER_ACTION_REQUIRED';
  intent: 'CAPTURE' | 'AUTHORIZE';
  purchaseUnits: PayPalPurchaseUnit[];
  payer?: PayPalPayer;
  createTime: Date;
  updateTime: Date;
  links: PayPalLink[];
}

export interface PayPalPurchaseUnit {
  referenceId: string;
  description?: string;
  customId?: string;
  invoiceId?: string;
  amount: {
    currencyCode: string;
    value: string;
    breakdown?: {
      itemTotal?: { currencyCode: string; value: string };
      shipping?: { currencyCode: string; value: string };
      handling?: { currencyCode: string; value: string };
      taxTotal?: { currencyCode: string; value: string };
      discount?: { currencyCode: string; value: string };
    };
  };
  items?: PayPalItem[];
  shipping?: {
    name?: { fullName?: string };
    address?: PayPalAddress;
  };
  payments?: {
    captures?: PayPalCapture[];
    authorizations?: PayPalAuthorization[];
    refunds?: PayPalRefund[];
  };
}

export interface PayPalItem {
  name: string;
  unitAmount: { currencyCode: string; value: string };
  quantity: string;
  description?: string;
  sku?: string;
  category?: 'DIGITAL_GOODS' | 'PHYSICAL_GOODS' | 'DONATION';
}

export interface PayPalPayer {
  payerId?: string;
  name?: { givenName?: string; surname?: string };
  emailAddress?: string;
  phone?: { phoneType?: string; phoneNumber?: { nationalNumber?: string } };
  birthDate?: string;
  address?: PayPalAddress;
}

export interface PayPalAddress {
  addressLine1?: string;
  addressLine2?: string;
  adminArea1?: string;
  adminArea2?: string;
  postalCode?: string;
  countryCode?: string;
}

export interface PayPalCapture {
  id: string;
  status: 'COMPLETED' | 'DECLINED' | 'PARTIALLY_REFUNDED' | 'PENDING' | 'REFUNDED' | 'FAILED';
  amount: { currencyCode: string; value: string };
  finalCapture: boolean;
  sellerProtection?: { status: string; disputeCategories?: string[] };
  createTime: Date;
  updateTime: Date;
}

export interface PayPalAuthorization {
  id: string;
  status: 'CREATED' | 'CAPTURED' | 'DENIED' | 'EXPIRED' | 'PARTIALLY_CAPTURED' | 'VOIDED' | 'PENDING';
  amount: { currencyCode: string; value: string };
  expirationTime?: Date;
  createTime: Date;
  updateTime: Date;
}

export interface PayPalRefund {
  id: string;
  status: 'CANCELLED' | 'FAILED' | 'PENDING' | 'COMPLETED';
  amount: { currencyCode: string; value: string };
  invoiceId?: string;
  noteToPayer?: string;
  createTime: Date;
  updateTime: Date;
}

export interface PayPalLink {
  href: string;
  rel: string;
  method?: string;
}

export interface PayPalSubscription {
  id: string;
  status: 'APPROVAL_PENDING' | 'APPROVED' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'EXPIRED';
  planId: string;
  quantity?: string;
  subscriber?: PayPalPayer;
  billingInfo?: {
    outstandingBalance?: { currencyCode: string; value: string };
    cycleExecutions?: Array<{
      tenureType: string;
      sequence: number;
      cyclesCompleted: number;
      cyclesRemaining?: number;
      currentPricingSchemeVersion?: number;
      totalCycles?: number;
    }>;
    lastPayment?: {
      amount: { currencyCode: string; value: string };
      time: Date;
    };
    nextBillingTime?: Date;
    failedPaymentsCount?: number;
  };
  createTime: Date;
  updateTime: Date;
  links: PayPalLink[];
}

export interface PayPalWebhookEvent {
  id: string;
  eventType: string;
  eventVersion: string;
  resourceType: string;
  resourceVersion?: string;
  resource: Record<string, unknown>;
  summary?: string;
  createTime: Date;
  links: PayPalLink[];
}

export interface CreateOrderParams {
  intent: 'CAPTURE' | 'AUTHORIZE';
  purchaseUnits: Array<{
    referenceId?: string;
    description?: string;
    customId?: string;
    invoiceId?: string;
    currencyCode: string;
    amount: string;
    items?: Array<{
      name: string;
      unitAmount: string;
      quantity: string;
      description?: string;
      sku?: string;
    }>;
  }>;
  returnUrl?: string;
  cancelUrl?: string;
}

export interface CreateSubscriptionParams {
  planId: string;
  quantity?: string;
  subscriber?: {
    name?: { givenName?: string; surname?: string };
    emailAddress?: string;
  };
  applicationContext?: {
    returnUrl?: string;
    cancelUrl?: string;
    brandName?: string;
  };
}

// ==================== Error Types ====================

export class PayPalAuthenticationError extends DomainError {
  readonly code = 'PAYPAL_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PayPalInvalidRequestError extends DomainError {
  readonly code = 'PAYPAL_INVALID_REQUEST';
  readonly details?: Array<{ field?: string; description?: string }>;

  constructor(message: string, details?: Array<{ field?: string; description?: string }>) {
    super(message);
    this.details = details;
  }
}

export class PayPalRateLimitError extends DomainError {
  readonly code = 'PAYPAL_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PayPalConnectionError extends DomainError {
  readonly code = 'PAYPAL_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class PayPalResourceNotFoundError extends DomainError {
  readonly code = 'PAYPAL_NOT_FOUND';

  constructor(resourceType: string, resourceId: string) {
    super(`${resourceType} ${resourceId} not found`);
  }
}

// ==================== Adapter Interface ====================

export interface PayPalServicePort {
  // Authentication
  getAccessToken(): Promise<Result<PayPalAccessToken, DomainError>>;

  // Order Operations
  createOrder(params: CreateOrderParams): Promise<Result<PayPalOrder, DomainError>>;
  getOrder(orderId: string): Promise<Result<PayPalOrder | null, DomainError>>;
  captureOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>>;
  authorizeOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>>;

  // Capture Operations
  getCapture(captureId: string): Promise<Result<PayPalCapture | null, DomainError>>;
  refundCapture(captureId: string, amount?: { currencyCode: string; value: string }, noteToPayer?: string): Promise<Result<PayPalRefund, DomainError>>;

  // Authorization Operations
  getAuthorization(authorizationId: string): Promise<Result<PayPalAuthorization | null, DomainError>>;
  captureAuthorization(authorizationId: string, amount?: { currencyCode: string; value: string }): Promise<Result<PayPalCapture, DomainError>>;
  voidAuthorization(authorizationId: string): Promise<Result<void, DomainError>>;

  // Subscription Operations
  createSubscription(params: CreateSubscriptionParams): Promise<Result<PayPalSubscription, DomainError>>;
  getSubscription(subscriptionId: string): Promise<Result<PayPalSubscription | null, DomainError>>;
  activateSubscription(subscriptionId: string): Promise<Result<void, DomainError>>;
  suspendSubscription(subscriptionId: string, reason?: string): Promise<Result<void, DomainError>>;
  cancelSubscription(subscriptionId: string, reason?: string): Promise<Result<void, DomainError>>;

  // Webhook Operations
  verifyWebhookSignature(webhookId: string, headers: Record<string, string>, body: string): Promise<Result<boolean, DomainError>>;
  parseWebhookEvent(body: string): Result<PayPalWebhookEvent, DomainError>;

  // Health Check
  checkConnection(): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * PayPal Payment Adapter
 * Implements payment processing via PayPal REST API v2
 */
export class PayPalAdapter implements PayPalServicePort {
  private config: PayPalConfig;
  private accessToken: PayPalAccessToken | null = null;

  private get apiBaseUrl(): string {
    return this.config.environment === 'production'
      ? 'https://api-m.paypal.com'
      : 'https://api-m.sandbox.paypal.com';
  }

  constructor(config: PayPalConfig) {
    this.config = config;
  }

  // ==================== Authentication ====================

  async getAccessToken(): Promise<Result<PayPalAccessToken, DomainError>> {
    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await fetch(`${this.apiBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as { error_description?: string };
        return Result.fail(
          new PayPalAuthenticationError(errorData.error_description ?? 'Authentication failed')
        );
      }

      const data = (await response.json()) as {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope: string;
      };

      this.accessToken = {
        accessToken: data.access_token,
        tokenType: data.token_type,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
      };

      return Result.ok(this.accessToken);
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Order Operations ====================

  async createOrder(params: CreateOrderParams): Promise<Result<PayPalOrder, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const body = {
        intent: params.intent,
        purchase_units: params.purchaseUnits.map((unit, index) => ({
          reference_id: unit.referenceId ?? `unit-${index}`,
          description: unit.description,
          custom_id: unit.customId,
          invoice_id: unit.invoiceId,
          amount: {
            currency_code: unit.currencyCode,
            value: unit.amount,
            breakdown: unit.items
              ? {
                  item_total: {
                    currency_code: unit.currencyCode,
                    value: unit.amount,
                  },
                }
              : undefined,
          },
          items: unit.items?.map((item) => ({
            name: item.name,
            unit_amount: {
              currency_code: unit.currencyCode,
              value: item.unitAmount,
            },
            quantity: item.quantity,
            description: item.description,
            sku: item.sku,
          })),
        })),
        application_context:
          params.returnUrl || params.cancelUrl
            ? {
                return_url: params.returnUrl,
                cancel_url: params.cancelUrl,
              }
            : undefined,
      };

      const response = await this.makeRequest('POST', '/v2/checkout/orders', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToOrder(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getOrder(orderId: string): Promise<Result<PayPalOrder | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest('GET', `/v2/checkout/orders/${orderId}`);

      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToOrder(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async captureOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest('POST', `/v2/checkout/orders/${orderId}/capture`, {});
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToOrder(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async authorizeOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest('POST', `/v2/checkout/orders/${orderId}/authorize`, {});
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToOrder(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Capture Operations ====================

  async getCapture(captureId: string): Promise<Result<PayPalCapture | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest('GET', `/v2/payments/captures/${captureId}`);

      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToCapture(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async refundCapture(
    captureId: string,
    amount?: { currencyCode: string; value: string },
    noteToPayer?: string
  ): Promise<Result<PayPalRefund, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const body: Record<string, unknown> = {};
      if (amount) {
        body.amount = {
          currency_code: amount.currencyCode,
          value: amount.value,
        };
      }
      if (noteToPayer) {
        body.note_to_payer = noteToPayer;
      }

      const response = await this.makeRequest(
        'POST',
        `/v2/payments/captures/${captureId}/refund`,
        Object.keys(body).length > 0 ? body : undefined
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToRefund(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Authorization Operations ====================

  async getAuthorization(
    authorizationId: string
  ): Promise<Result<PayPalAuthorization | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'GET',
        `/v2/payments/authorizations/${authorizationId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToAuthorization(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async captureAuthorization(
    authorizationId: string,
    amount?: { currencyCode: string; value: string }
  ): Promise<Result<PayPalCapture, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const body = amount
        ? {
            amount: {
              currency_code: amount.currencyCode,
              value: amount.value,
            },
          }
        : {};

      const response = await this.makeRequest(
        'POST',
        `/v2/payments/authorizations/${authorizationId}/capture`,
        body
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToCapture(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async voidAuthorization(authorizationId: string): Promise<Result<void, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'POST',
        `/v2/payments/authorizations/${authorizationId}/void`,
        {}
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Subscription Operations ====================

  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<Result<PayPalSubscription, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const body: Record<string, unknown> = {
        plan_id: params.planId,
      };

      if (params.quantity) {
        body.quantity = params.quantity;
      }

      if (params.subscriber) {
        body.subscriber = {
          name: params.subscriber.name
            ? {
                given_name: params.subscriber.name.givenName,
                surname: params.subscriber.name.surname,
              }
            : undefined,
          email_address: params.subscriber.emailAddress,
        };
      }

      if (params.applicationContext) {
        body.application_context = {
          return_url: params.applicationContext.returnUrl,
          cancel_url: params.applicationContext.cancelUrl,
          brand_name: params.applicationContext.brandName,
        };
      }

      const response = await this.makeRequest('POST', '/v1/billing/subscriptions', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToSubscription(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getSubscription(
    subscriptionId: string
  ): Promise<Result<PayPalSubscription | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'GET',
        `/v1/billing/subscriptions/${subscriptionId}`
      );

      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToSubscription(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async activateSubscription(subscriptionId: string): Promise<Result<void, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'POST',
        `/v1/billing/subscriptions/${subscriptionId}/activate`,
        { reason: 'Reactivating subscription' }
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async suspendSubscription(
    subscriptionId: string,
    reason?: string
  ): Promise<Result<void, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'POST',
        `/v1/billing/subscriptions/${subscriptionId}/suspend`,
        { reason: reason ?? 'Suspending subscription' }
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    reason?: string
  ): Promise<Result<void, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest(
        'POST',
        `/v1/billing/subscriptions/${subscriptionId}/cancel`,
        { reason: reason ?? 'Cancelling subscription' }
      );
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Webhook Operations ====================

  async verifyWebhookSignature(
    webhookId: string,
    headers: Record<string, string>,
    body: string
  ): Promise<Result<boolean, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const verificationBody = {
        auth_algo: headers['paypal-auth-algo'],
        cert_url: headers['paypal-cert-url'],
        transmission_id: headers['paypal-transmission-id'],
        transmission_sig: headers['paypal-transmission-sig'],
        transmission_time: headers['paypal-transmission-time'],
        webhook_id: webhookId,
        webhook_event: JSON.parse(body),
      };

      const response = await this.makeRequest(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        verificationBody
      );

      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(response.value.verification_status === 'SUCCESS');
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  parseWebhookEvent(body: string): Result<PayPalWebhookEvent, DomainError> {
    try {
      const event = JSON.parse(body);

      return Result.ok({
        id: event.id,
        eventType: event.event_type,
        eventVersion: event.event_version,
        resourceType: event.resource_type,
        resourceVersion: event.resource_version,
        resource: event.resource,
        summary: event.summary,
        createTime: new Date(event.create_time),
        links: (event.links ?? []).map((link: Record<string, unknown>) => ({
          href: String(link.href ?? ''),
          rel: String(link.rel ?? ''),
          method: link.method ? String(link.method) : undefined,
        })),
      });
    } catch (error) {
      return Result.fail(
        new PayPalInvalidRequestError(
          error instanceof Error ? error.message : 'Invalid webhook payload'
        )
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    const start = Date.now();

    try {
      const result = await this.getAccessToken();
      const latencyMs = Date.now() - start;

      if (result.isFailure) {
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
    if (!this.accessToken || this.accessToken.expiresAt < new Date()) {
      const authResult = await this.getAccessToken();
      if (authResult.isFailure) {
        return Result.fail(authResult.error);
      }
    }
    return Result.ok(undefined);
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.accessToken?.accessToken}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // 204 No Content is success for some operations
    if (response.status === 204) {
      return Result.ok({});
    }

    if (!response.ok) {
      return this.handleErrorResponse(response);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return Result.ok(data);
  }

  private async handleErrorResponse(
    response: Response
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const data = (await response.json().catch(() => ({}))) as {
      message?: string;
      name?: string;
      debug_id?: string;
      details?: Array<{ field?: string; description?: string }>;
    };

    switch (response.status) {
      case 401:
        this.accessToken = null;
        return Result.fail(new PayPalAuthenticationError(data.message ?? 'Authentication failed'));
      case 404:
        return Result.fail(
          new PayPalResourceNotFoundError(data.name ?? 'Resource', data.debug_id ?? 'unknown')
        );
      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new PayPalRateLimitError(retryAfter));
      default:
        const details = (data.details ?? []).map((d) => ({
          field: d.field ? String(d.field) : undefined,
          description: d.description ? String(d.description) : undefined,
        }));
        return Result.fail(new PayPalInvalidRequestError(data.message ?? 'Request failed', details));
    }
  }

  private mapToOrder(data: Record<string, unknown>): PayPalOrder {
    const purchaseUnits = (data.purchase_units as Array<Record<string, unknown>>) ?? [];
    const payer = data.payer as Record<string, unknown> | undefined;
    const links = (data.links as Array<Record<string, unknown>>) ?? [];

    return {
      id: String(data.id ?? ''),
      status: String(data.status ?? 'CREATED') as PayPalOrder['status'],
      intent: String(data.intent ?? 'CAPTURE') as PayPalOrder['intent'],
      purchaseUnits: purchaseUnits.map((unit) => this.mapToPurchaseUnit(unit)),
      payer: payer ? this.mapToPayer(payer) : undefined,
      createTime: new Date(String(data.create_time ?? new Date().toISOString())),
      updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
      links: links.map((link) => ({
        href: String(link.href ?? ''),
        rel: String(link.rel ?? ''),
        method: link.method ? String(link.method) : undefined,
      })),
    };
  }

  private mapToPurchaseUnit(data: Record<string, unknown>): PayPalPurchaseUnit {
    const amount = (data.amount as Record<string, unknown>) ?? {};
    const breakdown = amount.breakdown as Record<string, unknown> | undefined;
    const items = (data.items as Array<Record<string, unknown>>) ?? [];
    const shipping = data.shipping as Record<string, unknown> | undefined;
    const payments = data.payments as Record<string, unknown> | undefined;

    return {
      referenceId: String(data.reference_id ?? ''),
      description: data.description ? String(data.description) : undefined,
      customId: data.custom_id ? String(data.custom_id) : undefined,
      invoiceId: data.invoice_id ? String(data.invoice_id) : undefined,
      amount: {
        currencyCode: String(amount.currency_code ?? 'USD'),
        value: String(amount.value ?? '0.00'),
        breakdown: breakdown
          ? {
              itemTotal: breakdown.item_total
                ? {
                    currencyCode: String((breakdown.item_total as Record<string, unknown>).currency_code ?? 'USD'),
                    value: String((breakdown.item_total as Record<string, unknown>).value ?? '0.00'),
                  }
                : undefined,
              shipping: breakdown.shipping
                ? {
                    currencyCode: String((breakdown.shipping as Record<string, unknown>).currency_code ?? 'USD'),
                    value: String((breakdown.shipping as Record<string, unknown>).value ?? '0.00'),
                  }
                : undefined,
              taxTotal: breakdown.tax_total
                ? {
                    currencyCode: String((breakdown.tax_total as Record<string, unknown>).currency_code ?? 'USD'),
                    value: String((breakdown.tax_total as Record<string, unknown>).value ?? '0.00'),
                  }
                : undefined,
            }
          : undefined,
      },
      items: items.map((item) => this.mapToItem(item)),
      shipping: shipping ? this.mapToShipping(shipping) : undefined,
      payments: payments
        ? {
            captures: (payments.captures as Array<Record<string, unknown>>)?.map((c) =>
              this.mapToCapture(c)
            ),
            authorizations: (payments.authorizations as Array<Record<string, unknown>>)?.map((a) =>
              this.mapToAuthorization(a)
            ),
            refunds: (payments.refunds as Array<Record<string, unknown>>)?.map((r) =>
              this.mapToRefund(r)
            ),
          }
        : undefined,
    };
  }

  private mapToItem(data: Record<string, unknown>): PayPalItem {
    const unitAmount = (data.unit_amount as Record<string, unknown>) ?? {};

    return {
      name: String(data.name ?? ''),
      unitAmount: {
        currencyCode: String(unitAmount.currency_code ?? 'USD'),
        value: String(unitAmount.value ?? '0.00'),
      },
      quantity: String(data.quantity ?? '1'),
      description: data.description ? String(data.description) : undefined,
      sku: data.sku ? String(data.sku) : undefined,
      category: data.category ? (String(data.category) as PayPalItem['category']) : undefined,
    };
  }

  private mapToPayer(data: Record<string, unknown>): PayPalPayer {
    const name = data.name as Record<string, unknown> | undefined;
    const phone = data.phone as Record<string, unknown> | undefined;
    const address = data.address as Record<string, unknown> | undefined;

    return {
      payerId: data.payer_id ? String(data.payer_id) : undefined,
      name: name
        ? {
            givenName: name.given_name ? String(name.given_name) : undefined,
            surname: name.surname ? String(name.surname) : undefined,
          }
        : undefined,
      emailAddress: data.email_address ? String(data.email_address) : undefined,
      phone: phone
        ? {
            phoneType: phone.phone_type ? String(phone.phone_type) : undefined,
            phoneNumber: phone.phone_number
              ? {
                  nationalNumber: (phone.phone_number as Record<string, unknown>).national_number
                    ? String((phone.phone_number as Record<string, unknown>).national_number)
                    : undefined,
                }
              : undefined,
          }
        : undefined,
      birthDate: data.birth_date ? String(data.birth_date) : undefined,
      address: address ? this.mapToAddress(address) : undefined,
    };
  }

  private mapToAddress(data: Record<string, unknown>): PayPalAddress {
    return {
      addressLine1: data.address_line_1 ? String(data.address_line_1) : undefined,
      addressLine2: data.address_line_2 ? String(data.address_line_2) : undefined,
      adminArea1: data.admin_area_1 ? String(data.admin_area_1) : undefined,
      adminArea2: data.admin_area_2 ? String(data.admin_area_2) : undefined,
      postalCode: data.postal_code ? String(data.postal_code) : undefined,
      countryCode: data.country_code ? String(data.country_code) : undefined,
    };
  }

  private mapToShipping(
    data: Record<string, unknown>
  ): { name?: { fullName?: string }; address?: PayPalAddress } {
    const name = data.name as Record<string, unknown> | undefined;
    const address = data.address as Record<string, unknown> | undefined;

    return {
      name: name
        ? {
            fullName: name.full_name ? String(name.full_name) : undefined,
          }
        : undefined,
      address: address ? this.mapToAddress(address) : undefined,
    };
  }

  private mapToCapture(data: Record<string, unknown>): PayPalCapture {
    const amount = (data.amount as Record<string, unknown>) ?? {};
    const sellerProtection = data.seller_protection as Record<string, unknown> | undefined;

    return {
      id: String(data.id ?? ''),
      status: String(data.status ?? 'PENDING') as PayPalCapture['status'],
      amount: {
        currencyCode: String(amount.currency_code ?? 'USD'),
        value: String(amount.value ?? '0.00'),
      },
      finalCapture: Boolean(data.final_capture),
      sellerProtection: sellerProtection
        ? {
            status: String(sellerProtection.status ?? ''),
            disputeCategories: sellerProtection.dispute_categories as string[] | undefined,
          }
        : undefined,
      createTime: new Date(String(data.create_time ?? new Date().toISOString())),
      updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
    };
  }

  private mapToAuthorization(data: Record<string, unknown>): PayPalAuthorization {
    const amount = (data.amount as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      status: String(data.status ?? 'PENDING') as PayPalAuthorization['status'],
      amount: {
        currencyCode: String(amount.currency_code ?? 'USD'),
        value: String(amount.value ?? '0.00'),
      },
      expirationTime: data.expiration_time
        ? new Date(String(data.expiration_time))
        : undefined,
      createTime: new Date(String(data.create_time ?? new Date().toISOString())),
      updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
    };
  }

  private mapToRefund(data: Record<string, unknown>): PayPalRefund {
    const amount = (data.amount as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      status: String(data.status ?? 'PENDING') as PayPalRefund['status'],
      amount: {
        currencyCode: String(amount.currency_code ?? 'USD'),
        value: String(amount.value ?? '0.00'),
      },
      invoiceId: data.invoice_id ? String(data.invoice_id) : undefined,
      noteToPayer: data.note_to_payer ? String(data.note_to_payer) : undefined,
      createTime: new Date(String(data.create_time ?? new Date().toISOString())),
      updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
    };
  }

  private mapToSubscription(data: Record<string, unknown>): PayPalSubscription {
    const subscriber = data.subscriber as Record<string, unknown> | undefined;
    const billingInfo = data.billing_info as Record<string, unknown> | undefined;
    const links = (data.links as Array<Record<string, unknown>>) ?? [];

    return {
      id: String(data.id ?? ''),
      status: String(data.status ?? 'APPROVAL_PENDING') as PayPalSubscription['status'],
      planId: String(data.plan_id ?? ''),
      quantity: data.quantity ? String(data.quantity) : undefined,
      subscriber: subscriber ? this.mapToPayer(subscriber) : undefined,
      billingInfo: billingInfo
        ? {
            outstandingBalance: billingInfo.outstanding_balance
              ? {
                  currencyCode: String(
                    (billingInfo.outstanding_balance as Record<string, unknown>).currency_code ?? 'USD'
                  ),
                  value: String(
                    (billingInfo.outstanding_balance as Record<string, unknown>).value ?? '0.00'
                  ),
                }
              : undefined,
            lastPayment: billingInfo.last_payment
              ? {
                  amount: {
                    currencyCode: String(
                      ((billingInfo.last_payment as Record<string, unknown>).amount as Record<string, unknown>)
                        ?.currency_code ?? 'USD'
                    ),
                    value: String(
                      ((billingInfo.last_payment as Record<string, unknown>).amount as Record<string, unknown>)
                        ?.value ?? '0.00'
                    ),
                  },
                  time: new Date(
                    String((billingInfo.last_payment as Record<string, unknown>).time ?? new Date().toISOString())
                  ),
                }
              : undefined,
            nextBillingTime: billingInfo.next_billing_time
              ? new Date(String(billingInfo.next_billing_time))
              : undefined,
            failedPaymentsCount: billingInfo.failed_payments_count
              ? Number(billingInfo.failed_payments_count)
              : undefined,
          }
        : undefined,
      createTime: new Date(String(data.create_time ?? new Date().toISOString())),
      updateTime: new Date(String(data.update_time ?? new Date().toISOString())),
      links: links.map((link) => ({
        href: String(link.href ?? ''),
        rel: String(link.rel ?? ''),
        method: link.method ? String(link.method) : undefined,
      })),
    };
  }
}

export default PayPalAdapter;
