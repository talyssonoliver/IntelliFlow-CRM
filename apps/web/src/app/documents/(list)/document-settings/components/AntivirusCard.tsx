'use client';

import { Card, Switch } from '@intelliflow/ui';
import type { DocumentGeneralConfigLocal } from './GeneralConfigCard';

interface Props {
  config: DocumentGeneralConfigLocal;
  onConfigChange: (c: DocumentGeneralConfigLocal) => void;
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

export function AntivirusCard({ config, onConfigChange }: Readonly<Props>) {
  const toggle = (
    field: keyof Pick<
      DocumentGeneralConfigLocal,
      'enableAntivirusScan' | 'quarantineOnDetect' | 'blockOnScanFailure'
    >
  ) => onConfigChange({ ...config, [field]: !config[field] });

  return (
    <Card className="lg:col-span-7 p-4 sm:p-6">
      <SectionHeader
        icon="security"
        iconBg="bg-red-500/10"
        iconFg="text-red-500"
        title="Antivirus & Security"
        description="Scan uploads for malware and configure response policies."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Enable Antivirus Scan</p>
            <p className="text-xs text-muted-foreground">Scan all uploaded files before storing.</p>
          </div>
          <Switch
            checked={config.enableAntivirusScan}
            onCheckedChange={() => toggle('enableAntivirusScan')}
            aria-label="Enable antivirus scan"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Quarantine on Detection</p>
            <p className="text-xs text-muted-foreground">
              Move infected files to quarantine instead of deleting.
            </p>
          </div>
          <Switch
            checked={config.quarantineOnDetect}
            onCheckedChange={() => toggle('quarantineOnDetect')}
            aria-label="Quarantine on detection"
          />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Block on Scan Failure</p>
            <p className="text-xs text-muted-foreground">
              Reject the upload if the antivirus scan cannot complete.
            </p>
          </div>
          <Switch
            checked={config.blockOnScanFailure}
            onCheckedChange={() => toggle('blockOnScanFailure')}
            aria-label="Block on scan failure"
          />
        </div>
      </div>
    </Card>
  );
}
