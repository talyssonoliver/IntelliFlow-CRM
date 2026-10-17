/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';
import type { ContactTypeDto } from '@intelliflow/validators';
import { ContactTypeList, type ContactTypeListHandle } from '../ContactTypeList';

function type(overrides: Partial<ContactTypeDto> = {}): ContactTypeDto {
  return {
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
    ...overrides,
  };
}

function renderList(props: Partial<React.ComponentProps<typeof ContactTypeList>> = {}) {
  const ref = React.createRef<ContactTypeListHandle>();
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onDelete = vi.fn();
  render(
    <ContactTypeList
      ref={ref}
      types={[type()]}
      tags={[{ id: 'tag-a', name: 'supplier', isActive: true }]}
      canEdit
      isBusy={false}
      isSaving={false}
      onSave={onSave}
      onDelete={onDelete}
      {...props}
    />
  );
  return { ref, onSave, onDelete };
}

describe('ContactTypeList', () => {
  it('shows the canonical passive EmptyState with no extra tab stop beyond it', () => {
    renderList({ types: [] });
    expect(screen.getByText('No contact types yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // A11Y-11: the passive region is named and kept out of the tab order.
    const region = screen.getByRole('region', { name: 'No contact types' });
    expect(region).toHaveAttribute('tabindex', '-1');
  });

  it('states every row fact in text: badges, contact count, defaults summary', () => {
    renderList({
      types: [
        type(),
        type({
          id: 't2',
          key: 'vendor',
          name: 'Vendor',
          isSystem: true,
          isDefault: true,
          contactCount: 1,
        }),
        type({ id: 't3', key: 'old', name: 'Old', isActive: false, contactCount: 3 }),
      ],
    });
    const list = screen.getByRole('list', { name: 'Contact types' });
    expect(list).toBeInTheDocument();
    const vendor = screen.getByTestId('contact-type-row-t2');
    expect(vendor).toHaveTextContent('Default');
    expect(vendor).toHaveTextContent('Built-in');
    expect(vendor).toHaveTextContent('1 contact');
    expect(screen.getByTestId('contact-type-row-t3')).toHaveTextContent('Inactive');
    expect(screen.getByTestId('contact-type-row-t1')).toHaveTextContent('Status: Prospect');
    expect(screen.getByTestId('contact-type-row-t1')).toHaveTextContent('Owner: account owner');
    expect(screen.getByTestId('contact-type-row-t1')).toHaveTextContent('1 required field');
    expect(screen.getByTestId('contact-type-row-t1')).toHaveTextContent('1 default tag');
  });

  it.each([
    [
      'a built-in type',
      { isSystem: true },
      'Built-in types cannot be deleted. Deactivate it instead.',
    ],
    ['the default type', { isDefault: true }, 'The default type cannot be deleted.'],
    ['a type in use', { contactCount: 2 }, '2 contacts use this type. Deactivate it instead.'],
  ] as const)(
    'blocks deleting %s with aria-disabled and a visible reason (A11Y-7)',
    (_label, overrides, reason) => {
      const { onDelete } = renderList({ types: [type(overrides)] });
      const button = screen.getByRole('button', { name: 'Delete Reseller' });
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      button.focus();
      expect(button).toHaveFocus();
      const describedBy = button.getAttribute('aria-describedby')!;
      expect(
        describedBy
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent)
          .join(' ')
      ).toContain(reason);
      fireEvent.click(button);
      expect(onDelete).not.toHaveBeenCalled();
    }
  );

  it('deletes an unused custom type', () => {
    const { onDelete } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Reseller' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }));
  });

  it('read-only users get natively disabled actions described by the page note', () => {
    renderList({ canEdit: false, describedBy: 'read-only-note' });
    const edit = screen.getByRole('button', { name: 'Edit Reseller' });
    expect(edit).toBeDisabled();
    expect(edit).toHaveAttribute('aria-describedby', 'read-only-note');
  });

  it('opens the create dialog through the ref and returns focus to the trigger on close', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'New Contact Type';
    document.body.appendChild(trigger);
    trigger.focus();
    const { ref } = renderList();
    act(() => ref.current?.openCreate());
    expect(screen.getByRole('dialog', { name: 'New Contact Type' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it('opens the edit dialog for a row', () => {
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Reseller' }));
    expect(screen.getByRole('dialog', { name: 'Edit Reseller' })).toBeInTheDocument();
  });

  it('has no axe violations', async () => {
    const { container } = render(
      <ContactTypeList
        types={[type(), type({ id: 't2', isSystem: true, name: 'Vendor' })]}
        tags={[]}
        canEdit
        isBusy={false}
        isSaving={false}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
