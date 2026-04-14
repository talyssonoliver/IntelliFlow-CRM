'use client';

import { useMemo } from 'react';
import {
  contactAutomationSettingsSchema,
  type ContactAutomationSettingsInput,
} from '@intelliflow/validators';
import type { DuplicateRuleRow } from './DuplicateDetectionTab';
import type { RequiredFieldRow } from './RequiredFieldsTab';
import type { TagRow } from './TagsTab';

interface ConfigurationSummaryProps {
  rules: DuplicateRuleRow[];
  fields: RequiredFieldRow[];
  tags: TagRow[];
  automation: ContactAutomationSettingsInput;
  lastUpdated: Date | null;
  isDirty: boolean;
}

// Derive the AI and non-AI key partition directly from the Zod schema so
// adding a new boolean to the schema automatically flows into the counts.
const ALL_AUTOMATION_KEYS = Object.keys(
  contactAutomationSettingsSchema.shape
) as (keyof ContactAutomationSettingsInput)[];

const AI_KEYS = ALL_AUTOMATION_KEYS.filter((k) => k.startsWith('ai')) as Array<
  keyof ContactAutomationSettingsInput
>;
const NON_AI_AUTOMATION_KEYS = ALL_AUTOMATION_KEYS.filter(
  (k) => !k.startsWith('ai')
) as Array<keyof ContactAutomationSettingsInput>;

export function ConfigurationSummary({
  rules,
  fields,
  tags,
  automation,
  lastUpdated,
  isDirty,
}: Readonly<ConfigurationSummaryProps>) {
  const stats = useMemo(() => {
    const activeRules = rules.filter((r) => r.isActive).length;
    const requiredFields = fields.filter((f) => f.isRequired).length;
    const aiEnabled = AI_KEYS.filter((k) => automation[k]).length;
    const activeAutomation = NON_AI_AUTOMATION_KEYS.filter((k) => automation[k]).length;
    return { activeRules, requiredFields, aiEnabled, activeAutomation };
  }, [rules, fields, automation]);

  const items = [
    {
      icon: 'content_copy',
      label: 'Active duplicate rules',
      value: `${stats.activeRules} / ${rules.length}`,
      colorBg: 'bg-blue-100 dark:bg-blue-900/30',
      colorFg: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: 'checklist',
      label: 'Required fields',
      value: `${stats.requiredFields} / ${fields.length}`,
      colorBg: 'bg-emerald-100 dark:bg-emerald-900/30',
      colorFg: 'text-emerald-600 dark:text-emerald-400',
    },
    {
      icon: 'neurology',
      label: 'AI features on',
      value: `${stats.aiEnabled} / ${AI_KEYS.length}`,
      colorBg: 'bg-fuchsia-100 dark:bg-fuchsia-900/30',
      colorFg: 'text-fuchsia-600 dark:text-fuchsia-400',
    },
    {
      icon: 'bolt',
      label: 'Automation on',
      value: `${stats.activeAutomation} / ${NON_AI_AUTOMATION_KEYS.length}`,
      colorBg: 'bg-amber-100 dark:bg-amber-900/30',
      colorFg: 'text-amber-600 dark:text-amber-400',
    },
    {
      icon: 'sell',
      label: 'Tags defined',
      value: String(tags.length),
      colorBg: 'bg-violet-100 dark:bg-violet-900/30',
      colorFg: 'text-violet-600 dark:text-violet-400',
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
              </span>
              Unsaved changes
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span
                className="material-symbols-outlined text-[14px] text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              >
                check_circle
              </span>
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
