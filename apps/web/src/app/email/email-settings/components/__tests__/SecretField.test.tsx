/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { SecretField, secretInput, type SecretChange } from '../SecretField';

function Harness(props: {
  hasStored: boolean;
  initial?: SecretChange;
  error?: string;
  allowRemove?: boolean;
}) {
  const [value, setValue] = React.useState<SecretChange>(props.initial ?? { mode: 'keep' });
  return (
    <>
      <SecretField
        id="smtp-password"
        label="Password"
        hasStored={props.hasStored}
        value={value}
        onChange={setValue}
        error={props.error}
        allowRemove={props.allowRemove}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </>
  );
}

const current = () => JSON.parse(screen.getByTestId('value').textContent ?? '{}');

describe('SecretField', () => {
  it('asks for a new password when none is stored', () => {
    render(<Harness hasStored={false} />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('type', 'password');
    expect(input).toHaveAttribute('autocomplete', 'new-password');
    fireEvent.change(input, { target: { value: 'typed-now' } });
    expect(current()).toEqual({ mode: 'replace', value: 'typed-now' });
  });

  it('shows a stored password only as "saved" — the value is never in the DOM', () => {
    const { container } = render(<Harness hasStored />);
    expect(screen.getByText('A password is saved. It is never shown.')).toBeInTheDocument();
    expect(container.querySelector('input')).toBeNull();
  });

  it('replaces, keeps and removes a stored password', () => {
    render(<Harness hasStored allowRemove />);
    fireEvent.click(screen.getByRole('button', { name: 'Replace password' }));
    expect(current()).toEqual({ mode: 'replace', value: '' });
    expect(screen.getByLabelText('Password')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Keep saved password' }));
    expect(current()).toEqual({ mode: 'keep' });

    fireEvent.click(screen.getByRole('button', { name: 'Remove password' }));
    expect(current()).toEqual({ mode: 'remove' });
    expect(
      screen.getByText('The saved password will be removed when you save.')
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(current()).toEqual({ mode: 'keep' });
  });

  it('offers removal only when allowed', () => {
    render(<Harness hasStored />);
    expect(screen.queryByRole('button', { name: 'Remove password' })).not.toBeInTheDocument();
  });

  it('links an error to the input', () => {
    render(<Harness hasStored={false} error="Enter the mailbox password." />);
    const input = screen.getByLabelText('Password');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter the mailbox password.');
  });

  it('links an error to the Replace button while the stored password is kept', () => {
    render(<Harness hasStored error="Re-enter the password." />);
    expect(screen.getByRole('button', { name: 'Replace password' })).toHaveAccessibleDescription(
      /Re-enter the password\./
    );
  });

  it('has no axe violations in each state', async () => {
    for (const props of [
      { hasStored: false },
      { hasStored: true, allowRemove: true },
      { hasStored: true, initial: { mode: 'remove' } as SecretChange },
    ]) {
      const { container, unmount } = render(<Harness {...props} />);
      const results = await axe.run(container);
      expect(results.violations).toEqual([]);
      unmount();
    }
  });
});

describe('secretInput', () => {
  it('maps the field state to the API tri-state (absent keep, null clear, string set)', () => {
    expect(secretInput({ mode: 'keep' })).toBeUndefined();
    expect(secretInput({ mode: 'remove' })).toBeNull();
    expect(secretInput({ mode: 'replace', value: 'abc' })).toBe('abc');
    expect(secretInput({ mode: 'replace', value: '' })).toBeUndefined();
  });

  it('does not call onChange on render', () => {
    const onChange = vi.fn();
    render(<SecretField id="x" label="X" hasStored value={{ mode: 'keep' }} onChange={onChange} />);
    expect(onChange).not.toHaveBeenCalled();
  });
});
