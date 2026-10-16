/**
 * Case type defaults — PG-204 (ADR-076).
 *
 * Case types are applied when a case is created. This module decides, without
 * any I/O, which priority, deadline source, required fields and seeded tasks a
 * new case gets. Owner ruling 2026-10-13: explicit input first, then the case
 * type, then the PG-190 module defaults ("type first, then module defaults").
 */

import { CASE_PRIORITIES, type CasePriority } from './CaseEvents';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../crm/account/territory/territory-constants';

/** The PG-190 required-field keys — the single source the validators derive from. */
export const CASE_REQUIRED_FIELD_KEYS = [
  'title',
  'description',
  'deadline',
  'jurisdiction',
  'clientId',
  'assignedTo',
] as const;

export type CaseRequiredFieldKey = (typeof CASE_REQUIRED_FIELD_KEYS)[number];

/** Limits shared by the validators, the router and the UI. The type cap is soft. */
export const CASE_TYPE_LIMITS = {
  maxTypesPerTenant: 50,
  maxNameLength: 100,
  maxCategoryLength: 60,
  maxChecklistItems: 20,
  maxChecklistTitleLength: 200,
  minSlaDays: 1,
  maxSlaDays: 3650,
} as const;

/**
 * Roles allowed to change case types. Same set as account owner admins, so
 * there is one role list; OWNER and SUPER_ADMIN are forward-compatible strings.
 */
export const CASE_TYPE_ADMIN_ROLES = ACCOUNT_OWNER_ADMIN_ROLES;

const ADMIN_ROLE_SET: ReadonlySet<string> = new Set(CASE_TYPE_ADMIN_ROLES);

export function isCaseTypeAdminRole(role: string | null | undefined): boolean {
  return role != null && ADMIN_ROLE_SET.has(role);
}

export interface CaseTypeDefaultsSource {
  defaultPriority: CasePriority | null;
  defaultSlaDays: number | null;
  requiredFields: readonly string[];
  checklist: readonly { title: string }[];
}

export interface ResolveCaseCreateDefaultsArgs {
  input: {
    priority?: CasePriority;
    hasDeadline: boolean;
    title: string;
    description?: string | null;
    jurisdiction?: string | null;
    clientId: string;
    assignedTo: string;
  };
  caseType: CaseTypeDefaultsSource | null;
  /** `CaseSettings.defaultPriority` — an unvalidated string column. */
  moduleDefaultPriority: string | null;
  /** Tenant `CaseRequiredField` rows; the caller passes the PG-190 defaults when none exist. */
  tenantRequiredFields: readonly { fieldKey: string; isRequired: boolean }[];
}

export type CaseDeadlineSource =
  | { kind: 'input' }
  | { kind: 'sla'; days: number }
  | { kind: 'none' };

export interface ResolvedCaseCreateDefaults {
  priority: CasePriority;
  prioritySource: 'input' | 'type' | 'module' | 'fallback';
  deadline: CaseDeadlineSource;
  requiredSource: 'type' | 'module';
  missingRequired: CaseRequiredFieldKey[];
  seedTasks: { title: string }[];
}

const REQUIRED_KEY_SET: ReadonlySet<string> = new Set(CASE_REQUIRED_FIELD_KEYS);

function isCasePriority(value: string | null): value is CasePriority {
  return value !== null && (CASE_PRIORITIES as readonly string[]).includes(value);
}

function isFilled(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function resolvePriority(
  args: ResolveCaseCreateDefaultsArgs
): Pick<ResolvedCaseCreateDefaults, 'priority' | 'prioritySource'> {
  if (args.input.priority) return { priority: args.input.priority, prioritySource: 'input' };
  if (args.caseType?.defaultPriority) {
    return { priority: args.caseType.defaultPriority, prioritySource: 'type' };
  }
  if (isCasePriority(args.moduleDefaultPriority)) {
    return { priority: args.moduleDefaultPriority, prioritySource: 'module' };
  }
  return { priority: 'MEDIUM', prioritySource: 'fallback' };
}

function resolveDeadline(args: ResolveCaseCreateDefaultsArgs): CaseDeadlineSource {
  if (args.input.hasDeadline) return { kind: 'input' };
  const days = args.caseType?.defaultSlaDays;
  if (days != null) return { kind: 'sla', days };
  return { kind: 'none' };
}

function resolveRequiredKeys(args: ResolveCaseCreateDefaultsArgs): {
  keys: ReadonlySet<string>;
  source: 'type' | 'module';
} {
  const typeKeys = (args.caseType?.requiredFields ?? []).filter((k) => REQUIRED_KEY_SET.has(k));
  if (typeKeys.length > 0) return { keys: new Set(typeKeys), source: 'type' };
  const moduleKeys = args.tenantRequiredFields
    .filter((row) => row.isRequired && REQUIRED_KEY_SET.has(row.fieldKey))
    .map((row) => row.fieldKey);
  return { keys: new Set(moduleKeys), source: 'module' };
}

export function resolveCaseCreateDefaults(
  args: ResolveCaseCreateDefaultsArgs
): ResolvedCaseCreateDefaults {
  const { priority, prioritySource } = resolvePriority(args);
  const deadline = resolveDeadline(args);
  const required = resolveRequiredKeys(args);

  const present: Record<CaseRequiredFieldKey, boolean> = {
    title: isFilled(args.input.title),
    description: isFilled(args.input.description),
    deadline: deadline.kind !== 'none',
    jurisdiction: isFilled(args.input.jurisdiction),
    clientId: isFilled(args.input.clientId),
    assignedTo: isFilled(args.input.assignedTo),
  };
  const missingRequired = CASE_REQUIRED_FIELD_KEYS.filter(
    (key) => required.keys.has(key) && !present[key]
  );

  const seedTasks = (args.caseType?.checklist ?? []).map((item) => ({ title: item.title.trim() }));

  return {
    priority,
    prioritySource,
    deadline,
    requiredSource: required.source,
    missingRequired,
    seedTasks,
  };
}
