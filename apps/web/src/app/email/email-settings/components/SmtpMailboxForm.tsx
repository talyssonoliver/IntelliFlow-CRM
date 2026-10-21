'use client';

/**
 * SMTP mailbox form (PG-207, owner ruling Q7): Gmail / Outlook presets or a
 * custom server, the From identity, and optional IMAP details for reading
 * bounce reports. The shared Zod schema validates in the browser first (the
 * server runs the same one); stored passwords are never loaded — see
 * SecretField.
 */
import { useEffect, useState, type FormEvent } from 'react';
import {
  Button,
  Checkbox,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@intelliflow/ui';
import { saveSmtpMailboxInputSchema, type MailboxDto } from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { SecretField, secretInput, type SecretChange } from './SecretField';

type Scope = 'USER' | 'TENANT';
type Preset = 'gmail' | 'outlook' | 'custom';

const PRESETS: Record<
  Exclude<Preset, 'custom'>,
  { label: string; name: string; smtpHost: string; imapHost: string }
> = {
  gmail: { label: 'Gmail', name: 'Gmail', smtpHost: 'smtp.gmail.com', imapHost: 'imap.gmail.com' },
  outlook: {
    label: 'Outlook / Microsoft 365',
    name: 'Microsoft 365',
    smtpHost: 'smtp.office365.com',
    imapHost: 'outlook.office365.com',
  },
};

const PORTS = ['465', '587', '2525'] as const;

interface Draft {
  preset: Preset;
  smtpHost: string;
  smtpPort: string;
  smtpSecurity: 'SSL' | 'STARTTLS';
  smtpUsername: string;
  password: SecretChange;
  fromAddress: string;
  fromName: string;
  readBounces: boolean;
  imapHost: string;
  imapUsername: string;
  imapPassword: SecretChange;
}

type Field =
  | 'smtpHost'
  | 'smtpPort'
  | 'smtpSecurity'
  | 'smtpUsername'
  | 'smtpPassword'
  | 'fromAddress'
  | 'fromName'
  | 'imapHost'
  | 'imapUsername'
  | 'imapPassword';

/** Focus order for "move to the first invalid field". */
const FIELD_ORDER: readonly Field[] = [
  'smtpHost',
  'smtpPort',
  'smtpSecurity',
  'smtpUsername',
  'smtpPassword',
  'fromAddress',
  'fromName',
  'imapHost',
  'imapUsername',
  'imapPassword',
];

/** DOM id suffix of a field: its name in kebab case (smtpHost → smtp-host). */
function fieldSuffix(field: Field): string {
  return field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Used when the schema's own message is a generic "too small" / "required". */
const REQUIRED_MESSAGE: Partial<Record<Field, string>> = {
  smtpUsername: 'Enter the username.',
  imapUsername: 'Enter the IMAP username.',
  fromAddress: 'Enter a valid email address.',
};

function presetOf(host: string | null): Preset {
  if (host === PRESETS.gmail.smtpHost) return 'gmail';
  if (host === PRESETS.outlook.smtpHost) return 'outlook';
  return 'custom';
}

function initialDraft(mailbox: MailboxDto | null): Draft {
  const smtp = mailbox?.kind === 'SMTP' ? mailbox : null;
  return {
    preset: presetOf(smtp?.smtpHost ?? null),
    smtpHost: smtp?.smtpHost ?? '',
    smtpPort: String(smtp?.smtpPort ?? 587),
    smtpSecurity: smtp?.smtpSecurity ?? 'STARTTLS',
    smtpUsername: smtp?.smtpUsername ?? '',
    password: smtp?.hasSmtpPassword ? { mode: 'keep' } : { mode: 'replace', value: '' },
    fromAddress: smtp?.fromAddress ?? '',
    fromName: smtp?.fromName ?? '',
    readBounces: Boolean(smtp?.imapHost),
    imapHost: smtp?.imapHost ?? '',
    imapUsername: smtp?.imapUsername ?? '',
    imapPassword: smtp?.hasImapPassword ? { mode: 'keep' } : { mode: 'replace', value: '' },
  };
}

/** Password checks the schema cannot see: what is stored and whether it may be reused. */
function passwordErrors(draft: Draft, stored: MailboxDto | null): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const keepsSmtp = Boolean(stored?.hasSmtpPassword) && draft.password.mode === 'keep';
  if (!keepsSmtp && secretInput(draft.password) === undefined) {
    errors.smtpPassword = 'Enter the mailbox password.';
  } else if (
    keepsSmtp &&
    (stored?.smtpHost !== draft.smtpHost.trim().toLowerCase() ||
      stored?.smtpUsername !== draft.smtpUsername.trim())
  ) {
    errors.smtpPassword = 'Re-enter the password when you change the server or username.';
  }
  if (!draft.readBounces) return errors;
  const keepsImap = Boolean(stored?.hasImapPassword) && draft.imapPassword.mode === 'keep';
  if (!keepsImap && secretInput(draft.imapPassword) === undefined) {
    errors.imapPassword = 'Enter the IMAP password.';
  } else if (
    keepsImap &&
    (stored?.imapHost !== draft.imapHost.trim().toLowerCase() ||
      stored?.imapUsername !== draft.imapUsername.trim())
  ) {
    errors.imapPassword = 'Re-enter the IMAP password when you change the IMAP server or username.';
  }
  return errors;
}

function validate(draft: Draft, scope: Scope, stored: MailboxDto | null) {
  const parsed = saveSmtpMailboxInputSchema.safeParse({
    scope,
    smtpHost: draft.smtpHost,
    smtpPort: Number(draft.smtpPort),
    smtpSecurity: draft.smtpSecurity,
    smtpUsername: draft.smtpUsername,
    smtpPassword: secretInput(draft.password),
    fromAddress: draft.fromAddress,
    fromName: draft.fromName,
    imapHost: draft.readBounces ? draft.imapHost : null,
    imapPort: draft.readBounces ? 993 : null,
    imapUsername: draft.readBounces ? draft.imapUsername : null,
    imapPassword: draft.readBounces ? secretInput(draft.imapPassword) : undefined,
  });
  const errors = passwordErrors(draft, stored);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as Field;
      if (!FIELD_ORDER.includes(field) || errors[field]) continue;
      const generic = issue.code === 'too_small' || issue.code === 'invalid_type';
      errors[field] = (generic && REQUIRED_MESSAGE[field]) || issue.message;
    }
  }
  return { input: parsed.success ? parsed.data : null, errors };
}

export interface SmtpMailboxFormProps {
  scope: Scope;
  /** The scope's current mailbox, if any (its SMTP settings prefill the form). */
  mailbox: MailboxDto | null;
  onSaved: (mailbox: MailboxDto) => void;
  onCancel: () => void;
}

export function SmtpMailboxForm({
  scope,
  mailbox,
  onSaved,
  onCancel,
}: Readonly<SmtpMailboxFormProps>) {
  const prefix = scope === 'USER' ? 'my' : 'company';
  const fieldId = (field: Field) => `${prefix}-${fieldSuffix(field)}`;
  const save = trpc.emailMailbox.saveSmtp.useMutation();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(mailbox));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<Field | null>(null);
  const stored = mailbox?.kind === 'SMTP' ? mailbox : null;

  // Opening the form moves focus into it (the button that opened it is gone).
  useEffect(() => {
    document.getElementById(`${prefix}-smtp-preset`)?.focus();
  }, [prefix]);

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(`${prefix}-${fieldSuffix(focusField)}`)?.focus();
    setFocusField(null);
  }, [focusField, prefix]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const choosePreset = (preset: Preset) => {
    setDraft((current) => {
      if (preset === 'custom') return { ...current, preset };
      const p = PRESETS[preset];
      return {
        ...current,
        preset,
        smtpHost: p.smtpHost,
        smtpPort: '587',
        smtpSecurity: 'STARTTLS',
        imapHost: p.imapHost,
      };
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const result = validate(draft, scope, stored);
    const first = FIELD_ORDER.find((f) => result.errors[f]);
    setErrors(result.errors);
    if (first || !result.input) {
      setFocusField(first ?? 'smtpHost');
      return;
    }
    try {
      onSaved(await save.mutateAsync(result.input));
    } catch (error) {
      setServerError(
        error instanceof Error && error.message ? error.message : 'The mailbox could not be saved.'
      );
    }
  };

  const errorProps = (field: Field) =>
    errors[field]
      ? { 'aria-invalid': true as const, 'aria-describedby': `${fieldId(field)}-error` }
      : {};
  const errorText = (field: Field) =>
    errors[field] ? (
      <p id={`${fieldId(field)}-error`} className="text-xs text-red-700 dark:text-red-300">
        {errors[field]}
      </p>
    ) : null;

  const presetName = draft.preset === 'custom' ? null : PRESETS[draft.preset].name;

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
      aria-label="SMTP settings"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={`${prefix}-smtp-preset`}>Provider</Label>
          <Select value={draft.preset} onValueChange={(v) => choosePreset(v as Preset)}>
            <SelectTrigger id={`${prefix}-smtp-preset`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="gmail">{PRESETS.gmail.label}</SelectItem>
              <SelectItem value="outlook">{PRESETS.outlook.label}</SelectItem>
              <SelectItem value="custom">Other (custom server)</SelectItem>
            </SelectContent>
          </Select>
          {presetName && (
            <p className="text-xs text-muted-foreground">
              {presetName} needs an app password. Your normal sign-in password does not work here
              when 2-step verification is on.
            </p>
          )}
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor={fieldId('smtpHost')}>SMTP server</Label>
          <Input
            id={fieldId('smtpHost')}
            value={draft.smtpHost}
            autoComplete="off"
            placeholder="smtp.example.com"
            aria-required="true"
            onChange={(e) => set('smtpHost', e.currentTarget.value)}
            {...errorProps('smtpHost')}
          />
          {errorText('smtpHost')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('smtpPort')}>Port</Label>
          <Select value={draft.smtpPort} onValueChange={(v) => set('smtpPort', v)}>
            <SelectTrigger id={fieldId('smtpPort')} {...errorProps('smtpPort')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PORTS.map((port) => (
                <SelectItem key={port} value={port}>
                  {port}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errorText('smtpPort')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('smtpSecurity')}>Security</Label>
          <Select
            value={draft.smtpSecurity}
            onValueChange={(v) => set('smtpSecurity', v as Draft['smtpSecurity'])}
          >
            <SelectTrigger id={fieldId('smtpSecurity')} {...errorProps('smtpSecurity')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SSL">SSL/TLS</SelectItem>
              <SelectItem value="STARTTLS">STARTTLS</SelectItem>
            </SelectContent>
          </Select>
          {errorText('smtpSecurity')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('smtpUsername')}>Username</Label>
          <Input
            id={fieldId('smtpUsername')}
            value={draft.smtpUsername}
            autoComplete="off"
            aria-required="true"
            onChange={(e) => set('smtpUsername', e.currentTarget.value)}
            {...errorProps('smtpUsername')}
          />
          {errorText('smtpUsername')}
        </div>

        <SecretField
          id={fieldId('smtpPassword')}
          label="Password"
          hasStored={Boolean(stored?.hasSmtpPassword)}
          value={draft.password}
          onChange={(v) => set('password', v)}
          error={errors.smtpPassword}
          required
        />

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('fromAddress')}>From address</Label>
          <Input
            id={fieldId('fromAddress')}
            type="email"
            value={draft.fromAddress}
            autoComplete="off"
            aria-required="true"
            onChange={(e) => set('fromAddress', e.currentTarget.value)}
            {...errorProps('fromAddress')}
          />
          {errorText('fromAddress')}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={fieldId('fromName')}>Display name (optional)</Label>
          <Input
            id={fieldId('fromName')}
            value={draft.fromName}
            autoComplete="off"
            onChange={(e) => set('fromName', e.currentTarget.value)}
            {...errorProps('fromName')}
          />
          {errorText('fromName')}
        </div>
      </div>

      <div className="rounded-md border border-border p-3 space-y-3">
        <div className="flex items-start gap-2">
          <Checkbox
            id={`${prefix}-read-bounces`}
            checked={draft.readBounces}
            onCheckedChange={(v) => set('readBounces', v === true)}
            aria-describedby={`${prefix}-read-bounces-help`}
          />
          <div>
            <Label htmlFor={`${prefix}-read-bounces`}>Read bounce reports (IMAP)</Label>
            <p id={`${prefix}-read-bounces-help`} className="text-xs text-muted-foreground">
              Only bounce reports are read, to keep failed addresses off your lists. No other mail
              is stored.
            </p>
          </div>
        </div>
        {draft.readBounces && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={fieldId('imapHost')}>IMAP server</Label>
              <Input
                id={fieldId('imapHost')}
                value={draft.imapHost}
                autoComplete="off"
                aria-required="true"
                onChange={(e) => set('imapHost', e.currentTarget.value)}
                {...errorProps('imapHost')}
              />
              {errorText('imapHost')}
              <p className="text-xs text-muted-foreground">Port 993 (SSL/TLS)</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={fieldId('imapUsername')}>IMAP username</Label>
              <Input
                id={fieldId('imapUsername')}
                value={draft.imapUsername}
                autoComplete="off"
                aria-required="true"
                onChange={(e) => set('imapUsername', e.currentTarget.value)}
                {...errorProps('imapUsername')}
              />
              {errorText('imapUsername')}
            </div>
            <SecretField
              id={fieldId('imapPassword')}
              label="IMAP password"
              hasStored={Boolean(stored?.hasImapPassword)}
              value={draft.imapPassword}
              onChange={(v) => set('imapPassword', v)}
              error={errors.imapPassword}
              required
            />
          </div>
        )}
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {serverError}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save Mailbox'}
        </Button>
      </div>
    </form>
  );
}
