'use client';

/**
 * Create / edit a territory (PG-197, AC-004). Save is disabled until the draft
 * differs from its snapshot, while saving, and while a conflict is shown
 * (duplicate rule, rule without country, duplicate or empty name). After a
 * successful save the snapshot is refreshed from the saved row (playbook §3).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@intelliflow/ui';
import { TERRITORY_STRATEGIES, type TerritoryStrategy } from '@intelliflow/domain';
import { ACCOUNT_TAG_COLOR_TOKENS, type AccountTagColorToken } from '@intelliflow/validators';
import { COLOR_SWATCH_CLASSES, toColorToken } from './territory-colors';
import {
  TerritoryRulesEditor,
  findRuleIssues,
  newRuleDraft,
  type RuleDraft,
} from './TerritoryRulesEditor';
import { MemberMultiSelect, type MemberOption } from './MemberMultiSelect';
import type { TerritoryRow } from './TerritoryList';

export const STRATEGY_LABELS: Record<TerritoryStrategy, { label: string; help: string }> = {
  ROUND_ROBIN: { label: 'Round-robin', help: 'Members take turns, in list order.' },
  LOAD_BALANCE: { label: 'Load-balance', help: 'The member with the fewest accounts.' },
  MANUAL: { label: 'Manual', help: 'Nobody is picked; the creator keeps the account.' },
};

export interface TerritoryDraft {
  name: string;
  description: string;
  colorToken: AccountTagColorToken;
  strategy: TerritoryStrategy;
  isActive: boolean;
  rules: RuleDraft[];
  memberIds: string[];
}

export interface TerritorySaveInput {
  name: string;
  description?: string;
  colorToken: AccountTagColorToken;
  strategy: TerritoryStrategy;
  isActive: boolean;
  rules: { country: string; region?: string; postalPrefix?: string }[];
  memberIds: string[];
}

export function draftFromTerritory(territory: TerritoryRow | null): TerritoryDraft {
  if (!territory) {
    return {
      name: '',
      description: '',
      colorToken: 'slate',
      strategy: 'ROUND_ROBIN',
      isActive: true,
      rules: [newRuleDraft()],
      memberIds: [],
    };
  }
  return {
    name: territory.name,
    description: territory.description ?? '',
    colorToken: toColorToken(territory.colorToken),
    strategy: territory.strategy,
    isActive: territory.isActive,
    rules: territory.rules.map((rule) =>
      newRuleDraft({
        country: rule.country,
        region: rule.region ?? '',
        postalPrefix: rule.postalPrefix ?? '',
      })
    ),
    memberIds: territory.members.map((member) => member.userId),
  };
}

/** Comparable form of a draft (rule keys are UI-only). */
function fingerprint(draft: TerritoryDraft): string {
  return JSON.stringify({
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    rules: draft.rules.map(({ country, region, postalPrefix }) => [
      country,
      region.trim(),
      postalPrefix.trim(),
    ]),
  });
}

export function toSaveInput(draft: TerritoryDraft): TerritorySaveInput {
  return {
    name: draft.name.trim(),
    description: draft.description.trim() || undefined,
    colorToken: draft.colorToken,
    strategy: draft.strategy,
    isActive: draft.isActive,
    rules: draft.rules
      .filter((rule): rule is RuleDraft & { country: string } => !!rule.country)
      .map((rule) => ({
        country: rule.country,
        region: rule.region.trim() || undefined,
        postalPrefix: rule.postalPrefix.trim() || undefined,
      })),
    memberIds: draft.memberIds,
  };
}

export interface TerritoryDialogProps {
  open: boolean;
  /** null = create. */
  territory: TerritoryRow | null;
  /** Names of the other territories, for the duplicate-name check. */
  otherNames: string[];
  members: MemberOption[];
  membersLoading?: boolean;
  membersError?: boolean;
  isSaving: boolean;
  onSave: (input: TerritorySaveInput) => Promise<TerritoryRow | undefined>;
  onClose: () => void;
}

export function TerritoryDialog({
  open,
  territory,
  otherNames,
  members,
  membersLoading,
  membersError,
  isSaving,
  onSave,
  onClose,
}: Readonly<TerritoryDialogProps>) {
  const [snapshot, setSnapshot] = useState(() => draftFromTerritory(territory));
  const [draft, setDraft] = useState(snapshot);

  // Reset whenever the dialog opens for a (possibly different) territory.
  useEffect(() => {
    if (!open) return;
    const next = draftFromTerritory(territory);
    setSnapshot(next);
    setDraft(next);
  }, [open, territory]);

  const set = <K extends keyof TerritoryDraft>(key: K, value: TerritoryDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const ruleIssues = useMemo(() => findRuleIssues(draft.rules), [draft.rules]);
  const trimmedName = draft.name.trim();
  const nameTaken = otherNames.some((name) => name.toLowerCase() === trimmedName.toLowerCase());
  const isDefault = territory?.isDefault ?? false;
  const missingRule = !isDefault && draft.rules.length === 0;
  const hasConflict = !trimmedName || nameTaken || ruleIssues.length > 0 || missingRule;
  const isDirty = fingerprint(draft) !== fingerprint(snapshot);

  const save = async () => {
    const saved = await onSave(toSaveInput(draft));
    if (!saved) return;
    const refreshed = draftFromTerritory(saved);
    setSnapshot(refreshed);
    setDraft(refreshed);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{territory ? `Edit ${territory.name}` : 'New Territory'}</DialogTitle>
          <DialogDescription>
            Accounts whose location matches a rule are assigned using the strategy below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="territory-name">Name</Label>
              <Input
                id="territory-name"
                value={draft.name}
                maxLength={100}
                onChange={(e) => set('name', e.target.value)}
                aria-invalid={nameTaken ? true : undefined}
                aria-describedby={nameTaken ? 'territory-name-error' : undefined}
              />
              {nameTaken && (
                <p id="territory-name-error" className="text-xs text-destructive">
                  A territory named “{trimmedName}” already exists.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="territory-color">Colour</Label>
              <Select
                value={draft.colorToken}
                onValueChange={(value) => set('colorToken', toColorToken(value))}
              >
                <SelectTrigger id="territory-color">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TAG_COLOR_TOKENS.map((token) => (
                    <SelectItem key={token} value={token}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={`inline-block w-3 h-3 rounded-full ${COLOR_SWATCH_CLASSES[token]}`}
                          aria-hidden="true"
                        />
                        {token}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="territory-description">Description (optional)</Label>
            <Input
              id="territory-description"
              value={draft.description}
              maxLength={500}
              onChange={(e) => set('description', e.target.value)}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-foreground">Assignment strategy</legend>
            <RadioGroup
              value={draft.strategy}
              onValueChange={(value) =>
                set('strategy', TERRITORY_STRATEGIES.find((s) => s === value) ?? draft.strategy)
              }
              aria-label="Assignment strategy"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2"
            >
              {TERRITORY_STRATEGIES.map((strategy) => (
                <label
                  key={strategy}
                  htmlFor={`strategy-${strategy}`}
                  className="flex items-start gap-2 rounded-lg border border-border p-3 cursor-pointer"
                >
                  <RadioGroupItem id={`strategy-${strategy}`} value={strategy} className="mt-0.5" />
                  <span>
                    <span className="block text-sm font-medium">
                      {STRATEGY_LABELS[strategy].label}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {STRATEGY_LABELS[strategy].help}
                    </span>
                  </span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>

          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="territory-active">Active</Label>
            <Switch
              id="territory-active"
              checked={draft.isActive}
              onCheckedChange={(checked) => set('isActive', checked)}
              disabled={isDefault && draft.isActive}
              aria-describedby={isDefault ? 'territory-active-help' : undefined}
            />
          </div>
          {isDefault && (
            <p id="territory-active-help" className="text-xs text-muted-foreground -mt-3">
              The default territory must stay active.
            </p>
          )}

          <TerritoryRulesEditor
            rules={draft.rules}
            onChange={(rules) => set('rules', rules)}
            issues={ruleIssues}
            isDefault={isDefault}
          />

          <div className="space-y-1.5">
            <Label htmlFor="territory-members">Members</Label>
            <MemberMultiSelect
              id="territory-members"
              options={members}
              selectedIds={draft.memberIds}
              onChange={(ids) => set('memberIds', ids)}
              isLoading={membersLoading}
              isError={membersError}
            />
            <p className="text-xs text-muted-foreground">
              {draft.strategy === 'MANUAL'
                ? 'Manual territories can have no members.'
                : 'Round-robin follows this order. Members who left the workspace are skipped.'}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={!isDirty || isSaving || hasConflict}>
            {isSaving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
