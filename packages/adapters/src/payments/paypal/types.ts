/**
 * PayPal Payment Adapter Types
 */

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
  shipping?: { name?: { fullName?: string }; address?: PayPalAddress };
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
  status:
    | 'CREATED'
    | 'CAPTURED'
    | 'DENIED'
    | 'EXPIRED'
    | 'PARTIALLY_CAPTURED'
    | 'VOIDED'
    | 'PENDING';
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
    lastPayment?: { amount: { currencyCode: string; value: string }; time: Date };
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
