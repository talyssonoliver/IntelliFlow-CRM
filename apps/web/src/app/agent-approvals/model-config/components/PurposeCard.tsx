'use client';

/**
 * One AI purpose on the Model Configuration page (PG-199): primary model,
 * temperature, max tokens, ordered fallbacks and the monthly ceiling. The rag
 * card is locked to the platform embedding model (owner Q5); only its ceiling
 * is editable. A cheaper pick shows a non-modal note here; the confirm itself
 * happens once, at Save (owner R2/Q4).
 */
import type { ReactNode } from 'react';
import {
  Card,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { findDowngrades } from '@intelliflow/domain';
import { SectionHeader } from '@/components/shared/section-header';
import { FallbackList } from './FallbackList';
import {
  PURPOSE_META,
  formatModelPrice,
  formatUsd,
  isBelowSpend,
  modelOptionsFor,
  type CatalogModel,
  type DraftErrors,
  type ModelConfigLimits,
  type PurposeDraft,
  type PurposeRow,
} from './model-config-model';

/** Radix Select values cannot be empty; this stands for "no pin". */
export const DEFAULT_MODEL_VALUE = '__default__';
const DEFAULT_TEMPERATURE = 0.7;

export interface PurposeCardProps {
  row: PurposeRow;
  draft: PurposeDraft;
  catalog: CatalogModel[];
  limits: ModelConfigLimits;
  canManage: boolean;
  errors?: DraftErrors;
  onChange: (draft: PurposeDraft) => void;
}

function listModels(ids: string[]): string {
  if (ids.length <= 1) return ids.join('');
  return `${ids.slice(0, -1).join(', ')} or ${ids[ids.length - 1]}`;
}

function fallbackErrors(errors: DraftErrors): Record<number, string> {
  const byIndex: Record<number, string> = {};
  for (const [key, message] of Object.entries(errors)) {
    const match = /^fallbackModelIds\.(\d+)$/.exec(key);
    if (match && message) byIndex[Number(match[1])] = message;
  }
  return byIndex;
}

function FieldError({ id, message }: Readonly<{ id: string; message?: string }>) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}

/** Help text plus, when present, the error: keeps the constraint read with the error. */
function describedBy(helpId: string, errorId: string, error: string | undefined): string {
  return error ? `${helpId} ${errorId}` : helpId;
}

/** Always mounted, so notes that appear after a pick are announced (WCAG 4.1.3). */
function NoticeRegion({ children }: Readonly<{ children: ReactNode }>) {
  return <output className="block space-y-1">{children}</output>;
}

function Notice({
  label,
  icon,
  children,
}: Readonly<{ label: string; icon: string; children: string }>) {
  return (
    <p
      role="note"
      aria-label={label}
      className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-200"
    >
      <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
        {icon}
      </span>
      <span>{children}</span>
    </p>
  );
}

export function PurposeCard({
  row,
  draft,
  catalog,
  limits,
  canManage,
  errors = {},
  onChange,
}: Readonly<PurposeCardProps>) {
  const { purpose } = row;
  const meta = PURPOSE_META[purpose];
  const titleId = `${purpose}-title`;
  const disabled = !canManage;

  const ceilingId = `${purpose}-ceiling`;
  const ceilingHelpId = `${ceilingId}-help`;
  const ceilingErrorId = `${ceilingId}-error`;
  const spent =
    row.spentCents === null
      ? 'Spent this month: unavailable'
      : `Spent this month: ${formatUsd(row.spentCents)}`;
  const stopsOnSave = purpose === 'email' ? 'email drafts stop' : `AI for ${purpose} stops`;

  return (
    <section className="lg:col-span-6" aria-labelledby={titleId}>
      <Card className="h-full p-4 sm:p-5 space-y-4">
        <SectionHeader
          icon={meta.icon}
          iconBg={meta.iconBg}
          iconFg={meta.iconFg}
          title={meta.title}
          titleId={titleId}
          headingLevel={2}
          description={meta.description}
        />
        {row.blocked && (
          <p className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/30 dark:text-red-200">
            <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
              block
            </span>
            <span>{`Monthly AI ceiling reached for ${purpose}`}</span>
          </p>
        )}

        {row.locked ? (
          <LockedModel row={row} />
        ) : (
          <ModelFields
            row={row}
            draft={draft}
            catalog={catalog}
            limits={limits}
            disabled={disabled}
            errors={errors}
            onChange={onChange}
          />
        )}

        <div className="space-y-1">
          <Label htmlFor={ceilingId}>Monthly ceiling (USD)</Label>
          <Input
            id={ceilingId}
            inputMode="decimal"
            placeholder="No ceiling"
            value={draft.ceilingUsd}
            disabled={disabled}
            onChange={(e) => onChange({ ...draft, ceilingUsd: e.target.value })}
            aria-invalid={errors.ceilingUsd ? true : undefined}
            aria-describedby={describedBy(ceilingHelpId, ceilingErrorId, errors.ceilingUsd)}
          />
          <p id={ceilingHelpId} className="text-xs text-muted-foreground">
            Leave empty for no ceiling. $0 blocks AI for this purpose.
          </p>
          <FieldError id={ceilingErrorId} message={errors.ceilingUsd} />
          <p className="text-xs text-muted-foreground">{spent}</p>
          <NoticeRegion>
            {isBelowSpend(draft, row.spentCents) && (
              <Notice label="Ceiling already reached" icon="warning">
                {`Month-to-date spend already reaches this ceiling, so ${stopsOnSave} when you save.`}
              </Notice>
            )}
          </NoticeRegion>
        </div>
      </Card>
    </section>
  );
}

function LockedModel({ row }: Readonly<{ row: PurposeRow }>) {
  // The model the worker reports running (owner Q10), never a catalog default.
  const active = row.activeModel;
  return (
    <div className="space-y-1 rounded-md border border-border px-3 py-2">
      <p className="flex items-center gap-2 text-sm text-foreground">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
          lock
        </span>
        <span>Platform-managed embedding model</span>
      </p>
      {active ? (
        <p className="text-sm">
          <span className="font-mono">{active.id}</span>
          {active.dimensions ? (
            <span className="ml-2 text-xs text-muted-foreground">{`${active.dimensions} dimensions`}</span>
          ) : null}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Embedding model unavailable: the AI worker has not reported it yet.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Changing it would invalidate stored vectors, so only the ceiling can change. Embedding spend
        is estimated from input length.
      </p>
    </div>
  );
}

interface ModelFieldsProps {
  row: PurposeRow;
  draft: PurposeDraft;
  catalog: CatalogModel[];
  limits: ModelConfigLimits;
  disabled: boolean;
  errors: DraftErrors;
  onChange: (draft: PurposeDraft) => void;
}

function ModelFields({
  row,
  draft,
  catalog,
  limits,
  disabled,
  errors,
  onChange,
}: Readonly<ModelFieldsProps>) {
  const { purpose } = row;
  const title = PURPOSE_META[purpose].title;
  const options = modelOptionsFor(purpose, catalog);
  const known = draft.modelId === null || options.some((model) => model.id === draft.modelId);
  const primaries = draft.modelId ? [draft.modelId] : row.defaultModelIds;
  const fallbackOptions = options.filter((model) => !primaries.includes(model.id));
  const cheaper =
    findDowngrades(purpose, row, {
      modelId: draft.modelId,
      fallbackModelIds: draft.fallbackModelIds,
    }).length > 0;

  const modelId = `${purpose}-model`;
  const modelHelpId = `${modelId}-help`;
  const tempId = `${purpose}-temperature`;
  const customTempId = `${tempId}-custom`;
  const tokensId = `${purpose}-max-tokens`;
  const tokensHelpId = `${tokensId}-help`;
  const tokensErrorId = `${tokensId}-error`;

  const pickModel = (value: string) => {
    const next = value === DEFAULT_MODEL_VALUE ? null : value;
    const nextPrimaries = next ? [next] : row.defaultModelIds;
    onChange({
      ...draft,
      modelId: next,
      fallbackModelIds: draft.fallbackModelIds.filter((id) => !nextPrimaries.includes(id)),
    });
  };

  return (
    <>
      <div className="space-y-1">
        <Label htmlFor={modelId}>Model</Label>
        <Select
          value={draft.modelId ?? DEFAULT_MODEL_VALUE}
          onValueChange={pickModel}
          disabled={disabled}
        >
          <SelectTrigger
            id={modelId}
            aria-label={`${title} model`}
            aria-invalid={errors.modelId ? true : undefined}
            aria-describedby={describedBy(modelHelpId, `${modelId}-error`, errors.modelId)}
            className="h-11"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT_MODEL_VALUE}>Default (varies by feature)</SelectItem>
            {!known && draft.modelId && (
              <SelectItem value={draft.modelId} disabled>
                {`${draft.modelId} (retired)`}
              </SelectItem>
            )}
            {options.map((model) => (
              <SelectItem key={model.id} value={model.id}>
                {`${model.id} — ${formatModelPrice(model.price)}${model.onOpenRouter ? '' : ' (not on OpenRouter)'}`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p id={modelHelpId} className="text-xs text-muted-foreground">
          {`Default uses ${listModels(row.defaultModelIds)}, depending on the feature.`}
        </p>
        <FieldError id={`${modelId}-error`} message={errors.modelId} />
        <NoticeRegion>
          {!known && (
            <Notice label="Retired model" icon="info">
              This model is no longer offered. Pick another model or return to Default.
            </Notice>
          )}
          {cheaper && (
            <Notice label="Cheaper model selected" icon="info">
              The new choice costs less per token than the current one. You will be asked to confirm
              when you save.
            </Notice>
          )}
        </NoticeRegion>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground">Temperature</span>
          <span
            className="text-sm tabular-nums text-muted-foreground"
            data-testid={`${purpose}-temperature-value`}
          >
            {draft.temperature === null ? 'Default' : draft.temperature.toFixed(1)}
          </span>
        </div>
        <label htmlFor={customTempId} className="flex min-h-11 items-center gap-2 text-sm">
          <input
            id={customTempId}
            type="checkbox"
            className="h-4 w-4"
            checked={draft.temperature !== null}
            disabled={disabled}
            onChange={(e) =>
              onChange({ ...draft, temperature: e.target.checked ? DEFAULT_TEMPERATURE : null })
            }
          />
          <span>Custom temperature</span>
        </label>
        <input
          id={tempId}
          type="range"
          aria-label={`${title} temperature`}
          aria-valuetext={draft.temperature === null ? 'Default' : draft.temperature.toFixed(1)}
          aria-invalid={errors.temperature ? true : undefined}
          aria-describedby={errors.temperature ? `${tempId}-error` : undefined}
          min={limits.temperatureMin}
          max={limits.temperatureMax}
          step={0.1}
          value={draft.temperature ?? DEFAULT_TEMPERATURE}
          disabled={disabled || draft.temperature === null}
          onChange={(e) => onChange({ ...draft, temperature: Number(e.target.value) })}
          className="h-11 w-full accent-primary disabled:opacity-50"
        />
        <FieldError id={`${tempId}-error`} message={errors.temperature} />
      </div>

      <div className="space-y-1">
        <Label htmlFor={tokensId}>Max tokens</Label>
        <Input
          id={tokensId}
          inputMode="numeric"
          placeholder="Default"
          value={draft.maxTokens}
          disabled={disabled}
          onChange={(e) => onChange({ ...draft, maxTokens: e.target.value })}
          aria-invalid={errors.maxTokens ? true : undefined}
          aria-describedby={describedBy(tokensHelpId, tokensErrorId, errors.maxTokens)}
        />
        <p id={tokensHelpId} className="text-xs text-muted-foreground">
          {`Leave empty for the feature's default. ${limits.maxTokensMin}–${limits.maxTokensMax}.`}
        </p>
        <FieldError id={tokensErrorId} message={errors.maxTokens} />
      </div>

      <FallbackList
        purpose={purpose}
        title={title}
        ids={draft.fallbackModelIds}
        options={fallbackOptions}
        max={limits.maxFallbacks}
        errors={fallbackErrors(errors)}
        disabled={disabled}
        listErrorId={errors.fallbackModelIds ? `${purpose}-fallbacks-error` : undefined}
        onChange={(fallbackModelIds) => onChange({ ...draft, fallbackModelIds })}
      />
      <FieldError id={`${purpose}-fallbacks-error`} message={errors.fallbackModelIds} />
    </>
  );
}
