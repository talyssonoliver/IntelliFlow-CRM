/**
 * DecisionConfig Tests — IFC-031
 *
 * Regression test: the domain schema `DecisionConditionSchema` expects
 * `{ field, op, value }` objects, not strings. The form must emit objects.
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DecisionConfig } from '../DecisionConfig';

describe('DecisionConfig', () => {
  it('adding a condition emits a structured { field, op, value } object', () => {
    const update = vi.fn();
    render(
      <DecisionConfig
        config={{ type: 'decision', combinator: 'AND', conditions: [] } as never}
        update={update}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /add condition/i }));
    expect(update).toHaveBeenCalledWith({
      conditions: [{ field: '', op: 'eq', value: '' }],
    });
  });

  it('migrates legacy string conditions into the structured shape', () => {
    const update = vi.fn();
    render(
      <DecisionConfig
        config={{ type: 'decision', combinator: 'AND', conditions: ['amount>10'] } as never}
        update={update}
      />
    );
    const fieldInput = screen.getByLabelText('Condition 1 field') as HTMLInputElement;
    // legacy string is surfaced in the `field` column
    expect(fieldInput.value).toBe('amount>10');
  });

  it('edits the field column and emits structured payload', () => {
    const update = vi.fn();
    render(
      <DecisionConfig
        config={
          {
            type: 'decision',
            combinator: 'AND',
            conditions: [{ field: 'priority', op: 'eq', value: 'high' }],
          } as never
        }
        update={update}
      />
    );
    fireEvent.change(screen.getByLabelText('Condition 1 field'), {
      target: { value: 'severity' },
    });
    expect(update).toHaveBeenCalledWith({
      conditions: [{ field: 'severity', op: 'eq', value: 'high' }],
    });
  });

  it('changes the operator via the select', () => {
    const update = vi.fn();
    render(
      <DecisionConfig
        config={
          {
            type: 'decision',
            combinator: 'AND',
            conditions: [{ field: 'priority', op: 'eq', value: 'high' }],
          } as never
        }
        update={update}
      />
    );
    fireEvent.change(screen.getByLabelText('Condition 1 operator'), {
      target: { value: 'ne' },
    });
    expect(update).toHaveBeenCalledWith({
      conditions: [{ field: 'priority', op: 'ne', value: 'high' }],
    });
  });

  it('removes a condition', () => {
    const update = vi.fn();
    render(
      <DecisionConfig
        config={
          {
            type: 'decision',
            combinator: 'AND',
            conditions: [
              { field: 'a', op: 'eq', value: '1' },
              { field: 'b', op: 'eq', value: '2' },
            ],
          } as never
        }
        update={update}
      />
    );
    fireEvent.click(screen.getByLabelText('Remove condition 1'));
    expect(update).toHaveBeenCalledWith({
      conditions: [{ field: 'b', op: 'eq', value: '2' }],
    });
  });
});
