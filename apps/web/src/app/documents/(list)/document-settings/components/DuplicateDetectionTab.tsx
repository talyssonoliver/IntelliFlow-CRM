'use client';

import {
  Button,
  Card,
  EmptyState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';

export interface LocalDuplicateRule {
  field: 'content_hash' | 'filename_normalized';
  matchStrategy: 'exact' | 'normalized';
  collisionAction: 'replace' | 'warn' | 'skip' | 'version';
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  rules: LocalDuplicateRule[];
  onRulesChange: (r: LocalDuplicateRule[]) => void;
  hasConflict: boolean;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}

function SectionHeader({
  icon,
  iconBg,
  iconFg,
  title,
  description,
  action,
}: Readonly<SectionHeaderProps>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <span className={`material-symbols-outlined text-[20px] ${iconFg}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

const FIELD_OPTIONS = ['content_hash', 'filename_normalized'];
const STRATEGY_OPTIONS = ['exact', 'normalized'];
const ACTION_OPTIONS = ['warn', 'skip', 'replace', 'version'];

export function DuplicateDetectionTab({ rules, onRulesChange, hasConflict }: Readonly<Props>) {
  const addRule = () => {
    onRulesChange([
      ...rules,
      {
        field: 'content_hash',
        matchStrategy: 'exact',
        collisionAction: 'warn',
        isActive: true,
        sortOrder: rules.length,
      },
    ]);
  };

  const removeRule = (idx: number) => {
    onRulesChange(rules.filter((_, i) => i !== idx));
  };

  const updateRule = (idx: number, updates: Partial<LocalDuplicateRule>) => {
    onRulesChange(rules.map((r, i) => (i === idx ? { ...r, ...updates } : r)));
  };

  return (
    <Card className="lg:col-span-7 p-4 sm:p-6">
      <SectionHeader
        icon="content_copy"
        iconBg="bg-orange-500/10"
        iconFg="text-orange-500"
        title="Duplicate Detection"
        description="Rules for detecting duplicate documents by content hash or filename."
        action={
          <Button type="button" size="sm" variant="outline" onClick={addRule}>
            <span className="material-symbols-outlined text-[16px] mr-1" aria-hidden="true">
              add
            </span>
            Add Rule
          </Button>
        }
      />

      {hasConflict && (
        <div className="mb-3 px-3 py-2 rounded-md bg-destructive/10 text-destructive text-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
            warning
          </span>
          Duplicate field + strategy pair detected. Please resolve conflicts before saving.
        </div>
      )}

      {rules.length === 0 ? (
        <EmptyState entity="rules" phase="passive" size="sm" className="py-4 px-3 gap-2" />
      ) : (
        <div className="space-y-3">
          {rules.map((rule, idx) => (
            <div
              key={idx}
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1fr_140px_auto_auto] gap-2 items-center"
            >
              <Select
                value={rule.field}
                onValueChange={(v) => updateRule(idx, { field: v as LocalDuplicateRule['field'] })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Field" />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.matchStrategy}
                onValueChange={(v) =>
                  updateRule(idx, { matchStrategy: v as LocalDuplicateRule['matchStrategy'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Strategy" />
                </SelectTrigger>
                <SelectContent>
                  {STRATEGY_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={rule.collisionAction}
                onValueChange={(v) =>
                  updateRule(idx, { collisionAction: v as LocalDuplicateRule['collisionAction'] })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Action" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Switch
                checked={rule.isActive}
                onCheckedChange={(v) => updateRule(idx, { isActive: v })}
                aria-label={`Rule ${idx + 1} active`}
              />

              <button
                type="button"
                onClick={() => removeRule(idx)}
                aria-label={`Remove rule ${idx + 1}`}
                className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                  delete
                </span>
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
