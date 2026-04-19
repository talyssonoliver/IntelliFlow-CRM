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
    onRulesChange([
      ...rules,
      {
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: rules.length,
      },
    ]);
  };

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
                      <SelectItem key={k} value={k}>
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
                      <SelectItem key={k} value={k}>
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
        <Button size="sm" onClick={add}>
          Add Rule
        </Button>
      </div>
    </div>
  );
}
