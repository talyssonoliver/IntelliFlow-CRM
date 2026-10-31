/**
 * @vitest-environment jsdom
 *
 * VariablePicker — shared token picker (workflow builder; PG-208 task automation).
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { VariablePicker, variablesForEntityKind } from '../variable-picker';

describe('VariablePicker', () => {
  it('keeps the workflow-builder texts by default', () => {
    render(<VariablePicker value="" onChange={vi.fn()} variables={[]} ariaLabel="Title" />);
    expect(
      screen.getByText("Substituted at run time with the trigger entity's fields.")
    ).toBeTruthy();
    expect(screen.getByText(/pick a trigger entity on the Start node first/)).toBeTruthy();
    const input = screen.getByLabelText('Title');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(input.getAttribute('id')).toBeNull();
  });

  it('wires id, maxLength, invalid and describedBy, and custom help texts', () => {
    render(
      <VariablePicker
        id="rule-title"
        value=""
        onChange={vi.fn()}
        variables={[]}
        maxLength={200}
        invalid
        describedBy="rule-title-error"
        helpText="Filled in when the rule runs."
        emptyText="This trigger has no variables."
      />
    );
    const input = document.getElementById('rule-title') as HTMLInputElement;
    expect(input.maxLength).toBe(200);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('rule-title-error');
    expect(screen.getByText('Filled in when the rule runs.')).toBeTruthy();
    expect(screen.getByText('This trigger has no variables.')).toBeTruthy();
  });

  it('inserts a token at the end and in a multi-line field', () => {
    const onChange = vi.fn();
    const variables = [{ path: 'record.name', description: 'Record name' }];
    const { rerender } = render(
      <VariablePicker value="Call " onChange={onChange} variables={variables} ariaLabel="Title" />
    );
    fireEvent.click(screen.getByText('{{record.name}}'));
    expect(onChange).toHaveBeenCalledWith('Call {{record.name}}');
    expect(screen.getByText('Record name')).toBeTruthy();

    rerender(
      <VariablePicker
        value="Hi"
        onChange={onChange}
        variables={variables}
        multiline
        ariaLabel="Body"
        disabled
      />
    );
    const textarea = screen.getByLabelText('Body') as HTMLTextAreaElement;
    expect(textarea.tagName).toBe('TEXTAREA');
    expect(textarea.disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Insert variable' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    expect(onChange).toHaveBeenCalledWith('Hello');
  });

  it('derives default variables for a trigger entity kind', () => {
    expect(variablesForEntityKind('lead').some((v) => v.path === 'trigger.lead.email')).toBe(true);
  });
});
