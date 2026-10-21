'use client';

/**
 * Create / edit an email signature (PG-207, owner ruling Q2). Loaded on
 * demand. The content is edited in the shared RichTextEditor and read back
 * as HTML; the server sanitises it again on save. Image insertion is off:
 * remote images in signatures leak opens and are often blocked.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  RichTextEditor,
} from '@intelliflow/ui';
import { buildSignatureNameSchema, type EmailSignatureDto } from '@intelliflow/validators';

export type SignatureDialogTarget =
  | { kind: 'create'; scope: 'USER' | 'ORG' }
  | { kind: 'edit'; signature: EmailSignatureDto };

export interface SignatureSaveInput {
  name: string;
  html: string;
  isDefault: boolean;
}

export type SignatureSaveResult = { ok: true } | { ok: false; nameError?: string };

export interface SignatureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SignatureDialogTarget;
  /** The other signatures in the same scope, for the duplicate-name check. */
  existing: ReadonlyArray<{ id: string; name: string }>;
  onSave: (input: SignatureSaveInput) => Promise<SignatureSaveResult>;
}

interface EditorHandle {
  getHTML: () => string;
  getText: () => string;
  commands: { focus: () => unknown };
}

const CONTENT_ERROR_ID = 'signature-content-error';

const NAME_ID = 'signature-name';
const noImages = () => null;

export function SignatureDialog({
  open,
  onOpenChange,
  target,
  existing,
  onSave,
}: Readonly<SignatureDialogProps>) {
  const editing = target.kind === 'edit' ? target.signature : null;
  const scope = editing?.scope ?? (target.kind === 'create' ? target.scope : 'USER');
  const editorRef = useRef<EditorHandle | null>(null);
  const [name, setName] = useState(editing?.name ?? '');
  const [isDefault, setIsDefault] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [focusName, setFocusName] = useState(false);

  useEffect(() => {
    if (!focusName) return;
    document.getElementById(NAME_ID)?.focus();
    setFocusName(false);
  }, [focusName]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = buildSignatureNameSchema(existing, editing?.id).safeParse({ name });
    const html = editorRef.current?.getHTML() ?? editing?.html ?? '';
    // Before the editor is ready only an edit has content, and its stored HTML is not empty.
    const text = editorRef.current ? editorRef.current.getText() : html;
    const nextNameError = parsed.success
      ? null
      : (parsed.error.issues.find((i) => i.path[0] === 'name' && i.code === 'custom')?.message ??
        'Enter a name.');
    setNameError(nextNameError);
    setContentError(text.trim() === '' ? 'Add the signature text.' : null);
    if (nextNameError) {
      setFocusName(true);
      return;
    }
    if (text.trim() === '') {
      editorRef.current?.commands.focus();
      return;
    }

    setSaving(true);
    try {
      const result = await onSave({ name: name.trim(), html, isDefault });
      if (result.ok) {
        onOpenChange(false);
        return;
      }
      if (result.nameError) {
        setNameError(result.nameError);
        setFocusName(true);
      }
    } finally {
      setSaving(false);
    }
  };

  const defaultLabel = scope === 'ORG' ? 'Use as the organisation default' : 'Use as my default';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <form noValidate onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit signature' : 'New signature'}</DialogTitle>
            <DialogDescription>
              {scope === 'ORG'
                ? 'Everyone in the organisation can use this signature.'
                : 'Only you can use this signature.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={NAME_ID}>Name</Label>
            <Input
              id={NAME_ID}
              value={name}
              autoComplete="off"
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? `${NAME_ID}-error` : undefined}
              onChange={(e) => setName(e.currentTarget.value)}
            />
            {nameError && (
              <p id={`${NAME_ID}-error`} className="text-xs text-red-700 dark:text-red-300">
                {nameError}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <RichTextEditor
              key={editing?.id ?? 'new'}
              value={editing?.html ?? ''}
              ariaLabel="Signature"
              ariaDescribedBy={contentError ? CONTENT_ERROR_ID : undefined}
              ariaInvalid={Boolean(contentError)}
              promptForImage={noImages}
              onCreate={(editor: EditorHandle) => {
                editorRef.current = editor;
              }}
            />
            {contentError && (
              <p
                id={CONTENT_ERROR_ID}
                role="alert"
                className="text-xs text-red-700 dark:text-red-300"
              >
                {contentError}
              </p>
            )}
          </div>

          {!editing && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="signature-default"
                checked={isDefault}
                onCheckedChange={(v) => setIsDefault(v === true)}
              />
              <Label htmlFor="signature-default">{defaultLabel}</Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? 'Saving…' : 'Save Signature'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
