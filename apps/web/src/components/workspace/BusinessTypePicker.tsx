'use client';

/**
 * Business type picker: one radio group of option cards, used by the onboarding step and by
 * workspace settings. Owner ruling 23/11/2026: the business type decides which vertical modules a
 * workspace has. Each card says which tools that type gets (kept in step with VERTICAL_MODULE_MAP).
 */

import { TENANT_BUSINESS_TYPES, TENANT_BUSINESS_TYPE_LABELS } from '@intelliflow/domain';
import type { TenantBusinessType } from '@intelliflow/domain';
import { cn } from '@intelliflow/ui';

export const BUSINESS_TYPE_HINTS: Record<TenantBusinessType, string> = {
  TRADES_HOME_SERVICES: 'Handyman, plumber, electrician, cleaner, landscaper',
  AGENCY: 'Marketing, design, web or other client work',
  LAW_FIRM: 'Solicitors and legal practices',
  SHOP_ECOMMERCE: 'Selling products online or in a shop',
  OTHER: 'Anything that is not one of the above',
};

/** The tools each type gets, in one line. Core CRM, AI and reports are in every type. */
export const BUSINESS_TYPE_TOOLS: Record<TenantBusinessType, string> = {
  TRADES_HOME_SERVICES: 'CRM, AI assistant and reports',
  AGENCY: 'CRM, AI and reports, plus Tickets and Help Center',
  LAW_FIRM: 'CRM, AI and reports, plus Cases',
  SHOP_ECOMMERCE: 'CRM, AI and reports, plus Commerce',
  OTHER: 'CRM, AI assistant and reports',
};

export const BUSINESS_TYPE_ICONS: Record<TenantBusinessType, string> = {
  TRADES_HOME_SERVICES: 'handyman',
  AGENCY: 'campaign',
  LAW_FIRM: 'gavel',
  SHOP_ECOMMERCE: 'storefront',
  OTHER: 'category',
};

interface BusinessTypePickerProps {
  value: TenantBusinessType | null;
  onChange: (value: TenantBusinessType) => void;
  disabled?: boolean;
  /** Unique prefix for input ids/names when two pickers could share a page. */
  idPrefix?: string;
  legend?: string;
  /** Hide the legend visually when the surrounding step already shows the question. */
  legendHidden?: boolean;
}

export function BusinessTypePicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'business-type',
  legend = 'What kind of business is this workspace for?',
  legendHidden = false,
}: Readonly<BusinessTypePickerProps>) {
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className={cn('text-sm font-medium', legendHidden && 'sr-only')}>{legend}</legend>
      <div className="grid grid-cols-1 gap-3">
        {TENANT_BUSINESS_TYPES.map((type) => {
          const id = `${idPrefix}-${type}`;
          return (
            <label
              key={type}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-background p-4 text-sm transition-colors',
                'hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:checked]:ring-1 has-[:checked]:ring-primary',
                'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                disabled && 'cursor-not-allowed opacity-60'
              )}
            >
              <input
                id={id}
                type="radio"
                name={idPrefix}
                value={type}
                checked={value === type}
                onChange={() => onChange(type)}
                className="sr-only"
              />
              <span
                className="material-symbols-outlined mt-0.5 shrink-0 text-2xl text-primary"
                aria-hidden="true"
              >
                {BUSINESS_TYPE_ICONS[type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-foreground">
                  {TENANT_BUSINESS_TYPE_LABELS[type]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {BUSINESS_TYPE_HINTS[type]}
                </span>
                <span className="mt-1 block text-xs font-medium text-foreground/80">
                  Gets: {BUSINESS_TYPE_TOOLS[type]}
                </span>
              </span>
              <span
                className={cn(
                  'material-symbols-outlined shrink-0 text-xl',
                  value === type ? 'text-primary' : 'text-transparent'
                )}
                aria-hidden="true"
              >
                check_circle
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
