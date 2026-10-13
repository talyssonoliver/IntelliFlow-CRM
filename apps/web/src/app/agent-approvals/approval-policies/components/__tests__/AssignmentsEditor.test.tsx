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
  AssignmentsEditor,
  findAssignmentIssues,
  newAssignmentDraft,
  type AssignmentDraft,
} from '../AssignmentsEditor';

const row = (agentKey: string, actionType: string) => newAssignmentDraft({ agentKey, actionType });

describe('findAssignmentIssues', () => {
  it('flags a duplicate pair on the second row as "rows N and M" (AC-004)', () => {
    const issues = findAssignmentIssues([
      row('create_case', 'CREATE'),
      row('update_case', '*'),
      row('create_case', 'CREATE'),
    ]);
    expect(issues).toEqual([
      { index: 2, message: 'Rows 1 and 3 are the same agent and action. Remove one.' },
    ]);
  });

  it('rejects any/any and impossible tool/action pairs', () => {
    expect(findAssignmentIssues([row('*', '*')])[0]!.message).toContain('default policy');
    expect(findAssignmentIssues([row('create_case', 'UPDATE')])[0]!.message).toBe(
      'Row 1: Create case only performs Create actions.'
    );
    expect(findAssignmentIssues([row('create_case', '*'), row('*', 'DRAFT')])).toEqual([]);
  });
});

function Harness({
  initial,
  onRows,
}: Readonly<{ initial: AssignmentDraft[]; onRows?: (r: AssignmentDraft[]) => void }>) {
  const [rows, setRows] = React.useState(initial);
  return (
    <AssignmentsEditor
      scope="AGENT_TOOL"
      rows={rows}
      onChange={(next) => {
        setRows(next);
        onRows?.(next);
      }}
      issues={findAssignmentIssues(rows)}
      maxRows={2}
    />
  );
}

describe('AssignmentsEditor', () => {
  it('adds and removes rows, up to the limit', () => {
    const onRows = vi.fn();
    render(<Harness initial={[]} onRows={onRows} />);
    expect(screen.getByText('No overrides.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Add Override' }));
    expect(screen.getByLabelText('Row 1 agent')).toHaveValue('*');
    fireEvent.click(screen.getByRole('button', { name: 'Add Override' }));
    expect(screen.getByRole('button', { name: 'Add Override' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    expect(onRows).toHaveBeenLastCalledWith([expect.objectContaining({ agentKey: '*' })]);
  });

  it('wires the conflict message to both selects of the offending row', () => {
    render(<Harness initial={[row('create_case', 'CREATE'), row('draft_message', 'DRAFT')]} />);
    fireEvent.change(screen.getByLabelText('Row 2 agent'), { target: { value: 'create_case' } });
    fireEvent.change(screen.getByLabelText('Row 2 action'), { target: { value: 'CREATE' } });

    const message = screen.getByText('Rows 1 and 2 are the same agent and action. Remove one.');
    for (const label of ['Row 2 agent', 'Row 2 action']) {
      const select = screen.getByLabelText(label);
      expect(select).toHaveAttribute('aria-invalid', 'true');
      expect(select).toHaveAttribute('aria-describedby', message.id);
    }
    expect(screen.getByLabelText('Row 1 agent')).not.toHaveAttribute('aria-invalid');
  });

  it('offers the auto-response vocabulary in that queue', () => {
    render(
      <AssignmentsEditor
        scope="AUTO_RESPONSE"
        rows={[row('auto_response', 'FORM_SUBMIT')]}
        onChange={vi.fn()}
        issues={[]}
        maxRows={5}
      />
    );
    expect(screen.getByRole('option', { name: 'Auto-response' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Form submitted' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Create case' })).not.toBeInTheDocument();
  });
});
