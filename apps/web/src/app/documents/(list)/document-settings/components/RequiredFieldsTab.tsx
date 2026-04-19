'use client';

import { Card, EmptyState, Switch } from '@intelliflow/ui';

export interface LocalRequiredField {
  fieldKey: 'title' | 'description' | 'category' | 'tags' | 'expiresAt';
  isRequired: boolean;
}

interface Props {
  fields: LocalRequiredField[];
  onFieldsChange: (f: LocalRequiredField[]) => void;
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

const FIELD_LABELS: Record<LocalRequiredField['fieldKey'], { label: string; description: string }> =
  {
    title: { label: 'Title', description: 'Document display name (locked — always required).' },
    description: { label: 'Description', description: 'A summary of the document contents.' },
    category: { label: 'Category', description: 'Document category for classification.' },
    tags: { label: 'Tags', description: 'One or more tags applied to the document.' },
    expiresAt: {
      label: 'Expiry Date',
      description: 'When the document becomes invalid or should be reviewed.',
    },
  };

export function RequiredFieldsTab({ fields, onFieldsChange }: Readonly<Props>) {
  const toggle = (key: LocalRequiredField['fieldKey'], value: boolean) => {
    if (key === 'title') return;
    onFieldsChange(fields.map((f) => (f.fieldKey === key ? { ...f, isRequired: value } : f)));
  };

  if (fields.length === 0) {
    return (
      <Card className="lg:col-span-5 p-4 sm:p-6">
        <SectionHeader
          icon="checklist"
          iconBg="bg-emerald-500/10"
          iconFg="text-emerald-500"
          title="Required Fields"
          description="Fields that must be filled in before a document can be saved."
        />
        <EmptyState entity="files" phase="passive" size="sm" className="py-4 px-3 gap-2" />
      </Card>
    );
  }

  return (
    <Card className="lg:col-span-5 p-4 sm:p-6">
      <SectionHeader
        icon="checklist"
        iconBg="bg-emerald-500/10"
        iconFg="text-emerald-500"
        title="Required Fields"
        description="Fields that must be filled in before a document can be saved."
      />
      <div className="space-y-1">
        {fields.map((f) => {
          const meta = FIELD_LABELS[f.fieldKey];
          const locked = f.fieldKey === 'title';
          return (
            <div
              key={f.fieldKey}
              className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0 border-border"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-foreground">{meta.label}</div>
                <div className="text-xs text-muted-foreground">{meta.description}</div>
              </div>
              <Switch
                checked={f.isRequired}
                onCheckedChange={(v) => toggle(f.fieldKey, v)}
                disabled={locked}
                aria-label={`Toggle ${meta.label} required`}
              />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
