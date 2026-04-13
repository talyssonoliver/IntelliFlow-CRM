'use client';

import { Button, Input, Label } from '@intelliflow/ui';
import { DecisionOperators } from '@intelliflow/domain';
import type { NodeConfigFormProps } from './types';

/**
 * Decision node config — edits the structured `conditions` array.
 * Domain schema `DecisionConditionSchema` expects `{ field, op, value }`
 * objects (not raw strings), so each row renders a field/operator/value
 * tuple.
 */
interface ConditionRow {
  field: string;
  op: (typeof DecisionOperators)[number];
  value: string | number | boolean | string[];
}

function toRows(raw: unknown): ConditionRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c) => {
    // Legacy rows stored as plain strings — surface them in the `field`
    // column so the user can re-save them without data loss.
    if (typeof c === 'string') return { field: c, op: 'eq', value: '' };
    const obj = (c ?? {}) as Partial<ConditionRow>;
    return {
      field: typeof obj.field === 'string' ? obj.field : '',
      op: (DecisionOperators as readonly string[]).includes(obj.op as string)
        ? (obj.op as ConditionRow['op'])
        : 'eq',
      value:
        obj.value === undefined || obj.value === null
          ? ''
          : (obj.value as ConditionRow['value']),
    };
  });
}

function valueToInput(v: ConditionRow['value']): string {
  if (Array.isArray(v)) return v.join(',');
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export function DecisionConfig({ config, update }: NodeConfigFormProps) {
  const conditions: ConditionRow[] = toRows(
    (config as unknown as { conditions?: unknown }).conditions
  );

  const writeConditions = (next: ConditionRow[]) => {
    update({ conditions: next } as unknown as Partial<typeof config>);
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>Conditions</Label>
      <p className="text-sm text-muted-foreground">
        Define the branch conditions for this decision node. Each row is evaluated as
        &nbsp;<code>field &nbsp;op&nbsp; value</code>.
      </p>
      {conditions.map((cond, idx) => (
        <div key={idx} className="flex gap-2 items-center">
          <Input
            className="flex-1"
            placeholder="field"
            value={cond.field}
            onChange={(e) => {
              const next = [...conditions];
              next[idx] = { ...next[idx], field: e.target.value };
              writeConditions(next);
            }}
            aria-label={`Condition ${idx + 1} field`}
          />
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={cond.op}
            onChange={(e) => {
              const next = [...conditions];
              next[idx] = {
                ...next[idx],
                op: e.target.value as ConditionRow['op'],
              };
              writeConditions(next);
            }}
            aria-label={`Condition ${idx + 1} operator`}
          >
            {DecisionOperators.map((op) => (
              <option key={op} value={op}>
                {op}
              </option>
            ))}
          </select>
          <Input
            className="flex-1"
            placeholder="value"
            value={valueToInput(cond.value)}
            onChange={(e) => {
              const next = [...conditions];
              next[idx] = { ...next[idx], value: e.target.value };
              writeConditions(next);
            }}
            aria-label={`Condition ${idx + 1} value`}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => writeConditions(conditions.filter((_, i) => i !== idx))}
            aria-label={`Remove condition ${idx + 1}`}
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() =>
          writeConditions([...conditions, { field: '', op: 'eq', value: '' }])
        }
      >
        + Add Condition
      </Button>
    </div>
  );
}
