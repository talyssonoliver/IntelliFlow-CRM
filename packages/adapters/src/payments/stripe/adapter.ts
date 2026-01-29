/**
 * Stripe Payment Adapter (Refactored)
 * Facade that delegates to handler modules
 *
 * @see IFC-099: ERP/Payment/Email Connectors
 */

import { Result, DomainError } from '@intelliflow/domain';
import type {
  StripeConfig,
  StripeCustomer,
  StripePaymentMethod,
  StripePaymentIntent,
  StripeRefund,
  StripeSubscription,
  StripeInvoice,
  StripeWebhookEvent,
  CreatePaymentIntentParams,
  StripeCreateSubscriptionParams,
} from './types';
import {
  createCustomer as createCustomerHandler,
  getCustomer as getCustomerHandler,
  updateCustomer as updateCustomerHandler,
  deleteCustomer as deleteCustomerHandler,
  attachPaymentMethod as attachPaymentMethodHandler,
  detachPaymentMethod as detachPaymentMethodHandler,
  listPaymentMethods as listPaymentMethodsHandler,
  createPaymentIntent as createPaymentIntentHandler,
  confirmPaymentIntent as confirmPaymentIntentHandler,
  capturePaymentIntent as capturePaymentIntentHandler,
  cancelPaymentIntent as cancelPaymentIntentHandler,
  getPaymentIntent as getPaymentIntentHandler,
  createRefund as createRefundHandler,
  getRefund as getRefundHandler,
  createSubscription as createSubscriptionHandler,
  updateSubscription as updateSubscriptionHandler,
  cancelSubscription as cancelSubscriptionHandler,
  getSubscription as getSubscriptionHandler,
  listSubscriptions as listSubscriptionsHandler,
  getInvoice as getInvoiceHandler,
  listInvoices as listInvoicesHandler,
  payInvoice as payInvoiceHandler,
  constructWebhookEvent as constructWebhookEventHandler,
  checkConnection as checkConnectionHandler,
} from './handlers';

/**
 * Payment Service Port Interface
 */
export interface PaymentServicePort {
  createCustomer(params: {
    email?: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<Result<StripeCustomer, DomainError>>;
  getCustomer(customerId: string): Promise<Result<StripeCustomer | null, DomainError>>;
  updateCustomer(
    customerId: string,
    params: Partial<{ email: string; name: string; metadata: Record<string, string> }>
  ): Promise<Result<StripeCustomer, DomainError>>;
  deleteCustomer(customerId: string): Promise<Result<void, DomainError>>;
  attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<Result<StripePaymentMethod, DomainError>>;
  detachPaymentMethod(paymentMethodId: string): Promise<Result<void, DomainError>>;
  listPaymentMethods(customerId: string): Promise<Result<StripePaymentMethod[], DomainError>>;
  createPaymentIntent(
    params: CreatePaymentIntentParams
  ): Promise<Result<StripePaymentIntent, DomainError>>;
  confirmPaymentIntent(
    paymentIntentId: string,
    paymentMethodId?: string
  ): Promise<Result<StripePaymentIntent, DomainError>>;
  capturePaymentIntent(
    paymentIntentId: string,
    amount?: number
  ): Promise<Result<StripePaymentIntent, DomainError>>;
  cancelPaymentIntent(paymentIntentId: string): Promise<Result<StripePaymentIntent, DomainError>>;
  getPaymentIntent(
    paymentIntentId: string
  ): Promise<Result<StripePaymentIntent | null, DomainError>>;
  createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: StripeRefund['reason']
  ): Promise<Result<StripeRefund, DomainError>>;
  getRefund(refundId: string): Promise<Result<StripeRefund | null, DomainError>>;
  createSubscription(
    params: StripeCreateSubscriptionParams
  ): Promise<Result<StripeSubscription, DomainError>>;
  updateSubscription(
    subscriptionId: string,
    params: Partial<StripeCreateSubscriptionParams>
  ): Promise<Result<StripeSubscription, DomainError>>;
  cancelSubscription(
    subscriptionId: string,
    atPeriodEnd?: boolean
  ): Promise<Result<StripeSubscription, DomainError>>;
  getSubscription(subscriptionId: string): Promise<Result<StripeSubscription | null, DomainError>>;
  listSubscriptions(customerId: string): Promise<Result<StripeSubscription[], DomainError>>;
  getInvoice(invoiceId: string): Promise<Result<StripeInvoice | null, DomainError>>;
  listInvoices(customerId: string): Promise<Result<StripeInvoice[], DomainError>>;
  payInvoice(invoiceId: string): Promise<Result<StripeInvoice, DomainError>>;
  constructWebhookEvent(
    payload: string,
    signature: string
  ): Result<StripeWebhookEvent, DomainError>;
  checkConnection(): Promise<
    Result<{ status: 'healthy' | 'degraded' | 'unhealthy'; latencyMs: number }, DomainError>
  >;
}

/**
 * Stripe Payment Adapter
 */
export class StripeAdapter implements PaymentServicePort {
  private config: StripeConfig;

  constructor(config: StripeConfig) {
    this.config = config;
  }

  // Customer Operations
  createCustomer(params: { email?: string; name?: string; metadata?: Record<string, string> }) {
    return createCustomerHandler(this.config, params);
  }

  getCustomer(customerId: string) {
    return getCustomerHandler(this.config, customerId);
  }

  updateCustomer(
    customerId: string,
    params: Partial<{ email: string; name: string; metadata: Record<string, string> }>
  ) {
    return updateCustomerHandler(this.config, customerId, params);
  }

  deleteCustomer(customerId: string) {
    return deleteCustomerHandler(this.config, customerId);
  }

  // Payment Method Operations
  attachPaymentMethod(paymentMethodId: string, customerId: string) {
    return attachPaymentMethodHandler(this.config, paymentMethodId, customerId);
  }

  detachPaymentMethod(paymentMethodId: string) {
    return detachPaymentMethodHandler(this.config, paymentMethodId);
  }

  listPaymentMethods(customerId: string) {
    return listPaymentMethodsHandler(this.config, customerId);
  }

  // Payment Intent Operations
  createPaymentIntent(params: CreatePaymentIntentParams) {
    return createPaymentIntentHandler(this.config, params);
  }

  confirmPaymentIntent(paymentIntentId: string, paymentMethodId?: string) {
    return confirmPaymentIntentHandler(this.config, paymentIntentId, paymentMethodId);
  }

  capturePaymentIntent(paymentIntentId: string, amount?: number) {
    return capturePaymentIntentHandler(this.config, paymentIntentId, amount);
  }

  cancelPaymentIntent(paymentIntentId: string) {
    return cancelPaymentIntentHandler(this.config, paymentIntentId);
  }

  getPaymentIntent(paymentIntentId: string) {
    return getPaymentIntentHandler(this.config, paymentIntentId);
  }

  // Refund Operations
  createRefund(paymentIntentId: string, amount?: number, reason?: StripeRefund['reason']) {
    return createRefundHandler(this.config, paymentIntentId, amount, reason);
  }

  getRefund(refundId: string) {
    return getRefundHandler(this.config, refundId);
  }

  // Subscription Operations
  createSubscription(params: StripeCreateSubscriptionParams) {
    return createSubscriptionHandler(this.config, params);
  }

  updateSubscription(subscriptionId: string, params: Partial<StripeCreateSubscriptionParams>) {
    return updateSubscriptionHandler(this.config, subscriptionId, params);
  }

  cancelSubscription(subscriptionId: string, atPeriodEnd?: boolean) {
    return cancelSubscriptionHandler(this.config, subscriptionId, atPeriodEnd);
  }

  getSubscription(subscriptionId: string) {
    return getSubscriptionHandler(this.config, subscriptionId);
  }

  listSubscriptions(customerId: string) {
    return listSubscriptionsHandler(this.config, customerId);
  }

  // Invoice Operations
  getInvoice(invoiceId: string) {
    return getInvoiceHandler(this.config, invoiceId);
  }

  listInvoices(customerId: string) {
    return listInvoicesHandler(this.config, customerId);
  }

  payInvoice(invoiceId: string) {
    return payInvoiceHandler(this.config, invoiceId);
  }

  // Webhook Operations
  constructWebhookEvent(payload: string, signature: string) {
    return constructWebhookEventHandler(this.config, payload, signature);
  }

  // Health Check
  checkConnection() {
    return checkConnectionHandler(this.config);
  }
}
