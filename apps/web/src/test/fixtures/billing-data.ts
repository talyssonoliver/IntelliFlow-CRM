/**
 * Billing Test Fixtures
 *
 * Shared mock data factory for billing tests.
 *
 * @implements PG-025 (Billing Portal)
 */

// ============================================
// Types
// ============================================

interface MockSubscription {
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
}

interface MockPaymentMethod {
  id: string;
  type: 'card' | 'bank_account' | 'sepa_debit' | 'ideal' | 'paypal';
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
    funding?: string;
  };
  isDefault: boolean;
  created: Date;
}

interface MockInvoice {
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
  created: Date;
  hostedInvoiceUrl?: string;
  invoicePdf?: string;
}

interface MockBillingInformation {
  organization: string | null;
  email: string;
  address: {
    line1: string;
    line2?: string | null;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  } | null;
}

interface MockUsageMetrics {
  apiCalls: { current: number; limit: number };
  storage: { current: number; limit: number; unit: 'GB' | 'MB' };
  activeUsers: { current: number; limit: number };
}

// ============================================
// Factory Functions
// ============================================

export function createMockSubscription(overrides?: Partial<MockSubscription>): MockSubscription {
  return {
    id: 'sub_123',
    customerId: 'cus_123',
    status: 'active',
    priceId: 'price_professional_monthly',
    quantity: 5,
    currency: 'gbp',
    currentPeriodStart: new Date('2025-01-01'),
    currentPeriodEnd: new Date('2025-02-01'),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

export function createMockPaymentMethod(overrides?: Partial<MockPaymentMethod>): MockPaymentMethod {
  return {
    id: 'pm_123',
    type: 'card',
    card: {
      brand: 'visa',
      last4: '4242',
      expMonth: 12,
      expYear: 2026,
    },
    isDefault: true,
    created: new Date('2024-01-01'),
    ...overrides,
  };
}

export function createMockInvoice(overrides?: Partial<MockInvoice>): MockInvoice {
  return {
    id: 'in_123',
    customerId: 'cus_123',
    status: 'paid',
    amountDue: 7900,
    amountPaid: 7900,
    amountRemaining: 0,
    currency: 'gbp',
    created: new Date('2024-12-01'),
    invoicePdf: 'https://example.com/invoice.pdf',
    ...overrides,
  };
}

export function createMockBillingInformation(
  overrides?: Partial<MockBillingInformation>
): MockBillingInformation {
  return {
    organization: 'Acme Corp',
    email: 'billing@acme.com',
    address: {
      line1: '123 Business St',
      line2: 'Suite 100',
      city: 'London',
      state: 'Greater London',
      postalCode: 'EC1A 1BB',
      country: 'GB',
    },
    ...overrides,
  };
}

export function createMockUsageMetrics(overrides?: Partial<MockUsageMetrics>): MockUsageMetrics {
  return {
    apiCalls: { current: 8500, limit: 10000 },
    storage: { current: 2.4, limit: 5, unit: 'GB' },
    activeUsers: { current: 12, limit: 25 },
    ...overrides,
  };
}
