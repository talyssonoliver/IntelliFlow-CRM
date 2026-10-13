/**
 * Case type defaults resolver tests (PG-204, ADR-076).
 *
 * Covers the owner ruling: case types are applied at case creation, and with
 * no type the PG-190 module defaults apply (type first, then module defaults).
 */

import { describe, it, expect } from 'vitest';
import {
  CASE_REQUIRED_FIELD_KEYS,
  CASE_TYPE_ADMIN_ROLES,
  CASE_TYPE_LIMITS,
  isCaseTypeAdminRole,
  resolveCaseCreateDefaults,
  type ResolveCaseCreateDefaultsArgs,
} from '../case-type-defaults';
import { ACCOUNT_OWNER_ADMIN_ROLES } from '../../../crm/account/territory/territory-constants';

const MODULE_DEFAULT_ROWS = [
  { fieldKey: 'title', isRequired: true },
  { fieldKey: 'clientId', isRequired: true },
  { fieldKey: 'assignedTo', isRequired: true },
  { fieldKey: 'description', isRequired: false },
  { fieldKey: 'deadline', isRequired: false },
  { fieldKey: 'jurisdiction', isRequired: false },
];

function args(
  overrides: Partial<ResolveCaseCreateDefaultsArgs> = {}
): ResolveCaseCreateDefaultsArgs {
  return {
    input: {
      title: 'Smith v Jones',
      clientId: 'client-1',
      assignedTo: 'user-1',
      hasDeadline: false,
    },
    caseType: null,
    moduleDefaultPriority: null,
    tenantRequiredFields: MODULE_DEFAULT_ROWS,
    ...overrides,
  };
}

const LITIGATION = {
  defaultPriority: 'HIGH' as const,
  defaultSlaDays: 14,
  requiredFields: [] as string[],
  checklist: [{ title: 'Conflict check' }, { title: 'Engagement letter' }],
};

describe('constants', () => {
  it('lists the six PG-190 required-field keys in canonical order', () => {
    expect(CASE_REQUIRED_FIELD_KEYS).toEqual([
      'title',
      'description',
      'deadline',
      'jurisdiction',
      'clientId',
      'assignedTo',
    ]);
  });

  it('exposes the case type limits', () => {
    expect(CASE_TYPE_LIMITS).toEqual({
      maxTypesPerTenant: 50,
      maxNameLength: 100,
      maxCategoryLength: 60,
      maxChecklistItems: 20,
      maxChecklistTitleLength: 200,
      minSlaDays: 1,
      maxSlaDays: 3650,
    });
  });

  it('reuses the account owner admin roles as the single role source', () => {
    expect(CASE_TYPE_ADMIN_ROLES).toBe(ACCOUNT_OWNER_ADMIN_ROLES);
  });

  it('recognises admin roles only', () => {
    expect(isCaseTypeAdminRole('ADMIN')).toBe(true);
    expect(isCaseTypeAdminRole('MANAGER')).toBe(true);
    expect(isCaseTypeAdminRole('USER')).toBe(false);
    expect(isCaseTypeAdminRole(undefined)).toBe(false);
    expect(isCaseTypeAdminRole(null)).toBe(false);
  });
});

describe('resolveCaseCreateDefaults — priority', () => {
  it('keeps an explicit priority even when the type has one', () => {
    const result = resolveCaseCreateDefaults(
      args({
        input: { ...args().input, priority: 'LOW' },
        caseType: LITIGATION,
        moduleDefaultPriority: 'URGENT',
      })
    );
    expect(result.priority).toBe('LOW');
    expect(result.prioritySource).toBe('input');
  });

  it('uses the type default when no priority is given', () => {
    const result = resolveCaseCreateDefaults(
      args({ caseType: LITIGATION, moduleDefaultPriority: 'URGENT' })
    );
    expect(result.priority).toBe('HIGH');
    expect(result.prioritySource).toBe('type');
  });

  it('falls through to the module default when the type has none', () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: { ...LITIGATION, defaultPriority: null },
        moduleDefaultPriority: 'URGENT',
      })
    );
    expect(result.priority).toBe('URGENT');
    expect(result.prioritySource).toBe('module');
  });

  it('uses the module default when no type is picked', () => {
    const result = resolveCaseCreateDefaults(args({ moduleDefaultPriority: 'HIGH' }));
    expect(result.priority).toBe('HIGH');
    expect(result.prioritySource).toBe('module');
  });

  it('ignores an invalid module default and falls back to MEDIUM', () => {
    const result = resolveCaseCreateDefaults(args({ moduleDefaultPriority: 'garbage' }));
    expect(result.priority).toBe('MEDIUM');
    expect(result.prioritySource).toBe('fallback');
  });

  it('falls back to MEDIUM when nothing is configured', () => {
    const result = resolveCaseCreateDefaults(args());
    expect(result.priority).toBe('MEDIUM');
    expect(result.prioritySource).toBe('fallback');
  });
});

describe('resolveCaseCreateDefaults — deadline', () => {
  it('keeps an explicit deadline', () => {
    const result = resolveCaseCreateDefaults(
      args({ input: { ...args().input, hasDeadline: true }, caseType: LITIGATION })
    );
    expect(result.deadline).toEqual({ kind: 'input' });
  });

  it('derives the deadline from the type SLA when none is given', () => {
    const result = resolveCaseCreateDefaults(args({ caseType: LITIGATION }));
    expect(result.deadline).toEqual({ kind: 'sla', days: 14 });
  });

  it('has no deadline when the type has no SLA', () => {
    const result = resolveCaseCreateDefaults(
      args({ caseType: { ...LITIGATION, defaultSlaDays: null } })
    );
    expect(result.deadline).toEqual({ kind: 'none' });
  });

  it('has no deadline without a type', () => {
    expect(resolveCaseCreateDefaults(args()).deadline).toEqual({ kind: 'none' });
  });
});

describe('resolveCaseCreateDefaults — required fields', () => {
  it("uses the type's set when it is non-empty and ignores tenant rows", () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: { ...LITIGATION, requiredFields: ['jurisdiction'] },
        tenantRequiredFields: [{ fieldKey: 'description', isRequired: true }],
      })
    );
    expect(result.requiredSource).toBe('type');
    expect(result.missingRequired).toEqual(['jurisdiction']);
  });

  it('falls back to tenant rows when the type requires nothing', () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: LITIGATION,
        tenantRequiredFields: [{ fieldKey: 'description', isRequired: true }],
      })
    );
    expect(result.requiredSource).toBe('module');
    expect(result.missingRequired).toEqual(['description']);
  });

  it('applies tenant rows when no type is picked and ignores isRequired=false', () => {
    const result = resolveCaseCreateDefaults(
      args({
        tenantRequiredFields: [
          { fieldKey: 'description', isRequired: true },
          { fieldKey: 'jurisdiction', isRequired: false },
        ],
      })
    );
    expect(result.requiredSource).toBe('module');
    expect(result.missingRequired).toEqual(['description']);
  });

  it('ignores unknown keys from either source', () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: { ...LITIGATION, requiredFields: ['nonsense'] },
        tenantRequiredFields: [{ fieldKey: 'other', isRequired: true }],
      })
    );
    expect(result.missingRequired).toEqual([]);
  });

  it('treats an SLA-derived deadline as present', () => {
    const result = resolveCaseCreateDefaults(
      args({ caseType: { ...LITIGATION, requiredFields: ['deadline'] } })
    );
    expect(result.missingRequired).toEqual([]);
  });

  it('reports a required deadline when there is no input and no SLA', () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: { ...LITIGATION, defaultSlaDays: null, requiredFields: ['deadline'] },
      })
    );
    expect(result.missingRequired).toEqual(['deadline']);
  });

  it('treats blank and whitespace-only strings as missing', () => {
    const result = resolveCaseCreateDefaults(
      args({
        input: { ...args().input, description: '   ', jurisdiction: '' },
        tenantRequiredFields: [
          { fieldKey: 'jurisdiction', isRequired: true },
          { fieldKey: 'description', isRequired: true },
        ],
      })
    );
    expect(result.missingRequired).toEqual(['description', 'jurisdiction']);
  });

  it('accepts filled values and null optional values as present or missing correctly', () => {
    const result = resolveCaseCreateDefaults(
      args({
        input: {
          ...args().input,
          description: 'Contract dispute',
          jurisdiction: null,
          hasDeadline: true,
        },
        tenantRequiredFields: [
          { fieldKey: 'description', isRequired: true },
          { fieldKey: 'deadline', isRequired: true },
          { fieldKey: 'jurisdiction', isRequired: true },
          { fieldKey: 'title', isRequired: true },
          { fieldKey: 'clientId', isRequired: true },
          { fieldKey: 'assignedTo', isRequired: true },
        ],
      })
    );
    expect(result.missingRequired).toEqual(['jurisdiction']);
  });

  it('reports blank title, client and assignee when required', () => {
    const result = resolveCaseCreateDefaults(
      args({
        input: { title: ' ', clientId: '', assignedTo: '', hasDeadline: false },
      })
    );
    expect(result.missingRequired).toEqual(['title', 'clientId', 'assignedTo']);
  });
});

describe('resolveCaseCreateDefaults — checklist seeds', () => {
  it('returns the checklist in order with trimmed titles', () => {
    const result = resolveCaseCreateDefaults(
      args({
        caseType: {
          ...LITIGATION,
          checklist: [{ title: '  Conflict check ' }, { title: 'Engagement letter' }],
        },
      })
    );
    expect(result.seedTasks).toEqual([{ title: 'Conflict check' }, { title: 'Engagement letter' }]);
  });

  it('seeds nothing without a type', () => {
    expect(resolveCaseCreateDefaults(args()).seedTasks).toEqual([]);
  });
});
