'use client';

/**
 * The mailbox form (PG-207, owner ruling Q7). Choosing who provides the email comes
 * first and fills in the servers; the user then gives an address, once, and the
 * secret the provider asks for. Everything technical stays under Advanced, and
 * reading bounce reports is optional. Settings can be tested before they are saved.
 * The shared Zod schema validates in the browser first (the server runs the same
 * one); stored passwords are never loaded, see SecretField. The server and account
 * inputs are SmtpEndpointFields and SmtpAccountFields (#1103).
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Button, Input, Label } from '@intelliflow/ui';
import {
  SMTP_ACCOUNT_FIELDS,
  SMTP_ENDPOINT_FIELDS,
  saveSmtpMailboxInputSchema,
  type MailboxDto,
  type SmtpAccountField,
  type SmtpEndpointField,
} from '@intelliflow/validators';
import { trpc } from '@/lib/trpc';
import { BounceReadingFields } from './BounceReadingFields';
import { connectionFailureHelp } from './connection-help';
import {
  providerById,
  providerByServer,
  type MailboxProvider,
  type MailboxProviderId,
} from './mailbox-providers';
import { CustomProviderGuide, ProviderGuide, ProviderPicker } from './ProviderPicker';
import { secretInput, type SecretChange } from './SecretField';
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
interface Draft {
  /** Null until the user chooses, for a new mailbox. */
  provider: MailboxProviderId | null;
  /** The sign-in names follow the address until the user changes them. */
  usernameEdited: boolean;
  imapUsernameEdited: boolean;
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

/** Focus order for "move to the first invalid field": the order they appear on screen. */
const FIELD_ORDER: readonly Field[] = [
  ...SMTP_ENDPOINT_FIELDS,
  'fromAddress',
  'fromName',
  ...SMTP_ACCOUNT_FIELDS,
  'imapHost',
  'imapUsername',
  'imapPassword',
];

/** Fields that live under Advanced, which opens when one of them has an error. */
function isAdvancedField(field: Field, provider: MailboxProviderId | null): boolean {
  if (field === 'fromAddress' || field === 'fromName') return false;
  if (field === SMTP_ENDPOINT_FIELDS[0]) return provider !== 'custom';
  return field !== SMTP_ACCOUNT_FIELDS[1];
}

/** DOM id suffix of a field: its name in kebab case (imapHost → imap-host). */
function fieldSuffix(field: Field): string {
  return field.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Used when the schema's own message is a generic "too small" / "required". */
const REQUIRED_MESSAGE: Partial<Record<Field, string>> = {
  ...ACCOUNT_REQUIRED_MESSAGE,
  [SMTP_ENDPOINT_FIELDS[0]]: 'Enter the mail server name.',
  imapHost: 'Enter the server for reading bounce reports.',
  imapUsername: 'Enter the sign-in name for reading bounce reports.',
};

const EMPTY_ADDRESS = 'Enter your email address.';
const BAD_ADDRESS = "That doesn't look like an email address.";

/** The sign-in name a provider expects for this address. */
function usernameFor(provider: MailboxProvider | undefined, address: string): string {
  return provider?.signInName ?? address.trim();
}

function imapUsernameFor(provider: MailboxProvider | undefined, address: string): string {
  const trimmed = address.trim();
  return provider?.imapSignIn === 'local-part' ? (trimmed.split('@')[0] ?? '') : trimmed;
}

function missingSecretMessage(provider: MailboxProvider | undefined): string {
  if (provider?.secretLabel === 'App password') {
    return `Enter the app password from ${provider.name}.`;
  }
  if (provider?.secretLabel === 'API key') return `Enter the API key from ${provider.name}.`;
  return 'Enter the password for this mailbox.';
}

/** App passwords are often shown with spaces for reading; they are not part of it. */
function tidySecret(change: SecretChange, provider: MailboxProvider | undefined): SecretChange {
  if (change.mode !== 'replace' || provider?.secretLabel !== 'App password') return change;
  return { mode: 'replace', value: change.value.replace(/\s+/g, '') };
}

function initialDraft(mailbox: MailboxDto | null): Draft {
  const smtp = mailbox?.kind === 'SMTP' ? mailbox : null;
  const endpoint = endpointDraftOf(smtp);
  const account = accountDraftOf(smtp);
  const provider = smtp ? providerByServer(endpoint.host) : undefined;
  const address = smtp?.fromAddress ?? '';
  return {
    provider: smtp ? (provider?.id ?? 'custom') : null,
    usernameEdited: Boolean(smtp) && account.username !== usernameFor(provider, address),
    imapUsernameEdited:
      Boolean(smtp?.imapUsername) && smtp?.imapUsername !== imapUsernameFor(provider, address),
    endpoint: smtp ? endpoint : { ...endpoint, host: '' },
    account,
    fromAddress: address,
    fromName: smtp?.fromName ?? '',
    readBounces: Boolean(smtp?.imapHost),
    imapHost: smtp?.imapHost ?? '',
    imapUsername: smtp?.imapUsername ?? '',
    imapPassword: smtp?.hasImapPassword ? { mode: 'keep' } : { mode: 'replace', value: '' },
  };
}

/** Password checks the schema cannot see: what is stored and whether it may be reused. */
function passwordErrors(
  draft: Draft,
  stored: MailboxDto | null,
  imapSecret: string | null | undefined
): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  const keptFrom =
    stored?.hasSmtpPassword && draft.account.password.mode === 'keep' ? stored : null;
  if (!keptFrom && secretInput(draft.account.password) === undefined) {
    errors.smtpPassword = missingSecretMessage(providerById(draft.provider));
  } else if (
    keptFrom &&
    (endpointChanged(draft.endpoint, keptFrom) || accountChanged(draft.account, keptFrom))
  ) {
    errors.smtpPassword = 'Enter the password again when you change the server or sign-in name.';
  }
  if (!draft.readBounces) return errors;
  const keepsImap = Boolean(stored?.hasImapPassword) && draft.imapPassword.mode === 'keep';
  if (!keepsImap && imapSecret === undefined) {
    errors.imapPassword = 'Enter the password for reading bounce reports.';
  } else if (
    keepsImap &&
    (stored?.imapHost !== draft.imapHost.trim().toLowerCase() ||
      stored?.imapUsername !== draft.imapUsername.trim())
  ) {
    errors.imapPassword =
      'Enter this password again when you change the server or sign-in name for reading bounce reports.';
  }
  return errors;
}

/** The secret for reading bounces. It usually signs in the same way, so blank reuses the one above. */
function bounceSecretOf(
  draft: Draft,
  account: AccountDraft,
  provider: MailboxProvider | undefined
): string | null | undefined {
  const typed = secretInput(tidySecret(draft.imapPassword, provider));
  if (typed !== undefined) return typed;
  return draft.imapPassword.mode === 'replace' ? secretInput(account.password) : undefined;
}

function parseDraft(
  draft: Draft,
  scope: Scope,
  account: AccountDraft,
  bounceSecret: string | null | undefined
) {
  const reading = draft.readBounces;
  return saveSmtpMailboxInputSchema.safeParse({
    scope,
    ...endpointInput(draft.endpoint),
    ...accountInput(account),
    fromAddress: draft.fromAddress,
    fromName: draft.fromName,
    imapHost: reading ? draft.imapHost : null,
    imapPort: reading ? 993 : null,
    imapUsername: reading ? draft.imapUsername : null,
    imapPassword: reading ? bounceSecret : undefined,
  });
}

/** Adds the schema's complaints, in plainer words where it only said "required". */
function addSchemaErrors(
  errors: Partial<Record<Field, string>>,
  issues: readonly { code: string; path: readonly PropertyKey[]; message: string }[]
) {
  for (const issue of issues) {
    const field = issue.path[0] as Field;
    if (!FIELD_ORDER.includes(field) || errors[field]) continue;
    const generic = issue.code === 'too_small' || issue.code === 'invalid_type';
    errors[field] = (generic && REQUIRED_MESSAGE[field]) || issue.message;
  }
}

/** One message for the address; the sign-in names following it have nothing to follow yet. */
function settleAddressErrors(errors: Partial<Record<Field, string>>, draft: Draft) {
  if (!errors.fromAddress) return;
  errors.fromAddress = draft.fromAddress.trim() ? BAD_ADDRESS : EMPTY_ADDRESS;
  if (!draft.usernameEdited) delete errors[SMTP_ACCOUNT_FIELDS[0]];
  if (!draft.imapUsernameEdited) delete errors.imapUsername;
}

function validate(draft: Draft, scope: Scope, stored: MailboxDto | null) {
  const provider = providerById(draft.provider);
  const account = { ...draft.account, password: tidySecret(draft.account.password, provider) };
  const bounceSecret = bounceSecretOf(draft, account, provider);
  const parsed = parseDraft(draft, scope, account, bounceSecret);
  const errors = passwordErrors({ ...draft, account }, stored, bounceSecret);
  if (!parsed.success) addSchemaErrors(errors, parsed.error.issues);
  settleAddressErrors(errors, draft);
  return { input: parsed.success ? parsed.data : null, errors };
}

/** Sign-in names follow the address unless the user has changed them. */
function following(current: Draft, provider: MailboxProvider | undefined, address: string) {
  return {
    account: current.usernameEdited
      ? current.account
      : { ...current.account, username: usernameFor(provider, address) },
    imapUsername: current.imapUsernameEdited
      ? current.imapUsername
      : imapUsernameFor(provider, address),
  };
}

function withProvider(current: Draft, id: MailboxProviderId): Draft {
  const next = providerById(id);
  const customHost = providerById(current.provider) ? '' : current.endpoint.host;
  return {
    ...current,
    ...following({ ...current, usernameEdited: false }, next, current.fromAddress),
    provider: id,
    usernameEdited: false,
    endpoint: next ? presetEndpoint(next.server) : { ...current.endpoint, host: customHost },
    imapHost: next?.imapHost ?? '',
    readBounces: next?.imapHost === null ? false : current.readBounces,
  };
}

const messageOf = (error: unknown, fallback: string) =>
  error instanceof Error && error.message ? error.message : fallback;

/** The outcome of the last connection test, cleared whenever a field changes. */
type TestResult = { ok: true } | { ok: false; message: string };

function TestOutcome({ result }: Readonly<{ result: TestResult }>) {
  return (
    <output
      className={
        result.ok
          ? 'block text-sm text-green-700 dark:text-green-300'
          : 'block text-sm text-red-700 dark:text-red-300'
      }
    >
      {result.ok
        ? 'It works. These settings signed in, and you can save them now.'
        : result.message}
    </output>
  );
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
  const test = trpc.emailMailbox.testSmtpSettings.useMutation();
  const [draft, setDraft] = useState<Draft>(() => initialDraft(mailbox));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [focusField, setFocusField] = useState<Field | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const stored = mailbox?.kind === 'SMTP' ? mailbox : null;

  // Opening the form moves focus into it (the button that opened it is gone).
  const [openingProvider] = useState(draft.provider ?? 'custom');
  useEffect(() => {
    document.getElementById(`${prefix}-provider-${openingProvider}`)?.focus();
  }, [prefix, openingProvider]);

  useEffect(() => {
    if (!focusField) return;
    document.getElementById(`${prefix}-${fieldSuffix(focusField)}`)?.focus();
    setFocusField(null);
  }, [focusField, prefix]);

  const update = (change: (current: Draft) => Draft) => {
    setTestResult(null);
    setDraft(change);
  };
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    update((current) => ({ ...current, [key]: value }));

  const provider = providerById(draft.provider);

  const chooseProvider = (id: MailboxProviderId) => update((current) => withProvider(current, id));

  const setAddress = (address: string) =>
    update((current) => ({
      ...current,
      ...following(current, provider, address),
      fromAddress: address,
    }));

  /** Marks what is wrong and moves to it; the valid input, when there is nothing wrong. */
  const checked = () => {
    const result = validate(draft, scope, stored);
    const first = FIELD_ORDER.find((f) => result.errors[f]);
    setErrors(result.errors);
    if (first && isAdvancedField(first, draft.provider)) setAdvancedOpen(true);
    if (first || !result.input) {
      setFocusField(first ?? FIELD_ORDER[0] ?? null);
      return null;
    }
    return result.input;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setServerError(null);
    const input = checked();
    if (!input) return;
    try {
      onSaved(await save.mutateAsync(input));
    } catch (error) {
      setServerError(messageOf(error, 'The mailbox could not be saved.'));
    }
  };

  const runTest = async () => {
    setServerError(null);
    setTestResult(null);
    const input = checked();
    if (!input) return;
    try {
      const outcome = await test.mutateAsync(input);
      setTestResult(
        outcome.ok
          ? { ok: true }
          : {
              ok: false,
              message: connectionFailureHelp(outcome.code ?? 'CONNECT_FAILED', provider),
            }
      );
    } catch (error) {
      setServerError(messageOf(error, 'The connection could not be tested.'));
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

  const canReadBounces = provider?.imapHost !== null;

  return (
    <form
      noValidate
      onSubmit={(e) => void handleSubmit(e)}
      className="space-y-4"
      aria-label="Mailbox settings"
    >
      <ProviderPicker idPrefix={prefix} value={draft.provider} onChange={chooseProvider} />

      {draft.provider === null ? (
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          {provider ? <ProviderGuide provider={provider} /> : <CustomProviderGuide />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {!provider && (
              <SmtpEndpointFields
                value={draft.endpoint}
                onChange={(v) => set('endpoint', v)}
                bind={bind}
                show="server"
              />
            )}

            <div className="space-y-1.5">
              <Label htmlFor={fieldId('fromAddress')}>Email address</Label>
              <Input
                id={fieldId('fromAddress')}
                type="email"
                value={draft.fromAddress}
                autoComplete="off"
                placeholder="you@yourcompany.com"
                aria-required="true"
                onChange={(e) => setAddress(e.currentTarget.value)}
                {...errorProps('fromAddress')}
              />
              {errorText('fromAddress')}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={fieldId('fromName')}>Your name (optional)</Label>
              <Input
                id={fieldId('fromName')}
                value={draft.fromName}
                autoComplete="off"
                aria-describedby={`${fieldId('fromName')}-help`}
                onChange={(e) => set('fromName', e.currentTarget.value)}
                {...errorProps('fromName')}
              />
              {errorText('fromName')}
              <p id={`${fieldId('fromName')}-help`} className="text-xs text-muted-foreground">
                What people see next to your address.
              </p>
            </div>

            <SmtpAccountFields
              value={draft.account}
              onChange={(v) => set('account', v)}
              bind={bind}
              hasStored={Boolean(stored?.hasSmtpPassword)}
              secretLabel={provider?.secretLabel ?? 'Password'}
              show="secret"
            />
          </div>

          <details
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen(e.currentTarget.open)}
            className="rounded-md border border-border p-3"
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              Advanced settings
            </summary>
            <div className="mt-3 space-y-4">
              <p className="text-xs text-muted-foreground">
                {provider
                  ? `Filled in for ${provider.name}. Most people never change these.`
                  : 'The usual settings are filled in. Change them only if your email host says so.'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SmtpEndpointFields
                  value={draft.endpoint}
                  onChange={(v) => set('endpoint', v)}
                  bind={bind}
                  show={provider ? 'all' : 'connection'}
                />
                <SmtpAccountFields
                  value={draft.account}
                  onChange={(v) =>
                    update((current) => ({ ...current, account: v, usernameEdited: true }))
                  }
                  bind={bind}
                  hasStored={Boolean(stored?.hasSmtpPassword)}
                  secretLabel={provider?.secretLabel ?? 'Password'}
                  fixedUsernameOf={provider?.signInName ? provider.name : undefined}
                  show="username"
                />
              </div>

              {canReadBounces && (
                <BounceReadingFields
                  idPrefix={prefix}
                  bind={bind}
                  enabled={draft.readBounces}
                  onEnabledChange={(v) => set('readBounces', v)}
                  host={draft.imapHost}
                  onHostChange={(v) => set('imapHost', v)}
                  username={draft.imapUsername}
                  onUsernameChange={(v) =>
                    update((current) => ({
                      ...current,
                      imapUsername: v,
                      imapUsernameEdited: true,
                    }))
                  }
                  secret={draft.imapPassword}
                  onSecretChange={(v) => set('imapPassword', v)}
                  hasStored={Boolean(stored?.hasImapPassword)}
                />
              )}
            </div>
          </details>

          {testResult && <TestOutcome result={testResult} />}

          {serverError && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {serverError}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={test.isPending || save.isPending}
              onClick={() => void runTest()}
            >
              {test.isPending ? 'Testing…' : 'Test Connection'}
            </Button>
            <Button type="submit" size="sm" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save Mailbox'}
            </Button>
          </div>
        </>
      )}
    </form>
  );
}
