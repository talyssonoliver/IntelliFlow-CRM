/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PolicyCard } from '../PolicyCard';
import { policyRow } from './fixtures';

const handlers = () => ({ onEdit: vi.fn(), onDelete: vi.fn(), onSetDefault: vi.fn() });

describe('PolicyCard', () => {
  it('shows the name as text beside the colour, the default badge and the rule summary', () => {
    render(
      <PolicyCard
        policy={policyRow({ description: 'Most items' })}
        canManage={false}
        isBusy={false}
        {...handlers()}
      />
    );
    const card = screen.getByRole('article', { name: 'Standard policy' });
    expect(card).toHaveTextContent('Standard');
    expect(card.querySelector('.bg-blue-500')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Most items')).toBeInTheDocument();
    expect(screen.getByText('1 h')).toBeInTheDocument();
    expect(screen.getByText('Any user with approval access')).toBeInTheDocument();
    expect(screen.getAllByText('Off')).toHaveLength(2);
    expect(screen.getByText('Everything not routed to another policy')).toBeInTheDocument();
  });

  it('summarises auto-approve, escalation and overrides', () => {
    render(
      <PolicyCard
        policy={policyRow({
          isDefault: false,
          colorToken: 'unknown',
          minReviewerRole: 'MANAGER',
          autoApproveEnabled: true,
          autoApproveMinConfidence: 95,
          escalationEnabled: true,
          escalateAfterMinutes: 30,
          escalationTargetUserId: 'u1',
          escalationTarget: { id: 'u1', name: 'Ada' },
          assignments: [{ agentKey: 'create_case', actionType: 'CREATE' }],
        })}
        canManage={false}
        isBusy={false}
        {...handlers()}
      />
    );
    expect(screen.queryByText('Default')).not.toBeInTheDocument();
    expect(screen.getByText('Above 95% confidence')).toBeInTheDocument();
    expect(screen.getByText('To Ada after 30 min')).toBeInTheDocument();
    expect(screen.getByText('Create case · Create')).toBeInTheDocument();
    expect(screen.getByText('Manager or above')).toBeInTheDocument();
    expect(screen.getByRole('article').querySelector('.bg-slate-500')).not.toBeNull();
  });

  it('warns when the escalation target was deleted (AC-018)', () => {
    render(
      <PolicyCard
        policy={policyRow({ escalationEnabled: true, escalateAfterMinutes: 30, isDefault: false })}
        canManage={false}
        isBusy={false}
        {...handlers()}
      />
    );
    expect(screen.getByText('Inactive: target was a former user')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(
      'Escalation is inactive until a new target is chosen.'
    );
    expect(screen.getByText('Nothing yet (no overrides)')).toBeInTheDocument();
  });

  it('says "a former user" when only the target id survives', () => {
    render(
      <PolicyCard
        policy={policyRow({
          escalationEnabled: true,
          escalateAfterMinutes: null,
          escalationTargetUserId: 'u9',
        })}
        canManage={false}
        isBusy={false}
        {...handlers()}
      />
    );
    expect(screen.getByText('To a former user')).toBeInTheDocument();
  });

  it('hides every mutation control from readers (AC-019)', () => {
    render(
      <PolicyCard
        policy={policyRow({ isDefault: false })}
        canManage={false}
        isBusy={false}
        {...handlers()}
      />
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('lets admins edit, delete and make a policy the default', () => {
    const h = handlers();
    const policy = policyRow({ isDefault: false });
    render(<PolicyCard policy={policy} canManage isBusy={false} {...h} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Standard' }));
    fireEvent.click(screen.getByRole('button', { name: 'Make Default: Standard' }));
    expect(h.onEdit).toHaveBeenCalledWith(policy);
    expect(h.onDelete).toHaveBeenCalledWith(policy);
    expect(h.onSetDefault).toHaveBeenCalledWith(policy);
  });

  it('offers no Make Default on the default policy and disables actions while busy', () => {
    render(<PolicyCard policy={policyRow()} canManage isBusy {...handlers()} />);
    expect(screen.queryByRole('button', { name: /Make Default/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Standard' })).toBeDisabled();
  });
});
