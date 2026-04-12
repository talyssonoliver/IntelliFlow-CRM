'use client';

/**
 * Shared Plan Card Component
 *
 * Used by both the public /pricing page and the authenticated /billing/plans page.
 * Renders a plan tier card with pricing, features, and context-aware CTA.
 *
 * @variant "public" — marketing page with "Start Free Trial" / "Contact Sales" CTAs
 * @variant "billing" — authenticated page with "Upgrade" / "Downgrade" / "Current Plan" CTAs
 */

import * as React from 'react';
import Link from 'next/link';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
  Badge,
  Button,
  cn,
} from '@intelliflow/ui';

// ============================================
// Types
// ============================================

interface PlanFeatureItem {
  name: string;
  included: boolean;
  limit?: number | string;
}

interface PublicPlanCardProps {
  variant: 'public';
  name: string;
  description: string;
  icon?: string;
  price: string;
  priceSubtext?: string;
  features: string[];
  cta: string;
  ctaLink: string;
  isPopular?: boolean;
  isCustom?: boolean;
}

interface BillingPlanCardProps {
  variant: 'billing';
  id: string;
  name: string;
  description: string;
  priceFormatted: string;
  priceSubtext?: string;
  savingsBadge?: string;
  savingsPercent?: number;
  features: PlanFeatureItem[];
  isPopular?: boolean;
  isCurrent?: boolean;
  direction?: 'upgrade' | 'downgrade' | 'same';
  directionLabel?: string;
  directionIcon?: string;
  changeAllowed?: boolean;
  changeBlockedReason?: string;
  href?: string;
  compact?: boolean;
}

export type PlanCardProps = PublicPlanCardProps | BillingPlanCardProps;

// ============================================
// Component
// ============================================

export function PlanCard(props: PlanCardProps) {
  if (props.variant === 'public') {
    return <PublicPlanCard {...props} />;
  }
  return <BillingPlanCard {...props} />;
}

// ============================================
// Public Variant
// ============================================

function PublicPlanCard({
  name,
  description,
  icon,
  price,
  priceSubtext,
  features,
  cta,
  ctaLink,
  isPopular,
  isCustom,
}: PublicPlanCardProps) {
  return (
    <Card
      className={cn(
        'relative p-8 flex flex-col',
        isPopular
          ? 'border-[#137fec] border-2 shadow-xl'
          : 'hover:border-[#137fec] hover:shadow-lg transition-all'
      )}
    >
      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="bg-[#10b981] text-white px-4 py-1 rounded-full text-sm font-medium">
            Most Popular
          </span>
        </div>
      )}

      {icon && (
        <div className="w-12 h-12 bg-[#137fec]/10 dark:bg-[#137fec]/20 rounded-lg flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-2xl text-[#137fec]">{icon}</span>
        </div>
      )}

      <h3 className="text-2xl font-semibold text-slate-900 dark:text-white mb-2">{name}</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">{description}</p>

      <div className="mb-6">
        {isCustom ? (
          <div className="text-3xl font-bold text-slate-900 dark:text-white">{price}</div>
        ) : (
          <>
            <div className="text-4xl font-bold text-slate-900 dark:text-white">
              {price} <span className="text-lg text-slate-600 dark:text-slate-400">/user/mo</span>
            </div>
            {priceSubtext && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{priceSubtext}</p>
            )}
          </>
        )}
      </div>

      <ul className="space-y-3 mb-8 flex-1">
        {features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span className="material-symbols-outlined text-[#137fec] text-base mt-0.5 flex-shrink-0">
              check_circle
            </span>
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        className={cn(
          'w-full',
          isPopular
            ? 'bg-[#137fec] hover:bg-[#0e6ac7] text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
        )}
      >
        <Link href={ctaLink}>{cta}</Link>
      </Button>
    </Card>
  );
}

// ============================================
// Billing Variant
// ============================================

function BillingPlanCard({
  name,
  description,
  priceFormatted,
  priceSubtext,
  savingsBadge,
  savingsPercent,
  features,
  isPopular,
  isCurrent,
  direction,
  directionLabel,
  directionIcon,
  changeAllowed = true,
  changeBlockedReason,
  href,
  compact = false,
}: BillingPlanCardProps) {
  return (
    <Card
      className={cn(
        'border relative flex flex-col',
        isCurrent
          ? 'border-primary ring-2 ring-primary/20'
          : 'border-slate-200 dark:border-slate-800',
        isPopular && !isCurrent && 'border-blue-300 dark:border-blue-700'
      )}
      aria-current={isCurrent ? 'true' : undefined}
    >
      {isPopular && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-3">
          Popular
        </Badge>
      )}
      {isCurrent && (
        <Badge className="absolute -top-3 right-4 bg-primary text-white px-3">Current Plan</Badge>
      )}

      <CardHeader className="pt-6 pb-4">
        <CardTitle className="text-xl font-bold text-center">{name}</CardTitle>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mt-1">{description}</p>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-slate-900 dark:text-white">{priceFormatted}</p>
          {priceSubtext && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{priceSubtext}</p>
          )}
          {savingsBadge && (
            <Badge
              variant="outline"
              className="mt-2 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700"
            >
              {savingsBadge}
            </Badge>
          )}
          {savingsPercent !== undefined && savingsPercent > 0 && (
            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
              Save {savingsPercent}% vs monthly
            </p>
          )}
        </div>

        {!compact && (
          <ul className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700">
            {features.map((feature) => (
              <li key={feature.name} className="flex items-start gap-2 text-sm">
                <span
                  className={cn(
                    'material-symbols-outlined text-lg mt-0.5',
                    feature.included
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-slate-300 dark:text-slate-600'
                  )}
                  aria-hidden="true"
                >
                  {feature.included ? 'check_circle' : 'cancel'}
                </span>
                <span
                  className={cn(
                    feature.included
                      ? 'text-slate-700 dark:text-slate-300'
                      : 'text-slate-400 dark:text-slate-500 line-through'
                  )}
                >
                  {feature.name}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CardFooter className="pt-4">
        {(() => {
          if (isCurrent) {
            return (
              <Button className="w-full" disabled aria-label="Current Plan">
                Current Plan
              </Button>
            );
          }
          if (changeAllowed && href) {
            return (
              <Button
                className="w-full"
                variant={direction === 'upgrade' ? 'default' : 'outline'}
                asChild
              >
                <Link href={href}>
                  <span className="material-symbols-outlined text-lg mr-1" aria-hidden="true">
                    {directionIcon}
                  </span>
                  {directionLabel}
                </Link>
              </Button>
            );
          }
          return (
            <Button className="w-full" disabled title={changeBlockedReason}>
              {directionLabel}
            </Button>
          );
        })()}
      </CardFooter>
    </Card>
  );
}
