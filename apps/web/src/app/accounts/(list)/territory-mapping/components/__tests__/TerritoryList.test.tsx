/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

const h = vi.hoisted(() => ({ dialogProps: null as null | Record<string, any> }));

vi.mock('../TerritoryDialog', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  TerritoryDialog: (props: Record<string, any>) => {
    h.dialogProps = props;
    return props.open ? <dialog open>dialog {props.territory?.name ?? 'new'}</dialog> : null;
  },
}));

const dnd = vi.hoisted(() => ({
  onDragEnd: null as null | ((e: any) => void),
  sensors: [] as unknown[],
}));
vi.mock('@dnd-kit/core', async (orig) => {
  const actual = await orig<Record<string, any>>();
  return {
    ...actual,
    useSensors: (...sensors: unknown[]) => {
      dnd.sensors = sensors;
      return actual.useSensors(...sensors);
    },
    DndContext: (props: { onDragEnd: (e: any) => void; children: React.ReactNode }) => {
      dnd.onDragEnd = props.onDragEnd;
      return <>{props.children}</>;
    },
  };
});

import {
  TerritoryList,
  summarizeRules,
  type TerritoryRow,
  type TerritoryListHandle,
} from '../TerritoryList';

function row(id: string, overrides: Partial<TerritoryRow> = {}): TerritoryRow {
  return {
    id,
    name: id.toUpperCase(),
    description: null,
    colorToken: 'blue',
    priority: 0,
    strategy: 'ROUND_ROBIN',
    isDefault: false,
    isActive: true,
    rules: [{ id: `${id}-r`, country: 'GB', region: null, postalPrefix: null }],
    members: [],
    ...overrides,
  };
}

function setup(territories: TerritoryRow[], overrides: Record<string, unknown> = {}) {
  const props = {
    territories,
    members: [],
    canEdit: true,
    isBusy: false,
    isSaving: false,
    onSave: vi.fn().mockResolvedValue(undefined),
    onDelete: vi.fn(),
    onReorder: vi.fn(),
    ...overrides,
  };
  const ref = React.createRef<TerritoryListHandle>();
  render(<TerritoryList ref={ref} {...props} />);
  return { props, ref };
}

describe('summarizeRules', () => {
  it('summarises up to two rules', () => {
    expect(summarizeRules([])).toBe('No rules (fallback only)');
    expect(
      summarizeRules([
        { id: '1', country: 'GB', region: 'London', postalPrefix: 'SW1A' },
        { id: '2', country: 'US', region: null, postalPrefix: null },
        { id: '3', country: 'FR', region: null, postalPrefix: null },
      ])
    ).toBe('GB · London · SW1A…; US +1 more');
  });
});

describe('TerritoryList', () => {
  const territories = [
    row('a', { isDefault: true, members: [{ userId: 'u1', name: 'Ada', avatar: null }] }),
    row('b', { isActive: false, strategy: 'LOAD_BALANCE', colorToken: 'gold' }),
    row('c', {
      strategy: 'MANUAL',
      members: [
        { userId: 'u1', name: 'Ada', avatar: null },
        { userId: 'u2', name: 'Rex', avatar: null },
      ],
    }),
  ];

  it('lists rows in order with name, badges, strategy, rules and member count', () => {
    setup(territories);
    const a = screen.getByTestId('territory-row-a');
    expect(a.textContent).toContain('A');
    expect(a.textContent).toContain('Default');
    expect(a.textContent).toContain('Round-robin · GB · 1 member');
    expect(screen.getByTestId('territory-row-b').textContent).toContain('Inactive');
    expect(screen.getByTestId('territory-row-c').textContent).toContain('Manual · GB · 2 members');
    expect(screen.getByRole('list', { name: 'Territories in evaluation order' })).toBeDefined();
  });

  it('renders an unknown colour token as a slate swatch', () => {
    setup(territories);
    const swatch = screen
      .getByTestId('territory-row-b')
      .querySelector('[data-testid="territory-swatch"]');
    expect(swatch?.className).toContain('bg-slate-500');
  });

  it('shows the passive empty state with no action button', () => {
    setup([]);
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('moves with up/down buttons and announces the new position', () => {
    const { props } = setup(territories);
    expect((screen.getByRole('button', { name: 'Move A up' }) as HTMLButtonElement).disabled).toBe(
      true
    );
    expect(
      (screen.getByRole('button', { name: 'Move C down' }) as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move B up' }));
    expect(props.onReorder).toHaveBeenCalledWith(['b', 'a', 'c']);
    expect(screen.getByRole('status').textContent).toBe('B moved to position 1 of 3.');
    fireEvent.click(screen.getByRole('button', { name: 'Move A down' }));
    expect(props.onReorder).toHaveBeenLastCalledWith(['b', 'a', 'c']);
  });

  it('reorders on drag end and registers a keyboard sensor', () => {
    const { props } = setup(territories);
    expect(dnd.sensors).toHaveLength(2);
    act(() => dnd.onDragEnd!({ active: { id: 'c' }, over: { id: 'a' } }));
    expect(props.onReorder).toHaveBeenCalledWith(['c', 'a', 'b']);
    act(() => dnd.onDragEnd!({ active: { id: 'c' }, over: null }));
    act(() => dnd.onDragEnd!({ active: { id: 'c' }, over: { id: 'c' } }));
    act(() => dnd.onDragEnd!({ active: { id: 'zz' }, over: { id: 'a' } }));
    expect(props.onReorder).toHaveBeenCalledTimes(1);
  });

  it('opens create through the handle and returns focus on close', async () => {
    const { ref } = setup(territories);
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    act(() => ref.current!.openCreate());
    expect(screen.getByRole('dialog').textContent).toBe('dialog new');
    expect(h.dialogProps!.otherNames).toEqual(['A', 'B', 'C']);
    act(() => h.dialogProps!.onClose());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens edit for a row and saves with its id', async () => {
    const { props } = setup(territories);
    fireEvent.click(screen.getAllByRole('button', { name: 'Edit' })[1]);
    expect(screen.getByRole('dialog').textContent).toBe('dialog B');
    expect(h.dialogProps!.otherNames).toEqual(['A', 'C']);
    await h.dialogProps!.onSave({ name: 'B2' });
    expect(props.onSave).toHaveBeenCalledWith({ name: 'B2' }, 'b');
  });

  it('saves a new territory with a null id', async () => {
    const { props, ref } = setup(territories);
    act(() => ref.current!.openCreate());
    await h.dialogProps!.onSave({ name: 'New' });
    expect(props.onSave).toHaveBeenCalledWith({ name: 'New' }, null);
  });

  it('deletes through the callback', () => {
    const { props } = setup(territories);
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' })[2]);
    expect(props.onDelete).toHaveBeenCalledWith(territories[2]);
  });

  it('disables every action for a non-admin', () => {
    setup(territories, { canEdit: false });
    for (const name of ['Edit', 'Delete']) {
      for (const button of screen.getAllByRole('button', { name })) {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      }
    }
    expect(
      (screen.getByRole('button', { name: 'Drag to reorder A' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
