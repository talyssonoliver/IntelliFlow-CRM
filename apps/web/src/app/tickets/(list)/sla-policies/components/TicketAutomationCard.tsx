'use client';

import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';
import type { TicketAutomationSettingsInput } from '@intelliflow/validators';

interface SlaPolicySummary {
  id: string;
  name: string;
  isActive: boolean;
}

interface Props {
  settings: TicketAutomationSettingsInput;
  slaPolicies: SlaPolicySummary[];
  onChange: (settings: TicketAutomationSettingsInput) => void;
}

interface ToggleRow {
  key: keyof TicketAutomationSettingsInput;
  label: string;
  description?: string;
}

const AUTO_CLOSE_SWITCHES: ToggleRow[] = [
  {
    key: 'autoCloseAppliesToWaitingCustomer',
    label: 'Apply to tickets awaiting customer',
  },
  { key: 'autoCloseAppliesToResolved', label: 'Apply to resolved tickets' },
  { key: 'autoCloseNotifyCustomer', label: 'Notify customer before auto-close' },
];

const DUPLICATE_SWITCHES: ToggleRow[] = [
  {
    key: 'autoMergeOnExactContactSubject',
    label: 'Auto-merge exact (contact + subject) matches',
  },
  { key: 'notifyOnDuplicate', label: 'Notify when a duplicate is suspected' },
];

const RBAC_SWITCHES: ToggleRow[] = [
  { key: 'restrictTagCreationToAdmins', label: 'Restrict tag creation to admins' },
];

const HYGIENE_SWITCHES: ToggleRow[] = [
  { key: 'normalizeSubjectCasing', label: 'Normalize subject casing' },
  { key: 'trimDescriptionWhitespace', label: 'Trim description whitespace' },
  {
    key: 'preventDeleteWithOpenChildren',
    label: 'Block delete when the ticket has open children',
  },
];

const NOTIFICATION_SWITCHES: ToggleRow[] = [
  { key: 'notifyOnAssigneeChange', label: 'Notify on assignee change' },
  { key: 'notifyOnSlaBreach', label: 'Notify on SLA breach' },
  { key: 'notifyOnSlaWarning', label: 'Notify on SLA warning' },
  { key: 'notifyOnStatusResolved', label: 'Notify when resolved' },
  { key: 'notifyOnEscalation', label: 'Notify on escalation' },
];

const AI_SWITCHES: ToggleRow[] = [
  { key: 'aiDuplicateDetection', label: 'AI duplicate detection' },
  { key: 'aiAutoCategorization', label: 'AI auto-categorization' },
  { key: 'aiSentimentAnalysis', label: 'AI sentiment analysis' },
  { key: 'aiNextStepRecommendation', label: 'AI next-step recommendation' },
  { key: 'aiTagSuggestions', label: 'AI tag suggestions' },
  { key: 'aiInsightGeneration', label: 'AI insight generation' },
];

export function TicketAutomationCard({ settings, slaPolicies, onChange }: Props) {
  const setToggle = (key: keyof TicketAutomationSettingsInput, value: boolean) => {
    onChange({ ...settings, [key]: value } as TicketAutomationSettingsInput);
  };

  return (
    <div>
      <div className="flex items-start gap-3 mb-5">
        <div className="w-9 h-9 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
          <span
            className="material-symbols-outlined text-[20px] text-indigo-600 dark:text-indigo-400"
            aria-hidden="true"
          >
            smart_toy
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Automation</h3>
          <p className="text-sm text-muted-foreground">
            Default SLA, auto-close, notification triggers, and AI toggles.
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <GroupHeading>Default SLA</GroupHeading>
        <div>
          <label htmlFor="default-sla" className="text-sm font-medium block mb-1">
            Default SLA policy (applied when a ticket is created without an explicit SLA)
          </label>
          <Select
            value={settings.defaultSlaPolicyId ?? 'none'}
            onValueChange={(v) =>
              onChange({ ...settings, defaultSlaPolicyId: v === 'none' ? null : v })
            }
          >
            <SelectTrigger id="default-sla" aria-label="Default SLA policy">
              <SelectValue placeholder="No explicit default — falls back to isDefault flag" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No explicit default</SelectItem>
              {slaPolicies.map((p) => (
                <SelectItem key={p.id} value={p.id} disabled={!p.isActive}>
                  {p.name}
                  {!p.isActive && ' (inactive)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <GroupHeading>Auto-Close</GroupHeading>
        <p className="text-xs text-muted-foreground -mt-3">Runtime delivered by IFC-310.</p>
        <div>
          <label htmlFor="auto-close-days" className="text-sm font-medium block mb-1">
            Idle days before auto-close (0 disables)
          </label>
          <Input
            id="auto-close-days"
            type="number"
            min={0}
            max={365}
            value={settings.autoCloseIdleDays}
            onChange={(e) =>
              onChange({
                ...settings,
                autoCloseIdleDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)),
              })
            }
            aria-label="Idle days before auto-close"
          />
        </div>
        <ToggleGroup rows={AUTO_CLOSE_SWITCHES} settings={settings} onChange={setToggle} />

        <GroupHeading>Duplicate Detection</GroupHeading>
        <ToggleGroup rows={DUPLICATE_SWITCHES} settings={settings} onChange={setToggle} />

        <GroupHeading>RBAC</GroupHeading>
        <ToggleGroup rows={RBAC_SWITCHES} settings={settings} onChange={setToggle} />

        <GroupHeading>Data Hygiene</GroupHeading>
        <ToggleGroup rows={HYGIENE_SWITCHES} settings={settings} onChange={setToggle} />

        <GroupHeading>Notifications</GroupHeading>
        <ToggleGroup rows={NOTIFICATION_SWITCHES} settings={settings} onChange={setToggle} />

        <GroupHeading>AI &amp; Intelligence</GroupHeading>
        <p className="text-xs text-muted-foreground -mt-3">Runtime delivered by IFC-312.</p>
        <ToggleGroup rows={AI_SWITCHES} settings={settings} onChange={setToggle} />
      </div>
    </div>
  );
}

function GroupHeading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mt-2">
      {children}
    </h4>
  );
}

function ToggleGroup({
  rows,
  settings,
  onChange,
}: {
  rows: ToggleRow[];
  settings: TicketAutomationSettingsInput;
  onChange: (key: keyof TicketAutomationSettingsInput, value: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div
          key={row.key}
          className="flex items-center justify-between rounded-lg border border-border p-3"
        >
          <div>
            <span className="font-medium text-sm">{row.label}</span>
            {row.description && <p className="text-xs text-muted-foreground">{row.description}</p>}
          </div>
          <Switch
            checked={Boolean(settings[row.key])}
            onCheckedChange={(v) => onChange(row.key, v)}
            aria-label={row.label}
          />
        </div>
      ))}
    </div>
  );
}
