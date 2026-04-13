/**
 * config-forms registry dispatch — IFC-031 FU-008
 *
 * Verifies every canonical node type has a registered form component
 * and that `getConfigForm()` returns the right one.
 */

import { describe, it, expect } from 'vitest';
import { getConfigForm, getRegisteredNodeTypes } from '../index';
import { StartConfig } from '../StartConfig';
import { ActionConfig } from '../ActionConfig';
import { DecisionConfig } from '../DecisionConfig';
import { HumanConfig } from '../HumanConfig';
import { EndConfig } from '../EndConfig';

describe('config-forms registry', () => {
  it('registers exactly the five canonical node types', () => {
    const types = getRegisteredNodeTypes().sort();
    expect(types).toEqual(['action', 'decision', 'end', 'human', 'start']);
  });

  it.each([
    ['start', StartConfig],
    ['action', ActionConfig],
    ['decision', DecisionConfig],
    ['human', HumanConfig],
    ['end', EndConfig],
  ] as const)('dispatches %s to %s', (type, Expected) => {
    expect(getConfigForm(type)).toBe(Expected);
  });

  it('returns null for unknown types', () => {
    // @ts-expect-error — intentionally invalid type for test
    expect(getConfigForm('nonexistent')).toBeNull();
  });
});
