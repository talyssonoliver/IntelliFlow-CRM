'use client';

/**
 * The account part of the SMTP mailbox form: user name and password (#1103).
 * The server fields are in SmtpEndpointFields; see that module for why the two
 * are kept apart. Stored passwords are never loaded (see SecretField).
 */
import { Input, Label } from '@intelliflow/ui';
import {
  smtpAccountDiffers,
  smtpAccountFields,
  type MailboxDto,
  type SmtpAccountField,
} from '@intelliflow/validators';
import { SecretField, secretInput, type SecretChange } from './SecretField';
import type { FieldBinding } from './field-binding';

export interface AccountDraft {
  username: string;
  password: SecretChange;
}

/** Used when the schema's own message is a generic "too small" / "required". */
export const ACCOUNT_REQUIRED_MESSAGE: Partial<Record<SmtpAccountField, string>> = {
  smtpUsername: 'Enter the sign-in name. It is usually your email address.',
};

/** The account as the form starts it: a stored password is kept, never shown. */
export function accountDraftOf(smtp: MailboxDto | null): AccountDraft {
  return {
    username: smtp?.smtpUsername ?? '',
    password: smtp?.hasSmtpPassword ? { mode: 'keep' } : { mode: 'replace', value: '' },
  };
}

/** The account fields of the save input. */
export function accountInput(draft: AccountDraft) {
  return smtpAccountFields(draft.username, secretInput(draft.password));
}

/** Whether the draft would reuse the stored password for a different user name. */
export function accountChanged(draft: AccountDraft, stored: MailboxDto): boolean {
  return smtpAccountDiffers(stored, { smtpUsername: draft.username.trim() });
}

export interface SmtpAccountFieldsProps {
  value: AccountDraft;
  onChange: (value: AccountDraft) => void;
  bind: FieldBinding<SmtpAccountField>;
  /** A password is stored for this mailbox. */
  hasStored: boolean;
  /** What the provider calls the secret (Password, App password, API key). */
  secretLabel: string;
  /** The provider's own fixed sign-in name, when it is not the address. */
  fixedUsernameOf?: string;
  /** Which field to show: Advanced holds the sign-in name, the form body the secret. */
  show: 'username' | 'secret';
}

export function SmtpAccountFields({
  value,
  onChange,
  bind,
  hasStored,
  secretLabel,
  fixedUsernameOf,
  show,
}: Readonly<SmtpAccountFieldsProps>) {
  if (show === 'secret') {
    return (
      <SecretField
        id={bind.id('smtpPassword')}
        label={secretLabel}
        hasStored={hasStored}
        value={value.password}
        onChange={(v) => onChange({ ...value, password: v })}
        error={bind.errorMessage('smtpPassword')}
        required
      />
    );
  }
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={bind.id('smtpUsername')}>Sign-in name</Label>
        <Input
          id={bind.id('smtpUsername')}
          value={value.username}
          autoComplete="off"
          aria-required="true"
          onChange={(e) => onChange({ ...value, username: e.currentTarget.value })}
          {...bind.errorProps('smtpUsername')}
        />
        {bind.errorText('smtpUsername')}
        <p className="text-xs text-muted-foreground">
          {fixedUsernameOf
            ? `${fixedUsernameOf} always uses this name.`
            : 'Follows your email address unless you change it here.'}
        </p>
      </div>
    </>
  );
}
