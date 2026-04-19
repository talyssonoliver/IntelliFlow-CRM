'use client';

import { Input, Switch } from '@intelliflow/ui';
import type { DealAutomationSettingsInput } from '@intelliflow/validators';

export type DealAutomationSettings = DealAutomationSettingsInput;

export interface DealAutomationCardProps {
  readonly settings: DealAutomationSettings;
  readonly onSettingsChange: (next: DealAutomationSettings) => void;
}

type BooleanKey = Exclude<keyof DealAutomationSettings, 'highValueThreshold'>;

interface Section {
  title: string;
  description?: string;
  toggles: { key: BooleanKey; title: string; description: string }[];
}

const NON_AI_SECTIONS: Section[] = [
  {
    title: 'Duplicate Detection',
    toggles: [
      {
        key: 'autoMergeOnExactNameAccount',
        title: 'Auto-merge on exact name + account',
        description: 'Merge new deals with existing deals that share name and account.',
      },
      {
        key: 'notifyOnDuplicate',
        title: 'Notify on duplicate',
        description: 'Notify the owner when a likely duplicate is detected.',
      },
    ],
  },
  {
    title: 'Role-Based Access',
    toggles: [
      {
        key: 'restrictTagCreationToAdmins',
        title: 'Restrict tag creation to admins',
        description: 'Only admins can create new tags from the deals module.',
      },
    ],
  },
  {
    title: 'Data Hygiene',
    toggles: [
      {
        key: 'normalizeCurrency',
        title: 'Normalize currency',
        description: 'Round deal value to 2 decimals on save.',
      },
      {
        key: 'autoCapitalizeDealNames',
        title: 'Auto-capitalize deal names',
        description: 'Title-case deal names on create and edit.',
      },
      {
        key: 'preventDeleteWithOpenTasks',
        title: 'Prevent delete with open tasks',
        description: 'Block deal deletion while any open task is linked.',
      },
    ],
  },
  {
    title: 'Notifications',
    toggles: [
      {
        key: 'notifyOnOwnerChange',
        title: 'Notify on owner change',
        description: 'Send a notification when the deal owner changes.',
      },
      {
        key: 'notifyOnStageChange',
        title: 'Notify on stage change',
        description: 'Send a notification when the deal stage changes.',
      },
      {
        key: 'notifyOnHighValueStageMove',
        title: 'Notify on high-value stage move',
        description: 'Notify when a high-value deal moves stage.',
      },
    ],
  },
];

const AI_TOGGLES: { key: BooleanKey; title: string; description: string }[] = [
  {
    key: 'aiDuplicateDetection',
    title: 'AI duplicate detection',
    description: 'Use AI to surface likely duplicate deals.',
  },
  {
    key: 'aiDealScoring',
    title: 'AI deal scoring',
    description: 'Combine scoring rules with predictive modelling.',
  },
  {
    key: 'aiNextStepRecommendation',
    title: 'AI next-step recommendation',
    description: 'Suggest the most useful next action on a deal.',
  },
  {
    key: 'aiTagSuggestions',
    title: 'AI tag suggestions',
    description: 'Suggest tags based on deal content.',
  },
  {
    key: 'aiInsightGeneration',
    title: 'AI insight generation',
    description: 'Auto-generate deal insights from activity.',
  },
  {
    key: 'aiWinLossPrediction',
    title: 'AI win/loss prediction',
    description: 'Predict win/loss likelihood using deal history.',
  },
];

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: Readonly<{
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}>) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border">
      <div className="min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={title} />
    </div>
  );
}

export function DealAutomationCard({
  settings,
  onSettingsChange,
}: Readonly<DealAutomationCardProps>) {
  const toggle = (key: BooleanKey, value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  const setThreshold = (value: number) => {
    onSettingsChange({ ...settings, highValueThreshold: value });
  };

  return (
    <div className="space-y-5">
      {NON_AI_SECTIONS.map((section) => (
        <div key={section.title} className="space-y-1">
          <h4 className="text-sm font-semibold text-foreground">{section.title}</h4>
          {section.toggles.map((t) => (
            <ToggleRow
              key={t.key}
              title={t.title}
              description={t.description}
              checked={Boolean(settings[t.key])}
              onCheckedChange={(v) => toggle(t.key, v)}
            />
          ))}
          {section.title === 'Notifications' && (
            <div className="flex items-center gap-3 py-2">
              <label htmlFor="high-value-threshold" className="text-sm font-medium">
                High-value threshold
              </label>
              <Input
                id="high-value-threshold"
                type="number"
                min={0}
                value={settings.highValueThreshold}
                onChange={(e) => setThreshold(Number.parseFloat(e.target.value || '0'))}
                className="max-w-[160px]"
              />
            </div>
          )}
        </div>
      ))}

      <div className="space-y-1">
        <h4 className="text-sm font-semibold text-foreground">AI &amp; Intelligence</h4>
        <p className="text-xs text-muted-foreground">Runtime delivered by IFC-312.</p>
        {AI_TOGGLES.map((t) => (
          <ToggleRow
            key={t.key}
            title={t.title}
            description={t.description}
            checked={Boolean(settings[t.key])}
            onCheckedChange={(v) => toggle(t.key, v)}
          />
        ))}
      </div>
    </div>
  );
}
