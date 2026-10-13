'use client';

/**
 * Per-agent overrides for a policy (PG-198, AC-004): rows of agent + action.
 * A duplicate pair is flagged on the second row as "rows N and M" (the same
 * rule the validator's superRefine enforces) and blocks Save via hasConflict.
 */
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { APPROVAL_AGENT_TOOLS, type ApprovalPolicyScope } from '@intelliflow/domain';
import {
  WILDCARD,
  actionLabel,
  agentLabel,
  assignmentOptions,
  type PolicyAssignment,
} from './policy-model';

export interface AssignmentDraft extends PolicyAssignment {
  key: string;
}

export interface AssignmentIssue {
  index: number;
  message: string;
}

const TOOL_ACTIONS = new Map<string, string>(Object.entries(APPROVAL_AGENT_TOOLS));

/** An agent tool paired with an action it never performs can never match. */
function mismatch(row: PolicyAssignment): string | null {
  const toolAction = TOOL_ACTIONS.get(row.agentKey);
  if (!toolAction || row.actionType === WILDCARD || row.actionType === toolAction) return null;
  return `${agentLabel(row.agentKey)} only performs ${actionLabel(toolAction)} actions.`;
}

/** Duplicates, impossible pairs and the forbidden any/any pair, on the offending row. */
export function findAssignmentIssues(rows: readonly AssignmentDraft[]): AssignmentIssue[] {
  const issues: AssignmentIssue[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    if (row.agentKey === WILDCARD && row.actionType === WILDCARD) {
      issues.push({
        index,
        message: `Row ${index + 1} matches everything. Make this the default policy instead.`,
      });
      return;
    }
    const impossible = mismatch(row);
    if (impossible) {
      issues.push({ index, message: `Row ${index + 1}: ${impossible}` });
      return;
    }
    const pair = `${row.agentKey}|${row.actionType}`;
    const first = seen.get(pair);
    if (first === undefined) {
      seen.set(pair, index);
      return;
    }
    issues.push({
      index,
      message: `Rows ${first + 1} and ${index + 1} are the same agent and action. Remove one.`,
    });
  });
  return issues;
}

let assignmentSeq = 0;
export function newAssignmentDraft(partial: Partial<PolicyAssignment> = {}): AssignmentDraft {
  assignmentSeq += 1;
  return {
    key: `assignment-${assignmentSeq}`,
    agentKey: WILDCARD,
    actionType: WILDCARD,
    ...partial,
  };
}

export interface AssignmentsEditorProps {
  scope: ApprovalPolicyScope;
  rows: AssignmentDraft[];
  onChange: (rows: AssignmentDraft[]) => void;
  issues: AssignmentIssue[];
  maxRows: number;
}

export function AssignmentsEditor({
  scope,
  rows,
  onChange,
  issues,
  maxRows,
}: Readonly<AssignmentsEditorProps>) {
  const { agents, actions } = assignmentOptions(scope);
  const update = (index: number, patch: Partial<PolicyAssignment>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const issueFor = (index: number) => issues.find((issue) => issue.index === index);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">Applies to</legend>
      <p className="text-xs text-muted-foreground">
        Route specific agents or actions to this policy. The most specific match wins: an exact
        agent and action, then the agent, then the action, then the default policy.
      </p>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">No overrides.</p>}
      <ul className="space-y-2">
        {rows.map((row, index) => {
          const issue = issueFor(index);
          const errorId = issue ? `${row.key}-error` : undefined;
          return (
            <li key={row.key} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={row.agentKey}
                  onValueChange={(agentKey) => update(index, { agentKey })}
                >
                  <SelectTrigger
                    className="w-48"
                    aria-label={`Row ${index + 1} agent`}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map((agent) => (
                      <SelectItem key={agent} value={agent}>
                        {agentLabel(agent)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={row.actionType}
                  onValueChange={(actionType) => update(index, { actionType })}
                >
                  <SelectTrigger
                    className="w-44"
                    aria-label={`Row ${index + 1} action`}
                    aria-invalid={issue ? true : undefined}
                    aria-describedby={errorId}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {actions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {actionLabel(action)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(rows.filter((_, i) => i !== index))}
                  aria-label={`Remove row ${index + 1}`}
                >
                  <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                    delete
                  </span>
                </Button>
              </div>
              {issue && (
                <p id={errorId} className="text-xs text-destructive">
                  {issue.message}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...rows, newAssignmentDraft()])}
        disabled={rows.length >= maxRows}
      >
        Add Override
      </Button>
    </fieldset>
  );
}
