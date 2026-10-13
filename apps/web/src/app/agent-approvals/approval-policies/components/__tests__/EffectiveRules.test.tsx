/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EffectiveRules, type EffectiveRuleRow } from '../EffectiveRules';

const rows: EffectiveRuleRow[] = [
  {
    agentKey: 'create_case',
    actionType: 'CREATE',
    policyId: 'p1',
    policyName: 'Fast lane',
    colorToken: 'green',
    rule: { timeoutMinutes: 15 },
  },
  {
    agentKey: 'draft_message',
    actionType: 'DRAFT',
    policyId: null,
    policyName: null,
    colorToken: null,
    rule: { timeoutMinutes: 30 },
  },
];

describe('EffectiveRules', () => {
  it('shows a skeleton while loading', () => {
    render(
      <EffectiveRules
        label="Agent rules"
        rows={undefined}
        isLoading
        error={null}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent('Loading Agent rules…');
  });

  it('shows the error with a Retry', () => {
    const onRetry = vi.fn();
    render(
      <EffectiveRules
        label="Agent rules"
        rows={undefined}
        isLoading={false}
        error={{ message: 'boom' }}
        onRetry={onRetry}
      />
    );
    expect(screen.getByText('Could not load the effective rules: boom')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('treats missing data without an error as a failure too', () => {
    render(
      <EffectiveRules label="x" rows={undefined} isLoading={false} error={null} onRetry={vi.fn()} />
    );
    expect(screen.getByText('Could not load the effective rules.')).toBeInTheDocument();
  });

  it('lists each agent/action with its policy chip or the built-in default', () => {
    render(
      <EffectiveRules
        label="Agent rules"
        rows={rows}
        isLoading={false}
        error={null}
        onRetry={vi.fn()}
      />
    );
    expect(screen.getByRole('table', { name: 'Agent rules' })).toBeInTheDocument();
    expect(screen.getByText('Create case · Create')).toBeInTheDocument();
    expect(screen.getByText('Fast lane')).toBeInTheDocument();
    expect(screen.getByText('Built-in default')).toBeInTheDocument();
    expect(screen.getByText('15 min')).toBeInTheDocument();
  });
});
