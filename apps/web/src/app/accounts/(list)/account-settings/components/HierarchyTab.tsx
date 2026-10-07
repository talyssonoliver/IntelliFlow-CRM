'use client';

import Link from 'next/link';
import { Input, Button, Switch, Badge } from '@intelliflow/ui';
import type { AccountHierarchyConfigInput } from '@intelliflow/validators';

/** An account tier from the tenant's configuration (PG-196). */
export interface HierarchyTierOption {
  readonly key: string;
  readonly label: string;
}

export interface HierarchyTabProps {
  readonly config: AccountHierarchyConfigInput;
  readonly onConfigChange: (next: AccountHierarchyConfigInput) => void;
  /** Tiers defined on the Account Tiers page. */
  readonly tierOptions: readonly HierarchyTierOption[];
}

export function HierarchyTab({ config, onConfigChange, tierOptions }: HierarchyTabProps) {
  const tierKeys = new Set(tierOptions.map((t) => t.key));

  const handleMaxDepth = (raw: string) => {
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    const clamped = Math.min(10, Math.max(1, parsed));
    onConfigChange({ ...config, maxDepth: clamped });
  };

  const toggleTier = (tier: string) => {
    const has = config.requireParentForTiers.includes(tier);
    const next = has
      ? config.requireParentForTiers.filter((t) => t !== tier)
      : [...config.requireParentForTiers, tier];
    onConfigChange({ ...config, requireParentForTiers: next });
  };

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="account-hierarchy-max-depth"
          className="text-sm font-medium text-foreground"
        >
          Maximum hierarchy depth
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          How many levels a child account can be nested below its top-level parent (1–10).
        </p>
        <Input
          id="account-hierarchy-max-depth"
          type="number"
          min={1}
          max={10}
          value={config.maxDepth}
          onChange={(e) => handleMaxDepth(e.target.value)}
          aria-label="Maximum hierarchy depth"
          className="max-w-[120px]"
        />
      </div>

      <div className="space-y-3">
        <div>
          <h4 className="text-sm font-medium text-foreground">Tiers that require a parent</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Accounts on these tiers need a parent account. Tiers follow annual revenue;{' '}
            <Link
              href="/accounts/account-tiers"
              className="text-primary hover:underline"
              aria-label="Manage account tiers"
            >
              manage tiers
            </Link>
            .
          </p>
          <div className="flex flex-wrap gap-2">
            {tierOptions.map((tier) => {
              const active = config.requireParentForTiers.includes(tier.key);
              return (
                <Button
                  key={tier.key}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  aria-pressed={active}
                  onClick={() => toggleTier(tier.key)}
                >
                  {tier.label}
                </Button>
              );
            })}
          </div>
        </div>
        {config.requireParentForTiers.some((t) => !tierKeys.has(t)) && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">
              Legacy values (no matching tier, no effect):
            </p>
            <div className="flex flex-wrap gap-2">
              {config.requireParentForTiers
                .filter((t) => !tierKeys.has(t))
                .map((t) => (
                  <Badge key={t} variant="secondary" className="flex items-center gap-1">
                    {t}
                    <button
                      type="button"
                      aria-label={`Remove legacy tier ${t}`}
                      onClick={() => toggleTier(t)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div>
          <h4 className="text-sm font-medium text-foreground">Prevent hierarchy cycles</h4>
          <p className="text-xs text-muted-foreground">
            Disabling cycle prevention is not supported — accounts cannot be their own ancestor.
          </p>
        </div>
        <Switch checked={config.preventCycles} disabled aria-label="Prevent hierarchy cycles" />
      </div>
    </div>
  );
}
