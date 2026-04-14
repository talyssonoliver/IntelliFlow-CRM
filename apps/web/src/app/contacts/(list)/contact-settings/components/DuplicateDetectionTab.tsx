'use client';

import { useCallback } from 'react';
import {
  Button,
  EmptyState,
  Switch,
  Input,
  Label,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@intelliflow/ui';
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

const FIELD_OPTIONS: { value: DuplicateRuleField; label: string }[] = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'name_company', label: 'Name + Company' },
];

const STRATEGY_OPTIONS: { value: DuplicateRuleStrategy; label: string }[] = [
  { value: 'exact', label: 'Exact match' },
  { value: 'normalized', label: 'Normalized' },
  { value: 'fuzzy', label: 'Fuzzy' },
];

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
      onRulesChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
    },
    [rules, onRulesChange]
  );

  const addRule = useCallback(() => {
    // Pick first (field, strategy) combination not already present so the
    // compound unique constraint is respected; user is free to change both
    // immediately via the inline selects on the new row.
    const existing = new Set(rules.map((r) => `${r.field}_${r.matchStrategy}`));
    const firstFree = FIELD_OPTIONS.flatMap((f) =>
      STRATEGY_OPTIONS.map((s) => ({ field: f.value, matchStrategy: s.value }))
    ).find((pair) => !existing.has(`${pair.field}_${pair.matchStrategy}`));

    if (!firstFree) return;

    onRulesChange([
      ...rules,
      {
        field: firstFree.field,
        matchStrategy: firstFree.matchStrategy,
        threshold: firstFree.matchStrategy === 'fuzzy' ? 85 : 100,
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

  const isDuplicatePair = useCallback(
    (index: number) => {
      const { field, matchStrategy } = rules[index];
      return rules.some(
        (r, i) => i !== index && r.field === field && r.matchStrategy === matchStrategy
      );
    },
    [rules]
  );

  return (
    <div className="space-y-4" aria-label="Duplicate detection rules">
      {rules.map((rule, index) => {
        const rowKey = `dup-row-${index}`;
        const duplicatePair = isDuplicatePair(index);
        return (
          <div
            key={rowKey}
            className="rounded-lg border border-border p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto_auto] gap-3 items-end"
          >
            <div>
              <Label htmlFor={`${rowKey}-field`} className="text-xs text-muted-foreground">
                Field
              </Label>
              <Select
                value={rule.field}
                onValueChange={(v) =>
                  updateRule(index, { field: v as DuplicateRuleField })
                }
              >
                <SelectTrigger id={`${rowKey}-field`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor={`${rowKey}-strategy`} className="text-xs text-muted-foreground">
                Strategy
              </Label>
              <Select
                value={rule.matchStrategy}
                onValueChange={(v) =>
                  updateRule(index, { matchStrategy: v as DuplicateRuleStrategy })
                }
              >
                <SelectTrigger id={`${rowKey}-strategy`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label
                htmlFor={`${rowKey}-threshold`}
                className="text-xs text-muted-foreground"
              >
                Threshold
              </Label>
              <Input
                id={`${rowKey}-threshold`}
                type="number"
                min={0}
                max={100}
                value={rule.threshold}
                onChange={(e) =>
                  updateRule(index, { threshold: clampThreshold(Number(e.target.value)) })
                }
              />
            </div>

            <div className="flex items-center gap-2">
              <Label
                htmlFor={`${rowKey}-active`}
                className="text-xs text-muted-foreground"
              >
                Active
              </Label>
              <Switch
                id={`${rowKey}-active`}
                checked={rule.isActive}
                onCheckedChange={(checked) => updateRule(index, { isActive: checked })}
              />
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRule(index)}
              aria-label={`Remove rule ${index + 1}`}
              className="self-end"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                delete
              </span>
            </Button>

            {duplicatePair && (
              <p
                className="md:col-span-2 lg:col-span-5 text-xs text-destructive"
                role="alert"
              >
                Another rule already uses this field + strategy combination — saving
                is blocked until one is changed.
              </p>
            )}
          </div>
        );
      })}

      {rules.length === 0 && (
        <EmptyState
          entity="rules"
          size="sm"
          title="No duplicate rules"
          description="Add a rule to start flagging potential duplicate contacts on save."
          action={{ label: 'Add rule', icon: 'add', onClick: addRule }}
        />
      )}

      <Button
        variant="outline"
        onClick={addRule}
        disabled={rules.length >= FIELD_OPTIONS.length * STRATEGY_OPTIONS.length}
      >
        <span className="material-symbols-outlined text-base mr-1" aria-hidden="true">
          add
        </span>
        Add rule
      </Button>
    </div>
  );
}
