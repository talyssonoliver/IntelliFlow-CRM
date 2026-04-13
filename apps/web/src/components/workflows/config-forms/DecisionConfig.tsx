'use client';

import { Button, Input, Label } from '@intelliflow/ui';
import type { NodeConfigFormProps } from './types';

export function DecisionConfig({ config, update }: NodeConfigFormProps) {
  const conditions = config.conditions ?? [];

  return (
    <div className="flex flex-col gap-2">
      <Label>Conditions</Label>
      <p className="text-sm text-muted-foreground">
        Define the branch conditions for this decision node.
      </p>
      {conditions.map((cond, idx) => (
        <div key={idx} className="flex gap-2">
          <Input
            value={cond}
            onChange={(e) => {
              const next = [...conditions];
              next[idx] = e.target.value;
              update({ conditions: next });
            }}
            aria-label={`Condition ${idx + 1}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => update({ conditions: conditions.filter((_, i) => i !== idx) })}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => update({ conditions: [...conditions, ''] })}
      >
        + Add Condition
      </Button>
    </div>
  );
}
