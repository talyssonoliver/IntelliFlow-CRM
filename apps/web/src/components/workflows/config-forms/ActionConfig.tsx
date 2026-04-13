'use client';

import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type { ActionType } from '@/lib/workflow-types';
import type { NodeConfigFormProps } from './types';
import { NotifyConfig } from './NotifyConfig';
import { CreateTaskConfig } from './CreateTaskConfig';
import { UpdateFieldConfig } from './UpdateFieldConfig';
import { CallWebhookConfig } from './CallWebhookConfig';
import { TriggerWorkflowConfig } from './TriggerWorkflowConfig';
import { LogConfig } from './LogConfig';

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'trigger_workflow', label: 'Trigger Workflow' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'update_field', label: 'Update Field' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'log_event', label: 'Log Event' },
  { value: 'call_webhook', label: 'Call Webhook' },
];

/**
 * Action node dispatcher — renders the shared action-type picker plus
 * the specific sub-form for the chosen action variant. Each sub-form
 * lives in its own file for test isolation and lower cognitive load.
 */
export function ActionConfig(props: NodeConfigFormProps) {
  const { config, update } = props;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="actionType">Action type</Label>
        <Select
          value={config.actionType ?? ''}
          onValueChange={(v) => update({ actionType: v as ActionType })}
        >
          <SelectTrigger id="actionType">
            <SelectValue placeholder="Select action…" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {config.actionType === 'send_notification' && <NotifyConfig {...props} />}
      {config.actionType === 'create_task' && <CreateTaskConfig {...props} />}
      {config.actionType === 'update_field' && <UpdateFieldConfig {...props} />}
      {config.actionType === 'call_webhook' && <CallWebhookConfig {...props} />}
      {config.actionType === 'trigger_workflow' && <TriggerWorkflowConfig {...props} />}
      {config.actionType === 'log_event' && <LogConfig {...props} />}
    </>
  );
}
