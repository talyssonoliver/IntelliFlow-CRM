/**
 * Stripe Payment Adapter
 * Implements payment processing via Stripe API
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 * @see https://stripe.com/docs/api
 */

import { Result, DomainError } from '@intelliflow/domain';

// ==================== Types ====================

export interface StripeConfig {
  secretKey: string;
  webhookSecret?: string;
  apiVersion?: string;
}

export interface StripeCustomer {
  id: string;
  email?: string;
  name?: string;
  phone?: string;
  description?: string;
  metadata?: Record<string, string>;
  defaultPaymentMethodId?: string;
  balance: number;
  currency: string;
  created: Date;
}

export interface StripePaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'sepa_debit' | 'ideal' | 'paypal';
  customerId?: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding: string;
  };
  bankAccount?: {
    bankName: string;
    last4: string;
    routingNumber?: string;
    accountHolderType: 'individual' | 'company';
  };
  billingDetails: {
    name?: string;
    email?: string;
    phone?: string;
    address?: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postalCode?: string;
      country?: string;
    };
  };
  created: Date;
}

export interface StripePaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'requires_action' |
          'processing' | 'requires_capture' | 'canceled' | 'succeeded';
  customerId?: string;
  paymentMethodId?: string;
  clientSecret: string;
  description?: string;
  metadata?: Record<string, string>;
  receiptEmail?: string;
  capturedAmount?: number;
  created: Date;
}

export interface StripeRefund {
  id: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
  receiptNumber?: string;
  created: Date;
}

export interface StripeSubscription {
  id: string;
  customerId: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' |
          'past_due' | 'canceled' | 'unpaid' | 'paused';
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  metadata?: Record<string, string>;
}

export interface StripeInvoice {
  id: string;
  customerId: string;
  subscriptionId?: string;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amountDue: number;
  amountPaid: number;
  amountRemaining: number;
  currency: string;
  dueDate?: Date;
  paidAt?: Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
  created: Date;
}

export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
    previousAttributes?: Record<string, unknown>;
  };
  created: Date;
  livemode: boolean;
}

export interface CreatePaymentIntentParams {
  amount: number;
  currency: string;
  customerId?: string;
  paymentMethodId?: string;
  description?: string;
  metadata?: Record<string, string>;
  receiptEmail?: string;
  captureMethod?: 'automatic' | 'manual';
  confirmationMethod?: 'automatic' | 'manual';
}

export interface StripeCreateSubscriptionParams {
  customerId: string;
  priceId: string;
  quantity?: number;
  trialPeriodDays?: number;
  metadata?: Record<string, string>;
  cancelAtPeriodEnd?: boolean;
}

// ==================== Error Types ====================

export class StripeAuthenticationError extends DomainError {
  readonly code = 'STRIPE_AUTH_ERROR';

  constructor(message: string) {
    super(message);
  }
}

export class StripeCardError extends DomainError {
  readonly code = 'STRIPE_CARD_ERROR';
  readonly declineCode?: string;

  constructor(message: string, declineCode?: string) {
    super(message);
    this.declineCode = declineCode;
  }
}

export class StripeRateLimitError extends DomainError {
  readonly code = 'STRIPE_RATE_LIMIT';
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Rate limited. Retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class StripeInvalidRequestError extends DomainError {
  readonly code = 'STRIPE_INVALID_REQUEST';

  constructor(message: string) {
    super(message);
  }
}

export class StripeConnectionError extends DomainError {
  readonly code = 'STRIPE_CONNECTION_ERROR';

  constructor(message: string) {
    super(message);
  }
}

// ==================== Adapter Interface ====================

export interface PaymentServicePort {
  // Customer Operations
  createCustomer(params: { email?: string; name?: string; metadata?: Record<string, string> }): Promise<Result<StripeCustomer, DomainError>>;
  getCustomer(customerId: string): Promise<Result<StripeCustomer | null, DomainError>>;
  updateCustomer(customerId: string, params: Partial<{ email: string; name: string; metadata: Record<string, string> }>): Promise<Result<StripeCustomer, DomainError>>;
  deleteCustomer(customerId: string): Promise<Result<void, DomainError>>;

  // Payment Method Operations
  attachPaymentMethod(paymentMethodId: string, customerId: string): Promise<Result<StripePaymentMethod, DomainError>>;
  detachPaymentMethod(paymentMethodId: string): Promise<Result<void, DomainError>>;
  listPaymentMethods(customerId: string): Promise<Result<StripePaymentMethod[], DomainError>>;

  // Payment Intent Operations
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<Result<StripePaymentIntent, DomainError>>;
  confirmPaymentIntent(paymentIntentId: string, paymentMethodId?: string): Promise<Result<StripePaymentIntent, DomainError>>;
  capturePaymentIntent(paymentIntentId: string, amount?: number): Promise<Result<StripePaymentIntent, DomainError>>;
  cancelPaymentIntent(paymentIntentId: string): Promise<Result<StripePaymentIntent, DomainError>>;
  getPaymentIntent(paymentIntentId: string): Promise<Result<StripePaymentIntent | null, DomainError>>;

  // Refund Operations
  createRefund(paymentIntentId: string, amount?: number, reason?: StripeRefund['reason']): Promise<Result<StripeRefund, DomainError>>;
  getRefund(refundId: string): Promise<Result<StripeRefund | null, DomainError>>;

  // Subscription Operations
  createSubscription(params: StripeCreateSubscriptionParams): Promise<Result<StripeSubscription, DomainError>>;
  updateSubscription(subscriptionId: string, params: Partial<StripeCreateSubscriptionParams>): Promise<Result<StripeSubscription, DomainError>>;
  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean): Promise<Result<StripeSubscription, DomainError>>;
  getSubscription(subscriptionId: string): Promise<Result<StripeSubscription | null, DomainError>>;
  listSubscriptions(customerId: string): Promise<Result<StripeSubscription[], DomainError>>;

  // Invoice Operations
  getInvoice(invoiceId: string): Promise<Result<StripeInvoice | null, DomainError>>;
  listInvoices(customerId: string): Promise<Result<StripeInvoice[], DomainError>>;
  payInvoice(invoiceId: string): Promise<Result<StripeInvoice, DomainError>>;

  // Webhook Operations
  constructWebhookEvent(payload: string, signature: string): Result<StripeWebhookEvent, DomainError>;

  // Health Check
  checkConnection(): Promise<Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>>;
}

// ==================== Adapter Implementation ====================

/**
 * Stripe Payment Adapter
 * Implements payment processing via Stripe REST API
 */
export class StripeAdapter implements PaymentServicePort {
  private config: StripeConfig;
  private readonly apiBaseUrl = 'https://api.stripe.com/v1';

  constructor(config: StripeConfig) {
    this.config = config;
  }

  // ==================== Customer Operations ====================

  async createCustomer(params: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Result<StripeCustomer, DomainError>> {
    try {
      const body = new URLSearchParams();
      if (params.email) body.append('email', params.email);
      if (params.name) body.append('name', params.name);
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, value);
        });
      }

      const response = await this.makeRequest('POST', '/customers', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToCustomer(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getCustomer(customerId: string): Promise<Result<StripeCustomer | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', `/customers/${customerId}`);

      if (response.isFailure) {
        if (response.error.code === 'STRIPE_INVALID_REQUEST') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToCustomer(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateCustomer(
    customerId: string,
    params: Partial<{ email: string; name: string; metadata: Record<string, string> }>
  ): Promise<Result<StripeCustomer, DomainError>> {
    try {
      const body = new URLSearchParams();
      if (params.email) body.append('email', params.email);
      if (params.name) body.append('name', params.name);
      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, value);
        });
      }

      const response = await this.makeRequest('POST', `/customers/${customerId}`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToCustomer(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async deleteCustomer(customerId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('DELETE', `/customers/${customerId}`);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Payment Method Operations ====================

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Result<StripePaymentMethod, DomainError>> {
    try {
      const body = new URLSearchParams();
      body.append('customer', customerId);

      const response = await this.makeRequest('POST', `/payment_methods/${paymentMethodId}/attach`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToPaymentMethod(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<Result<void, DomainError>> {
    try {
      const response = await this.makeRequest('POST', `/payment_methods/${paymentMethodId}/detach`);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(undefined);
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listPaymentMethods(customerId: string): Promise<Result<StripePaymentMethod[], DomainError>> {
    try {
      const params = new URLSearchParams({
        customer: customerId,
        type: 'card',
      });

      const response = await this.makeRequest('GET', `/payment_methods?${params}`);
      if (response.isFailure) return Result.fail(response.error);

      const responseData = response.value as { data?: Record<string, unknown>[] };
      const methods = (responseData.data ?? []).map((pm: Record<string, unknown>) =>
        this.mapToPaymentMethod(pm)
      );
      return Result.ok(methods);
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Payment Intent Operations ====================

  async createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<Result<StripePaymentIntent, DomainError>> {
    try {
      const body = new URLSearchParams();
      body.append('amount', params.amount.toString());
      body.append('currency', params.currency);

      if (params.customerId) body.append('customer', params.customerId);
      if (params.paymentMethodId) body.append('payment_method', params.paymentMethodId);
      if (params.description) body.append('description', params.description);
      if (params.receiptEmail) body.append('receipt_email', params.receiptEmail);
      if (params.captureMethod) body.append('capture_method', params.captureMethod);
      if (params.confirmationMethod) body.append('confirmation_method', params.confirmationMethod);

      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, value);
        });
      }

      const response = await this.makeRequest('POST', '/payment_intents', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToPaymentIntent(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Result<StripePaymentIntent, DomainError>> {
    try {
      const body = new URLSearchParams();
      if (paymentMethodId) body.append('payment_method', paymentMethodId);

      const response = await this.makeRequest('POST', `/payment_intents/${paymentIntentId}/confirm`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToPaymentIntent(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async capturePaymentIntent(
    paymentIntentId: string,
    amount?: number
  ): Promise<Result<StripePaymentIntent, DomainError>> {
    try {
      const body = new URLSearchParams();
      if (amount !== undefined) body.append('amount_to_capture', amount.toString());

      const response = await this.makeRequest('POST', `/payment_intents/${paymentIntentId}/capture`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToPaymentIntent(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<Result<StripePaymentIntent, DomainError>> {
    try {
      const response = await this.makeRequest('POST', `/payment_intents/${paymentIntentId}/cancel`);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToPaymentIntent(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getPaymentIntent(
    paymentIntentId: string
  ): Promise<Result<StripePaymentIntent | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', `/payment_intents/${paymentIntentId}`);

      if (response.isFailure) {
        if (response.error.code === 'STRIPE_INVALID_REQUEST') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToPaymentIntent(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Refund Operations ====================

  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: StripeRefund['reason']
  ): Promise<Result<StripeRefund, DomainError>> {
    try {
      const body = new URLSearchParams();
      body.append('payment_intent', paymentIntentId);
      if (amount !== undefined) body.append('amount', amount.toString());
      if (reason) body.append('reason', reason);

      const response = await this.makeRequest('POST', '/refunds', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToRefund(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getRefund(refundId: string): Promise<Result<StripeRefund | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', `/refunds/${refundId}`);

      if (response.isFailure) {
        if (response.error.code === 'STRIPE_INVALID_REQUEST') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToRefund(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Subscription Operations ====================

  async createSubscription(
    params: StripeCreateSubscriptionParams
  ): Promise<Result<StripeSubscription, DomainError>> {
    try {
      const body = new URLSearchParams();
      body.append('customer', params.customerId);
      body.append('items[0][price]', params.priceId);

      if (params.quantity) body.append('items[0][quantity]', params.quantity.toString());
      if (params.trialPeriodDays) body.append('trial_period_days', params.trialPeriodDays.toString());
      if (params.cancelAtPeriodEnd) body.append('cancel_at_period_end', 'true');

      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, value);
        });
      }

      const response = await this.makeRequest('POST', '/subscriptions', body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToSubscription(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async updateSubscription(
    subscriptionId: string,
    params: Partial<StripeCreateSubscriptionParams>
  ): Promise<Result<StripeSubscription, DomainError>> {
    try {
      const body = new URLSearchParams();

      if (params.priceId) body.append('items[0][price]', params.priceId);
      if (params.quantity) body.append('items[0][quantity]', params.quantity.toString());
      if (params.cancelAtPeriodEnd !== undefined) {
        body.append('cancel_at_period_end', params.cancelAtPeriodEnd.toString());
      }

      if (params.metadata) {
        Object.entries(params.metadata).forEach(([key, value]) => {
          body.append(`metadata[${key}]`, value);
        });
      }

      const response = await this.makeRequest('POST', `/subscriptions/${subscriptionId}`, body);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToSubscription(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async cancelSubscription(
    subscriptionId: string,
    atPeriodEnd: boolean = false
  ): Promise<Result<StripeSubscription, DomainError>> {
    try {
      if (atPeriodEnd) {
        const body = new URLSearchParams();
        body.append('cancel_at_period_end', 'true');

        const response = await this.makeRequest('POST', `/subscriptions/${subscriptionId}`, body);
        if (response.isFailure) return Result.fail(response.error);

        return Result.ok(this.mapToSubscription(response.value));
      } else {
        const response = await this.makeRequest('DELETE', `/subscriptions/${subscriptionId}`);
        if (response.isFailure) return Result.fail(response.error);

        return Result.ok(this.mapToSubscription(response.value));
      }
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async getSubscription(
    subscriptionId: string
  ): Promise<Result<StripeSubscription | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', `/subscriptions/${subscriptionId}`);

      if (response.isFailure) {
        if (response.error.code === 'STRIPE_INVALID_REQUEST') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToSubscription(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listSubscriptions(customerId: string): Promise<Result<StripeSubscription[], DomainError>> {
    try {
      const params = new URLSearchParams({ customer: customerId });
      const response = await this.makeRequest('GET', `/subscriptions?${params}`);
      if (response.isFailure) return Result.fail(response.error);

      const responseData = response.value as { data?: Record<string, unknown>[] };
      const subscriptions = (responseData.data ?? []).map((sub: Record<string, unknown>) =>
        this.mapToSubscription(sub)
      );
      return Result.ok(subscriptions);
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Invoice Operations ====================

  async getInvoice(invoiceId: string): Promise<Result<StripeInvoice | null, DomainError>> {
    try {
      const response = await this.makeRequest('GET', `/invoices/${invoiceId}`);

      if (response.isFailure) {
        if (response.error.code === 'STRIPE_INVALID_REQUEST') {
          return Result.ok(null);
        }
        return Result.fail(response.error);
      }

      return Result.ok(this.mapToInvoice(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async listInvoices(customerId: string): Promise<Result<StripeInvoice[], DomainError>> {
    try {
      const params = new URLSearchParams({ customer: customerId });
      const response = await this.makeRequest('GET', `/invoices?${params}`);
      if (response.isFailure) return Result.fail(response.error);

      const responseData = response.value as { data?: Record<string, unknown>[] };
      const invoices = (responseData.data ?? []).map((inv: Record<string, unknown>) =>
        this.mapToInvoice(inv)
      );
      return Result.ok(invoices);
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  async payInvoice(invoiceId: string): Promise<Result<StripeInvoice, DomainError>> {
    try {
      const response = await this.makeRequest('POST', `/invoices/${invoiceId}/pay`);
      if (response.isFailure) return Result.fail(response.error);

      return Result.ok(this.mapToInvoice(response.value));
    } catch (error) {
      return Result.fail(
        new StripeConnectionError(error instanceof Error ? error.message : 'Unknown error')
      );
    }
  }

  // ==================== Webhook Operations ====================

  constructWebhookEvent(payload: string, signature: string): Result<StripeWebhookEvent, DomainError> {
    if (!this.config.webhookSecret) {
      return Result.fail(new StripeInvalidRequestError('Webhook secret not configured'));
    }

    try {
      // Verify webhook signature
      const elements = signature.split(',');
      const signatureMap: Record<string, string> = {};

      elements.forEach((element) => {
        const [key, value] = element.split('=');
        signatureMap[key] = value;
      });

      const timestamp = signatureMap['t'];
      const v1Signature = signatureMap['v1'];

      if (!timestamp || !v1Signature) {
        return Result.fail(new StripeInvalidRequestError('Invalid signature format'));
      }

      // Check timestamp tolerance (5 minutes)
      const tolerance = 300;
      const timestampAge = Math.floor(Date.now() / 1000) - parseInt(timestamp);

      if (timestampAge > tolerance) {
        return Result.fail(new StripeInvalidRequestError('Webhook timestamp too old'));
      }

      // Compute expected signature
      const signedPayload = `${timestamp}.${payload}`;
      const crypto = require('crypto');
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(signedPayload)
        .digest('hex');

      // Compare signatures
      const signaturesMatch = crypto.timingSafeEqual(
        Buffer.from(v1Signature),
        Buffer.from(expectedSignature)
      );

      if (!signaturesMatch) {
        return Result.fail(new StripeInvalidRequestError('Invalid signature'));
      }

      const event = JSON.parse(payload);

      return Result.ok({
        id: event.id,
        type: event.type,
        data: {
          object: event.data.object,
          previousAttributes: event.data.previous_attributes,
        },
        created: new Date(event.created * 1000),
        livemode: event.livemode,
      });
    } catch (error) {
      return Result.fail(
        new StripeInvalidRequestError(error instanceof Error ? error.message : 'Invalid webhook payload')
      );
    }
  }

  // ==================== Health Check ====================

  async checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  > {
    const start = Date.now();

    try {
      const response = await this.makeRequest('GET', '/balance');
      const latencyMs = Date.now() - start;

      if (response.isFailure) {
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

  private async makeRequest(
    method: string,
    endpoint: string,
    body?: URLSearchParams
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.config.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    };

    if (this.config.apiVersion) {
      headers['Stripe-Version'] = this.config.apiVersion;
    }

    const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
      method,
      headers,
      body: body?.toString(),
    });

    if (!response.ok) {
      return this.handleErrorResponse(response);
    }

    const data = (await response.json()) as Record<string, unknown>;
    return Result.ok(data);
  }

  private async handleErrorResponse(
    response: Response
  ): Promise<Result<Record<string, unknown>, DomainError>> {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string; decline_code?: string; code?: string; param?: string } };
    const error = data.error ?? {};

    switch (response.status) {
      case 401:
        return Result.fail(new StripeAuthenticationError(error.message ?? 'Invalid API key'));
      case 429:
        const retryAfter = parseInt(response.headers.get('Retry-After') ?? '60');
        return Result.fail(new StripeRateLimitError(retryAfter));
      case 402:
        return Result.fail(new StripeCardError(error.message ?? 'Card declined', error.decline_code));
      default:
        return Result.fail(new StripeInvalidRequestError(error.message ?? 'Request failed'));
    }
  }

  private mapToCustomer(data: Record<string, unknown>): StripeCustomer {
    return {
      id: String(data.id ?? ''),
      email: data.email ? String(data.email) : undefined,
      name: data.name ? String(data.name) : undefined,
      phone: data.phone ? String(data.phone) : undefined,
      description: data.description ? String(data.description) : undefined,
      metadata: data.metadata as Record<string, string> | undefined,
      defaultPaymentMethodId: data.invoice_settings
        ? String((data.invoice_settings as Record<string, unknown>).default_payment_method ?? '')
        : undefined,
      balance: Number(data.balance ?? 0),
      currency: String(data.currency ?? 'usd'),
      created: new Date(Number(data.created ?? 0) * 1000),
    };
  }

  private mapToPaymentMethod(data: Record<string, unknown>): StripePaymentMethod {
    const card = data.card as Record<string, unknown> | undefined;
    const bankAccount = data.us_bank_account as Record<string, unknown> | undefined;
    const billingDetails = (data.billing_details as Record<string, unknown>) ?? {};
    const address = (billingDetails.address as Record<string, unknown>) ?? {};

    return {
      id: String(data.id ?? ''),
      type: String(data.type ?? 'card') as StripePaymentMethod['type'],
      customerId: data.customer ? String(data.customer) : undefined,
      card: card
        ? {
            brand: String(card.brand ?? ''),
            last4: String(card.last4 ?? ''),
            expMonth: Number(card.exp_month ?? 0),
            expYear: Number(card.exp_year ?? 0),
            funding: String(card.funding ?? ''),
          }
        : undefined,
      bankAccount: bankAccount
        ? {
            bankName: String(bankAccount.bank_name ?? ''),
            last4: String(bankAccount.last4 ?? ''),
            routingNumber: bankAccount.routing_number ? String(bankAccount.routing_number) : undefined,
            accountHolderType: String(bankAccount.account_holder_type ?? 'individual') as
              | 'individual'
              | 'company',
          }
        : undefined,
      billingDetails: {
        name: billingDetails.name ? String(billingDetails.name) : undefined,
        email: billingDetails.email ? String(billingDetails.email) : undefined,
        phone: billingDetails.phone ? String(billingDetails.phone) : undefined,
        address: {
          line1: address.line1 ? String(address.line1) : undefined,
          line2: address.line2 ? String(address.line2) : undefined,
          city: address.city ? String(address.city) : undefined,
          state: address.state ? String(address.state) : undefined,
          postalCode: address.postal_code ? String(address.postal_code) : undefined,
          country: address.country ? String(address.country) : undefined,
        },
      },
      created: new Date(Number(data.created ?? 0) * 1000),
    };
  }

  private mapToPaymentIntent(data: Record<string, unknown>): StripePaymentIntent {
    return {
      id: String(data.id ?? ''),
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? 'usd'),
      status: String(data.status ?? 'requires_payment_method') as StripePaymentIntent['status'],
      customerId: data.customer ? String(data.customer) : undefined,
      paymentMethodId: data.payment_method ? String(data.payment_method) : undefined,
      clientSecret: String(data.client_secret ?? ''),
      description: data.description ? String(data.description) : undefined,
      metadata: data.metadata as Record<string, string> | undefined,
      receiptEmail: data.receipt_email ? String(data.receipt_email) : undefined,
      capturedAmount: data.amount_received ? Number(data.amount_received) : undefined,
      created: new Date(Number(data.created ?? 0) * 1000),
    };
  }

  private mapToRefund(data: Record<string, unknown>): StripeRefund {
    return {
      id: String(data.id ?? ''),
      paymentIntentId: String(data.payment_intent ?? ''),
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? 'usd'),
      status: String(data.status ?? 'pending') as StripeRefund['status'],
      reason: data.reason ? (String(data.reason) as StripeRefund['reason']) : undefined,
      receiptNumber: data.receipt_number ? String(data.receipt_number) : undefined,
      created: new Date(Number(data.created ?? 0) * 1000),
    };
  }

  private mapToSubscription(data: Record<string, unknown>): StripeSubscription {
    const items = data.items as Record<string, unknown> | undefined;
    const itemsData = (items?.data as Array<Record<string, unknown>>) ?? [];
    const firstItem = itemsData[0] ?? {};
    const price = firstItem.price as Record<string, unknown> | undefined;

    return {
      id: String(data.id ?? ''),
      customerId: String(data.customer ?? ''),
      status: String(data.status ?? 'incomplete') as StripeSubscription['status'],
      priceId: price ? String(price.id ?? '') : '',
      quantity: Number(firstItem.quantity ?? 1),
      currency: String(data.currency ?? 'usd'),
      currentPeriodStart: new Date(Number(data.current_period_start ?? 0) * 1000),
      currentPeriodEnd: new Date(Number(data.current_period_end ?? 0) * 1000),
      cancelAtPeriodEnd: Boolean(data.cancel_at_period_end),
      canceledAt: data.canceled_at ? new Date(Number(data.canceled_at) * 1000) : undefined,
      trialStart: data.trial_start ? new Date(Number(data.trial_start) * 1000) : undefined,
      trialEnd: data.trial_end ? new Date(Number(data.trial_end) * 1000) : undefined,
      metadata: data.metadata as Record<string, string> | undefined,
    };
  }

  private mapToInvoice(data: Record<string, unknown>): StripeInvoice {
    return {
      id: String(data.id ?? ''),
      customerId: String(data.customer ?? ''),
      subscriptionId: data.subscription ? String(data.subscription) : undefined,
      status: String(data.status ?? 'draft') as StripeInvoice['status'],
      amountDue: Number(data.amount_due ?? 0),
      amountPaid: Number(data.amount_paid ?? 0),
      amountRemaining: Number(data.amount_remaining ?? 0),
      currency: String(data.currency ?? 'usd'),
      dueDate: data.due_date ? new Date(Number(data.due_date) * 1000) : undefined,
      paidAt: data.status_transitions
        ? new Date(
            Number((data.status_transitions as Record<string, unknown>).paid_at ?? 0) * 1000
          )
        : undefined,
      hostedInvoiceUrl: data.hosted_invoice_url ? String(data.hosted_invoice_url) : undefined,
      invoicePdf: data.invoice_pdf ? String(data.invoice_pdf) : undefined,
      created: new Date(Number(data.created ?? 0) * 1000),
    };
  }
}

export default StripeAdapter;
