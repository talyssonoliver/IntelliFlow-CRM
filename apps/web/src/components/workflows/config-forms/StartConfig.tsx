'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type { WorkflowNodeConfig } from '@/lib/workflow-types';
import type { NodeConfigFormProps } from './types';

const TRIGGER_TYPES = [
  { value: 'event', label: 'Event' },
  { value: 'schedule', label: 'Schedule (CRON)' },
  { value: 'manual', label: 'Manual' },
  { value: 'webhook', label: 'Webhook' },
];

export function StartConfig({ config, update }: NodeConfigFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="triggerType">Trigger Type</Label>
      <Select
        value={config.triggerType ?? ''}
        onValueChange={(v) => update({ triggerType: v as WorkflowNodeConfig['triggerType'] })}
      >
        <SelectTrigger id="triggerType">
          <SelectValue placeholder="Select trigger…" />
        </SelectTrigger>
        <SelectContent>
          {TRIGGER_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
