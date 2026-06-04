'use client';

/**
 * GenericNodeConfig — IFC-031
 *
 * Fallback configuration form for custom / unregistered node types. Renders
 * every key in `config.actionParams` as a plain text input so the node is
 * still configurable even when no dedicated form has been registered.
 *
 * If `actionParams` is empty or absent, it renders a single informational row
 * so the panel is never completely blank.
 */

import { Input, Label } from '@intelliflow/ui';
import type { NodeConfigFormProps } from './types';

export function GenericNodeConfig({ config, update }: NodeConfigFormProps) {
  const params = config.actionParams ?? {};
  const entries = Object.entries(params);

  const handleChange = (key: string, value: string) => {
    update({ actionParams: { ...params, [key]: value } });
  };

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">This node has no configurable parameters.</p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.map(([key, value]) => (
        <div key={key} className="flex flex-col gap-2">
          <Label htmlFor={`param-${key}`}>{key}</Label>
          <Input
            id={`param-${key}`}
            value={typeof value === 'string' ? value : String(value ?? '')}
            onChange={(e) => handleChange(key, e.target.value)}
            placeholder={key}
          />
        </div>
      ))}
    </div>
  );
}
