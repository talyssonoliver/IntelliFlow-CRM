'use client';

import { useState } from 'react';
import { Card, Input, Button, Switch, Badge } from '@intelliflow/ui';
import type { AccountHierarchyConfigInput } from '@intelliflow/validators';

const DEFAULT_TIER_OPTIONS = ['enterprise', 'mid-market', 'smb', 'startup'];

export interface HierarchyTabProps {
  readonly config: AccountHierarchyConfigInput;
  readonly onConfigChange: (next: AccountHierarchyConfigInput) => void;
  readonly tierOptions?: readonly string[];
}

export function HierarchyTab({
  config,
  onConfigChange,
  tierOptions = DEFAULT_TIER_OPTIONS,
}: HierarchyTabProps) {
  const [customTier, setCustomTier] = useState('');

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

  const addCustomTier = () => {
    const t = customTier.trim();
    if (!t) return;
    if (config.requireParentForTiers.includes(t)) return;
    onConfigChange({
      ...config,
      requireParentForTiers: [...config.requireParentForTiers, t],
    });
    setCustomTier('');
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 space-y-3">
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
      </Card>

      <Card className="p-4 space-y-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Tiers that require a parent</h3>
          <p className="text-xs text-muted-foreground mb-2">
            Accounts on these tiers must be created with a parent account.
          </p>
          <div className="flex flex-wrap gap-2">
            {tierOptions.map((tier) => {
              const active = config.requireParentForTiers.includes(tier);
              return (
                <Button
                  key={tier}
                  type="button"
                  size="sm"
                  variant={active ? 'default' : 'outline'}
                  onClick={() => toggleTier(tier)}
                >
                  {tier}
                </Button>
              );
            })}
          </div>
        </div>
        {config.requireParentForTiers.some((t) => !tierOptions.includes(t)) && (
          <div className="flex flex-wrap gap-2">
            {config.requireParentForTiers
              .filter((t) => !tierOptions.includes(t))
              .map((t) => (
                <Badge key={t} variant="secondary" className="flex items-center gap-1">
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove tier ${t}`}
                    onClick={() => toggleTier(t)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ×
                  </button>
                </Badge>
              ))}
          </div>
        )}
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label htmlFor="custom-tier" className="text-xs text-muted-foreground">
              Add a custom tier key
            </label>
            <Input
              id="custom-tier"
              value={customTier}
              onChange={(e) => setCustomTier(e.target.value)}
              placeholder="e.g. strategic"
            />
          </div>
          <Button type="button" onClick={addCustomTier}>
            Add
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Prevent hierarchy cycles</h3>
            <p className="text-xs text-muted-foreground">
              Disabling cycle prevention is not supported — accounts cannot be their own ancestor.
            </p>
          </div>
          <Switch checked={config.preventCycles} disabled aria-label="Prevent hierarchy cycles" />
        </div>
      </Card>
    </div>
  );
}
