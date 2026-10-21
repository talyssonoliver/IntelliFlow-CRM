/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import type { EmailSignatureDto } from '@intelliflow/validators';

// Tiptap does not run in jsdom: a textarea stands in, exposing the same editor
// surface the dialog uses (getHTML / getText via onCreate).
const editorProps = vi.hoisted(() => ({ last: null as null | Record<string, unknown> }));
vi.mock('@intelliflow/ui', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  function RichTextEditor(props: {
    value?: string;
    onCreate?: (e: unknown) => void;
    ariaLabel?: string;
  }) {
    editorProps.last = props as Record<string, unknown>;
    const htmlRef = React.useRef(props.value ?? '');
    const onCreateRef = React.useRef(props.onCreate);
    const [html, setHtml] = React.useState(props.value ?? '');
    React.useEffect(() => {
      onCreateRef.current?.({
        getHTML: () => htmlRef.current,
        // Plain text is only checked for emptiness, so the raw value stands in.
        getText: () => htmlRef.current,
      });
    }, []);
    return (
      <textarea
        aria-label={props.ariaLabel}
        value={html}
        onChange={(e) => {
          htmlRef.current = e.currentTarget.value;
          setHtml(e.currentTarget.value);
        }}
      />
    );
  }
  return { ...actual, RichTextEditor };
});

import { SignatureDialog, type SignatureDialogProps } from '../SignatureDialog';

const sig = (over: Partial<EmailSignatureDto> = {}): EmailSignatureDto => ({
  id: 'sig-1',
  scope: 'USER',
  name: 'Formal',
  html: '<p>Kind regards</p>',
  isDefault: false,
  updatedAt: '2026-10-20T00:00:00.000Z',
  ...over,
});

function renderDialog(props: Partial<SignatureDialogProps> = {}) {
  const onSave = vi.fn().mockResolvedValue({ ok: true });
  const onOpenChange = vi.fn();
  const utils = render(
    <SignatureDialog
      open
      onOpenChange={onOpenChange}
      target={{ kind: 'create', scope: 'USER' }}
      existing={[]}
      onSave={onSave}
      {...props}
    />
  );
  return { onSave, onOpenChange, ...utils };
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save Signature' }));

beforeEach(() => vi.clearAllMocks());

describe('SignatureDialog', () => {
  it('creates a personal signature with its HTML and default flag', async () => {
    const { onSave, onOpenChange } = renderDialog();
    expect(screen.getByRole('dialog', { name: 'New signature' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Short ' } });
    fireEvent.change(screen.getByLabelText('Signature'), {
      target: { value: '<p>Thanks, Me</p>' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use as my default' }));
    save();
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith({
      name: 'Short',
      html: '<p>Thanks, Me</p>',
      isDefault: true,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('names the organisation default for an organisation signature', () => {
    renderDialog({ target: { kind: 'create', scope: 'ORG' } });
    expect(
      screen.getByRole('checkbox', { name: 'Use as the organisation default' })
    ).toBeInTheDocument();
  });

  it('disables image insertion (no remote images in signatures)', () => {
    renderDialog();
    const promptForImage = editorProps.last?.promptForImage as () => string | null;
    expect(promptForImage()).toBeNull();
  });

  it('edits name and content of an existing signature (no default switch)', async () => {
    const { onSave } = renderDialog({
      target: { kind: 'edit', signature: sig() },
      existing: [sig()],
    });
    expect(screen.getByRole('dialog', { name: 'Edit signature' })).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Formal');
    expect(screen.getByLabelText('Signature')).toHaveValue('<p>Kind regards</p>');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    save();
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Formal',
        html: '<p>Kind regards</p>',
        isDefault: false,
      })
    );
  });

  it('refuses a duplicate name on the field and focuses it', async () => {
    const { onSave } = renderDialog({ existing: [sig()] });
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'formal ' } });
    fireEvent.change(screen.getByLabelText('Signature'), { target: { value: '<p>x</p>' } });
    save();
    await waitFor(() => expect(document.activeElement).toBe(name));
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAccessibleDescription('A signature with this name already exists');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires a name and some content', async () => {
    const { onSave } = renderDialog();
    save();
    await waitFor(() =>
      expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true')
    );
    expect(screen.getByText('Add the signature text.')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('shows a server conflict on the name field and keeps the dialog open', async () => {
    const onSave = vi
      .fn()
      .mockResolvedValue({ ok: false, nameError: 'A signature with this name already exists' });
    const { onOpenChange } = renderDialog({ onSave });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Raced' } });
    fireEvent.change(screen.getByLabelText('Signature'), { target: { value: '<p>x</p>' } });
    save();
    const name = screen.getByLabelText('Name');
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(name);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('has no axe violations', async () => {
    renderDialog();
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  });
});
