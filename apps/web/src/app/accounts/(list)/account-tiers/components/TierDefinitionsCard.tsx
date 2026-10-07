'use client';

import { Button, Input } from '@intelliflow/ui';
import type { AccountTierColorToken } from '@intelliflow/validators';
import { parseRevenueInput, type TierDraft } from '../tier-draft';
import { TierColorPicker } from './TierColorPicker';

export interface TierDefinitionsCardProps {
  readonly tiers: readonly TierDraft[];
  readonly errors: Readonly<Record<string, string[]>>;
  readonly readOnly: boolean;
  readonly onChange: (id: string, patch: Partial<Omit<TierDraft, 'id'>>) => void;
  readonly onRemove: (id: string) => void;
}

const revenueFormatter = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

function revenueHint(text: string): string {
  const value = parseRevenueInput(text);
  if (!Number.isFinite(value)) return 'Enter a number';
  return value === 0 ? 'Accounts from 0' : `Accounts from ${revenueFormatter.format(value)}`;
}

/** Tier rows: colour, name, minimum annual revenue, remove. */
export function TierDefinitionsCard({
  tiers,
  errors,
  readOnly,
  onChange,
  onRemove,
}: TierDefinitionsCardProps) {
  const canRemove = !readOnly && tiers.length > 1;
  return (
    <ul className="space-y-3" aria-label="Account tiers">
      {tiers.map((tier, index) => {
        const rowErrors = errors[tier.id] ?? [];
        const labelId = `tier-${tier.id}-label`;
        const minId = `tier-${tier.id}-min`;
        const errorId = `tier-${tier.id}-errors`;
        const tierName = tier.label.trim() || `Tier ${index + 1}`;
        return (
          <li
            key={tier.id}
            className="grid grid-cols-[auto_1fr] sm:grid-cols-[auto_1fr_180px_auto] items-start gap-2 sm:gap-3"
          >
            <TierColorPicker
              tierLabel={tierName}
              value={tier.colorToken}
              disabled={readOnly}
              onChange={(colorToken: AccountTierColorToken) => onChange(tier.id, { colorToken })}
            />
            <div>
              <label htmlFor={labelId} className="sr-only">
                Name of tier {index + 1}
              </label>
              <Input
                id={labelId}
                value={tier.label}
                maxLength={40}
                disabled={readOnly}
                aria-invalid={rowErrors.length > 0}
                aria-describedby={rowErrors.length > 0 ? errorId : undefined}
                onChange={(e) => onChange(tier.id, { label: e.target.value })}
              />
              {tier.key && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Key <code>{tier.key}</code>
                </p>
              )}
            </div>
            <div className="col-start-2 sm:col-start-auto">
              <label htmlFor={minId} className="sr-only">
                Minimum annual revenue for {tierName}
              </label>
              <Input
                id={minId}
                inputMode="decimal"
                value={tier.minRevenue}
                placeholder="0"
                disabled={readOnly}
                aria-invalid={rowErrors.length > 0}
                aria-describedby={`${minId}-hint`}
                onChange={(e) => onChange(tier.id, { minRevenue: e.target.value })}
              />
              <p id={`${minId}-hint`} className="mt-1 text-xs text-muted-foreground">
                {revenueHint(tier.minRevenue)}
              </p>
            </div>
            <div className="col-start-2 sm:col-start-auto">
              {canRemove && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${tierName}`}
                  onClick={() => onRemove(tier.id)}
                >
                  Remove
                </Button>
              )}
            </div>
            {rowErrors.length > 0 && (
              <div id={errorId} role="alert" className="col-span-full text-xs text-destructive">
                {rowErrors.map((message) => (
                  <p key={message}>{message}</p>
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
