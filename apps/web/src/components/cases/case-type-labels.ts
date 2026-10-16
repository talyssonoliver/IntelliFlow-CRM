/**
 * Case type display labels (PG-204). Shared by the Case Types settings page,
 * the New Case form hint and the case detail badge so the wording matches.
 */
import {
  CASE_REQUIRED_FIELD_KEYS,
  type CasePriority,
  type CaseRequiredFieldKey,
} from '@intelliflow/domain';

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const REQUIRED_FIELD_LABELS: Record<CaseRequiredFieldKey, string> = {
  title: 'Subject',
  description: 'Description',
  deadline: 'Deadline',
  jurisdiction: 'Jurisdiction',
  clientId: 'Client',
  assignedTo: 'Assignee',
};

function plural(count: number, one: string, many: string): string {
  return count === 1 ? `1 ${one}` : `${count} ${many}`;
}

export function slaLabel(days: number | null): string {
  return days == null ? 'No SLA' : `Due in ${plural(days, 'day', 'days')}`;
}

export function priorityLabel(priority: CasePriority | null): string {
  return priority ? `${CASE_PRIORITY_LABELS[priority]} priority` : 'Module default priority';
}

export function caseCountLabel(count: number): string {
  return count === 0 ? 'No cases' : plural(count, 'case', 'cases');
}

export function requiredCountLabel(count: number): string {
  return count === 0
    ? 'Module required fields'
    : plural(count, 'required field', 'required fields');
}

export function checklistCountLabel(count: number): string {
  return count === 0 ? 'No checklist' : plural(count, 'checklist step', 'checklist steps');
}

export interface CaseTypeDefaultsSummary {
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
}

/** "Type default: High priority · due in 14 days" — the New Case hint. */
export function describeCaseTypeDefaults(type: CaseTypeDefaultsSummary | null): string {
  if (!type) return 'No case type: the Case Settings default priority and required fields apply.';
  const parts = [
    type.defaultPriority
      ? `${CASE_PRIORITY_LABELS[type.defaultPriority]} priority`
      : 'Case Settings default priority',
    type.defaultSlaDays == null
      ? 'no default deadline'
      : `due in ${plural(type.defaultSlaDays, 'day', 'days')}`,
  ];
  return `Type default: ${parts.join(' · ')}`;
}

/** Label of the empty priority option, carrying the resolved value when known. */
export function defaultPriorityOptionLabel(type: CaseTypeDefaultsSummary | null): string {
  return type?.defaultPriority
    ? `Use default (${CASE_PRIORITY_LABELS[type.defaultPriority]})`
    : 'Use default';
}

/** Required keys for a new case: the type's non-empty set, else the module's (ADR-076). */
export function effectiveRequiredFields(
  typeFields: readonly CaseRequiredFieldKey[] | null | undefined,
  moduleFields: readonly CaseRequiredFieldKey[]
): ReadonlySet<CaseRequiredFieldKey> {
  return new Set(typeFields && typeFields.length > 0 ? typeFields : moduleFields);
}

const KNOWN_REQUIRED_KEYS: ReadonlySet<string> = new Set(CASE_REQUIRED_FIELD_KEYS);

/** Case Settings rows → the keys marked required (unknown keys dropped). */
export function requiredKeysFromRows(
  rows: readonly { fieldKey: string; isRequired: boolean }[] | undefined
): CaseRequiredFieldKey[] {
  return (rows ?? [])
    .filter((row) => row.isRequired)
    .map((row) => row.fieldKey)
    .filter((key): key is CaseRequiredFieldKey => KNOWN_REQUIRED_KEYS.has(key));
}
