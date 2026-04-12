'use client';

/**
 * NodeConfigPanel — IFC-031
 *
 * Sheet-based configuration panel for workflow node properties.
 * Renders different form fields depending on the node type.
 */

import { useState, useEffect } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { validateNodeConfig } from '@/lib/workflow-builder/validation';
import type { WorkflowNodeType, WorkflowNodeConfig, ActionType } from '@/lib/workflow-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_TYPES: { value: ActionType; label: string }[] = [
  { value: 'trigger_workflow', label: 'Trigger Workflow' },
  { value: 'send_notification', label: 'Send Notification' },
  { value: 'update_field', label: 'Update Field' },
  { value: 'create_task', label: 'Create Task' },
  { value: 'log_event', label: 'Log Event' },
  { value: 'call_webhook', label: 'Call Webhook' },
];

const TRIGGER_TYPES = [
  { value: 'event', label: 'Event' },
  { value: 'schedule', label: 'Schedule (CRON)' },
  { value: 'manual', label: 'Manual' },
  { value: 'webhook', label: 'Webhook' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface NodeConfigPanelProps {
  nodeType: WorkflowNodeType;
  config: WorkflowNodeConfig;
  onSave: (config: WorkflowNodeConfig) => void;
  onClose: () => void;
  open?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NodeConfigPanel({
  nodeType,
  config: initialConfig,
  onSave,
  onClose,
  open = true,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState<WorkflowNodeConfig>(initialConfig);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Sync config when the selected node changes
  useEffect(() => {
    setConfig(initialConfig);
    setValidationErrors([]);
  }, [initialConfig, nodeType]);

  const handleSave = () => {
    const result = validateNodeConfig(nodeType, config);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    onSave(config);
  };

  const update = (patch: Partial<WorkflowNodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  return (
    /* istanbul ignore next -- Radix Sheet's onOpenChange is triggered by Radix Portal, not directly testable */
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <SheetContent side="right" className="w-[380px] sm:w-[420px]">
        <SheetHeader>
          <SheetTitle>
            Configure{' '}
            {nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Node
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 flex-1 overflow-y-auto">
          {/* ── Action ───────────────────────────────────────────────── */}
          {nodeType === 'action' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="actionType">Action Type</Label>
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
          )}

          {/* ── Decision ─────────────────────────────────────────────── */}
          {nodeType === 'decision' && (
            <div className="flex flex-col gap-2">
              <Label>Conditions</Label>
              <p className="text-sm text-muted-foreground">
                Define the branch conditions for this decision node.
              </p>
              {(config.conditions ?? []).map((cond, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    value={cond}
                    onChange={(e) => {
                      const updated = [...(config.conditions ?? [])];
                      updated[idx] = e.target.value;
                      update({ conditions: updated });
                    }}
                    aria-label={`Condition ${idx + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      update({
                        conditions: (config.conditions ?? []).filter((_, i) => i !== idx),
                      });
                    }}
                  >
                    ×
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => update({ conditions: [...(config.conditions ?? []), ''] })}
              >
                + Add Condition
              </Button>
            </div>
          )}

          {/* ── Human ────────────────────────────────────────────────── */}
          {nodeType === 'human' && (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="timeout">Timeout (seconds)</Label>
                <Input
                  id="timeout"
                  type="number"
                  min={1}
                  value={config.timeout ?? ''}
                  onChange={(e) => update({ timeout: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="instructions">Instructions</Label>
                <textarea
                  id="instructions"
                  className="w-full rounded-md border border-input px-3 py-2 text-sm min-h-[80px] resize-y"
                  aria-label="Instructions"
                  value={config.instructions ?? ''}
                  onChange={(e) => update({ instructions: e.target.value })}
                />
              </div>
            </>
          )}

          {/* ── Start ────────────────────────────────────────────────── */}
          {nodeType === 'start' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="triggerType">Trigger Type</Label>
              <Select
                value={config.triggerType ?? ''}
                onValueChange={(v) =>
                  update({ triggerType: v as WorkflowNodeConfig['triggerType'] })
                }
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
          )}

          {/* ── End ──────────────────────────────────────────────────── */}
          {nodeType === 'end' && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="completionStatus">Completion Status (optional)</Label>
              <Input
                id="completionStatus"
                value={config.completionStatus ?? ''}
                onChange={(e) => update({ completionStatus: e.target.value })}
                placeholder="e.g. resolved, escalated…"
              />
            </div>
          )}

          {/* ── Validation errors ─────────────────────────────────────── */}
          {validationErrors.length > 0 && (
            <div role="alert" className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
              <ul className="text-sm text-destructive list-disc list-inside space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t mt-4">
          <Button type="button" onClick={handleSave} className="flex-1">
            Save
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
