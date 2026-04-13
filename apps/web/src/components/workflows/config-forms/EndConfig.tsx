'use client';

import { Input, Label } from '@intelliflow/ui';
import type { NodeConfigFormProps } from './types';

export function EndConfig({ config, update }: NodeConfigFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="completionStatus">Completion Status (optional)</Label>
      <Input
        id="completionStatus"
        value={config.completionStatus ?? ''}
        onChange={(e) => update({ completionStatus: e.target.value })}
        placeholder="e.g. resolved, escalated…"
      />
    </div>
  );
}
