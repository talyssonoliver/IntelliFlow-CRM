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

interface MockUsageLimitMetric {
  current: number;
  limit: number;
}

interface MockUsageMetrics {
  planLimits: {
    activeUsers: MockUsageLimitMetric;
    contacts: MockUsageLimitMetric;
    aiPredictions: MockUsageLimitMetric;
    storage: MockUsageLimitMetric;
  };
  crm: {
    leads: number;
    contacts: number;
    accounts: number;
    deals: number;
    tasks: number;
    tickets: number;
    cases: number;
  };
  ai: {
    scores: number;
    scoresThisPeriod: number;
    conversations: number;
    messages: number;
    toolCalls: number;
    insights: number;
    leadInsights: number;
    contactInsights: number;
    outputReviews: number;
    monitoringEvents: number;
    agentActions: number;
    chainVersions: number;
    experiments: number;
  };
  activity: {
    auditLogs: number;
    notifications: number;
  };
  content: {
    documents: number;
    calendarEvents: number;
  };
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
    planLimits: {
      activeUsers: { current: 12, limit: 25 },
      contacts: { current: 4200, limit: 10000 },
      aiPredictions: { current: 8500, limit: 10000 },
      storage: { current: 2.4, limit: 5 },
    },
    crm: {
      leads: 156,
      contacts: 4200,
      accounts: 89,
      deals: 234,
      tasks: 512,
      tickets: 78,
      cases: 23,
    },
    ai: {
      scores: 12500,
      scoresThisPeriod: 8500,
      conversations: 142,
      messages: 1834,
      toolCalls: 567,
      insights: 89,
      leadInsights: 156,
      contactInsights: 98,
      outputReviews: 34,
      monitoringEvents: 2341,
      agentActions: 78,
      chainVersions: 12,
      experiments: 5,
    },
    activity: {
      auditLogs: 3456,
      notifications: 891,
    },
    content: {
      documents: 67,
      calendarEvents: 245,
    },
    ...overrides,
  };
}
