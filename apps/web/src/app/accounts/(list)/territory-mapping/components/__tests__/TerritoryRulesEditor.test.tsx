/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
}));

import {
  TerritoryRulesEditor,
  findRuleIssues,
  newRuleDraft,
  type RuleDraft,
} from '../TerritoryRulesEditor';

describe('findRuleIssues (BR-19)', () => {
  it('reports duplicates at the second row with "Rules N and M"', () => {
    const issues = findRuleIssues([
      newRuleDraft({ country: 'GB', region: 'London' }),
      newRuleDraft({ country: 'US' }),
      newRuleDraft({ country: 'GB', region: ' LONDON ' }),
    ]);
    expect(issues).toEqual([{ index: 2, message: expect.stringContaining('Rules 1 and 3') }]);
  });

  it('treats postcode keys and blank region the same way as the server', () => {
    expect(
      findRuleIssues([
        newRuleDraft({ country: 'GB', postalPrefix: 'SW1A-' }),
        newRuleDraft({ country: 'GB', postalPrefix: 'sw1a' }),
      ])
    ).toHaveLength(1);
    expect(
      findRuleIssues([
        newRuleDraft({ country: 'GB' }),
        newRuleDraft({ country: 'GB', region: ' ' }),
      ])
    ).toHaveLength(1);
  });

  it('flags a rule without a country', () => {
    expect(findRuleIssues([newRuleDraft()])).toEqual([
      { index: 0, message: 'Choose a country for rule 1.' },
    ]);
  });
});

function setup(rules: RuleDraft[], isDefault = false) {
  const onChange = vi.fn();
  render(
    <TerritoryRulesEditor
      rules={rules}
      onChange={onChange}
      issues={findRuleIssues(rules)}
      isDefault={isDefault}
    />
  );
  return onChange;
}

describe('TerritoryRulesEditor', () => {
  it('renders a labelled fieldset with per-row labels', () => {
    setup([newRuleDraft({ country: 'GB' })]);
    expect(screen.getByRole('group', { name: 'Rules' })).toBeDefined();
    expect(screen.getByLabelText('Rule 1 country')).toBeDefined();
    expect(screen.getByLabelText('Rule 1 region')).toBeDefined();
    expect(screen.getByLabelText('Rule 1 postcode prefix')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Remove rule 1' })).toBeDefined();
  });

  it('edits, adds and removes rows', () => {
    const rules = [newRuleDraft({ country: 'GB' }), newRuleDraft({ country: 'US' })];
    const onChange = setup(rules);
    fireEvent.change(screen.getByLabelText('Rule 1 region'), { target: { value: 'London' } });
    expect(onChange.mock.calls[0][0][0]).toMatchObject({ region: 'London' });
    fireEvent.change(screen.getByLabelText('Rule 2 postcode prefix'), {
      target: { value: '941' },
    });
    expect(onChange.mock.calls[1][0][1]).toMatchObject({ postalPrefix: '941' });
    fireEvent.change(screen.getByLabelText('Rule 2 country'), { target: { value: 'CA' } });
    expect(onChange.mock.calls[2][0][1]).toMatchObject({ country: 'CA' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    expect(onChange.mock.calls[3][0]).toEqual([rules[1]]);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    expect(onChange.mock.calls[4][0]).toHaveLength(3);
  });

  it('wires duplicate errors with aria-invalid and aria-describedby', () => {
    setup([newRuleDraft({ country: 'GB' }), newRuleDraft({ country: 'GB' })]);
    const region = screen.getByLabelText('Rule 2 region');
    expect(region.getAttribute('aria-invalid')).toBe('true');
    const errorId = region.getAttribute('aria-describedby')!;
    expect(document.getElementById(errorId)?.textContent).toContain('Rules 1 and 2');
    expect(screen.getByLabelText('Rule 1 region').getAttribute('aria-invalid')).toBeNull();
  });

  it('explains empty rules for default and non-default territories', () => {
    setup([], true);
    expect(screen.getByText('No rules — used as the fallback only.')).toBeDefined();
  });

  it('asks for a rule on a non-default territory', () => {
    setup([]);
    expect(screen.getByText('Add at least one rule.')).toBeDefined();
  });
});
