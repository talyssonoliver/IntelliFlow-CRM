'use client';

// Task Automation settings card — PG-208 (AC-TA-014). Its own Save, inside its
// own fieldset, so saving never locks the rules list. The draft is seeded from
// `settings` and re-seeded only while it has no unsaved edits (M13: a rule
// toggle that refetches the list must not wipe them). The hourly cap stays a
// string while typed and is parsed on save.

import { useState } from 'react';
import { TASK_AUTOMATION_LIMITS } from '@intelliflow/domain';
import { Button, ConfirmationDialog, Input, Label, Switch } from '@intelliflow/ui';
import type {
  TaskAutomationSettingsView,
  UpdateTaskAutomationSettingsInput,
} from '@intelliflow/validators';

const L = TASK_AUTOMATION_LIMITS;

export interface AutomationSettingsCardProps {
  readonly settings: TaskAutomationSettingsView;
  readonly canEdit: boolean;
  readonly isSaving: boolean;
  readonly onSave: (input: UpdateTaskAutomationSettingsInput) => Promise<void>;
  /** Read-only note shown to users who cannot edit (id for aria-describedby). */
  readonly readOnlyNoteId?: string;
  /** Resolves with the reset settings; rejects on failure so the confirmation stays open. */
  readonly onReset: () => Promise<TaskAutomationSettingsView>;
}

interface Draft {
  automationEnabled: boolean;
  notifyRuleOwnerOnFailure: boolean;
  maxRunsPerRulePerHour: string;
}

function toDraft(settings: TaskAutomationSettingsView): Draft {
  return {
    automationEnabled: settings.automationEnabled,
    notifyRuleOwnerOnFailure: settings.notifyRuleOwnerOnFailure,
    maxRunsPerRulePerHour: String(settings.maxRunsPerRulePerHour),
  };
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.automationEnabled === b.automationEnabled &&
    a.notifyRuleOwnerOnFailure === b.notifyRuleOwnerOnFailure &&
    a.maxRunsPerRulePerHour === b.maxRunsPerRulePerHour
  );
}

function parseCap(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= L.minRunsPerRulePerHour && n <= L.maxRunsPerRulePerHour ? n : null;
}

export function AutomationSettingsCard({
  settings,
  canEdit,
  isSaving,
  onSave,
  onReset,
  readOnlyNoteId,
}: AutomationSettingsCardProps) {
  const [seededFrom, setSeededFrom] = useState(settings);
  const [baseline, setBaseline] = useState<Draft>(() => toDraft(settings));
  const [draft, setDraft] = useState<Draft>(baseline);
  const [capError, setCapError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const isDirty = !sameDraft(draft, baseline);

  // Adjust state while rendering (no effect): new server values replace a clean draft only.
  if (settings !== seededFrom) {
    setSeededFrom(settings);
    if (!isDirty) {
      setBaseline(toDraft(settings));
      setDraft(toDraft(settings));
    }
  }

  const reseed = (next: TaskAutomationSettingsView) => {
    setBaseline(toDraft(next));
    setDraft(toDraft(next));
    setCapError(null);
  };

  async function handleSave() {
    const cap = parseCap(draft.maxRunsPerRulePerHour);
    if (cap === null) {
      setCapError(
        `Enter a whole number from ${L.minRunsPerRulePerHour} to ${L.maxRunsPerRulePerHour}.`
      );
      document.getElementById('ta-max-runs')?.focus();
      return;
    }
    setCapError(null);
    const input = {
      automationEnabled: draft.automationEnabled,
      notifyRuleOwnerOnFailure: draft.notifyRuleOwnerOnFailure,
      maxRunsPerRulePerHour: cap,
    };
    try {
      await onSave(input);
      reseed(input);
    } catch {
      // The parent toasts the error; the draft is kept.
    }
  }

  async function handleReset() {
    reseed(await onReset());
  }

  const readOnly = !canEdit;
  return (
    <>
      <fieldset
        disabled={isSaving || readOnly}
        aria-describedby={readOnly ? readOnlyNoteId : undefined}
        className="space-y-4"
      >
        <legend className="sr-only">Task automation settings</legend>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="ta-enabled">Run task automation</Label>
            <p id="ta-enabled-help" className="text-xs text-muted-foreground">
              When off, no rule runs. Events that happen while it is off are not run later.
            </p>
          </div>
          <Switch
            id="ta-enabled"
            checked={draft.automationEnabled}
            onCheckedChange={(automationEnabled) => setDraft((d) => ({ ...d, automationEnabled }))}
            aria-describedby="ta-enabled-help"
          />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label htmlFor="ta-notify-owner">Notify the rule owner when a run fails</Label>
            <p id="ta-notify-owner-help" className="text-xs text-muted-foreground">
              The person who created the rule gets an in-app notification.
            </p>
          </div>
          <Switch
            id="ta-notify-owner"
            checked={draft.notifyRuleOwnerOnFailure}
            onCheckedChange={(notifyRuleOwnerOnFailure) =>
              setDraft((d) => ({ ...d, notifyRuleOwnerOnFailure }))
            }
            aria-describedby="ta-notify-owner-help"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ta-max-runs">Max runs per rule per hour</Label>
          <Input
            id="ta-max-runs"
            inputMode="numeric"
            value={draft.maxRunsPerRulePerHour}
            onChange={(e) => setDraft((d) => ({ ...d, maxRunsPerRulePerHour: e.target.value }))}
            aria-invalid={capError ? true : undefined}
            aria-describedby={capError ? 'ta-max-runs-help ta-max-runs-error' : 'ta-max-runs-help'}
          />
          <p id="ta-max-runs-help" className="text-xs text-muted-foreground">
            Runs over this limit are skipped and counted on the rule. The workspace limit is{' '}
            {L.maxRunsPerTenantPerHour} runs an hour.
          </p>
          {capError && (
            <p id="ta-max-runs-error" className="text-xs text-red-600 dark:text-red-400">
              {capError}
            </p>
          )}
        </div>
      </fieldset>
      {canEdit && (
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmReset(true)}
            disabled={isSaving}
          >
            Reset to Defaults
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!isDirty || isSaving}>
            {isSaving ? 'Saving…' : 'Save Settings'}
          </Button>
        </div>
      )}
      <ConfirmationDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset Settings to Defaults"
        description={`Automation is turned on, failure notifications are turned off and the hourly limit goes back to ${L.defaultRunsPerRulePerHour}. Rules, run history and tags are kept.`}
        confirmLabel="Reset"
        onConfirm={handleReset}
      />
    </>
  );
}
