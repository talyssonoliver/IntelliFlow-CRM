'use client';

import { useCallback } from 'react';
import { Card, Input, Label, Switch } from '@intelliflow/ui';
import { SectionHeader } from './SectionHeader';

export interface RetentionPolicyValue {
  retentionDays: number;
  archiveInsteadOfDelete: boolean;
  preserveVersions: number;
  isActive: boolean;
}

interface RetentionPolicySectionProps {
  value: RetentionPolicyValue;
  onChange: (next: RetentionPolicyValue) => void;
}

export function RetentionPolicySection({ value, onChange }: Readonly<RetentionPolicySectionProps>) {
  const updateNumber = useCallback(
    (field: 'retentionDays' | 'preserveVersions') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const num = Number(e.target.value);
      if (Number.isNaN(num)) return;
      onChange({ ...value, [field]: Math.floor(num) });
    },
    [value, onChange]
  );

  const toggle = (field: 'archiveInsteadOfDelete' | 'isActive') => (checked: boolean) => {
    onChange({ ...value, [field]: checked });
  };

  return (
    <Card className="lg:col-span-7 p-4 sm:p-6">
      <SectionHeader
        icon="schedule"
        iconBg="bg-purple-100 dark:bg-purple-900/30"
        iconFg="text-purple-600 dark:text-purple-400"
        title="Retention Policy"
        description="Automated document lifecycle — retention, archival, and version preservation."
      />

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="retention-active" className="flex-1">
            Enable retention policy
          </Label>
          <Switch
            id="retention-active"
            checked={value.isActive}
            onCheckedChange={toggle('isActive')}
          />
        </div>

        <div>
          <Label htmlFor="retentionDays">Retention period (days)</Label>
          <Input
            id="retentionDays"
            type="number"
            min={1}
            max={3650}
            value={value.retentionDays}
            onChange={updateNumber('retentionDays')}
            disabled={!value.isActive}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label htmlFor="archiveInsteadOfDelete" className="flex-1">
            Archive instead of delete
          </Label>
          <Switch
            id="archiveInsteadOfDelete"
            checked={value.archiveInsteadOfDelete}
            onCheckedChange={toggle('archiveInsteadOfDelete')}
            disabled={!value.isActive}
          />
        </div>

        <div>
          <Label htmlFor="preserveVersions">Versions to preserve (0–100)</Label>
          <Input
            id="preserveVersions"
            type="number"
            min={0}
            max={100}
            value={value.preserveVersions}
            onChange={updateNumber('preserveVersions')}
            disabled={!value.isActive}
          />
        </div>
      </div>
    </Card>
  );
}
