'use client';

/**
 * Module Paywall Component
 * IFC-210: Dynamic Module Registry
 *
 * Displayed when a user navigates to a module that is not enabled
 * for their tenant's current plan. Shows an upgrade CTA.
 */

import Link from 'next/link';
import {
  MODULE_METADATA,
  getMinimumPlanForModule,
  type ModuleId,
} from '@intelliflow/domain';

interface ModulePaywallProps {
  moduleId: ModuleId;
  className?: string;
}

export function ModulePaywall({ moduleId, className }: ModulePaywallProps) {
  const meta = MODULE_METADATA[moduleId];
  const minPlan = getMinimumPlanForModule(moduleId);

  return (
    <div className={`flex flex-col items-center justify-center min-h-[60vh] px-4 ${className ?? ''}`}>
      <div className="max-w-md text-center space-y-6">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
          <span className="material-symbols-outlined text-3xl text-muted-foreground">lock</span>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-semibold tracking-tight">
          {meta?.label ?? moduleId} Module
        </h1>

        {/* Description */}
        <p className="text-muted-foreground">
          {meta?.description ?? 'This module is not included in your current plan.'}
        </p>

        {/* Plan info */}
        {minPlan && (
          <p className="text-sm text-muted-foreground">
            Available on <span className="font-medium text-foreground">{minPlan}</span> plan and above,
            or as an add-on.
          </p>
        )}

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Link
            href="/settings/billing"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Upgrade Plan
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-border px-6 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
