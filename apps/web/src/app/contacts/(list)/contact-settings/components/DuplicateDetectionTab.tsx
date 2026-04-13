'use client';

import { useCallback } from 'react';
import { Card, Button, Switch, Input, Label } from '@intelliflow/ui';
import type {
  ContactDuplicateRuleInput,
  DuplicateRuleField,
  DuplicateRuleStrategy,
} from '@intelliflow/validators';

export type DuplicateRuleRow = ContactDuplicateRuleInput;

interface DuplicateDetectionTabProps {
  rules: DuplicateRuleRow[];
  onRulesChange: (rules: DuplicateRuleRow[]) => void;
}

const FIELD_LABELS: Record<DuplicateRuleField, string> = {
  email: 'Email',
  phone: 'Phone',
  name_company: 'Name + Company',
};

const STRATEGY_LABELS: Record<DuplicateRuleStrategy, string> = {
  exact: 'Exact match',
  normalized: 'Normalized',
  fuzzy: 'Fuzzy',
};

const FIELDS: DuplicateRuleField[] = ['email', 'phone', 'name_company'];
const STRATEGIES: DuplicateRuleStrategy[] = ['exact', 'normalized', 'fuzzy'];

function clampThreshold(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
}

export function DuplicateDetectionTab({
  rules,
  onRulesChange,
}: Readonly<DuplicateDetectionTabProps>) {
  const updateRule = useCallback(
    (index: number, patch: Partial<DuplicateRuleRow>) => {
      const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
      onRulesChange(next);
    },
    [rules, onRulesChange]
  );

  const addRule = useCallback(() => {
    const existing = new Set(rules.map((r) => `${r.field}_${r.matchStrategy}`));
    const pair = FIELDS.flatMap((f) => STRATEGIES.map((s) => [f, s] as const)).find(
      ([f, s]) => !existing.has(`${f}_${s}`)
    );
    if (!pair) return;
    const [field, matchStrategy] = pair;
    onRulesChange([
      ...rules,
      {
        field,
        matchStrategy,
        threshold: matchStrategy === 'fuzzy' ? 85 : 100,
        isActive: true,
        sortOrder: rules.length,
      },
    ]);
  }, [rules, onRulesChange]);

  const removeRule = useCallback(
    (index: number) => {
      onRulesChange(rules.filter((_, i) => i !== index));
    },
    [rules, onRulesChange]
  );

  return (
    <Card className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">Duplicate detection rules</h3>
          <p className="text-sm text-muted-foreground">
            Configure how the system flags potential duplicate contacts.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={addRule}
          disabled={rules.length >= FIELDS.length * STRATEGIES.length}
        >
          <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
            add
          </span>
          Add rule
        </Button>
      </div>

      <div className="space-y-4" aria-label="Duplicate detection rules">
        {rules.map((rule, index) => {
          const rowId = `dup-${rule.field}-${rule.matchStrategy}`;
          return (
            <div
              key={rowId}
              className="rounded-lg border border-border p-4 flex flex-wrap items-center gap-4"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">{FIELD_LABELS[rule.field]}</span>
                <span className="text-xs text-muted-foreground">
                  Strategy: {STRATEGY_LABELS[rule.matchStrategy]}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Label htmlFor={`${rowId}-threshold`} className="text-xs text-muted-foreground">
                  Threshold
                </Label>
                <Input
                  id={`${rowId}-threshold`}
                  type="number"
                  className="w-20"
                  min={0}
                  max={100}
                  value={rule.threshold}
                  onChange={(e) =>
                    updateRule(index, { threshold: clampThreshold(Number(e.target.value)) })
                  }
                />
              </div>

              <div className="flex items-center gap-2 ml-auto">
                <Label htmlFor={`${rowId}-active`} className="text-xs text-muted-foreground">
                  Active
                </Label>
                <Switch
                  id={`${rowId}-active`}
                  checked={rule.isActive}
                  onCheckedChange={(checked) => updateRule(index, { isActive: checked })}
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeRule(index)}
                aria-label={`Remove ${FIELD_LABELS[rule.field]} rule`}
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  delete
                </span>
              </Button>
            </div>
          );
        })}

        {rules.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            No rules yet. Click “Add rule” to configure duplicate detection.
          </p>
        )}
      </div>
    </Card>
  );
}
