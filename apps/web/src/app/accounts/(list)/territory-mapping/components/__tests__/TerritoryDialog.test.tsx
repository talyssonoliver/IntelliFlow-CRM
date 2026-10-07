/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  ...(await import('@/test/mocks/native-select')).nativeSelectMock,
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import {
  TerritoryDialog,
  draftFromTerritory,
  toSaveInput,
  type TerritoryDialogProps,
} from '../TerritoryDialog';
import type { TerritoryRow } from '../TerritoryList';

const london: TerritoryRow = {
  id: 't1',
  name: 'London',
  description: null,
  colorToken: 'gold',
  priority: 1,
  strategy: 'ROUND_ROBIN',
  isDefault: false,
  isActive: true,
  rules: [{ id: 'r1', country: 'GB', region: 'London', postalPrefix: null }],
  members: [{ userId: 'u1', name: 'Ada', avatar: null }],
};

function setup(overrides: Partial<TerritoryDialogProps> = {}) {
  const props: TerritoryDialogProps = {
    open: true,
    territory: null,
    otherNames: ['North'],
    members: [
      { id: 'u1', name: 'Ada' },
      { id: 'u2', name: 'Rex' },
    ],
    isSaving: false,
    onSave: vi.fn().mockResolvedValue(undefined),
    onClose: vi.fn(),
    ...overrides,
  };
  const view = render(<TerritoryDialog {...props} />);
  return { props, ...view };
}

const saveButton = () => screen.getByRole('button', { name: 'Save' }) as HTMLButtonElement;

describe('draft helpers', () => {
  it('narrows an unknown colour token to slate', () => {
    expect(draftFromTerritory(london).colorToken).toBe('slate');
  });

  it('builds the save input, trimming and dropping blank optionals', () => {
    const draft = draftFromTerritory(london);
    draft.description = '  ';
    draft.rules.push({ key: 'x', country: null, region: '', postalPrefix: '' });
    expect(toSaveInput(draft)).toEqual({
      name: 'London',
      description: undefined,
      colorToken: 'slate',
      strategy: 'ROUND_ROBIN',
      isActive: true,
      rules: [{ country: 'GB', region: 'London', postalPrefix: undefined }],
      memberIds: ['u1'],
    });
  });
});

describe('TerritoryDialog', () => {
  it('renders every field with labels', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'New Territory' })).toBeDefined();
    for (const label of ['Name', 'Colour', 'Description (optional)', 'Active']) {
      expect(screen.getByLabelText(label)).toBeDefined();
    }
    expect(screen.getByRole('radiogroup', { name: 'Assignment strategy' })).toBeDefined();
    expect(screen.getByRole('group', { name: 'Rules' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Members, 0 selected' })).toBeDefined();
  });

  it('keeps Save disabled until the draft is dirty and conflict-free', () => {
    setup();
    expect(saveButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'South' } });
    expect(saveButton().disabled).toBe(true); // rule 1 has no country yet
    fireEvent.change(screen.getByLabelText('Rule 1 country'), { target: { value: 'GB' } });
    expect(saveButton().disabled).toBe(false);
  });

  it('flags a duplicate name with aria-invalid and aria-describedby', () => {
    setup();
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'north' } });
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toContain(
      'already exists'
    );
  });

  it('blocks Save on a duplicate rule', () => {
    setup({ territory: london });
    fireEvent.click(screen.getByRole('button', { name: 'Add Rule' }));
    fireEvent.change(screen.getByLabelText('Rule 2 country'), { target: { value: 'GB' } });
    fireEvent.change(screen.getByLabelText('Rule 2 region'), { target: { value: 'LONDON' } });
    expect(screen.getByText(/Rules 1 and 2 cover the same area/)).toBeDefined();
    expect(saveButton().disabled).toBe(true);
  });

  it('saves the edited territory, refreshes the snapshot and closes', async () => {
    const saved = { ...london, name: 'Greater London', strategy: 'LOAD_BALANCE' as const };
    const { props } = setup({ territory: london, onSave: vi.fn().mockResolvedValue(saved) });
    expect(screen.getByRole('heading', { name: 'Edit London' })).toBeDefined();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Greater London' } });
    fireEvent.click(screen.getByRole('radio', { name: /Load-balance/ }));
    fireEvent.change(screen.getByLabelText('Colour'), { target: { value: 'teal' } });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'City' },
    });
    fireEvent.click(screen.getByRole('switch', { name: 'Active' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Rex/ }));
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onClose).toHaveBeenCalled());
    expect(props.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Greater London',
        strategy: 'LOAD_BALANCE',
        colorToken: 'teal',
        description: 'City',
        isActive: false,
        memberIds: ['u1', 'u2'],
      })
    );
    expect(saveButton().disabled).toBe(true);
  });

  it('stays open when the save fails', async () => {
    const { props } = setup({ territory: london });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Londres' } });
    fireEvent.click(saveButton());
    await waitFor(() => expect(props.onSave).toHaveBeenCalled());
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps the default territory active and allows it no rules', () => {
    setup({ territory: { ...london, isDefault: true } });
    expect((screen.getByRole('switch', { name: 'Active' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(screen.getByText('The default territory must stay active.')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    expect(saveButton().disabled).toBe(false);
  });

  it('explains manual territories and shows the saving state', () => {
    setup({ territory: { ...london, strategy: 'MANUAL' }, isSaving: true });
    expect(screen.getByText('Manual territories can have no members.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDefined();
  });

  it('cancel closes', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(props.onClose).toHaveBeenCalled();
  });
});
