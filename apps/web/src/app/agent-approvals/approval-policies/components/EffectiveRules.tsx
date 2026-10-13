'use client';

/**
 * Which policy each agent/action of a queue resolves to right now (PG-198,
 * `approvalPolicies.preview`). Each queue's card owns its loading and error
 * state, so one failing query never blanks the page.
 */
import { Button, Skeleton } from '@intelliflow/ui';
import { PolicyChip } from './PolicyCard';
import { actionLabel, agentLabel, formatMinutes } from './policy-model';

export interface EffectiveRuleRow {
  agentKey: string;
  actionType: string;
  policyId: string | null;
  policyName: string | null;
  colorToken: string | null;
  rule: { timeoutMinutes: number };
}

export interface EffectiveRulesProps {
  label: string;
  rows: EffectiveRuleRow[] | undefined;
  isLoading: boolean;
  error: { message: string } | null;
  onRetry: () => void;
}

const SKELETON_KEYS = ['er-0', 'er-1', 'er-2'] as const;

export function EffectiveRules({
  label,
  rows,
  isLoading,
  error,
  onRetry,
}: Readonly<EffectiveRulesProps>) {
  if (isLoading) {
    return (
      <>
        <output className="sr-only">Loading {label}…</output>
        <div className="space-y-2" aria-busy="true">
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-8 w-full" />
          ))}
        </div>
      </>
    );
  }
  if (error || !rows) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-700 dark:text-red-400" role="alert">
          Could not load the effective rules{error ? `: ${error.message}` : '.'}
        </p>
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{label}</caption>
      <thead>
        <tr className="text-left text-xs text-muted-foreground">
          <th scope="col" className="py-1 pr-2 font-medium">
            Agent / action
          </th>
          <th scope="col" className="py-1 pr-2 font-medium">
            Policy
          </th>
          <th scope="col" className="py-1 font-medium">
            Timeout
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={`${row.agentKey}|${row.actionType}`}
            className="border-t border-slate-100 dark:border-slate-800"
          >
            <th scope="row" className="py-1.5 pr-2 text-left font-normal">
              {agentLabel(row.agentKey)} · {actionLabel(row.actionType)}
            </th>
            <td className="py-1.5 pr-2">
              {row.policyName ? (
                <PolicyChip name={row.policyName} colorToken={row.colorToken ?? 'slate'} />
              ) : (
                <span className="text-muted-foreground">Built-in default</span>
              )}
            </td>
            <td className="py-1.5">{formatMinutes(row.rule.timeoutMinutes)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
