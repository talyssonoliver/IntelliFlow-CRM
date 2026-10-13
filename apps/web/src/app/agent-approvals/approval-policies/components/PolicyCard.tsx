'use client';

/**
 * One approval policy (PG-198): colour chip with the name as text (AC-021),
 * default badge, and a plain-language summary of its rules. Mutation controls
 * render only for admins (AC-019).
 */
import { Badge, Button } from '@intelliflow/ui';
import { swatchClass } from '@/lib/color-tokens';
import {
  ROLE_LABELS,
  actionLabel,
  agentLabel,
  formatMinutes,
  hasFormerTarget,
  type PolicyRow,
} from './policy-model';

export function PolicyChip({ name, colorToken }: Readonly<{ name: string; colorToken: string }>) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full ${swatchClass(colorToken)}`}
        aria-hidden="true"
      />
      {name}
    </span>
  );
}

function autoApproveSummary(policy: PolicyRow): string {
  if (!policy.autoApproveEnabled || policy.autoApproveMinConfidence === null) return 'Off';
  return `Above ${policy.autoApproveMinConfidence}% confidence`;
}

function escalationSummary(policy: PolicyRow): string {
  if (!policy.escalationEnabled) return 'Off';
  if (hasFormerTarget(policy)) return 'Inactive: target was a former user';
  const after =
    policy.escalateAfterMinutes === null
      ? ''
      : ` after ${formatMinutes(policy.escalateAfterMinutes)}`;
  return `To ${policy.escalationTarget?.name ?? 'a former user'}${after}`;
}

function appliesTo(policy: PolicyRow): string {
  if (policy.assignments.length === 0) {
    return policy.isDefault
      ? 'Everything not routed to another policy'
      : 'Nothing yet (no overrides)';
  }
  return policy.assignments
    .map((a) => `${agentLabel(a.agentKey)} · ${actionLabel(a.actionType)}`)
    .join(', ');
}

export interface PolicyCardProps {
  policy: PolicyRow;
  canManage: boolean;
  isBusy: boolean;
  onEdit: (policy: PolicyRow) => void;
  onDelete: (policy: PolicyRow) => void;
  onSetDefault: (policy: PolicyRow) => void;
}

export function PolicyCard({
  policy,
  canManage,
  isBusy,
  onEdit,
  onDelete,
  onSetDefault,
}: Readonly<PolicyCardProps>) {
  const rows: [string, string][] = [
    ['Timeout', formatMinutes(policy.timeoutMinutes)],
    ['Reviewer', ROLE_LABELS[policy.minReviewerRole]],
    ['Auto-approve', autoApproveSummary(policy)],
    ['Escalation', escalationSummary(policy)],
    ['Applies to', appliesTo(policy)],
  ];
  return (
    <article
      className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 sm:p-4 space-y-3"
      aria-label={`${policy.name} policy`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PolicyChip name={policy.name} colorToken={policy.colorToken} />
            {policy.isDefault && <Badge variant="secondary">Default</Badge>}
          </div>
          {policy.description && (
            <p className="text-sm text-muted-foreground">{policy.description}</p>
          )}
        </div>
        {canManage && (
          <div className="flex flex-wrap gap-2">
            {!policy.isDefault && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onSetDefault(policy)}
                disabled={isBusy}
                aria-label={`Make Default: ${policy.name}`}
              >
                Make Default
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onEdit(policy)}
              disabled={isBusy}
              aria-label={`Edit ${policy.name}`}
            >
              Edit
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onDelete(policy)}
              disabled={isBusy}
              aria-label={`Delete ${policy.name}`}
            >
              Delete
            </Button>
          </div>
        )}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
        {rows.map(([term, value]) => (
          <div key={term} className="contents">
            <dt className="text-muted-foreground">{term}</dt>
            <dd className="text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      {hasFormerTarget(policy) && (
        <p className="text-xs text-amber-700 dark:text-amber-400" role="note">
          Escalation is inactive until a new target is chosen.
        </p>
      )}
    </article>
  );
}
