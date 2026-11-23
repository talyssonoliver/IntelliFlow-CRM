'use client';

/**
 * Business type picker — one radio group used by the onboarding step and by workspace settings.
 * Owner ruling 23/11/2026: the business type decides which vertical modules a workspace has.
 */

import { TENANT_BUSINESS_TYPES, TENANT_BUSINESS_TYPE_LABELS } from '@intelliflow/domain';
import type { TenantBusinessType } from '@intelliflow/domain';
import { cn } from '@intelliflow/ui';

export const BUSINESS_TYPE_HINTS: Record<TenantBusinessType, string> = {
  TRADES_HOME_SERVICES: 'Handyman, plumber, electrician, cleaner, landscaper',
  AGENCY: 'Marketing, design, web or other client work, with support tickets',
  LAW_FIRM: 'Solicitors and legal practices, with cases and deadlines',
  SHOP_ECOMMERCE: 'Selling products online or in a shop',
  OTHER: 'Anything else: you get the core CRM, AI and reports',
};

interface BusinessTypePickerProps {
  value: TenantBusinessType | null;
  onChange: (value: TenantBusinessType) => void;
  disabled?: boolean;
  /** Unique prefix for input ids/names when two pickers could share a page. */
  idPrefix?: string;
  legend?: string;
}

export function BusinessTypePicker({
  value,
  onChange,
  disabled = false,
  idPrefix = 'business-type',
  legend = 'What kind of business is this workspace for?',
}: Readonly<BusinessTypePickerProps>) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-medium">{legend}</legend>
      {TENANT_BUSINESS_TYPES.map((type) => {
        const id = `${idPrefix}-${type}`;
        const label = TENANT_BUSINESS_TYPE_LABELS[type];
        const hint = BUSINESS_TYPE_HINTS[type];
        return (
          <label
            key={type}
            htmlFor={id}
            className={cn(
              'grid cursor-pointer grid-cols-[auto_1fr] items-start gap-x-3 rounded-md border border-border bg-background p-3 text-sm',
              'has-[:checked]:border-primary has-[:checked]:bg-primary/5',
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
              className="row-span-2 mt-1"
            />
            <span className="font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </label>
        );
      })}
    </fieldset>
  );
}
