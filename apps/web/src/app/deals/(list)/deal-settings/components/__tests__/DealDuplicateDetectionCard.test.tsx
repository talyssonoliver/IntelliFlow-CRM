import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  DealDuplicateDetectionCard,
  type DealDuplicateRuleRow,
} from '../DealDuplicateDetectionCard';

const rules: DealDuplicateRuleRow[] = [
  { field: 'name_account', matchStrategy: 'exact', threshold: 100, isActive: true, sortOrder: 0 },
  {
    field: 'name_amount_stage',
    matchStrategy: 'fuzzy',
    threshold: 85,
    isActive: false,
    sortOrder: 1,
  },
];

// All 9 possible (field, matchStrategy) combinations — used to test capacity guard.
const ALL_FIELDS = ['name_account', 'name_amount_stage', 'expected_close'] as const;
const ALL_STRATEGIES = ['exact', 'normalized', 'fuzzy'] as const;

function allNineRules(): DealDuplicateRuleRow[] {
  const rows: DealDuplicateRuleRow[] = [];
  let order = 0;
  for (const field of ALL_FIELDS) {
    for (const matchStrategy of ALL_STRATEGIES) {
      rows.push({ field, matchStrategy, threshold: 100, isActive: true, sortOrder: order++ });
    }
  }
  return rows;
}

describe('DealDuplicateDetectionCard', () => {
  it('renders empty state with Add Rule CTA', () => {
    render(<DealDuplicateDetectionCard rules={[]} onRulesChange={vi.fn()} />);
    expect(screen.getByText(/no rules yet/i)).toBeDefined();
    expect(screen.getByRole('button', { name: 'Add Rule' })).toBeDefined();
  });

  it('renders rule rows with field and strategy', () => {
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={vi.fn()} />);
    expect(screen.getByText('Name + account')).toBeDefined();
    expect(screen.getByText('Name + amount + stage')).toBeDefined();
  });

  it('adds a new rule when Add Rule is clicked', () => {
    const onChange = vi.fn();
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];
    expect(next.length).toBe(3);
  });

  it('shows threshold input only for fuzzy rules', () => {
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={vi.fn()} />);
    const thresholds = screen.queryAllByLabelText(/threshold/i);
    expect(thresholds.length).toBe(1);
  });

  it('removes a rule', () => {
    const onChange = vi.fn();
    render(<DealDuplicateDetectionCard rules={rules} onRulesChange={onChange} />);
    fireEvent.click(screen.getAllByRole('button', { name: /remove/i })[0]);
    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];
    expect(next.length).toBe(1);
  });

  // --- New tests covering add-dedup, collision-disable, and capacity guard ---

  it('add() never inserts a duplicate (field, matchStrategy) combo', () => {
    // Start with 2 rules that share the same field; click Add Rule and verify
    // every (field, matchStrategy) pair in the resulting list is unique.
    const onChange = vi.fn();
    const startRules: DealDuplicateRuleRow[] = [
      {
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      },
      {
        field: 'name_account',
        matchStrategy: 'normalized',
        threshold: 100,
        isActive: true,
        sortOrder: 1,
      },
    ];

    render(<DealDuplicateDetectionCard rules={startRules} onRulesChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];

    // The newly added rule must not collide with any existing rule.
    const combosAfter = next.map((r) => `${r.field}|${r.matchStrategy}`);
    const uniqueCombos = new Set(combosAfter);
    expect(uniqueCombos.size).toBe(combosAfter.length);
  });

  it('add() picks the first unused combo in field-then-strategy order', () => {
    // name_account|exact and name_account|normalized are taken;
    // add() should pick name_account|fuzzy (first still-free slot).
    const onChange = vi.fn();
    const startRules: DealDuplicateRuleRow[] = [
      {
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      },
      {
        field: 'name_account',
        matchStrategy: 'normalized',
        threshold: 100,
        isActive: true,
        sortOrder: 1,
      },
    ];

    render(<DealDuplicateDetectionCard rules={startRules} onRulesChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));

    const next = onChange.mock.calls[0][0] as DealDuplicateRuleRow[];
    const added = next[next.length - 1];
    expect(added.field).toBe('name_account');
    expect(added.matchStrategy).toBe('fuzzy');
  });

  it('a strategy SelectItem that would collide is marked aria-disabled in the open dropdown', () => {
    // Row 0: name_account|exact.  Row 1: name_account|normalized.
    // When row 1's strategy selector is opened, the "Exact" option would
    // produce name_account|exact — which row 0 already uses — so it must be
    // disabled.  Radix Select marks disabled options with aria-disabled="true".
    const collisionRules: DealDuplicateRuleRow[] = [
      {
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      },
      {
        field: 'name_account',
        matchStrategy: 'normalized',
        threshold: 100,
        isActive: true,
        sortOrder: 1,
      },
    ];

    render(<DealDuplicateDetectionCard rules={collisionRules} onRulesChange={vi.fn()} />);

    // There are 4 comboboxes: row0-field(0), row0-strategy(1), row1-field(2), row1-strategy(3).
    const comboboxes = screen.getAllByRole('combobox');
    // Open row 1's strategy selector.
    fireEvent.click(comboboxes[3]);

    // Radix renders options as role="option" inside the open listbox.
    const options = screen.getAllByRole('option');
    const exactOption = options.find((o) => o.textContent === 'Exact');

    // isComboTaken(1, 'name_account', 'exact') → true (row 0 has name_account|exact)
    // Radix propagates disabled={true} as aria-disabled="true" on the option element.
    expect(exactOption).toBeDefined();
    expect(exactOption?.getAttribute('aria-disabled')).toBe('true');
  });

  it('non-colliding strategy options in the open dropdown are NOT aria-disabled', () => {
    // Same setup as above: row 1 is name_account|normalized.
    // "Fuzzy" does not collide with any existing rule → must NOT be disabled.
    const collisionRules: DealDuplicateRuleRow[] = [
      {
        field: 'name_account',
        matchStrategy: 'exact',
        threshold: 100,
        isActive: true,
        sortOrder: 0,
      },
      {
        field: 'name_account',
        matchStrategy: 'normalized',
        threshold: 100,
        isActive: true,
        sortOrder: 1,
      },
    ];

    render(<DealDuplicateDetectionCard rules={collisionRules} onRulesChange={vi.fn()} />);

    const comboboxes = screen.getAllByRole('combobox');
    fireEvent.click(comboboxes[3]); // open row 1 strategy selector

    const options = screen.getAllByRole('option');
    const fuzzyOption = options.find((o) => o.textContent === 'Fuzzy');

    expect(fuzzyOption).toBeDefined();
    expect(fuzzyOption?.getAttribute('aria-disabled')).toBeNull();
  });

  it('Add Rule button is disabled when all 9 (field, matchStrategy) combos are present', () => {
    render(<DealDuplicateDetectionCard rules={allNineRules()} onRulesChange={vi.fn()} />);
    const addBtn = screen.getByRole('button', { name: 'Add Rule' });
    expect(addBtn).toHaveProperty('disabled', true);
  });

  it('Add Rule button is NOT disabled when fewer than 9 combos are present', () => {
    // 8 combos — one slot still free.
    const eightRules = allNineRules().slice(0, 8);
    render(<DealDuplicateDetectionCard rules={eightRules} onRulesChange={vi.fn()} />);
    const addBtn = screen.getByRole('button', { name: 'Add Rule' });
    expect(addBtn).toHaveProperty('disabled', false);
  });

  it('add() does nothing (no onChange call) when all 9 combos are present', () => {
    // Even if the button were clicked programmatically, add() has an early return.
    const onChange = vi.fn();
    render(<DealDuplicateDetectionCard rules={allNineRules()} onRulesChange={onChange} />);
    // Directly simulate a click — the component's add() guard must protect
    // against adding a rule even when the button DOM state is disabled.
    const addBtn = screen.getByRole('button', { name: 'Add Rule' });
    fireEvent.click(addBtn);
    // onChange should NOT have been called because add() returns early.
    expect(onChange).not.toHaveBeenCalled();
  });
});
