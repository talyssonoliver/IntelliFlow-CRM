'use client';

/**
 * SMTP mailbox form (PG-207, owner ruling Q7): Gmail / Outlook presets or a
 * custom server, the From identity, and optional IMAP details for reading
 * bounce reports. The shared Zod schema validates in the browser first (the
 * server runs the same one); stored passwords are never loaded — see
 * SecretField. The server and account inputs are SmtpEndpointFields and
 * SmtpAccountFields (#1103).
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
import {
  SMTP_ACCOUNT_FIELDS,
  SMTP_ENDPOINT_FIELDS,
  saveSmtpMailboxInputSchema,
  type MailboxDto,
  type SmtpAccountField,
  type SmtpEndpointField,
} from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { SecretField, secretInput, type SecretChange } from './SecretField';
import type { FieldBinding, FieldErrorProps } from './field-binding';
import {
  SmtpEndpointFields,
  endpointChanged,
  endpointDraftOf,
  endpointInput,
  presetEndpoint,
  type EndpointDraft,
} from './SmtpEndpointFields';
import {
  ACCOUNT_REQUIRED_MESSAGE,
  SmtpAccountFields,
  accountChanged,
  accountDraftOf,
  accountInput,
  type AccountDraft,
} from './SmtpAccountFields';

type Scope = 'USER' | 'TENANT';
type Preset = 'gmail' | 'outlook' | 'custom';

/** Each preset's SMTP and IMAP server names. */
const PRESETS: Record<
  Exclude<Preset, 'custom'>,
  { label: string; name: string; smtp: string; imap: string }
> = {
  gmail: { label: 'Gmail', name: 'Gmail', smtp: 'smtp.gmail.com', imap: 'imap.gmail.com' },
  outlook: {
    label: 'Outlook / Microsoft 365',
    name: 'Microsoft 365',
    smtp: 'smtp.office365.com',
    imap: 'outlook.office365.com',
  },
};

interface Draft {
  preset: Preset;
  endpoint: EndpointDraft;
  account: AccountDraft;
  fromAddress: string;
  fromName: string;
  readBounces: boolean;
  imapHost: string;
  imapUsername: string;
  imapPassword: SecretChange;
}

type Field =
  | SmtpEndpointField
  | SmtpAccountField
  | 'fromAddress'
  | 'fromName'
  | 'imapHost'
  | 'imapUsername'
  | 'imapPassword';

/** Focus order for "move to the first invalid field". */
const FIELD_ORDER: readonly Field[] = [
  ...SMTP_ENDPOINT_FIELDS,
  ...SMTP_ACCOUNT_FIELDS,
  'fromAddress',
  'fromName',
  'imapHost',
  'imapUsername',
  'imapPassword',
];

/** DOM id suffix of a field: its name in kebab case (imapHost → imap-host). */
function fieldSuffix(field: Field): string {
  return field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Used when the schema's own message is a generic "too small" / "required". */
const REQUIRED_MESSAGE: Partial<Record<Field, string>> = {
  ...ACCOUNT_REQUIRED_MESSAGE,
  imapUsername: 'Enter the IMAP username.',
  fromAddress: 'Enter a valid email address.',
};

function presetOf(host: string): Preset {
  if (host === PRESETS.gmail.smtp) return 'gmail';
  if (host === PRESETS.outlook.smtp) return 'outlook';
  return 'custom';
}

function initialDraft(mailbox: MailboxDto | null): Draft {
  const smtp = mailbox?.kind === 'SMTP' ? mailbox : null;
  const endpoint = endpointDraftOf(smtp);
  return {
    preset: presetOf(endpoint.host),
    endpoint,
    account: accountDraftOf(smtp),
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
  const keptFrom =
    stored?.hasSmtpPassword && draft.account.password.mode === 'keep' ? stored : null;
  if (!keptFrom && secretInput(draft.account.password) === undefined) {
    errors.smtpPassword = 'Enter the mailbox password.';
  } else if (
    keptFrom &&
    (endpointChanged(draft.endpoint, keptFrom) || accountChanged(draft.account, keptFrom))
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
    ...endpointInput(draft.endpoint),
    ...accountInput(draft.account),
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
      return { ...current, preset, endpoint: presetEndpoint(p.smtp), imapHost: p.imap };
    });
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const result = validate(draft, scope, stored);
    const first = FIELD_ORDER.find((f) => result.errors[f]);
    setErrors(result.errors);
    if (first || !result.input) {
      setFocusField(first ?? FIELD_ORDER[0] ?? null);
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

  const errorProps = (field: Field): FieldErrorProps =>
    errors[field] ? { 'aria-invalid': true, 'aria-describedby': `${fieldId(field)}-error` } : {};
  const errorText = (field: Field) =>
    errors[field] ? (
      <p id={`${fieldId(field)}-error`} className="text-xs text-red-700 dark:text-red-300">
        {errors[field]}
      </p>
    ) : null;
  const bind: FieldBinding<Field> = {
    id: fieldId,
    errorProps,
    errorText,
    errorMessage: (field) => errors[field],
  };

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

        <SmtpEndpointFields
          value={draft.endpoint}
          onChange={(v) => set('endpoint', v)}
          bind={bind}
        />

        <SmtpAccountFields
          value={draft.account}
          onChange={(v) => set('account', v)}
          bind={bind}
          hasStored={Boolean(stored?.hasSmtpPassword)}
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
