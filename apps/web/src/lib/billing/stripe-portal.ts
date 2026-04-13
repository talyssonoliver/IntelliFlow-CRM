/**
 * Billing Portal Service Layer
 *
 * Provides helper functions and configuration for the billing portal.
 * Works with tRPC billing router for data fetching.
 *
 * @implements PG-025 (Billing Portal)
 */

// ============================================
// Types
// ============================================

export interface BillingSubscription {
  id: string;
  status: string;
  planName?: string;
  priceId: string;
  quantity: number;
  currency: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
}

export interface BillingInvoice {
  id: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  status: string;
  created: Date;
  paidAt?: Date | null;
  invoicePdf?: string | null;
  hostedInvoiceUrl?: string | null;
}

export interface BillingPaymentMethod {
  id: string;
  type: string;
  card?: {
    brand: string;
    last4: string;
    expMonth: number;
    expYear: number;
  };
  isDefault: boolean;
}

export interface UsageLimitMetric {
  current: number;
  limit: number; // -1 = unlimited
}

export interface UsageMetrics {
  planLimits: {
    activeUsers: UsageLimitMetric;
    contacts: UsageLimitMetric;
    aiPredictions: UsageLimitMetric;
    storage: UsageLimitMetric;
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
// Formatting Helpers
// ============================================

/**
 * Format currency amount (from cents to display format)
 */
export function formatCurrency(amount: number, currency: string): string {
  const currencyUpper = currency.toUpperCase();
  const locale = currencyUpper === 'GBP' ? 'en-GB' : 'en-GB';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyUpper,
    minimumFractionDigits: 2,
  }).format(amount / 100);
}

/**
 * Format date for billing display
 */
export function formatBillingDate(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(dateObj);
}

/**
 * Format date with time
 */
export function formatBillingDateTime(date: Date | string): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;

  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(dateObj);
}

// ============================================
// Status Helpers
// ============================================

export type StatusVariant = 'success' | 'warning' | 'error' | 'default';

export interface StatusDisplay {
  label: string;
  variant: StatusVariant;
}

/**
 * Get display properties for subscription status
 */
export function getSubscriptionStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'active':
      return { label: 'Active', variant: 'success' };
    case 'trialing':
      return { label: 'Trial', variant: 'success' };
    case 'past_due':
      return { label: 'Past Due', variant: 'warning' };
    case 'canceled':
      return { label: 'Canceled', variant: 'error' };
    case 'unpaid':
      return { label: 'Unpaid', variant: 'error' };
    case 'paused':
      return { label: 'Paused', variant: 'warning' };
    case 'incomplete':
      return { label: 'Incomplete', variant: 'warning' };
    default:
      return { label: status, variant: 'default' };
  }
}

/**
 * Get display properties for invoice status
 */
export function getInvoiceStatusDisplay(status: string): StatusDisplay {
  switch (status) {
    case 'paid':
      return { label: 'Paid', variant: 'success' };
    case 'open':
      return { label: 'Open', variant: 'warning' };
    case 'draft':
      return { label: 'Draft', variant: 'default' };
    case 'uncollectible':
      return { label: 'Uncollectible', variant: 'error' };
    case 'void':
      return { label: 'Void', variant: 'error' };
    default:
      return { label: status, variant: 'default' };
  }
}

// ============================================
// Card Brand Helpers
// ============================================

/**
 * Get display name for card brand
 */
export function getCardBrandDisplay(brand: string): string {
  const brands: Record<string, string> = {
    visa: 'Visa',
    mastercard: 'Mastercard',
    amex: 'American Express',
    discover: 'Discover',
    diners: 'Diners Club',
    jcb: 'JCB',
    unionpay: 'UnionPay',
  };

  return brands[brand.toLowerCase()] ?? brand;
}

/**
 * Get icon name for card brand (Material Symbols)
 */
export function getCardBrandIcon(_brand: string): string {
  // Material Symbols has generic credit_card icon
  // In a real app, you might use brand-specific icons for _brand
  return 'credit_card';
}

// ============================================
// Plan Configuration
// ============================================

export interface PlanFeature {
  name: string;
  included: boolean;
  limit?: number | string;
}

export interface Plan {
  id: string;
  priceId: string;
  name: string;
  description: string;
  priceMonthly: number; // in cents
  priceAnnual: number; // in cents
  currency: string;
  features: PlanFeature[];
  popular?: boolean;
  maxUsers: number | null;
}

/**
 * Stripe-specific plan overlay (fields not suitable for public pricing JSON)
 */
import pricingData from '@/data/pricing-data.json';

interface StripePlanOverlay {
  priceId: string;
  maxUsers: number | null;
  features: PlanFeature[];
}

const STRIPE_PLAN_OVERLAY: Record<string, StripePlanOverlay> = {
  starter: {
    priceId: 'price_starter_monthly',
    maxUsers: 5,
    features: [
      { name: 'Up to 5 users', included: true },
      { name: '1,000 contacts', included: true, limit: '1,000' },
      { name: 'Basic AI lead scoring', included: true },
      { name: '1,000 AI predictions/month', included: true, limit: '1,000' },
      { name: 'Email support', included: true },
      { name: 'Workflow automation', included: false },
      { name: 'Custom integrations', included: false },
      { name: 'Dedicated account manager', included: false },
    ],
  },
  professional: {
    priceId: 'price_professional_monthly',
    maxUsers: 25,
    features: [
      { name: 'Up to 25 users', included: true },
      { name: '10,000 contacts', included: true, limit: '10,000' },
      { name: 'Advanced AI insights', included: true },
      { name: '10,000 AI predictions/month', included: true, limit: '10,000' },
      { name: 'Priority support (4h response)', included: true },
      { name: 'Workflow automation', included: true },
      { name: 'Custom integrations', included: false },
      { name: 'Dedicated account manager', included: false },
    ],
  },
  enterprise: {
    priceId: 'price_enterprise_monthly',
    maxUsers: null,
    features: [
      { name: 'Unlimited users', included: true },
      { name: 'Unlimited contacts', included: true },
      { name: 'Full AI suite', included: true },
      { name: 'Unlimited AI predictions', included: true },
      { name: '24/7 priority support', included: true },
      { name: 'Advanced workflow automation', included: true },
      { name: 'Custom integrations', included: true },
      { name: 'Dedicated account manager', included: true },
    ],
  },
};

/**
 * Available pricing plans — derived from pricing-data.json (single source of truth)
 * with Stripe-specific overlay for billing integration.
 */
export const PLANS: Plan[] = pricingData.tiers
  .filter((t) => t.id in STRIPE_PLAN_OVERLAY)
  .map((t) => {
    const overlay = STRIPE_PLAN_OVERLAY[t.id]!;
    return {
      id: t.id,
      priceId: overlay.priceId,
      name: t.name,
      description: t.description,
      priceMonthly: (t.price.monthly as number) * 100,
      priceAnnual: (t.price.annual as number) * 12 * 100,
      currency: pricingData.metadata.currency,
      features: overlay.features,
      popular: t.mostPopular,
      maxUsers: overlay.maxUsers,
    };
  });

/**
 * Get plan by ID
 */
export function getPlanById(planId: string): Plan | undefined {
  return PLANS.find((plan) => plan.id === planId);
}

/**
 * Get plan by Stripe price ID
 */
export function getPlanByPriceId(priceId: string): Plan | undefined {
  return PLANS.find((plan) => plan.priceId === priceId);
}

/**
 * Calculate annual savings percentage
 */
export function getAnnualSavingsPercent(plan: Plan): number {
  const monthlyTotal = plan.priceMonthly * 12;
  const savings = monthlyTotal - plan.priceAnnual;
  return Math.round((savings / monthlyTotal) * 100);
}

// ============================================
// Usage Helpers
// ============================================

/**
 * Calculate usage percentage
 */
export function getUsagePercentage(current: number, limit: number): number {
  if (limit === 0) return 0;
  return Math.min(Math.round((current / limit) * 100), 100);
}

/**
 * Check if usage is near limit (>80%)
 */
export function isNearUsageLimit(current: number, limit: number): boolean {
  return getUsagePercentage(current, limit) >= 80;
}

/**
 * Check if usage is at limit (100%)
 */
export function isAtUsageLimit(current: number, limit: number): boolean {
  return current >= limit;
}

/**
 * Format storage size
 */
export function formatStorageSize(sizeInGB: number): string {
  if (sizeInGB >= 1) {
    return `${sizeInGB.toFixed(1)} GB`;
  }
  return `${Math.round(sizeInGB * 1024)} MB`;
}
