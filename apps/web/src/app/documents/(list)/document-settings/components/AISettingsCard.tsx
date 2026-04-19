'use client';

import { Card } from '@intelliflow/ui';
import type { LocalAutomationSettings } from './AutomationCard';

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

type Cat2Key =
  | 'autoVersionOnCollision'
  | 'autoDetectDuplicates'
  | 'autoExtractText'
  | 'autoClassifyCategory'
  | 'autoDetectPii'
  | 'aiTagSuggestions'
  | 'aiInsightGeneration';

const CAT2_TOGGLES: { key: Cat2Key; title: string; description: string }[] = [
  {
    key: 'autoVersionOnCollision',
    title: 'Auto-version on collision',
    description: 'Create a new version when a duplicate file is uploaded.',
  },
  {
    key: 'autoDetectDuplicates',
    title: 'Auto-detect duplicates',
    description: 'Run duplicate-detection rules on every upload automatically.',
  },
  {
    key: 'autoExtractText',
    title: 'Auto-extract text (OCR)',
    description: 'Extract text from images and scanned PDFs using OCR.',
  },
  {
    key: 'autoClassifyCategory',
    title: 'Auto-classify category',
    description: 'Infer document category from content using the AI classifier.',
  },
  {
    key: 'autoDetectPii',
    title: 'Auto-detect PII',
    description: 'Flag documents containing personally identifiable information.',
  },
  {
    key: 'aiTagSuggestions',
    title: 'AI tag suggestions',
    description: 'Suggest tags based on document content and metadata.',
  },
  {
    key: 'aiInsightGeneration',
    title: 'AI insight generation',
    description: 'Generate summaries and insights for uploaded documents.',
  },
];

export function AISettingsCard({ settings, onSettingsChange }: Readonly<Props>) {
  // Category-2 toggles are rendered aria-disabled with a pending badge.
  // They will be wired in IFC-310 / IFC-312.
  void onSettingsChange; // referenced to satisfy ESLint prop usage; actual writes are disabled

  return (
    <Card className="lg:col-span-5 p-4 sm:p-6">
      <SectionHeader
        icon="smart_toy"
        iconBg="bg-fuchsia-500/10"
        iconFg="text-fuchsia-500"
        title="AI & Intelligence"
        description="Control how IntelliFlow's AI augments document records."
      />
      <div className="space-y-1">
        {CAT2_TOGGLES.map(({ key, title, description }) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium text-foreground">{title}</div>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted text-muted-foreground border border-border">
                  pending
                </span>
              </div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings[key]}
              aria-disabled="true"
              aria-label={title}
              className="relative inline-flex h-5 w-9 shrink-0 cursor-not-allowed items-center rounded-full border-2 border-transparent bg-muted transition-colors opacity-50"
            >
              <span
                className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
                  settings[key] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
