/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import axe from 'axe-core';
import type { CaseTypeDto } from '@intelliflow/validators';

const h = vi.hoisted(() => ({ dialogProps: null as null | Record<string, any> }));

vi.mock('../CaseTypeDialog', () => ({
  CaseTypeDialog: (props: Record<string, any>) => {
    h.dialogProps = props;
    return props.open ? (
      <dialog open aria-label={props.caseType ? `Edit ${props.caseType.name}` : 'New'}>
        <button onClick={props.onClose}>Close</button>
      </dialog>
    ) : null;
  },
}));

import { CaseTypeList, type CaseTypeListHandle } from '../CaseTypeList';

function type(overrides: Partial<CaseTypeDto> = {}): CaseTypeDto {
  return {
    id: 't1',
    name: 'Litigation',
    category: 'Disputes',
    colorToken: 'blue',
    defaultPriority: 'HIGH',
    defaultSlaDays: 14,
    requiredFields: ['jurisdiction', 'deadline'],
    isActive: true,
    isDefault: true,
    checklist: [{ id: 'i1', title: 'Conflict check', sortOrder: 0 }],
    caseCount: 12,
    ...overrides,
  };
}

function renderList(props: Partial<React.ComponentProps<typeof CaseTypeList>> = {}) {
  const ref = React.createRef<CaseTypeListHandle>();
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onDelete = vi.fn();
  const utils = render(
    <CaseTypeList
      ref={ref}
      types={[
        type(),
        type({
          id: 't2',
          name: 'Advisory',
          category: null,
          defaultPriority: null,
          defaultSlaDays: null,
          requiredFields: [],
          checklist: [],
          isActive: false,
          isDefault: false,
          caseCount: 1,
          colorToken: 'unknown',
        }),
      ]}
      canEdit
      isBusy={false}
      isSaving={false}
      onSave={onSave}
      onDelete={onDelete}
      {...props}
    />
  );
  return { ...utils, ref, onSave, onDelete };
}

describe('CaseTypeList', () => {
  it('opens the create dialog through the forwarded openCreate handle', () => {
    const { ref } = renderList();
    act(() => ref.current?.openCreate());
    expect(screen.getByRole('dialog', { name: 'New' })).toBeDefined();
    expect(h.dialogProps?.caseType).toBeNull();
  });

  it('states every fact in text, not colour alone', () => {
    renderList();
    const first = screen.getByTestId('case-type-row-t1').textContent;
    expect(first).toContain('Litigation');
    expect(first).toContain('Default');
    expect(first).toContain('12 cases');
    expect(first).toContain(
      'Disputes · High priority · Due in 14 days · 2 required fields · 1 checklist step'
    );
    const second = screen.getByTestId('case-type-row-t2').textContent;
    expect(second).toContain('Inactive');
    expect(second).toContain('1 case');
    expect(second).toContain(
      'Module default priority · No SLA · Module required fields · No checklist'
    );
    const swatches = screen.getAllByTestId('case-type-swatch');
    expect(swatches[0].className).toContain('bg-blue-500');
    expect(swatches[1].className).toContain('bg-slate-500');
    expect(swatches[0].getAttribute('aria-hidden')).toBe('true');
  });

  it('edits a row and returns focus to its Edit button', () => {
    vi.useFakeTimers();
    renderList();
    const edit = screen.getByRole('button', { name: 'Edit Litigation' });
    edit.focus();
    fireEvent.click(edit);
    expect(screen.getByRole('dialog', { name: 'Edit Litigation' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    act(() => vi.runAllTimers());
    expect(document.activeElement).toBe(edit);
    vi.useRealTimers();
  });

  it('saves through onSave with the row id', async () => {
    const { onSave } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Advisory' }));
    await h.dialogProps!.onSave({ name: 'Advisory' });
    expect(onSave).toHaveBeenCalledWith({ name: 'Advisory' }, 't2');
  });

  it('asks the page to delete a row', () => {
    const { onDelete } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Advisory' }));
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 't2' }));
  });

  it('locks row actions for read-only users and links the explanation', () => {
    renderList({ canEdit: false, describedBy: 'note' });
    const edit = screen.getByRole('button', { name: 'Edit Litigation' }) as HTMLButtonElement;
    expect(edit.disabled).toBe(true);
    expect(edit.getAttribute('aria-describedby')).toBe('note');
  });

  it('shows the canonical empty state without its own button', () => {
    const { container } = renderList({ types: [] });
    expect(container.textContent).toContain('No case types yet');
    expect(screen.queryByRole('list', { name: 'Case types' })).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('has no axe violations', async () => {
    const { container } = renderList();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });
});
