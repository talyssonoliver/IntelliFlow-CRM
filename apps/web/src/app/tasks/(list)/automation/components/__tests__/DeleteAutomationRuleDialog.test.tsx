/**
 * @vitest-environment jsdom
 *
 * DeleteAutomationRuleDialog — PG-208: copy, refusal kept in the dialog, focus
 * moves to the Rules heading when it closes (the row is gone).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { DeleteAutomationRuleDialog } from '../DeleteAutomationRuleDialog';

describe('DeleteAutomationRuleDialog', () => {
  it('confirms, shows a refusal, and focuses the heading on close', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { rerender } = render(
      <>
        <h2 id="rules-heading" tabIndex={-1}>
          Rules
        </h2>
        <DeleteAutomationRuleDialog
          name="Call new leads"
          isDeleting={false}
          error="Rule not found."
          onConfirm={onConfirm}
          onCancel={onCancel}
          focusTargetId="rules-heading"
          deleted={false}
        />
      </>
    );
    expect(screen.getByText('Delete Call new leads?')).toBeInTheDocument();
    expect(screen.getByText(/Tasks it already created are kept/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Rule not found.');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalled();

    rerender(
      <>
        <h2 id="rules-heading" tabIndex={-1}>
          Rules
        </h2>
        <DeleteAutomationRuleDialog
          name={null}
          isDeleting={false}
          error={null}
          onConfirm={onConfirm}
          onCancel={onCancel}
          focusTargetId="rules-heading"
          deleted
        />
      </>
    );
    await waitFor(() => expect(document.activeElement?.id).toBe('rules-heading'));
  });
});
