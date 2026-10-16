/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  ConfirmationDialog: (props: {
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    onOpenChange: (open: boolean) => void;
  }) =>
    props.open ? (
      <div role="alertdialog" aria-label={props.title}>
        <p>{props.description}</p>
        <button onClick={() => props.onConfirm()}>{props.confirmLabel}</button>
        <button onClick={() => props.onOpenChange(false)}>Cancel confirmation</button>
      </div>
    ) : null,
}));

import {
  PolicyDialog,
  draftFromPolicy,
  findFieldErrors,
  toSaveInput,
  type PolicyDialogProps,
} from '../PolicyDialog';
import { LIMITS, policyRow } from './fixtures';

function setup(overrides: Partial<PolicyDialogProps> = {}) {
  const props: PolicyDialogProps = {
    open: true,
    scope: 'AGENT_TOOL',
    policy: null,
    makeDefault: false,
    defaultTimeoutMinutes: 30,
    otherNames: ['Existing'],
    limits: LIMITS,
    members: [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Grace' },
    ],
    isSaving: false,
    onSave: vi.fn().mockResolvedValue(policyRow({ name: 'Saved' })),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<PolicyDialog {...props} />);
  return props;
}

const save = () => screen.getByRole('button', { name: 'Save' });
const type = (label: string | RegExp, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('PolicyDialog', () => {
  it('starts a new policy from the built-in timeout with auto-approve and escalation off', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'New Policy' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Approval timeout \(minutes\)/)).toHaveValue('30');
    expect(screen.getByLabelText('Auto-approve high-confidence items')).not.toBeChecked();
    expect(screen.getByLabelText('Escalate when nobody decides')).not.toBeChecked();
    expect(screen.queryByLabelText('Confidence threshold (%)')).not.toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('enables Save only for a dirty, conflict-free draft (playbook §3)', async () => {
    const props = setup();
    type(/^Name/, 'Existing');
    expect(
      screen.getByText('A policy named “Existing” already exists for this queue.')
    ).toHaveAttribute('id', 'policy-name-error');
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true');
    expect(save()).toBeDisabled();

    type(/^Name/, 'Fast lane');
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fast lane', scope: 'AGENT_TOOL', isDefault: false })
    );
  });

  it('keeps the dialog open and announces the failure inside it (WCAG 4.1.3)', async () => {
    const props = setup({ onSave: vi.fn().mockRejectedValue(new Error('Name taken')) });
    type(/^Name/, 'Fast lane');
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save the policy: Name taken'
    );
    expect(props.onClose).not.toHaveBeenCalled();

    (props.onSave as ReturnType<typeof vi.fn>).mockRejectedValueOnce('odd');
    fireEvent.click(save());
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Please try again.'));
  });

  it('shows "Enter a name." only after the field is visited, and explains a blocked Save', () => {
    setup();
    expect(screen.queryByText('Enter a name.')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-required', 'true');
    fireEvent.blur(screen.getByLabelText(/^Name/));
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();

    type(/^Approval timeout/, '2');
    expect(save()).toHaveAttribute('aria-describedby', 'policy-save-hint');
    expect(screen.getByText('Fix the highlighted fields to save.')).toBeInTheDocument();
  });

  it('reveals the empty-name error as soon as another field changes', () => {
    setup();
    type(/^Approval timeout/, '45');
    expect(screen.getByText('Enter a name.')).toBeInTheDocument();
    expect(screen.getByText('Fix the highlighted fields to save.')).toBeInTheDocument();
  });

  it('asks before turning auto-approval on, and cancelling leaves it off (AC-020)', () => {
    setup();
    fireEvent.click(screen.getByLabelText('Auto-approve high-confidence items'));
    // The mock renders beside the open Radix dialog, which aria-hides its siblings.
    const confirm = screen.getByRole('alertdialog', {
      name: 'Turn on auto-approval?',
      hidden: true,
    });
    expect(confirm).toHaveTextContent('will execute without a human review');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel confirmation', hidden: true }));
    expect(screen.getByLabelText('Auto-approve high-confidence items')).not.toBeChecked();
    expect(screen.queryByLabelText('Confidence threshold (%)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Auto-approve high-confidence items'));
    fireEvent.click(screen.getByRole('button', { name: 'Turn On', hidden: true }));
    expect(screen.getByLabelText('Auto-approve high-confidence items')).toBeChecked();
    expect(screen.getByLabelText('Confidence threshold (%)')).toHaveValue('95');

    type('Confidence threshold (%)', '80');
    expect(screen.getByText('Enter a whole percent from 90 to 99.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confidence threshold (%)')).toHaveAttribute(
      'aria-invalid',
      'true'
    );

    fireEvent.click(screen.getByLabelText('Auto-approve high-confidence items'));
    expect(screen.queryByLabelText('Confidence threshold (%)')).not.toBeInTheDocument();
  });

  it('validates the escalation delay against the timeout and requires a target', () => {
    setup();
    type(/^Name/, 'Escalating');
    fireEvent.click(screen.getByLabelText('Escalate when nobody decides'));
    expect(screen.getByText('Enter at least 5 minutes.')).toBeInTheDocument();
    expect(screen.getByText('Choose who receives escalations.')).toBeInTheDocument();
    expect(save()).toBeDisabled();

    type('Escalate after (minutes)', '30');
    expect(screen.getByText('Escalate before the approval times out.')).toBeInTheDocument();
    type('Escalate after (minutes)', '20');
    fireEvent.change(screen.getByLabelText('Escalate to'), { target: { value: 'u2' } });
    expect(screen.queryByText('Choose who receives escalations.')).not.toBeInTheDocument();
    expect(save()).toBeEnabled();
  });

  it('rejects an out-of-range timeout', () => {
    setup();
    type(/^Approval timeout \(minutes\)/, '2');
    expect(screen.getByText('Enter whole minutes from 5 to 10080 (7 d).')).toBeInTheDocument();
    type(/^Approval timeout \(minutes\)/, '1440');
    expect(screen.getByText('Undecided actions expire after 1 d.')).toBeInTheDocument();
  });

  it('shows "(former user)" and an inline warning when the target was deleted (AC-018)', () => {
    setup({
      policy: policyRow({ escalationEnabled: true, escalateAfterMinutes: 20 }),
    });
    expect(screen.getByRole('note')).toHaveTextContent(
      'The escalation target (former user) no longer exists.'
    );
    expect(screen.getByRole('option', { name: '(former user)' })).toBeInTheDocument();
    expect(save()).toBeDisabled();
  });

  it('lists a stored target who is no longer an assignee by name', () => {
    setup({
      policy: policyRow({
        escalationEnabled: true,
        escalateAfterMinutes: 20,
        escalationTargetUserId: 'u9',
        escalationTarget: { id: 'u9', name: 'Linus' },
      }),
    });
    expect(screen.getByLabelText('Escalate to')).toHaveValue('u9');
    expect(screen.getByRole('option', { name: 'Linus' })).toBeInTheDocument();
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('edits an existing policy and blocks Save on a duplicate override', () => {
    setup({
      policy: policyRow({
        name: 'Edit me',
        assignments: [{ agentKey: 'create_case', actionType: 'CREATE' }],
      }),
    });
    expect(screen.getByRole('heading', { name: 'Edit Edit me' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add Override' }));
    fireEvent.change(screen.getByLabelText('Row 2 agent'), { target: { value: 'create_case' } });
    fireEvent.change(screen.getByLabelText('Row 2 action'), { target: { value: 'CREATE' } });
    expect(save()).toBeDisabled();
  });

  it('changes the colour, role and description', () => {
    const props = setup({ makeDefault: true });
    expect(screen.getByText(/This is the default policy for the queue\./)).toBeInTheDocument();
    type(/^Name/, 'Coloured');
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'rose' } });
    fireEvent.change(screen.getByLabelText('Minimum reviewer'), { target: { value: 'MANAGER' } });
    type('Description (optional)', '  Senior review  ');
    fireEvent.click(save());
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        colorToken: 'rose',
        minReviewerRole: 'MANAGER',
        description: 'Senior review',
        isDefault: true,
      })
    );
  });

  it('closes on Cancel', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe('PolicyDialog helpers', () => {
  it('round-trips a policy through the draft into the save payload', () => {
    const policy = policyRow({
      description: 'd',
      autoApproveEnabled: true,
      autoApproveMinConfidence: 97,
      escalationEnabled: true,
      escalateAfterMinutes: 15,
      escalationTargetUserId: 'u1',
      assignments: [{ agentKey: '*', actionType: 'UPDATE' }],
    });
    expect(toSaveInput(draftFromPolicy(policy, 30), 'AGENT_TOOL', true)).toEqual({
      name: 'Standard',
      description: 'd',
      colorToken: 'blue',
      scope: 'AGENT_TOOL',
      isDefault: true,
      timeoutMinutes: 60,
      minReviewerRole: 'USER',
      autoApproveEnabled: true,
      autoApproveMinConfidence: 97,
      escalationEnabled: true,
      escalateAfterMinutes: 15,
      escalationTargetUserId: 'u1',
      assignments: [{ agentKey: '*', actionType: 'UPDATE' }],
    });
  });

  it('drops threshold and escalation values while those switches are off', () => {
    const draft = {
      ...draftFromPolicy(null, 30),
      name: 'x',
      autoApproveMinConfidence: '95',
      escalateAfterMinutes: '10',
      escalationTargetUserId: 'u1',
      timeoutMinutes: 'abc',
    };
    expect(toSaveInput(draft, 'AUTO_RESPONSE', false)).toMatchObject({
      timeoutMinutes: 0,
      autoApproveMinConfidence: null,
      escalateAfterMinutes: null,
      escalationTargetUserId: null,
      description: undefined,
    });
    expect(findFieldErrors(draft, LIMITS, []).timeout).toBeDefined();
  });

  it('reports an empty name', () => {
    expect(findFieldErrors(draftFromPolicy(null, 30), LIMITS, []).name).toBe('Enter a name.');
  });
});
