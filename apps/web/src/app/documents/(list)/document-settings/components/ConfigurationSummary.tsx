'use client';

import { useTimezoneContext } from '@/providers/TimezoneProvider';
import { formatDateShort } from '@/lib/shared/timezone-utils';
import type { DocumentGeneralConfigLocal } from './GeneralConfigCard';
import type { LocalDuplicateRule } from './DuplicateDetectionTab';
import type { LocalRequiredField } from './RequiredFieldsTab';
import type { LocalAutomationSettings } from './AutomationCard';
import type { LocalRetentionPolicy } from './RetentionPoliciesTab';

export interface ConfigurationSummaryProps {
  readonly general: DocumentGeneralConfigLocal;
  readonly rules: LocalDuplicateRule[];
  readonly requiredFields: LocalRequiredField[];
  readonly automation: LocalAutomationSettings;
  readonly retention: LocalRetentionPolicy[];
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
  general,
  rules,
  requiredFields,
  automation,
  retention,
  lastUpdated,
  isDirty,
}: Readonly<ConfigurationSummaryProps>) {
  const { timezone } = useTimezoneContext();

  const activeRules = rules.filter((r) => r.isActive).length;
  const requiredCount = requiredFields.filter((f) => f.isRequired).length;
  const aiOn = (
    [
      'autoExtractText',
      'autoClassifyCategory',
      'autoDetectPii',
      'aiTagSuggestions',
      'aiInsightGeneration',
    ] as const
  ).filter((k) => automation[k]).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Allowed MIME types" value={general.allowedMimeTypes.length} />
        <Stat label="Max upload size" value={`${general.maxUploadSizeMb} MB`} />
        <Stat
          label="Retention default"
          value={
            general.defaultRetentionDays === 0 ? 'Forever' : `${general.defaultRetentionDays}d`
          }
        />
        <Stat label="Antivirus" value={general.enableAntivirusScan ? 'On' : 'Off'} />
        <Stat label="Duplicate rules (on)" value={`${activeRules} / ${rules.length}`} />
        <Stat label="Required fields" value={`${requiredCount} / ${requiredFields.length}`} />
        <Stat label="Retention policies" value={retention.length} />
        <Stat label="AI features on" value={`${aiOn} / 7`} />
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
