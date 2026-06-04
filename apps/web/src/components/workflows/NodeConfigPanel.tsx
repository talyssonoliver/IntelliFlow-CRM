'use client';

/**
 * NodeConfigPanel — IFC-031
 *
 * Sheet-based configuration panel for workflow node properties. Owns the
 * Sheet chrome (header, footer, validation surface) and dispatches to
 * per-variant form components under `./config-forms/` via the registry.
 *
 * FU-008 (2026-04-13): split inline per-variant blocks into one file
 * each. Registry populated at module load via `./config-forms/index.ts`.
 */

import { useState, useEffect, useCallback } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, Button } from '@intelliflow/ui';
import { validateNodeConfig } from '@/lib/workflow-builder/validation';
import type { WorkflowNodeType, WorkflowNodeConfig } from '@/lib/workflow-types';
import { useIsMobile } from '@/hooks/useIsMobile';
import { getConfigForm } from './config-forms';
import { GenericNodeConfig } from './config-forms/GenericNodeConfig';
// Side-effect import: populates the config-form registry.
import './config-forms';

export interface NodeConfigPanelProps {
  nodeType: WorkflowNodeType;
  config: WorkflowNodeConfig;
  onSave: (config: WorkflowNodeConfig) => void;
  onClose: () => void;
  open?: boolean;
}

export function NodeConfigPanel({
  nodeType,
  config: initialConfig,
  onSave,
  onClose,
  open = true,
}: NodeConfigPanelProps) {
  const [config, setConfig] = useState<WorkflowNodeConfig>(initialConfig);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const isMobile = useIsMobile();

  useEffect(() => {
    setConfig(initialConfig);
    setValidationErrors([]);
  }, [initialConfig, nodeType]);

  const update = useCallback((patch: Partial<WorkflowNodeConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSave = () => {
    const result = validateNodeConfig(nodeType, config);
    if (!result.valid) {
      setValidationErrors(result.errors);
      return;
    }
    setValidationErrors([]);
    onSave(config);
  };

  const FormComponent = getConfigForm(nodeType);

  return (
    /* istanbul ignore next -- Radix Sheet's onOpenChange is triggered by Radix Portal, not directly testable */
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className={isMobile ? 'h-[85vh] w-full rounded-t-xl' : 'w-[380px] sm:w-[420px]'}
      >
        <SheetHeader>
          <SheetTitle>
            Configure {nodeType.charAt(0).toUpperCase() + nodeType.slice(1)} Node
          </SheetTitle>
        </SheetHeader>

        <div className="flex flex-col gap-4 mt-4 flex-1 overflow-y-auto">
          {FormComponent ? (
            <FormComponent config={config} update={update} />
          ) : (
            <GenericNodeConfig config={config} update={update} />
          )}

          {validationErrors.length > 0 && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
            >
              <ul className="text-sm text-destructive list-disc list-inside space-y-0.5">
                {validationErrors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

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
