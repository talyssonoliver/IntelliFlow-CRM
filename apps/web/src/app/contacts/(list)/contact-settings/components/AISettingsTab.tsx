'use client';

import { useCallback } from 'react';
import { Switch } from '@intelliflow/ui';
import type { ContactAutomationSettingsInput } from '@intelliflow/validators';

type AIKey =
  | 'aiDuplicateDetection'
  | 'aiEnrichment'
  | 'aiTagSuggestions'
  | 'aiInsightGeneration'
  | 'aiAutoReplyDrafting';

interface AISettingsTabProps {
  settings: ContactAutomationSettingsInput;
  onSettingsChange: (settings: ContactAutomationSettingsInput) => void;
}

const AI_ITEMS: Array<{ key: AIKey; title: string; description: string; icon: string }> = [
  {
    key: 'aiDuplicateDetection',
    title: 'AI duplicate detection',
    description:
      'Use embeddings to find semantic duplicates (same person with different email providers, misspellings).',
    icon: 'auto_awesome',
  },
  {
    key: 'aiEnrichment',
    title: 'AI data enrichment',
    description:
      'Auto-fill empty contact fields (company, job title, location) from public sources when a contact is created.',
    icon: 'auto_fix_high',
  },
  {
    key: 'aiTagSuggestions',
    title: 'AI tag suggestions',
    description:
      'Suggest relevant tags on the contact detail page based on profile and recent activity.',
    icon: 'sell',
  },
  {
    key: 'aiInsightGeneration',
    title: 'AI insights',
    description:
      'Generate summary cards with recent activity, sentiment, and next-best-action on each contact page.',
    icon: 'psychology',
  },
  {
    key: 'aiAutoReplyDrafting',
    title: 'AI reply drafting',
    description:
      'Draft email replies in the contact inbox that you review and send — never auto-sent.',
    icon: 'forum',
  },
];

export function AISettingsTab({ settings, onSettingsChange }: Readonly<AISettingsTabProps>) {
  const handleToggle = useCallback(
    (key: AIKey, value: boolean) => {
      onSettingsChange({ ...settings, [key]: value });
    },
    [settings, onSettingsChange]
  );

  return (
    <div className="space-y-5">
      {AI_ITEMS.map((item) => (
        <div key={item.key} className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <span
              className="material-symbols-outlined text-[20px] text-muted-foreground mt-0.5"
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <label
                htmlFor={`contact-ai-${item.key}`}
                className="text-sm font-medium cursor-pointer"
              >
                {item.title}
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
            </div>
          </div>
          <Switch
            id={`contact-ai-${item.key}`}
            checked={settings[item.key]}
            onCheckedChange={(checked) => handleToggle(item.key, checked)}
          />
        </div>
      ))}
    </div>
  );
}
