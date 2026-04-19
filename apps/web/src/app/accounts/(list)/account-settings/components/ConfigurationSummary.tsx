'use client';

import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { formatDateShort } from '@/lib/shared/timezone-utils';
import type { AccountHierarchyConfigInput } from '@intelliflow/validators';
import type { IndustryRow } from './IndustryTab';
import type { CustomFieldRow } from './CustomFieldsTab';
import type { DuplicateRuleRow } from './DuplicateDetectionTab';
import type { RequiredFieldRow } from './RequiredFieldsTab';
import type { TagRow } from './TagsTab';
import type { AccountAutomationSettings } from './AutomationTab';

export interface ConfigurationSummaryProps {
  readonly hierarchy: AccountHierarchyConfigInput;
  readonly industries: IndustryRow[];
  readonly customFields: CustomFieldRow[];
  readonly duplicateRules: DuplicateRuleRow[];
  readonly requiredFields: RequiredFieldRow[];
  readonly tags: TagRow[];
  readonly automation: AccountAutomationSettings;
  readonly lastUpdated: Date | null;
  readonly isDirty: boolean;
}

function Stat({ label, value }: Readonly<{ label: string; value: React.ReactNode }>) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold text-foreground">{value}</div>
    </div>
  );
}

export function ConfigurationSummary({
  hierarchy,
  industries,
  customFields,
  duplicateRules,
  requiredFields,
  tags,
  automation,
  lastUpdated,
  isDirty,
}: Readonly<ConfigurationSummaryProps>) {
  const { timezone } = useTimezoneContext();
  const activeIndustries = industries.filter((i) => i.isActive).length;
  const requiredCustomFields = customFields.filter((f) => f.isRequired).length;
  const activeDuplicateRules = duplicateRules.filter((r) => r.isActive).length;
  const requiredCoreFields = requiredFields.filter((f) => f.isRequired).length;
  const aiFeaturesOn = (
    [
      'aiIndustryInference',
      'aiEnrichment',
      'aiTagSuggestions',
      'aiInsightGeneration',
      'aiAccountScoring',
    ] as const
  ).filter((k) => automation[k]).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Max hierarchy depth" value={hierarchy.maxDepth} />
        <Stat label="Industries (active)" value={`${activeIndustries} / ${industries.length}`} />
        <Stat label="Custom fields" value={customFields.length} />
        <Stat label="Required custom" value={requiredCustomFields} />
        <Stat
          label="Duplicate rules (on)"
          value={`${activeDuplicateRules} / ${duplicateRules.length}`}
        />
        <Stat
          label="Required core fields"
          value={`${requiredCoreFields} / ${requiredFields.length}`}
        />
        <Stat label="Tags" value={tags.length} />
        <Stat label="AI features on" value={`${aiFeaturesOn} / 5`} />
      </div>

      <div className="flex items-center justify-between text-xs pt-3 border-t border-border">
        <span className={isDirty ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
          {isDirty ? 'Unsaved changes' : 'All changes saved'}
        </span>
        <span className="text-muted-foreground">
          {lastUpdated ? `Updated ${formatDateShort(lastUpdated, timezone)}` : '—'}
        </span>
      </div>
    </div>
  );
}
