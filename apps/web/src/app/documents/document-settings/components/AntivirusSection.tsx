'use client';

import { Card, Switch, Label } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

export interface AntivirusValue {
  enableAntivirusScan: boolean;
  quarantineInfected: boolean;
  notifyAdminOnThreat: boolean;
}

interface AntivirusSectionProps {
  value: AntivirusValue;
  onChange: (next: AntivirusValue) => void;
}

export function AntivirusSection({ value, onChange }: Readonly<AntivirusSectionProps>) {
  const toggle = (field: keyof AntivirusValue) => (checked: boolean) => {
    onChange({ ...value, [field]: checked });
  };

  return (
    <Card className="lg:col-span-4 p-4 sm:p-6">
      <SectionHeader
        icon="shield"
        iconBg="bg-emerald-100 dark:bg-emerald-900/30"
        iconFg="text-emerald-600 dark:text-emerald-400"
        title="Antivirus"
        description="Malware scanning and quarantine behavior."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="enableAntivirusScan" className="flex-1">
            Scan uploads for malware
          </Label>
          <Switch
            id="enableAntivirusScan"
            checked={value.enableAntivirusScan}
            onCheckedChange={toggle('enableAntivirusScan')}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="quarantineInfected" className="flex-1">
            Quarantine infected files
          </Label>
          <Switch
            id="quarantineInfected"
            checked={value.quarantineInfected}
            onCheckedChange={toggle('quarantineInfected')}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="notifyAdminOnThreat" className="flex-1">
            Notify admin on threat detection
          </Label>
          <Switch
            id="notifyAdminOnThreat"
            checked={value.notifyAdminOnThreat}
            onCheckedChange={toggle('notifyAdminOnThreat')}
          />
        </div>
      </div>
    </Card>
  );
}
