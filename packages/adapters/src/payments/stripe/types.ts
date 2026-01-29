/**
 * Stripe Payment Adapter Types
 */

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
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
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
  status:
    | 'incomplete'
    | 'incomplete_expired'
    | 'trialing'
    | 'active'
    | 'past_due'
    | 'canceled'
    | 'unpaid'
    | 'paused';
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

export interface CreateCustomerParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}

export interface UpdateCustomerParams {
  email?: string;
  name?: string;
  metadata?: Record<string, string>;
}
