'use client';

import { Button, EmptyState, Switch } from '@intelliflow/ui';
import type { TicketDuplicateRuleInput } from '@intelliflow/validators';

interface Props {
  rules: TicketDuplicateRuleInput[];
  onChange: (rules: TicketDuplicateRuleInput[]) => void;
}

const FIELD_LABELS: Record<string, string> = {
  contact_subject: 'Contact + Subject',
  contact_24h: 'Same Contact (24h window)',
  email_subject: 'Email + Subject (fuzzy)',
  contact_description_5min: 'Contact + Description (5-min window)',
};

const STRATEGY_LABELS: Record<string, string> = {
  exact: 'Exact',
  normalized: 'Normalized',
  fuzzy: 'Fuzzy',
};

const FIELD_OPTIONS = Object.keys(FIELD_LABELS) as TicketDuplicateRuleInput['field'][];
const STRATEGY_OPTIONS = Object.keys(
  STRATEGY_LABELS
) as TicketDuplicateRuleInput['matchStrategy'][];
const MAX_RULES = FIELD_OPTIONS.length * STRATEGY_OPTIONS.length;

export function TicketDuplicateDetectionCard({ rules, onChange }: Props) {
  const toggleActive = (index: number) => {
    const next = rules.map((r, i) => (i === index ? { ...r, isActive: !r.isActive } : r));
    onChange(next);
  };

  const addRule = () => {
    const existing = new Set(rules.map((r) => `${r.field}_${r.matchStrategy}`));
    const firstFree = FIELD_OPTIONS.flatMap((field) =>
      STRATEGY_OPTIONS.map((matchStrategy) => ({ field, matchStrategy }))
    ).find((pair) => !existing.has(`${pair.field}_${pair.matchStrategy}`));

    if (!firstFree) return;

    onChange([
      ...rules,
      {
        field: firstFree.field,
        matchStrategy: firstFree.matchStrategy,
        threshold: firstFree.matchStrategy === 'fuzzy' ? 85 : 100,
        isActive: true,
        sortOrder: rules.length,
      },
    ]);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-[20px] text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          >
            rule
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Duplicate Detection</h3>
          <p className="text-sm text-muted-foreground">
            Rules that flag possible duplicate tickets at intake.
          </p>
        </div>
      </div>

      {rules.length === 0 ? (
        <EmptyState
          entity="rules"
          phase="passive"
          size="sm"
          className="py-4 px-3 gap-2"
          title="No duplicate rules yet"
          description="Add a rule to flag possible duplicates automatically."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2 pr-3">Field</th>
                <th className="py-2 pr-3">Strategy</th>
                <th className="py-2 pr-3">Threshold</th>
                <th className="py-2 pr-3">Active</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule, i) => (
                <tr key={`${rule.field}-${rule.matchStrategy}`} className="border-b border-border">
                  <td className="py-2 pr-3">{FIELD_LABELS[rule.field] ?? rule.field}</td>
                  <td className="py-2 pr-3">
                    {STRATEGY_LABELS[rule.matchStrategy] ?? rule.matchStrategy}
                  </td>
                  <td className="py-2 pr-3">{rule.threshold}%</td>
                  <td className="py-2 pr-3">
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleActive(i)}
                      aria-label={`Toggle ${FIELD_LABELS[rule.field] ?? rule.field}`}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          onClick={addRule}
          disabled={rules.length >= MAX_RULES}
          aria-label="Add duplicate detection rule"
        >
          Add Rule
        </Button>
      </div>
    </div>
  );
}
