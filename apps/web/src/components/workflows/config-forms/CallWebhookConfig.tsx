'use client';

import {
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import type { WorkflowNodeConfig } from '@/lib/workflow-types';
import type { NodeConfigFormProps } from './types';

const METHODS: WorkflowNodeConfig['method'][] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

export function CallWebhookConfig({ config, update }: NodeConfigFormProps) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          value={config.url ?? ''}
          onChange={(e) => update({ url: e.target.value })}
          placeholder="https://example.com/hook"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-method">HTTP method</Label>
        <Select
          value={config.method ?? 'POST'}
          onValueChange={(v) => update({ method: v as WorkflowNodeConfig['method'] })}
        >
          <SelectTrigger id="webhook-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {METHODS.map((m) => (
              <SelectItem key={m} value={m as string}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="webhook-body">Body (optional)</Label>
        <textarea
          id="webhook-body"
          className="w-full rounded-md border border-input px-3 py-2 text-sm min-h-[60px] resize-y font-mono"
          aria-label="Webhook body"
          value={config.body ?? ''}
          onChange={(e) => update({ body: e.target.value })}
          placeholder='{"event": "workflow.fired"}'
        />
      </div>
    </>
  );
}
