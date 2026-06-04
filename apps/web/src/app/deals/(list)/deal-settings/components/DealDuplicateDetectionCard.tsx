'use client';

import {
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';

export interface DealDuplicateRuleRow {
  field: 'name_account' | 'name_amount_stage' | 'expected_close';
  matchStrategy: 'exact' | 'normalized' | 'fuzzy';
  threshold: number;
  isActive: boolean;
  sortOrder: number;
}

const FIELD_LABELS: Record<DealDuplicateRuleRow['field'], string> = {
  name_account: 'Name + account',
  name_amount_stage: 'Name + amount + stage',
  expected_close: 'Expected close date',
};

const STRATEGY_LABELS: Record<DealDuplicateRuleRow['matchStrategy'], string> = {
  exact: 'Exact',
  normalized: 'Normalized',
  fuzzy: 'Fuzzy',
};

// Single source of truth for the closed option sets (DRY — used by add(), the
// all-combinations-used guard, and the per-row collision disabling).
const ALL_FIELDS = Object.keys(FIELD_LABELS) as DealDuplicateRuleRow['field'][];
const ALL_STRATEGIES = Object.keys(STRATEGY_LABELS) as DealDuplicateRuleRow['matchStrategy'][];

export interface DealDuplicateDetectionCardProps {
  readonly rules: DealDuplicateRuleRow[];
  readonly onRulesChange: (rules: DealDuplicateRuleRow[]) => void;
}

export function DealDuplicateDetectionCard({
  rules,
  onRulesChange,
}: Readonly<DealDuplicateDetectionCardProps>) {
  const update = (index: number, patch: Partial<DealDuplicateRuleRow>) => {
    const next = rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onRulesChange(next);
  };

  const remove = (index: number) => {
    onRulesChange(rules.filter((_, i) => i !== index));
  };

  const add = () => {
    const existing = new Set(rules.map((r) => `${r.field}|${r.matchStrategy}`));
    let newRule: Omit<DealDuplicateRuleRow, 'sortOrder'> | null = null;
    outer: for (const field of ALL_FIELDS) {
      for (const matchStrategy of ALL_STRATEGIES) {
        if (!existing.has(`${field}|${matchStrategy}`)) {
          newRule = { field, matchStrategy, threshold: 100, isActive: true };
          break outer;
        }
      }
    }
    if (!newRule) return; // all combinations already present — button will be hidden
    onRulesChange([...rules, { ...newRule, sortOrder: rules.length }]);
  };

  // A rule combination is (field, matchStrategy). Duplicates are prevented
  // structurally: add() only inserts an unused combination, and the per-row
  // Selects below disable any option that would collide with another row — so
  // update() cannot create a duplicate either, and Save can never persist one.
  const allCombinationsUsed = rules.length >= ALL_FIELDS.length * ALL_STRATEGIES.length;

  // True if some OTHER row already uses this (field, matchStrategy) combo.
  const isComboTaken = (
    idx: number,
    field: DealDuplicateRuleRow['field'],
    matchStrategy: DealDuplicateRuleRow['matchStrategy']
  ) => rules.some((r, i) => i !== idx && r.field === field && r.matchStrategy === matchStrategy);

  return (
    <div className="space-y-3">
      {rules.length === 0 ? (
        <p className="text-sm text-muted-foreground">No rules yet. Add one below.</p>
      ) : (
        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <Card key={`${rule.field}-${rule.matchStrategy}-${idx}`} className="p-3 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Select
                  value={rule.field}
                  onValueChange={(v) => update(idx, { field: v as DealDuplicateRuleRow['field'] })}
                >
                  <SelectTrigger className="min-w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(FIELD_LABELS).map(([k, v]) => (
                      <SelectItem
                        key={k}
                        value={k}
                        disabled={isComboTaken(
                          idx,
                          k as DealDuplicateRuleRow['field'],
                          rule.matchStrategy
                        )}
                      >
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={rule.matchStrategy}
                  onValueChange={(v) =>
                    update(idx, { matchStrategy: v as DealDuplicateRuleRow['matchStrategy'] })
                  }
                >
                  <SelectTrigger className="min-w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(STRATEGY_LABELS).map(([k, v]) => (
                      <SelectItem
                        key={k}
                        value={k}
                        disabled={isComboTaken(
                          idx,
                          rule.field,
                          k as DealDuplicateRuleRow['matchStrategy']
                        )}
                      >
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Switch
                  checked={rule.isActive}
                  onCheckedChange={(v) => update(idx, { isActive: v })}
                  aria-label={`Toggle ${FIELD_LABELS[rule.field]} rule`}
                />
                <Button size="sm" variant="outline" onClick={() => remove(idx)}>
                  Remove
                </Button>
              </div>
              {rule.matchStrategy === 'fuzzy' && (
                <div className="flex items-center gap-2 text-sm">
                  <label htmlFor={`threshold-${idx}`} className="text-muted-foreground">
                    Threshold (0–100)
                  </label>
                  <Input
                    id={`threshold-${idx}`}
                    type="number"
                    min={0}
                    max={100}
                    value={rule.threshold}
                    onChange={(e) =>
                      update(idx, {
                        threshold: Math.min(
                          100,
                          Math.max(0, Number.parseInt(e.target.value || '0', 10))
                        ),
                      })
                    }
                    className="max-w-[100px]"
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button size="sm" onClick={add} disabled={allCombinationsUsed}>
          Add Rule
        </Button>
      </div>
    </div>
  );
}
