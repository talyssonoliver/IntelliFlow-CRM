'use client';

import { Card, Switch } from '@intelliflow/ui';

export interface LocalAutomationSettings {
  normalizeFilename: boolean;
  preventDeleteIfReferenced: boolean;
  notifyOnOwnerChange: boolean;
  restrictTagCreationToAdmins: boolean;
  notifyOnDuplicate: boolean;
  autoVersionOnCollision: boolean;
  autoDetectDuplicates: boolean;
  autoExtractText: boolean;
  autoClassifyCategory: boolean;
  autoDetectPii: boolean;
  aiTagSuggestions: boolean;
  aiInsightGeneration: boolean;
}

interface Props {
  settings: LocalAutomationSettings;
  onSettingsChange: (s: LocalAutomationSettings) => void;
}

interface SectionHeaderProps {
  icon: string;
  iconBg: string;
  iconFg: string;
  title: string;
  description: string;
}

function SectionHeader({ icon, iconBg, iconFg, title, description }: Readonly<SectionHeaderProps>) {
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
    </div>
  );
}

type Cat1Key = 'normalizeFilename' | 'preventDeleteIfReferenced' | 'restrictTagCreationToAdmins';
type Cat2Key = 'notifyOnDuplicate' | 'notifyOnOwnerChange';
type ToggleKey = Cat1Key | Cat2Key;

const CAT1_TOGGLES: { key: Cat1Key; title: string; description: string }[] = [
  {
    key: 'normalizeFilename',
    title: 'Normalize filename',
    description: 'Lowercase and strip special characters from filenames on upload.',
  },
  {
    key: 'preventDeleteIfReferenced',
    title: 'Prevent delete if referenced',
    description: 'Block deletion of documents linked to cases or contacts.',
  },
  {
    key: 'restrictTagCreationToAdmins',
    title: 'Restrict tag creation to admins',
    description: 'Only admins and owners can create new document tags.',
  },
];

const CAT2_TOGGLES: { key: Cat2Key; title: string; description: string; pendingTask: string }[] = [
  {
    key: 'notifyOnDuplicate',
    title: 'Notify on duplicate',
    description: 'Notify the uploader when a likely duplicate document is detected.',
    pendingTask: 'IFC-310',
  },
  {
    key: 'notifyOnOwnerChange',
    title: 'Notify on owner change',
    description: "Send a notification when a document's owner is reassigned.",
    pendingTask: 'IFC-311',
  },
];

export function AutomationCard({ settings, onSettingsChange }: Readonly<Props>) {
  const toggle = (key: ToggleKey, value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Card className="lg:col-span-7 p-4 sm:p-6">
      <SectionHeader
        icon="automation"
        iconBg="bg-violet-500/10"
        iconFg="text-violet-500"
        title="Automation"
        description="Automated behaviours for document management and data hygiene."
      />
      <div className="space-y-1">
        {CAT1_TOGGLES.map(({ key, title, description }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{title}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <Switch
              checked={settings[key]}
              onCheckedChange={(v) => toggle(key, v)}
              aria-label={title}
            />
          </div>
        ))}
        {CAT2_TOGGLES.map(({ key, title, description, pendingTask }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border opacity-60"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <span>{title}</span>
                <span
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                  title={`Runtime consumer ships in ${pendingTask}`}
                >
                  Pending {pendingTask}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <Switch
              checked={settings[key]}
              onCheckedChange={(v) => toggle(key, v)}
              aria-label={`${title} (pending ${pendingTask})`}
              aria-disabled
              disabled
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
