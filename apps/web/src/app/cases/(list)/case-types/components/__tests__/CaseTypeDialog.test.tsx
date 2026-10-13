/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';
import type { CaseTypeDto } from '@intelliflow/validators';
import {
  CaseTypeDialog,
  draftFromCaseType,
  findChecklistErrors,
  parseSlaDays,
  toSaveInput,
} from '../CaseTypeDialog';
import { newChecklistItem } from '../ResolutionChecklistEditor';

// Radix Select needs pointer capture APIs jsdom lacks; the shared PrioritySelect is covered elsewhere.
vi.mock('@/components/shared/priority-select', () => ({
  PrioritySelect: (props: {
    value?: string;
    onChange: (next: string | undefined) => void;
    ariaLabel: string;
  }) => (
    <select
      aria-label={props.ariaLabel}
      value={props.value ?? ''}
      onChange={(e) => props.onChange(e.target.value || undefined)}
    >
      <option value="">Case Settings default</option>
      <option value="HIGH">High</option>
    </select>
  ),
}));

const LITIGATION: CaseTypeDto = {
  id: 't1',
  name: 'Litigation',
  category: 'Disputes',
  colorToken: 'blue',
  defaultPriority: 'HIGH',
  defaultSlaDays: 14,
  requiredFields: ['jurisdiction'],
  isActive: true,
  isDefault: false,
  checklist: [{ id: 'i1', title: 'Conflict check', sortOrder: 0 }],
  caseCount: 0,
};

function renderDialog(props: Partial<React.ComponentProps<typeof CaseTypeDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  const utils = render(
    <CaseTypeDialog
      open
      caseType={null}
      existing={[{ id: 't1', name: 'Litigation' }]}
      isSaving={false}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />
  );
  return { ...utils, onSave, onClose };
}

const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

describe('CaseTypeDialog helpers', () => {
  it('parses SLA days', () => {
    expect(parseSlaDays('')).toBeNull();
    expect(parseSlaDays(' 14 ')).toBe(14);
    expect(parseSlaDays('0')).toBe('invalid');
    expect(parseSlaDays('3651')).toBe('invalid');
    expect(parseSlaDays('1.5')).toBe('invalid');
    expect(parseSlaDays('abc')).toBe('invalid');
  });

  it('flags case-insensitive duplicate steps and ignores blank ones', () => {
    expect(
      findChecklistErrors([newChecklistItem('A'), newChecklistItem(' '), newChecklistItem('a')])
    ).toEqual({ 2: 'Same as step 1.' });
  });

  it('drops blank steps from the save payload', () => {
    const draft = draftFromCaseType(null);
    expect(
      toSaveInput({ ...draft, checklist: [newChecklistItem(' '), newChecklistItem(' Filing ')] })
        .checklist
    ).toEqual([{ title: 'Filing' }]);
  });

  it('round-trips a type into a save payload and normalises a legacy colour', () => {
    const draft = draftFromCaseType({ ...LITIGATION, colorToken: 'fuchsia', category: null });
    expect(draft.colorToken).toBe('slate');
    expect(draft.category).toBe('');
    expect(toSaveInput(draft)).toEqual({
      name: 'Litigation',
      category: null,
      colorToken: 'slate',
      defaultPriority: 'HIGH',
      defaultSlaDays: 14,
      requiredFields: ['jurisdiction'],
      checklist: [{ title: 'Conflict check' }],
      isActive: true,
    });
    expect(toSaveInput({ ...draft, slaDays: 'x' }).defaultSlaDays).toBeNull();
    expect(draftFromCaseType({ ...LITIGATION, defaultSlaDays: null }).slaDays).toBe('');
  });
});

describe('CaseTypeDialog', () => {
  it('creates a type with every field', async () => {
    const { onSave, onClose } = renderDialog();
    expect(screen.getByRole('heading', { name: 'New Case Type' })).toBeDefined();
    expect(saveButton().disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Advisory ' } });
    fireEvent.change(screen.getByLabelText('Category (optional)'), {
      target: { value: 'Advice' },
    });
    fireEvent.click(screen.getByRole('radio', { name: 'Teal' }));
    fireEvent.change(screen.getByLabelText('Default priority'), { target: { value: 'HIGH' } });
    fireEvent.change(screen.getByLabelText('Default SLA (days)'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Deadline' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jurisdiction' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Jurisdiction' }));
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Add Step' }));
    });
    fireEvent.change(screen.getByLabelText('Checklist step 1'), {
      target: { value: 'Scope letter' },
    });

    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(onSave).toHaveBeenCalledWith({
      name: 'Advisory',
      category: 'Advice',
      colorToken: 'teal',
      defaultPriority: 'HIGH',
      defaultSlaDays: 30,
      requiredFields: ['deadline'],
      checklist: [{ title: 'Scope letter' }],
      isActive: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks a duplicate name with an alert linked to the field', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'litigation' } });
    const input = screen.getByLabelText('Name');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('A case type named “Litigation” already exists.');
    expect(input.getAttribute('aria-describedby')).toBe(alert.id);
    expect(saveButton().disabled).toBe(true);
  });

  it('allows keeping its own name when editing', () => {
    renderDialog({ caseType: LITIGATION });
    expect(screen.getByRole('heading', { name: 'Edit Litigation' })).toBeDefined();
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Litigation');
    expect(screen.queryByRole('alert')).toBeNull();
    // Unchanged draft → Save stays disabled.
    expect(saveButton().disabled).toBe(true);
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    expect(saveButton().disabled).toBe(false);
  });

  it('rejects an out-of-range SLA', () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'X' } });
    fireEvent.change(screen.getByLabelText('Default SLA (days)'), { target: { value: '0' } });
    expect(screen.getByRole('alert').textContent).toBe('Enter a whole number from 1 to 3650.');
    expect(saveButton().disabled).toBe(true);
  });

  it('shows a server name conflict under the field and focuses it', async () => {
    const { onClose } = renderDialog({
      onSave: vi.fn().mockResolvedValue({ ok: false, error: 'Name taken on the server' }),
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Advisory' } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(screen.getByRole('alert').textContent).toBe('Name taken on the server');
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    expect(onClose).not.toHaveBeenCalled();
    // Typing clears the server error.
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Advisory 2' } });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('stays open without an inline message on other failures', async () => {
    const { onClose } = renderDialog({ onSave: vi.fn().mockResolvedValue({ ok: false }) });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Advisory' } });
    await act(async () => {
      fireEvent.click(saveButton());
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the default type active', () => {
    renderDialog({ caseType: { ...LITIGATION, isDefault: true } });
    expect((screen.getByRole('switch', { name: 'Active' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('The default case type must stay active.')).toBeDefined();
  });

  it('cancels and shows the saving state', () => {
    const { onClose } = renderDialog({ isSaving: true });
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('has no axe violations', async () => {
    renderDialog({ caseType: LITIGATION });
    const dialog = screen.getByRole('dialog');
    const results = await axe.run(dialog, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
