'use client';

import { Card, Switch, Label, Badge } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

export interface AutomationValue {
  normalizeFilename: boolean;
  preventDeleteIfReferenced: boolean;
  notifyOnOwnerChange: boolean;
  notifyOnUpload: boolean;
  aiDocumentClassification: boolean;
  aiSensitiveDataDetection: boolean;
  aiSummarization: boolean;
}

interface AutomationSectionProps {
  value: AutomationValue;
  onChange: (next: AutomationValue) => void;
}

type CategoryRow = {
  key: keyof AutomationValue;
  label: string;
  description: string;
  pendingTask?: string;
};

const CAT1_ROWS: CategoryRow[] = [
  {
    key: 'normalizeFilename',
    label: 'Normalize filenames on upload',
    description: 'Lowercase + kebab-case. Preserves extension.',
  },
  {
    key: 'preventDeleteIfReferenced',
    label: 'Prevent delete if referenced',
    description: 'Block deletion when a case or contact references the document.',
  },
];

const CAT2_ROWS: CategoryRow[] = [
  {
    key: 'notifyOnUpload',
    label: 'Notify stakeholders on upload',
    description: 'Pending notification infrastructure.',
    pendingTask: 'IFC-310',
  },
  {
    key: 'notifyOnOwnerChange',
    label: 'Notify on owner change',
    description: 'Pending reassignment notification runtime.',
    pendingTask: 'IFC-311',
  },
];

const CAT3_ROWS: CategoryRow[] = [
  {
    key: 'aiDocumentClassification',
    label: 'AI document classification',
    description: 'Auto-classify uploaded documents (opt-in).',
  },
  {
    key: 'aiSensitiveDataDetection',
    label: 'AI sensitive data detection',
    description: 'Flag PII/PHI/financial data on upload (opt-in).',
  },
  {
    key: 'aiSummarization',
    label: 'AI summarization',
    description: 'Generate short summaries for large documents (opt-in).',
  },
];

export function AutomationSection({ value, onChange }: Readonly<AutomationSectionProps>) {
  const toggle = (field: keyof AutomationValue) => (checked: boolean) => {
    onChange({ ...value, [field]: checked });
  };

  return (
    <Card className="lg:col-span-12 p-4 sm:p-6">
      <SectionHeader
        icon="auto_awesome"
        iconBg="bg-teal-100 dark:bg-teal-900/30"
        iconFg="text-teal-600 dark:text-teal-400"
        title="Automation"
        description="Runtime behaviors, pending integrations, and AI features."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Active
          </h4>
          <div className="space-y-4">
            {CAT1_ROWS.map((row) => (
              <div key={row.key} className="flex items-start gap-3">
                <Switch
                  id={`toggle-${row.key}`}
                  checked={value[row.key]}
                  onCheckedChange={toggle(row.key)}
                />
                <div className="flex-1 min-w-0">
                  <Label htmlFor={`toggle-${row.key}`} className="font-medium">
                    {row.label}
                  </Label>
                  <p className="text-xs text-muted-foreground mt-1">{row.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            Pending infrastructure
          </h4>
          <div className="space-y-4">
            {CAT2_ROWS.map((row) => (
              <div key={row.key} className="flex items-start gap-3">
                <Switch
                  id={`toggle-${row.key}`}
                  checked={value[row.key]}
                  onCheckedChange={toggle(row.key)}
                  disabled
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor={`toggle-${row.key}`} className="font-medium">
                      {row.label}
                    </Label>
                    {row.pendingTask ? (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        data-testid={`pending-${row.key}`}
                      >
                        Pending {row.pendingTask}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3 text-muted-foreground uppercase tracking-wide">
            AI &amp; Intelligence
          </h4>
          <div className="space-y-4">
            {CAT3_ROWS.map((row) => (
              <div key={row.key} className="flex items-start gap-3">
                <Switch
                  id={`toggle-${row.key}`}
                  checked={value[row.key]}
                  onCheckedChange={toggle(row.key)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Label htmlFor={`toggle-${row.key}`} className="font-medium">
                      {row.label}
                    </Label>
                    <Badge variant="outline" className="text-xs">
                      Opt-in
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{row.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}
