'use client';

import { Input, Label } from '@intelliflow/ui';
import type { NodeConfigFormProps } from './types';

export function TriggerWorkflowConfig({ config, update }: NodeConfigFormProps) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="trigger-workflow-id">Workflow to trigger</Label>
      <Input
        id="trigger-workflow-id"
        value={config.workflowId ?? ''}
        onChange={(e) => update({ workflowId: e.target.value })}
        placeholder="workflow ID"
      />
      <p className="text-xs text-muted-foreground">
        The downstream workflow fires with the current run's entity context attached.
      </p>
    </div>
  );
}
