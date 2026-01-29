/**
 * PayPal Payment Adapter (Refactored)
 * Facade that delegates to handlers
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  PayPalConfig,
  PayPalAccessToken,
  PayPalOrder,
  PayPalCapture,
  PayPalAuthorization,
  PayPalRefund,
  PayPalSubscription,
  PayPalWebhookEvent,
  CreateOrderParams,
  CreateSubscriptionParams,
} from './types';
import {
  PayPalAuthenticationError,
  PayPalInvalidRequestError,
  PayPalRateLimitError,
  PayPalConnectionError,
  PayPalResourceNotFoundError,
} from './errors';
import {
  mapToOrder,
  mapToCapture,
  mapToAuthorization,
  mapToRefund,
  mapToSubscription,
} from './mappers';

/**
 * PayPal Service Port Interface
 */
export interface PayPalServicePort {
  getAccessToken(): Promise<Result<PayPalAccessToken, DomainError>>;
  createOrder(params: CreateOrderParams): Promise<Result<PayPalOrder, DomainError>>;
  getOrder(orderId: string): Promise<Result<PayPalOrder | null, DomainError>>;
  captureOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>>;
  authorizeOrder(orderId: string): Promise<Result<PayPalOrder, DomainError>>;
  getCapture(captureId: string): Promise<Result<PayPalCapture | null, DomainError>>;
  refundCapture(
    captureId: string,
    amount?: { currencyCode: string; value: string },
    noteToPayer?: string
  ): Promise<Result<PayPalRefund, DomainError>>;
  getAuthorization(
    authorizationId: string
  ): Promise<Result<PayPalAuthorization | null, DomainError>>;
  captureAuthorization(
    authorizationId: string,
    amount?: { currencyCode: string; value: string }
  ): Promise<Result<PayPalCapture, DomainError>>;
  voidAuthorization(authorizationId: string): Promise<Result<void, DomainError>>;
  createSubscription(
    params: CreateSubscriptionParams
  ): Promise<Result<PayPalSubscription, DomainError>>;
  getSubscription(subscriptionId: string): Promise<Result<PayPalSubscription | null, DomainError>>;
  activateSubscription(subscriptionId: string): Promise<Result<void, DomainError>>;
  suspendSubscription(subscriptionId: string, reason?: string): Promise<Result<void, DomainError>>;
  cancelSubscription(subscriptionId: string, reason?: string): Promise<Result<void, DomainError>>;
  verifyWebhookSignature(
    webhookId: string,
    headers: Record<string, string>,
    body: string
  ): Promise<Result<boolean, DomainError>>;
  parseWebhookEvent(body: string): Result<PayPalWebhookEvent, DomainError>;
  checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  >;
}

/**
 * PayPal Payment Adapter
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

  // Authentication
  async getAccessToken(): Promise<Result<PayPalAccessToken, DomainError>> {
    try {
      const credentials = Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString('base64');

      const response = await fetch(`${this.apiBaseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => ({}))) as {
          error_description?: string;
        };
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

  // Order Operations
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
              ? { item_total: { currency_code: unit.currencyCode, value: unit.amount } }
              : undefined,
          },
          items: unit.items?.map((item) => ({
            name: item.name,
            unit_amount: { currency_code: unit.currencyCode, value: item.unitAmount },
            quantity: item.quantity,
            description: item.description,
            sku: item.sku,
          })),
        })),
        application_context:
          params.returnUrl || params.cancelUrl
            ? { return_url: params.returnUrl, cancel_url: params.cancelUrl }
            : undefined,
      };

      const response = await this.makeRequest('POST', '/v2/checkout/orders', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(mapToOrder(response.value));
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
        if (response.error.code === 'PAYPAL_NOT_FOUND') return Result.ok(null);
        return Result.fail(response.error);
      }
      return Result.ok(mapToOrder(response.value));
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
      const response = await this.makeRequest(
        'POST',
        `/v2/checkout/orders/${orderId}/capture`,
        {}
      );
      if (response.isFailure) return Result.fail(response.error);
      return Result.ok(mapToOrder(response.value));
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
      const response = await this.makeRequest(
        'POST',
        `/v2/checkout/orders/${orderId}/authorize`,
        {}
      );
      if (response.isFailure) return Result.fail(response.error);
      return Result.ok(mapToOrder(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // Capture Operations
  async getCapture(captureId: string): Promise<Result<PayPalCapture | null, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const response = await this.makeRequest('GET', `/v2/payments/captures/${captureId}`);
      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') return Result.ok(null);
        return Result.fail(response.error);
      }
      return Result.ok(mapToCapture(response.value));
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
      if (amount) body.amount = { currency_code: amount.currencyCode, value: amount.value };
      if (noteToPayer) body.note_to_payer = noteToPayer;

      const response = await this.makeRequest(
        'POST',
        `/v2/payments/captures/${captureId}/refund`,
        Object.keys(body).length > 0 ? body : undefined
      );
      if (response.isFailure) return Result.fail(response.error);
      return Result.ok(mapToRefund(response.value));
    } catch (error) {
      return Result.fail(
        new PayPalConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // Authorization Operations
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
        if (response.error.code === 'PAYPAL_NOT_FOUND') return Result.ok(null);
        return Result.fail(response.error);
      }
      return Result.ok(mapToAuthorization(response.value));
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
        ? { amount: { currency_code: amount.currencyCode, value: amount.value } }
        : {};
      const response = await this.makeRequest(
        'POST',
        `/v2/payments/authorizations/${authorizationId}/capture`,
        body
      );
      if (response.isFailure) return Result.fail(response.error);
      return Result.ok(mapToCapture(response.value));
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

  // Subscription Operations
  async createSubscription(
    params: CreateSubscriptionParams
  ): Promise<Result<PayPalSubscription, DomainError>> {
    const authCheck = await this.ensureAuthenticated();
    if (authCheck.isFailure) return Result.fail(authCheck.error);

    try {
      const body: Record<string, unknown> = { plan_id: params.planId };
      if (params.quantity) body.quantity = params.quantity;
      if (params.subscriber) {
        body.subscriber = {
          name: params.subscriber.name
            ? { given_name: params.subscriber.name.givenName, surname: params.subscriber.name.surname }
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
      return Result.ok(mapToSubscription(response.value));
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
      const response = await this.makeRequest('GET', `/v1/billing/subscriptions/${subscriptionId}`);
      if (response.isFailure) {
        if (response.error.code === 'PAYPAL_NOT_FOUND') return Result.ok(null);
        return Result.fail(response.error);
      }
      return Result.ok(mapToSubscription(response.value));
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

  // Webhook Operations
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

  // Health Check
  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    const start = Date.now();

    try {
      const result = await this.getAccessToken();
      const latencyMs = Date.now() - start;

      if (result.isFailure) {
        return Result.ok({ status: 'unhealthy', latencyMs });
      }

      return Result.ok({
        status: latencyMs < 1000 ? 'healthy' : 'degraded',
        latencyMs,
      });
    } catch {
      return Result.ok({
        status: 'unhealthy',
        latencyMs: Date.now() - start,
      });
    }
  }

  // Private Helpers
  private async ensureAuthenticated(): Promise<Result<void, DomainError>> {
    if (!this.accessToken || this.accessToken.expiresAt < new Date()) {
      const authResult = await this.getAccessToken();
      if (authResult.isFailure) return Result.fail(authResult.error);
    }
    return Result.ok(undefined);
  }

  private async makeRequest(
    method: string,
    endpoint: string,
    body?: Record<string, unknown>
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken?.accessToken}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) return Result.ok({});

    if (!response.ok) return this.handleErrorResponse(response);

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
      case 429: {
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new PayPalRateLimitError(retryAfter));
      }
      default: {
        const details = (data.details ?? []).map((d) => ({
          field: d.field ? String(d.field) : undefined,
          description: d.description ? String(d.description) : undefined,
        }));
        return Result.fail(
          new PayPalInvalidRequestError(data.message ?? 'Request failed', details)
        );
      }
    }
  }
}
