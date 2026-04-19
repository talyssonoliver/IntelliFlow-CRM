'use client';

import { useCallback } from 'react';
import { Card, Input, Label } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

export interface SizeLimitsValue {
  maxFileSizeMB: number;
  maxTotalStorageMB: number;
  maxFilesPerUpload: number;
}

interface SizeLimitsSectionProps {
  value: SizeLimitsValue;
  onChange: (next: SizeLimitsValue) => void;
}

export function SizeLimitsSection({ value, onChange }: Readonly<SizeLimitsSectionProps>) {
  const update = useCallback(
    (field: keyof SizeLimitsValue) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = Number(e.target.value);
      if (Number.isNaN(num)) return;
      onChange({ ...value, [field]: Math.floor(num) });
    },
    [value, onChange]
  );

  return (
    <Card className="lg:col-span-5 p-4 sm:p-6">
      <SectionHeader
        icon="straighten"
        iconBg="bg-amber-100 dark:bg-amber-900/30"
        iconFg="text-amber-600 dark:text-amber-400"
        title="Size Limits"
        description="Configure maximum file and storage limits."
      />

      <div className="space-y-4">
        <div>
          <Label htmlFor="maxFileSizeMB">Max file size (MB)</Label>
          <Input
            id="maxFileSizeMB"
            type="number"
            min={1}
            max={10000}
            value={value.maxFileSizeMB}
            onChange={update('maxFileSizeMB')}
          />
        </div>

        <div>
          <Label htmlFor="maxTotalStorageMB">Max total storage (MB)</Label>
          <Input
            id="maxTotalStorageMB"
            type="number"
            min={1}
            max={1_000_000}
            value={value.maxTotalStorageMB}
            onChange={update('maxTotalStorageMB')}
          />
        </div>

        <div>
          <Label htmlFor="maxFilesPerUpload">Max files per upload batch</Label>
          <Input
            id="maxFilesPerUpload"
            type="number"
            min={1}
            max={1000}
            value={value.maxFilesPerUpload}
            onChange={update('maxFilesPerUpload')}
          />
        </div>
      </div>
    </Card>
  );
}
