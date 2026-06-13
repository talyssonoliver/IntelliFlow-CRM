/**
 * @vitest-environment jsdom
 */

import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@intelliflow/ui', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock('@/hooks/useUnsavedChanges', () => ({ useFormUnsavedChanges: vi.fn() }));

import { LeadEditor, type LeadEditorLead } from '../lead-editor';

function makeLead(overrides: Partial<LeadEditorLead> = {}): LeadEditorLead {
  return {
    email: 'john@example.com',
    status: 'NEW',
    source: 'WEBSITE',
    firstName: 'John',
    lastName: 'Doe',
    phone: '+1234567890',
    title: 'CTO',
    company: 'ACME Corp',
    location: 'New York',
    website: 'https://acme.com',
    estimatedValue: 5000,
    tags: ['enterprise', 'saas'],
    ...overrides,
  };
}

const noop = () => {};

function renderEditor(props: Partial<React.ComponentProps<typeof LeadEditor>> = {}) {
  return render(
    <LeadEditor
      leadId="test-lead-id"
      lead={makeLead()}
      isSaving={false}
      onSave={vi.fn()}
      onCancel={noop}
      {...props}
    />
  );
}

describe('LeadEditor', () => {
  it('pre-populates editable fields from the lead', () => {
    renderEditor();
    expect((screen.getByLabelText('First Name') as HTMLInputElement).value).toBe('John');
    expect((screen.getByLabelText('Last Name') as HTMLInputElement).value).toBe('Doe');
    expect((screen.getByLabelText('Company') as HTMLInputElement).value).toBe('ACME Corp');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('+1234567890');
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('New York');
  });

  it('shows email read-only with a lock icon and status/source badges', () => {
    renderEditor();
    expect(screen.getByText('john@example.com')).toBeTruthy();
    expect(screen.getByText('lock')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    expect(screen.getByText('WEBSITE')).toBeTruthy();
    expect(screen.queryByLabelText('Email')).toBeNull();
  });

  it('converts estimatedValue cents → dollars and joins tags', () => {
    renderEditor();
    expect((screen.getByLabelText('Estimated Value ($)') as HTMLInputElement).value).toBe('50');
    expect((screen.getByLabelText('Tags') as HTMLInputElement).value).toBe('enterprise, saas');
  });

  it('seeds phone from the object form { value }', () => {
    renderEditor({ lead: makeLead({ phone: { value: '+1234567890' } }) });
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('+1234567890');
  });

  it('seeds empty strings when nullable fields are null', () => {
    renderEditor({
      lead: makeLead({
        firstName: null,
        phone: null,
        location: null,
        estimatedValue: null,
        tags: null,
      }),
    });
    expect((screen.getByLabelText('First Name') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Phone') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Estimated Value ($)') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Tags') as HTMLInputElement).value).toBe('');
  });

  it('re-seeds the form when navigating to a different lead', () => {
    const { rerender } = render(
      <LeadEditor
        leadId="lead-a"
        lead={makeLead({ firstName: 'Alice' })}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={noop}
      />
    );
    expect((screen.getByLabelText('First Name') as HTMLInputElement).value).toBe('Alice');
    rerender(
      <LeadEditor
        leadId="lead-b"
        lead={makeLead({ firstName: 'Bob' })}
        isSaving={false}
        onSave={vi.fn()}
        onCancel={noop}
      />
    );
    expect((screen.getByLabelText('First Name') as HTMLInputElement).value).toBe('Bob');
  });

  it('updates every editable field on change', () => {
    renderEditor();
    const change = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    change('First Name', 'A');
    change('Last Name', 'B');
    change('Phone', '999');
    change('Job Title', 'D');
    change('Company', 'E');
    change('Location', 'F');
    change('Website', 'G');
    change('Estimated Value ($)', '12');
    change('Tags', 'x, y');
    expect((screen.getByLabelText('Last Name') as HTMLInputElement).value).toBe('B');
    expect((screen.getByLabelText('Tags') as HTMLInputElement).value).toBe('x, y');
  });

  it('submits a minimal patch of only the changed fields', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave });
    const firstName = screen.getByLabelText('First Name') as HTMLInputElement;
    fireEvent.change(firstName, { target: { value: 'Jane' } });
    fireEvent.submit(firstName.closest('form')!);
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith({ id: 'test-lead-id', firstName: 'Jane' });
    });
  });

  it('clears the dirty state after a successful save', async () => {
    const onSave = vi.fn().mockResolvedValue({});
    renderEditor({ onSave });
    const firstName = screen.getByLabelText('First Name') as HTMLInputElement;
    const save = screen.getByText('Save Changes').closest('button') as HTMLButtonElement;
    fireEvent.change(firstName, { target: { value: 'Jane' } });
    expect(save.disabled).toBe(false);
    fireEvent.submit(firstName.closest('form')!);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    await waitFor(() => expect(save.disabled).toBe(true));
  });

  it('does not call onSave when nothing changed (no no-op update)', () => {
    const onSave = vi.fn();
    renderEditor({ onSave });
    fireEvent.submit(screen.getByText('Save Changes').closest('form')!);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('disables Save until the form is dirty', () => {
    renderEditor();
    const save = screen.getByText('Save Changes').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('First Name'), { target: { value: 'Jane' } });
    expect(save.disabled).toBe(false);
  });

  it('calls onCancel when Cancel is clicked', () => {
    const onCancel = vi.fn();
    renderEditor({ onCancel });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the saving state and disables Save while saving', () => {
    renderEditor({ isSaving: true });
    expect(screen.getByText('Saving...')).toBeTruthy();
    const save = screen.getByText('Saving...').closest('button') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });
});
