'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@intelliflow/ui';
import type { TierDraft } from '../tier-draft';

/** Select value standing for "no default tier" (Radix Select needs a non-empty value). */
export const NO_DEFAULT_TIER = '__unknown__';

export interface DefaultTierCardProps {
  readonly tiers: readonly TierDraft[];
  readonly value: string | null;
  readonly readOnly: boolean;
  readonly onChange: (key: string | null) => void;
}

/** Tier shown for accounts with no annual revenue. Only saved tiers (with a key) can be chosen. */
export function DefaultTierCard({ tiers, value, readOnly, onChange }: DefaultTierCardProps) {
  const saved = tiers.filter((t): t is TierDraft & { key: string } => Boolean(t.key));
  return (
    <div className="space-y-2">
      <p id="default-tier-label" className="text-sm font-medium text-foreground">
        Default tier
      </p>
      <Select
        value={value ?? NO_DEFAULT_TIER}
        disabled={readOnly}
        onValueChange={(next) => onChange(next === NO_DEFAULT_TIER ? null : next)}
      >
        <SelectTrigger aria-labelledby="default-tier-label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_DEFAULT_TIER}>Unknown (no tier)</SelectItem>
          {saved.map((t) => (
            <SelectItem key={t.key} value={t.key}>
              {t.label.trim() || t.key}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Used when an account has no annual revenue recorded. New tiers can be chosen after saving.
      </p>
    </div>
  );
}
