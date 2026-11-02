/**
 * @vitest-environment jsdom
 *
 * PG-203 — Event type dialog (AC-004, AC-005, AC-008, AC-009, AC-026).
 */
import * as React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { TAG_COLOR_TOKENS } from '@intelliflow/validators';
import { eventTypeDto } from '../../__tests__/event-types-fixtures';

vi.mock('@/components/tasks/EntitySearchField', () => ({
  EntitySearchField: (props: {
    valueName: string;
    onChange: (id: string, name: string) => void;
  }) => (
    <button type="button" onClick={() => props.onChange('clhother0000000000x', 'Otto Other')}>
      Host: {props.valueName || 'none'}
    </button>
  ),
}));

import { EventTypeDialog, type EventTypeDialogProps } from '../EventTypeDialog';

const HOST = { id: 'clhme00000000000000', name: 'Ada Admin' };

function renderDialog(overrides: Partial<EventTypeDialogProps> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onClose = vi.fn();
  const utils = render(
    <EventTypeDialog
      open
      eventType={null}
      existing={[]}
      defaultHost={HOST}
      isSaving={false}
      onSave={onSave}
      onClose={onClose}
      {...overrides}
    />
  );
  return { ...utils, onSave, onClose, dialog: screen.getByRole('dialog') };
}

async function axeClean(container: HTMLElement) {
  const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(results.violations).toEqual([]);
}

beforeEach(() => vi.clearAllMocks());

describe('create', () => {
  it('suggests the slug from the name until the slug is edited, and saves the full payload', async () => {
    const { dialog, onSave, onClose } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText('Name'), {
      target: { value: 'Initial Consultation!' },
    });
    expect(within(dialog).getByLabelText('Booking slug')).toHaveValue('initial-consultation');
    fireEvent.change(within(dialog).getByLabelText('Booking slug'), { target: { value: 'intro' } });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Intro call' } });
    expect(within(dialog).getByLabelText('Booking slug')).toHaveValue('intro');
    fireEvent.change(within(dialog).getByLabelText('Duration (minutes)'), {
      target: { value: '45' },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Phone' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith({
      name: 'Intro call',
      slug: 'intro',
      description: null,
      durationMinutes: 45,
      colorToken: 'blue',
      locationType: 'VIDEO',
      locationDetails: null,
      appointmentType: 'MEETING',
      hostUserId: HOST.id,
      requiredFields: ['phone'],
      leadSource: 'BOOKING',
      isActive: true,
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('defaults the host to the signed-in user and lets it be changed', async () => {
    const { dialog, onSave } = renderDialog();
    expect(within(dialog).getByRole('button', { name: 'Host: Ada Admin' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Host: Ada Admin' }));
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Call' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ hostUserId: 'clhother0000000000x' })
      )
    );
  });

  it('offers the 18 colours with text labels, and no AI switch (owner Q9)', async () => {
    const { dialog, container } = renderDialog();
    const colours = within(dialog).getByRole('radiogroup', { name: 'Colour' });
    expect(within(colours).getAllByRole('radio')).toHaveLength(TAG_COLOR_TOKENS.length);
    expect(within(colours).getByText('Blue')).toBeInTheDocument();
    expect(within(dialog).queryByText(/\bAI\b/)).toBeNull();
    expect(within(dialog).getByRole('switch', { name: 'Active' })).toBeChecked();
    await axeClean(container);
  });

  it('keeps the typed draft when the parent re-renders with a new host object', () => {
    const { dialog, rerender, onSave, onClose } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Kept' } });
    rerender(
      <EventTypeDialog
        open
        eventType={null}
        existing={[]}
        defaultHost={{ ...HOST }}
        isSaving
        onSave={onSave}
        onClose={onClose}
      />
    );
    expect(within(screen.getByRole('dialog')).getByLabelText('Name')).toHaveValue('Kept');
  });

  it('offers WEBSITE or BOOKING as the lead source (owner Q8)', () => {
    const { dialog } = renderDialog();
    const group = within(dialog).getByRole('radiogroup', { name: 'Lead source for new bookers' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.getAttribute('value'))
    ).toEqual(['BOOKING', 'WEBSITE']);
  });
});

describe('validation (AC-004)', () => {
  it('blocks save and explains an http video link', async () => {
    const { dialog, onSave } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Call' } });
    fireEvent.change(within(dialog).getByLabelText('Meeting link'), {
      target: { value: 'http://meet.example.invalid' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter an https:// meeting link')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires an address for in-person meetings, and focuses that field', async () => {
    const { dialog, onSave } = renderDialog();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Visit' } });
    fireEvent.change(within(dialog).getByLabelText('Location'), { target: { value: 'IN_PERSON' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Enter the meeting address')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    expect(dialog.querySelector('#event-type-location-details')).toHaveFocus();
  });

  it('groups the host picker under its label and ties the host error to it', async () => {
    const { dialog } = renderDialog({ defaultHost: null });
    const group = within(dialog).getByRole('group', { name: 'Host' });
    expect(group).toHaveAttribute('aria-describedby', 'event-type-host-help');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Call' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText('Choose a host.')).toBeInTheDocument();
    expect(group).toHaveAttribute(
      'aria-describedby',
      'event-type-host-help event-type-hostUserId-error'
    );
  });

  it('flags a slug or name already used by another type before saving', async () => {
    const { dialog, onSave } = renderDialog({
      existing: [{ id: 'x', name: 'Intro', slug: 'intro' }],
    });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Intro' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByText(/already/)).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a server CONFLICT inline and keeps the dialog open', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, error: 'That booking slug is already in use.' });
    const { dialog, onClose } = renderDialog({ onSave });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'New one' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(
      await within(dialog).findByText('That booking slug is already in use.')
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('edit', () => {
  it('starts from the stored type and narrows an unknown colour token to slate', () => {
    renderDialog({ eventType: eventTypeDto({ colorToken: 'gold' }) });
    const dialog = screen.getByRole('dialog', { name: 'Edit Initial consultation' });
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Initial consultation');
    expect(within(dialog).getByLabelText('Booking slug')).toHaveValue('initial-consultation');
    expect(within(dialog).getByRole('radio', { name: 'Slate' })).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Host: Hana Host' })).toBeInTheDocument();
  });

  it('saves isActive=false when the switch is turned off', async () => {
    const { onSave } = renderDialog({ eventType: eventTypeDto() });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Active' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ isActive: false }))
    );
  });
});
