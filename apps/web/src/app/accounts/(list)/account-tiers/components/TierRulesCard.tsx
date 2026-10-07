'use client';

import { Switch } from '@intelliflow/ui';

export interface TierRulesCardProps {
  readonly notifyOwnerOnUpgrade: boolean;
  readonly notifyOwnerOnDowngrade: boolean;
  readonly readOnly: boolean;
  readonly onChange: (
    patch: Partial<{ notifyOwnerOnUpgrade: boolean; notifyOwnerOnDowngrade: boolean }>
  ) => void;
}

const RULES = [
  {
    field: 'notifyOwnerOnUpgrade',
    id: 'tier-rule-upgrade',
    label: 'Notify owner when an account moves up a tier',
  },
  {
    field: 'notifyOwnerOnDowngrade',
    id: 'tier-rule-downgrade',
    label: 'Notify owner when an account moves down a tier',
  },
] as const;

/** Up/down rules: tiers follow revenue automatically; owners can be notified of a move. */
export function TierRulesCard(props: TierRulesCardProps) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Accounts move between tiers automatically when their annual revenue crosses a threshold.
      </p>
      {RULES.map((rule) => (
        <div key={rule.field} className="flex items-center justify-between gap-4">
          <label htmlFor={rule.id} className="text-sm text-foreground">
            {rule.label}
          </label>
          <Switch
            id={rule.id}
            checked={props[rule.field]}
            disabled={props.readOnly}
            onCheckedChange={(checked) => props.onChange({ [rule.field]: checked })}
          />
        </div>
      ))}
    </div>
  );
}
