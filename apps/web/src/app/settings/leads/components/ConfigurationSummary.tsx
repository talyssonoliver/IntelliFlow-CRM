'use client';

import { useMemo } from 'react';
import type { AutomationSettings } from './AutomationTab';
import type { CustomField } from './CustomFieldsTab';
import type { ScoringRule } from './ScoringRulesTab';
import type { StageItem } from './SortableStageItem';

interface ConfigurationSummaryProps {
  stages: StageItem[];
  rules: ScoringRule[];
  fields: CustomField[];
  automation: AutomationSettings;
  lastUpdated: Date | null;
  isDirty: boolean;
}

const AUTOMATION_KEYS: readonly (keyof AutomationSettings)[] = [
  'autoAssignment',
  'instantNotifications',
  'leadRecurrence',
];

export function ConfigurationSummary({
  stages,
  rules,
  fields,
  automation,
  lastUpdated,
  isDirty,
}: Readonly<ConfigurationSummaryProps>) {
  const stats = useMemo(() => {
    const stageCount = stages.length;
    const scoringTotal = rules.reduce((sum, r) => sum + r.points, 0);
    const requiredFieldCount = fields.filter((f) => f.isRequired).length;
    const automationOn = AUTOMATION_KEYS.filter((k) => automation[k]).length;
    return { stageCount, scoringTotal, requiredFieldCount, automationOn };
  }, [stages, rules, fields, automation]);

  const items = [
    {
      icon: 'view_kanban',
      label: 'Pipeline stages',
      value: String(stats.stageCount),
      colorBg: 'bg-blue-100 dark:bg-blue-900/30',
      colorFg: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: 'trending_up',
      label: 'Scoring points (max)',
      value: String(stats.scoringTotal),
      colorBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      colorFg: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: 'tune',
      label: 'Custom fields',
      value: `${stats.requiredFieldCount} req / ${fields.length}`,
      colorBg: 'bg-violet-100 dark:bg-violet-900/30',
      colorFg: 'text-violet-600 dark:text-violet-400',
    },
    {
      icon: 'bolt',
      label: 'Automation on',
      value: `${stats.automationOn} / ${AUTOMATION_KEYS.length}`,
      colorBg: 'bg-amber-100 dark:bg-amber-900/30',
      colorFg: 'text-amber-600 dark:text-amber-400',
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="space-y-3 flex-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div
              className={`w-8 h-8 rounded-lg ${item.colorBg} flex items-center justify-center shrink-0`}
            >
              <span
                className={`material-symbols-outlined text-[18px] ${item.colorFg}`}
                aria-hidden="true"
              >
                {item.icon}
              </span>
            </div>
            <div className="flex-1 min-w-0 flex items-center justify-between gap-2">
              <span className="text-sm text-muted-foreground truncate">{item.label}</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-border text-xs text-muted-foreground flex items-center justify-between gap-2">
        <span>
          {isDirty ? (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                edit
              </span>{' '}
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span
                className="material-symbols-outlined text-[14px] text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              >
                check_circle
              </span>{' '}
              Saved
            </span>
          )}
        </span>
        {lastUpdated && (
          <span className="truncate">
            Last saved{' '}
            {lastUpdated.toLocaleDateString('en-GB', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        )}
      </div>
    </div>
  );
}
