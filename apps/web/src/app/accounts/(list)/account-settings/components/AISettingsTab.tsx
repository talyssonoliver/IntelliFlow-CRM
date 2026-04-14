'use client';

import { Switch } from '@intelliflow/ui';
import type { AccountAutomationSettings } from './AutomationTab';

const AI_KEYS: {
  key: keyof AccountAutomationSettings;
  title: string;
  description: string;
}[] = [
  { key: 'aiIndustryInference', title: 'AI industry inference', description: 'Infer industry from website and description when not provided.' },
  { key: 'aiEnrichment', title: 'AI company enrichment', description: 'Enrich accounts with firmographic data (employees, revenue, description).' },
  { key: 'aiTagSuggestions', title: 'AI tag suggestions', description: 'Suggest tags based on account activity and metadata.' },
  { key: 'aiInsightGeneration', title: 'AI insight generation', description: 'Generate weekly insight summaries for each account.' },
  { key: 'aiAccountScoring', title: 'AI account scoring', description: 'Produce an engagement / fit score for every account nightly.' },
];

export interface AISettingsTabProps {
  readonly settings: AccountAutomationSettings;
  readonly onSettingsChange: (next: AccountAutomationSettings) => void;
}

export function AISettingsTab({ settings, onSettingsChange }: Readonly<AISettingsTabProps>) {
  const toggle = (key: keyof AccountAutomationSettings, value: boolean) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <div className="space-y-1">
      {AI_KEYS.map(({ key, title, description }) => (
        <div
          key={key}
          className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
        >
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">{title}</div>
            <div className="text-xs text-muted-foreground">{description}</div>
          </div>
          <Switch
            checked={Boolean(settings[key])}
            onCheckedChange={(v) => toggle(key, v)}
            aria-label={title}
          />
        </div>
      ))}
    </div>
  );
}
