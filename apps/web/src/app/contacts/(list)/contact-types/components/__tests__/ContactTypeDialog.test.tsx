/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { CONTACT_TYPE_COLOR_TOKENS, type ContactTypeDto } from '@intelliflow/validators';
import { ContactTypeDialog, draftFromContactType, toSaveInput } from '../ContactTypeDialog';
import * as validators from '@intelliflow/validators';

// The dialog must validate the name through the shared superRefine schema (DoD: "Zod
// superRefine for duplicate type names"), not a parallel check.
vi.mock('@intelliflow/validators', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@intelliflow/validators')>();
  return { ...actual, contactTypeNameSchema: vi.fn(actual.contactTypeNameSchema) };
});

const TAGS = [
  { id: 'tag-a', name: 'supplier', isActive: true },
  { id: 'tag-b', name: 'emea', isActive: true },
];

const RESELLER: ContactTypeDto = {
  id: 't1',
  key: 'reseller',
  name: 'Reseller',
  colorToken: 'teal',
  isSystem: false,
  isActive: true,
  isDefault: false,
  sortOrder: 6,
  defaultStatus: 'PROSPECT',
  defaultDepartment: 'Channel',
  defaultOwner: 'ACCOUNT_OWNER',
  requiredFields: ['company'],
  defaultTags: [{ id: 'tag-a', name: 'supplier' }],
  contactCount: 0,
};

function renderDialog(props: Partial<React.ComponentProps<typeof ContactTypeDialog>> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  const utils = render(
    <ContactTypeDialog
      open
      contactType={null}
      existing={[{ id: 't1', name: 'Reseller' }]}
      tags={TAGS}
      isSaving={false}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />
  );
  return { ...utils, onSave, onClose };
}

const save = () => screen.getByRole('button', { name: 'Save' });

describe('ContactTypeDialog', () => {
  it('starts clean: Save disabled until something changes', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'New Contact Type' })).toBeInTheDocument();
    expect(save()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Distributor' } });
    expect(save()).toBeEnabled();
  });

  it('a blank name says why on Save and moves focus to the name (A11Y-9, a11y review #2)', () => {
    const { onSave } = renderDialog({ contactType: RESELLER });
    const name = screen.getByLabelText('Name');
    expect(name).toHaveAttribute('aria-required', 'true');
    fireEvent.change(name, { target: { value: '   ' } });
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required.');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveFocus();
  });

  it('shows the read-only key as a labelled field (a11y review #3)', () => {
    renderDialog({ contactType: RESELLER });
    const key = screen.getByLabelText('Key');
    expect(key).toHaveAttribute('readonly');
    expect(key).toHaveValue(RESELLER.key);
  });

  it('offers 18 labelled colour radios in a fieldset; arrow keys move through them in order', async () => {
    renderDialog();
    const group = screen.getByRole('group', { name: 'Colour' });
    const radios = screen.getAllByRole('radio', {
      name: /^(Slate|Red|Orange|Amber|Yellow|Lime|Green|Emerald|Teal|Cyan|Sky|Blue|Indigo|Violet|Purple|Fuchsia|Pink|Rose)$/,
    });
    expect(group).toBeInTheDocument();
    expect(radios).toHaveLength(CONTACT_TYPE_COLOR_TOKENS.length);
    const slate = screen.getByRole('radio', { name: 'Slate' });
    expect(slate).toHaveAttribute('data-state', 'checked');
    slate.focus();
    fireEvent.keyDown(slate, { key: 'ArrowRight' });
    // Radix roving focus moves focus on the next tick.
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Red' })).toHaveFocus());
  });

  it('marks the checked swatch with a glyph, not colour alone (A11Y-3)', () => {
    renderDialog({ contactType: RESELLER });
    const teal = screen.getByRole('radio', { name: 'Teal' });
    const label = teal.closest('label')!;
    expect(label.querySelector('[data-testid="swatch-check"]')).not.toBeNull();
    const slateLabel = screen.getByRole('radio', { name: 'Slate' }).closest('label')!;
    expect(slateLabel.querySelector('[data-testid="swatch-check"]')).toBeNull();
  });

  it('loads an existing type, shows its key read-only and builds the save input', async () => {
    const { onSave, onClose } = renderDialog({ contactType: RESELLER });
    expect(screen.getByRole('dialog', { name: 'Edit Reseller' })).toBeInTheDocument();
    expect(screen.getByLabelText('Key')).toHaveValue('reseller');
    expect(screen.getByRole('checkbox', { name: 'Company' })).toHaveAttribute(
      'data-state',
      'checked'
    );
    expect(screen.getByRole('radio', { name: 'Account owner' })).toHaveAttribute(
      'data-state',
      'checked'
    );
    expect(screen.getByLabelText('Default status')).toHaveValue('PROSPECT');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Job title' }));
    fireEvent.change(screen.getByLabelText('Default department'), {
      target: { value: ' Partners ' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'emea' }));
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSave).toHaveBeenCalledWith({
      name: 'Reseller',
      colorToken: 'teal',
      isActive: true,
      defaultStatus: 'PROSPECT',
      defaultDepartment: 'Partners',
      defaultOwner: 'ACCOUNT_OWNER',
      requiredFields: ['company', 'title'],
      defaultTagIds: ['tag-a', 'tag-b'],
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('saves the default status, owner rule and active flag the user changed', async () => {
    const { onSave } = renderDialog({ contactType: RESELLER });
    fireEvent.change(screen.getByLabelText('Default status'), { target: { value: 'ACTIVE' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Creator' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    await act(async () => {
      fireEvent.click(save());
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ defaultStatus: 'ACTIVE', defaultOwner: 'CREATOR', isActive: false })
    );
  });

  it('validates the name with the shared superRefine schema (contactTypeNameSchema)', () => {
    renderDialog({ contactType: RESELLER });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'customer' } });
    expect(validators.contactTypeNameSchema).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: 'Reseller' })]),
      RESELLER.id
    );
  });

  it('rejects an empty or duplicate name with an inline alert (aria-invalid + describedby)', () => {
    const renderDialogResult = renderDialog();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: '  reseller ' } });
    expect(name).toHaveAttribute('aria-invalid', 'true');
    const errorId = name.getAttribute('aria-describedby');
    const error = document.getElementById(errorId!);
    expect(error).toHaveAttribute('role', 'alert');
    expect(error).toHaveTextContent('A contact type named “Reseller” already exists.');
    expect(error?.className).toContain('text-red-700');
    // Save stays operable: activating it saves nothing and returns focus to the name.
    const { onSave } = renderDialogResult;
    fireEvent.click(save());
    expect(onSave).not.toHaveBeenCalled();
    expect(name).toHaveFocus();
  });

  it('a server CONFLICT keeps the dialog open and moves focus to the invalid name (A11Y-9)', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'A contact type with this name already exists.' });
    const { onClose } = renderDialog({ onSave });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Brand new' } });
    await act(async () => {
      fireEvent.click(save());
    });
    const name = screen.getByLabelText('Name');
    expect(name).toHaveFocus();
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('already exists');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the default type active (switch locked, reason linked)', () => {
    renderDialog({ contactType: { ...RESELLER, isDefault: true } });
    const active = screen.getByRole('switch', { name: 'Active' });
    expect(active).toBeDisabled();
    expect(document.getElementById(active.getAttribute('aria-describedby')!)).toHaveTextContent(
      'The default contact type must stay active.'
    );
  });

  it('shows a linked default tag that was deactivated so it can be removed (codex 3a11a307)', () => {
    renderDialog({
      contactType: RESELLER,
      tags: [{ id: 'tag-a', name: 'supplier', isActive: false }, TAGS[1]],
    });
    expect(screen.getByRole('checkbox', { name: 'supplier (inactive)' })).toBeChecked();
  });

  it('Cancel closes without saving', () => {
    const { onSave, onClose } = renderDialog({ contactType: RESELLER });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('draft helpers round-trip a type and narrow an unknown colour', () => {
    const draft = draftFromContactType({ ...RESELLER, colorToken: 'magenta' });
    expect(draft.colorToken).toBe('slate');
    expect(toSaveInput({ ...draft, defaultDepartment: '   ', name: '  X  ' })).toMatchObject({
      name: 'X',
      defaultDepartment: null,
    });
    expect(draftFromContactType(null)).toMatchObject({
      name: '',
      defaultOwner: 'CREATOR',
      isActive: true,
    });
  });

  it('has no axe violations', async () => {
    renderDialog({ contactType: RESELLER });
    const results = await axe.run(screen.getByRole('dialog'), {
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
