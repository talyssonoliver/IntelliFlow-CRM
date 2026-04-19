'use client';

import { useState } from 'react';
import { Button, Card, Input } from '@intelliflow/ui';

export interface DocumentGeneralConfigLocal {
  allowedMimeTypes: string[];
  maxUploadSizeMb: number;
  defaultRetentionDays: number;
  enableAntivirusScan: boolean;
  quarantineOnDetect: boolean;
  blockOnScanFailure: boolean;
}

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

export function GeneralConfigCard({ config, onConfigChange }: Readonly<Props>) {
  const [mimeInput, setMimeInput] = useState('');

  const addMime = () => {
    const val = mimeInput.trim();
    if (!val || config.allowedMimeTypes.includes(val)) return;
    onConfigChange({ ...config, allowedMimeTypes: [...config.allowedMimeTypes, val] });
    setMimeInput('');
  };

  const removeMime = (mime: string) => {
    onConfigChange({
      ...config,
      allowedMimeTypes: config.allowedMimeTypes.filter((m) => m !== mime),
    });
  };

  return (
    <Card className="lg:col-span-5 p-4 sm:p-6">
      <SectionHeader
        icon="upload_file"
        iconBg="bg-blue-500/10"
        iconFg="text-blue-500"
        title="General Config"
        description="File types, upload limits, and default retention."
      />

      <div className="space-y-4">
        {/* MIME types */}
        <div>
          <label htmlFor="mime-input" className="text-sm font-medium text-foreground mb-1.5 block">
            Allowed MIME Types
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {config.allowedMimeTypes.map((mime) => (
              <span
                key={mime}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-xs font-medium"
              >
                {mime}
                <button
                  type="button"
                  onClick={() => removeMime(mime)}
                  aria-label={`Remove ${mime}`}
                  className="ml-0.5 text-muted-foreground hover:text-foreground"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              id="mime-input"
              value={mimeInput}
              onChange={(e) => setMimeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addMime()}
              placeholder="application/pdf"
              className="flex-1"
            />
            <Button type="button" variant="outline" size="sm" onClick={addMime}>
              Add
            </Button>
          </div>
        </div>

        {/* Max upload size */}
        <div>
          <label
            htmlFor="max-upload-size"
            className="text-sm font-medium text-foreground mb-1.5 block"
          >
            Max Upload Size (MB)
          </label>
          <Input
            id="max-upload-size"
            type="number"
            min={1}
            max={500}
            value={config.maxUploadSizeMb}
            onChange={(e) =>
              onConfigChange({
                ...config,
                maxUploadSizeMb: Math.max(1, Math.min(500, Number(e.target.value))),
              })
            }
          />
        </div>

        {/* Default retention */}
        <div>
          <label
            htmlFor="default-retention"
            className="text-sm font-medium text-foreground mb-1.5 block"
          >
            Default Retention (Days, 0 = forever)
          </label>
          <Input
            id="default-retention"
            type="number"
            min={0}
            value={config.defaultRetentionDays}
            onChange={(e) =>
              onConfigChange({
                ...config,
                defaultRetentionDays: Math.max(0, Number(e.target.value)),
              })
            }
          />
        </div>
      </div>
    </Card>
  );
}
