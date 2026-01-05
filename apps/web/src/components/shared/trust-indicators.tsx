'use client';

/**
 * TrustIndicators - Security badges row
 *
 * Displays trust and security indicators (encryption, compliance, etc.).
 * Used on login, signup, and other security-sensitive pages.
 *
 * Features:
 * - Default items for common trust signals
 * - Material Symbols icons
 * - Customizable items
 * - Inline or stacked layout variants
 *
 * @example
 * ```tsx
 * <TrustIndicators />
 *
 * <TrustIndicators
 *   items={[
 *     { icon: 'lock', label: 'Encrypted' },
 *     { icon: 'shield_check', label: 'Certified' },
 *   ]}
 * />
 * ```
 */

import * as React from 'react';
import { cn } from '@intelliflow/ui';

// ============================================================
// Types
// ============================================================

export interface TrustIndicatorItem {
  /** Material Symbol icon name */
  icon: string;
  /** Label text */
  label: string;
}

export interface TrustIndicatorsProps {
  /** Custom trust indicator items (defaults to common security badges) */
  items?: TrustIndicatorItem[];
  /** Layout variant */
  variant?: 'inline' | 'stacked';
  /** Additional CSS classes */
  className?: string;
}

// ============================================================
// Default Items
// ============================================================

const DEFAULT_TRUST_ITEMS: TrustIndicatorItem[] = [
  { icon: 'lock', label: 'Secure' },
  { icon: 'shield_check', label: 'SOC 2 Type II' },
  { icon: 'policy', label: 'GDPR Ready' },
];

// ============================================================
// Component
// ============================================================

export function TrustIndicators({
  items = DEFAULT_TRUST_ITEMS,
  variant = 'inline',
  className,
}: TrustIndicatorsProps) {
  if (variant === 'stacked') {
    return (
      <div className={cn('flex flex-col gap-2 text-xs text-slate-400', className)}>
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-4 text-xs text-slate-400',
        className
      )}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          <div className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7cc4ff]" aria-hidden="true">
              {item.icon}
            </span>
            {item.label}
          </div>
          {/* Separator dot (not after last item) */}
          {index < items.length - 1 && (
            <div className="w-1 h-1 rounded-full bg-slate-600" aria-hidden="true" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

export default TrustIndicators;
