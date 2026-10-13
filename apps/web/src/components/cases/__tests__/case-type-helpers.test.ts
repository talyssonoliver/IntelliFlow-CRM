/**
 * PG-204 case type display helpers (labels + colour swatches).
 */
import { describe, it, expect } from 'vitest';
import {
  caseCountLabel,
  checklistCountLabel,
  defaultPriorityOptionLabel,
  describeCaseTypeDefaults,
  effectiveRequiredFields,
  priorityLabel,
  requiredCountLabel,
  requiredKeysFromRows,
  slaLabel,
} from '../case-type-labels';
import { swatchClass, toCaseTypeColorToken } from '../case-type-colors';

describe('case type labels', () => {
  it('pluralises counts', () => {
    expect(slaLabel(null)).toBe('No SLA');
    expect(slaLabel(1)).toBe('Due in 1 day');
    expect(slaLabel(14)).toBe('Due in 14 days');
    expect(caseCountLabel(0)).toBe('No cases');
    expect(caseCountLabel(1)).toBe('1 case');
    expect(caseCountLabel(12)).toBe('12 cases');
    expect(requiredCountLabel(0)).toBe('Module required fields');
    expect(requiredCountLabel(1)).toBe('1 required field');
    expect(checklistCountLabel(0)).toBe('No checklist');
    expect(checklistCountLabel(3)).toBe('3 checklist steps');
  });

  it('labels priorities', () => {
    expect(priorityLabel('URGENT')).toBe('Urgent priority');
    expect(priorityLabel(null)).toBe('Module default priority');
  });

  it('describes what a type will apply on a new case', () => {
    expect(describeCaseTypeDefaults({ defaultPriority: 'HIGH', defaultSlaDays: 14 })).toBe(
      'Type default: High priority · due in 14 days'
    );
    expect(describeCaseTypeDefaults({ defaultPriority: null, defaultSlaDays: 1 })).toBe(
      'Type default: Case Settings default priority · due in 1 day'
    );
    expect(describeCaseTypeDefaults({ defaultPriority: 'LOW', defaultSlaDays: null })).toBe(
      'Type default: Low priority · no default deadline'
    );
    expect(describeCaseTypeDefaults(null)).toMatch(/No case type/);
  });

  it('labels the empty priority option with the resolved value when known', () => {
    expect(defaultPriorityOptionLabel({ defaultPriority: 'HIGH', defaultSlaDays: null })).toBe(
      'Use default (High)'
    );
    expect(defaultPriorityOptionLabel(null)).toBe('Use default');
  });

  it("uses the type's required fields when it has any, else the module's", () => {
    expect([...effectiveRequiredFields(['deadline'], ['description'])]).toEqual(['deadline']);
    expect([...effectiveRequiredFields([], ['description'])]).toEqual(['description']);
    expect([...effectiveRequiredFields(undefined, ['jurisdiction'])]).toEqual(['jurisdiction']);
  });

  it('reads the required keys from Case Settings rows', () => {
    expect(
      requiredKeysFromRows([
        { fieldKey: 'description', isRequired: true },
        { fieldKey: 'deadline', isRequired: false },
        { fieldKey: 'bogus', isRequired: true },
      ])
    ).toEqual(['description']);
    expect(requiredKeysFromRows(undefined)).toEqual([]);
  });
});

describe('case type colours', () => {
  it('maps tokens to static classes and falls back to slate', () => {
    expect(swatchClass('blue')).toBe('bg-blue-500');
    expect(swatchClass('neon')).toBe('bg-slate-500');
    expect(toCaseTypeColorToken('teal')).toBe('teal');
    expect(toCaseTypeColorToken('fuchsia')).toBe('slate');
  });
});
